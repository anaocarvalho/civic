// VoteHub single-page app: router, shared state, and the six pages from the PRD.
import { getConfig, getDivisions, getElections, getVoterInfo } from './api.js';
import { TEST_ELECTION_ID, applicableElections, contestTitle, earlyVotingRange, groupContests, keyDates } from './elections.js';
import { downloadIcs, googleCalendarUrl } from './ics.js';
import { KINDS, attachAutocomplete, renderMap } from './map.js';
import { describeAll, shortLabel } from './ocd.js';
import * as store from './store.js';
import { daysUntil, directionsUrl, esc, formatAddress, formatDay, link, safeUrl, tidy } from './util.js';

const state = {
  address: store.get('address', ''),
  settings: store.get('settings', { demo: false, notify: false }),
  mapsKey: null,
  status: 'idle', // idle | loading | ready | error
  error: null,
  elections: [],
  upcoming: [],
  election: null,
  voterinfo: null,
  voterError: null,
  divisions: null,
};

// Google's test election only has data for some addresses; demo mode uses this one for ballot/locations.
const DEMO_ADDRESS = '340 Main St, Venice, CA 90291';

const view = document.getElementById('view');
const routes = { '/': home, '/where': where, '/ballot': ballot, '/dates': dates, '/districts': districts, '/fau': fau };
const titles = { '/': 'Home', '/where': 'Where do I vote?', '/ballot': 'Sample ballot', '/dates': 'Dates & reminders', '/districts': 'My districts', '/fau': 'FAU campus voter hub' };

// ---------- data ----------

async function load(address) {
  state.address = address;
  store.set('address', address);
  Object.assign(state, { status: 'loading', error: null, election: null, voterinfo: null, voterError: null, divisions: null });
  render();

  const [div, els] = await Promise.allSettled([getDivisions(address), getElections()]);
  if (div.status === 'rejected') {
    state.status = 'error';
    state.error = div.reason;
    return render();
  }
  state.divisions = div.value;
  state.elections = els.status === 'fulfilled' ? els.value.elections || [] : [];
  state.upcoming = applicableElections(state.elections, Object.keys(state.divisions.divisions || {}));
  state.election = state.settings.demo
    ? state.elections.find((e) => e.id === TEST_ELECTION_ID) || { id: TEST_ELECTION_ID, name: 'VIP Test Election', electionDay: '2031-12-06' }
    : state.upcoming[0] || null;

  if (state.election) {
    try {
      state.voterinfo = await getVoterInfo(state.settings.demo ? DEMO_ADDRESS : address, state.election.id);
    } catch (err) {
      state.voterError = err;
    }
  }
  state.status = 'ready';
  render();
  maybeNotify();
}

const stateInfo = () => state.voterinfo?.state?.[0] || null;
const stateBody = () => stateInfo()?.electionAdministrationBody || null;
const localBody = () => stateInfo()?.local_jurisdiction?.electionAdministrationBody || null;
const localName = () => stateInfo()?.local_jurisdiction?.name || '';

// ---------- shell ----------

function navigate(path) {
  if (location.pathname !== path) history.pushState({}, '', path);
  render(true);
}

function render(focus = false) {
  const path = routes[location.pathname] ? location.pathname : '/';
  document.title = path === '/' ? 'VoteHub' : `${titles[path]} · VoteHub`;
  document.querySelectorAll('.nav a').forEach((a) => {
    if (a.getAttribute('href') === path) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  view.innerHTML = `${demoBanner()}${routes[path]()}`;
  wire(path);
  if (focus) view.querySelector('h1')?.focus();
}

function demoBanner() {
  if (!state.settings.demo) return '';
  return `<div class="banner" role="status">Demo mode: showing Google's test election (ID ${TEST_ELECTION_ID}) for a sample Los Angeles address, not your real ballot. <button type="button" class="linklike" data-action="demo-off">Turn off</button></div>`;
}

function addressForm({ compact = false } = {}) {
  return `
    <form class="address-form${compact ? ' compact' : ''}" data-form="address" role="search">
      <label for="address-input">${compact ? 'Your address' : 'Enter your home address'}</label>
      <div class="row">
        <input id="address-input" name="address" type="text" autocomplete="street-address" inputmode="text"
          placeholder="777 Glades Rd, Boca Raton, FL 33431" value="${esc(state.address)}" required minlength="5" maxlength="200">
        <button type="submit" class="btn primary">${state.status === 'loading' ? 'Searching…' : 'Find my info'}</button>
      </div>
      <p class="hint">Use the address where you're registered to vote. It stays in this browser.</p>
    </form>`;
}

function statusBlock() {
  if (state.status === 'loading') return `<div class="card loading" role="status" aria-live="polite"><span class="spinner" aria-hidden="true"></span> Looking up your voting information…</div>`;
  if (state.status === 'error') return errorCard(state.error);
  return '';
}

function errorCard(err) {
  const titlesByCode = { address: "We couldn't find that address", quota: 'Too many requests', network: 'Connection problem', nodata: 'No data yet', election: 'Election not available' };
  const title = titlesByCode[err?.code] || 'Something went wrong';
  return `<div class="card error" role="alert"><h2>${esc(title)}</h2><p>${esc(err?.message || 'Please try again.')}</p></div>`;
}

// Gate for pages that need an address lookup first.
function needsData(heading, intro) {
  if (state.status === 'ready') return null;
  return `<h1 tabindex="-1">${esc(heading)}</h1><p class="lead">${esc(intro)}</p>${addressForm()}${statusBlock()}`;
}

function officialLinks() {
  const s = stateBody();
  const l = localBody();
  const items = [];
  if (l?.electionInfoUrl) items.push(link(l.electionInfoUrl, `${tidy(localName()) || 'County'} elections office`));
  if (s?.electionRegistrationConfirmationUrl) items.push(link(s.electionRegistrationConfirmationUrl, 'Check your registration'));
  if (s?.electionRegistrationUrl) items.push(link(s.electionRegistrationUrl, 'Register or update registration'));
  if (l?.absenteeVotingInfoUrl || s?.absenteeVotingInfoUrl) items.push(link(l?.absenteeVotingInfoUrl || s.absenteeVotingInfoUrl, 'Vote by mail'));
  if (s?.electionRulesUrl) items.push(link(s.electionRulesUrl, 'Election rules'));
  if (s?.electionInfoUrl) items.push(link(s.electionInfoUrl, `${s.name || 'State'} elections site`));
  return items.length ? `<ul class="links">${items.map((i) => `<li>${i}</li>`).join('')}</ul>` : '';
}

// ---------- pages ----------

function home() {
  const ready = state.status === 'ready';
  let body = '';
  if (ready) {
    const e = state.election;
    const vi = state.voterinfo;
    const polling = vi?.pollingLocations?.[0];
    const cd = Object.keys(state.divisions?.divisions || {}).map(shortLabel).find(Boolean);
    const contests = vi?.contests?.length || 0;
    body = `
      ${countdownCard()}
      <div class="grid">
        ${shortcut('/where', 'Where do I vote?', polling ? `${esc(tidy(polling.address?.locationName || formatAddress(polling.address)))}` : 'Polling place, early voting, drop boxes')}
        ${shortcut('/ballot', 'Sample ballot', contests ? `${contests} races and measures` : 'Races, candidates, and measures')}
        ${shortcut('/dates', 'Dates & reminders', e ? `Add ${esc(e.name)} to your calendar` : 'Upcoming elections')}
        ${shortcut('/districts', 'My districts', cd ? `${esc(cd)} and ${Object.keys(state.divisions.divisions).length - 1} more` : 'What districts you live in')}
        ${shortcut('/fau', 'FAU students', 'Campus voting help')}
      </div>`;
  }
  return `
    <section class="hero">
      <h1 tabindex="-1">Everything you need to vote, from one address.</h1>
      <p class="lead">Find your polling place, preview your ballot, save key dates, and see your districts. Nonpartisan, no account needed.</p>
      ${addressForm()}
    </section>
    ${statusBlock()}
    ${body}`;
}

function shortcut(href, title, sub) {
  return `<a class="card shortcut" href="${href}" data-link><span class="shortcut-title">${esc(title)}</span><span class="shortcut-sub">${sub}</span></a>`;
}

function countdownCard() {
  const e = state.election;
  if (!e) {
    return `<div class="card"><h2>No upcoming election found</h2><p>Google doesn't list an upcoming election for your address right now. Check back closer to election season, or contact your local elections office.</p>${officialLinks()}</div>`;
  }
  const n = daysUntil(e.electionDay);
  const ev = earlyVotingRange(state.voterinfo?.earlyVoteSites, e.electionDay);
  const when = n === 0 ? 'Today is Election Day' : n === 1 ? '1 day until Election Day' : `${n} days until Election Day`;
  const evLine = ev
    ? `<p class="ev">Early voting: <strong>${esc(formatDay(ev.start, { month: 'short', day: 'numeric' }))} – ${esc(formatDay(ev.end, { month: 'short', day: 'numeric' }))}</strong>${daysUntil(ev.start) <= 0 && daysUntil(ev.end) >= 0 ? ' · <span class="pill">Open now</span>' : ''}</p>`
    : '';
  return `
    <div class="card countdown">
      <p class="eyebrow">${esc(e.name)}</p>
      <p class="big"><span class="num">${n}</span> ${n === 1 ? 'day' : 'days'}</p>
      <p>${esc(when)} · ${esc(formatDay(e.electionDay))}</p>
      ${evLine}
      <a class="btn" href="/dates" data-link>Add dates to calendar</a>
    </div>`;
}

let whereTab = 'polling';

function where() {
  const gate = needsData('Where do I vote?', 'Enter your address to see your polling place, early voting sites, and ballot drop-off locations.');
  if (gate) return gate;
  const vi = state.voterinfo || {};
  const lists = {
    polling: (vi.pollingLocations || []).map((p) => ({ ...p, kind: 'polling' })),
    early: (vi.earlyVoteSites || []).map((p) => ({ ...p, kind: 'early' })),
    dropoff: (vi.dropOffLocations || []).map((p) => ({ ...p, kind: 'dropoff' })),
  };
  const total = lists.polling.length + lists.early.length + lists.dropoff.length;
  const origin = lists.polling[0];
  if (origin) for (const k of ['early', 'dropoff']) sortByDistance(lists[k], origin);

  const head = `<h1 tabindex="-1">Where do I vote?</h1>${addressForm({ compact: true })}`;
  if (!total) {
    const l = localBody();
    return `${head}
      <div class="card empty">
        <h2>No locations published yet</h2>
        <p>${state.voterError ? esc(state.voterError.message) : 'Polling locations usually appear a few weeks before an election.'} Your local elections office has the official list.</p>
        ${l?.electionInfoUrl ? `<p>${link(l.electionInfoUrl, `Visit ${tidy(localName()) || 'your county'} Supervisor of Elections`, 'btn primary')}</p>` : ''}
        ${officialLinks()}
      </div>`;
  }

  const tabs = Object.entries(KINDS).map(([k, v]) => `
    <button type="button" role="tab" id="tab-${k}" aria-controls="panel" aria-selected="${whereTab === k}" tabindex="${whereTab === k ? 0 : -1}" data-tab="${k}">
      <span class="dot" style="background:${v.color}" aria-hidden="true"></span>${esc(tabLabel(k))} <span class="count">${lists[k].length}</span>
    </button>`).join('');

  const current = lists[whereTab];
  return `${head}
    <div class="where-layout">
      <div>
        <div class="tabs" role="tablist" aria-label="Location type">${tabs}</div>
        <div id="panel" role="tabpanel" aria-labelledby="tab-${whereTab}">
          ${current.length ? `<ol class="places">${current.map(placeItem).join('')}</ol>` : `<p class="card empty">No ${esc(tabLabel(whereTab).toLowerCase())} listed for this address. Check with your ${link(localBody()?.electionInfoUrl, 'local elections office') || 'local elections office'}.</p>`}
        </div>
      </div>
      <div class="map-wrap">
        <div id="map" class="map" role="region" aria-label="Map of voting locations. The same locations are listed in text."></div>
        <ul class="legend">${Object.entries(KINDS).map(([, v]) => `<li><span class="dot" style="background:${v.color}" aria-hidden="true"></span>${esc(v.label)}</li>`).join('')}</ul>
      </div>
    </div>
    <p class="fine">Locations come from the Voting Information Project via Google. Always confirm with ${link(localBody()?.electionInfoUrl || stateBody()?.votingLocationFinderUrl, 'your official elections office') || 'your official elections office'}.</p>`;
}

const tabLabel = (k) => ({ polling: 'Election Day', early: 'Early voting', dropoff: 'Drop-off' }[k]);

function sortByDistance(list, origin) {
  if (!Number.isFinite(origin.latitude)) return;
  for (const p of list) {
    if (!Number.isFinite(p.latitude)) continue;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(p.latitude - origin.latitude);
    const dLon = toRad(p.longitude - origin.longitude);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(origin.latitude)) * Math.cos(toRad(p.latitude)) * Math.sin(dLon / 2) ** 2;
    p.miles = 3958.8 * 2 * Math.asin(Math.sqrt(a));
  }
  list.sort((a, b) => (a.miles ?? Infinity) - (b.miles ?? Infinity));
}

function placeItem(p) {
  const name = tidy(p.address?.locationName || KINDS[p.kind].label);
  const hours = String(p.pollingHours || '').split('\n').filter(Boolean);
  const range = p.startDate && p.endDate && p.startDate !== p.endDate
    ? `${formatDay(p.startDate, { month: 'short', day: 'numeric' })} – ${formatDay(p.endDate, { month: 'short', day: 'numeric' })}` : '';
  return `
    <li class="card place">
      <div class="place-head">
        <h3>${esc(name)}</h3>
        ${p.miles != null ? `<span class="pill">${p.miles < 0.1 ? '<0.1' : p.miles.toFixed(1)} mi</span>` : ''}
      </div>
      <p>${esc(tidy(formatAddress(p.address)))}</p>
      ${range ? `<p><strong>Dates:</strong> ${esc(range)}</p>` : ''}
      ${hours.length ? `<details${hours.length <= 2 ? ' open' : ''}><summary>Hours</summary><ul class="hours">${hours.map((h) => `<li>${esc(h)}</li>`).join('')}</ul></details>` : ''}
      ${p.notes ? `<p class="notes">${esc(p.notes)}</p>` : ''}
      <a class="btn small" href="${esc(directionsUrl(p))}" target="_blank" rel="noopener noreferrer">Get directions<span class="sr-only"> to ${esc(name)} (opens Google Maps)</span></a>
    </li>`;
}

function ballot() {
  const gate = needsData('Sample ballot', 'Enter your address to see the races and measures on your ballot.');
  if (gate) return gate;
  const e = state.election;
  const contests = state.voterinfo?.contests || [];
  const head = `<h1 tabindex="-1">Sample ballot</h1><p class="lead">${e ? `${esc(e.name)} · ${esc(formatDay(e.electionDay))}` : ''}</p>`;
  if (!contests.length) {
    const s = stateBody();
    return `${head}${addressForm({ compact: true })}
      <div class="card empty">
        <h2>Ballot details aren't available yet</h2>
        <p>Google hasn't published the races for your address${e ? ` in the ${esc(e.name)}` : ''}. Coverage depends on what your state and county report.</p>
        ${s?.ballotInfoUrl ? `<p>${link(s.ballotInfoUrl, 'View your official sample ballot', 'btn primary')}</p>` : ''}
        ${officialLinks()}
        ${state.settings.demo ? '' : `<p class="fine">Want to see how this page works? <button type="button" class="linklike" data-action="demo-on">Preview with Google's test election</button></p>`}
      </div>`;
  }
  const picks = store.get(store.picksKey(e.id), {});
  const decided = Object.values(picks).filter((v) => v && v !== '__undecided').length;
  const groups = groupContests(contests);
  return `${head}
    <div class="toolbar no-print">
      <p><span id="pick-count">${decided}</span> of ${contests.length} picks made · saved in this browser</p>
      <div class="row">
        <button type="button" class="btn primary" data-action="print">Print / Save as PDF</button>
        <button type="button" class="btn" data-action="clear-picks">Clear picks</button>
      </div>
    </div>
    <p class="fine">Candidates are listed in the order provided by the election data source. VoteHub does not endorse anyone.</p>
    <p class="print-only print-head">My ballot checklist · ${esc(e.name)} · ${esc(formatDay(e.electionDay))}</p>
    <form data-form="ballot" class="ballot">
      ${groups.map((g) => `
        <section class="level">
          <h2>${esc(g.level)}</h2>
          ${g.contests.map((c) => (g.level === 'Referenda' ? referendum(c, picks) : race(c, picks))).join('')}
        </section>`).join('')}
    </form>`;
}

function race(c, picks) {
  const name = `pick-${c.key}`;
  const chosen = picks[c.key];
  const cands = c.candidates || [];
  const district = c.district?.name ? tidy(c.district.name) : '';
  const pickedName = chosen && chosen !== '__undecided' ? chosen : 'Undecided';
  return `
    <fieldset class="card contest">
      <legend><span class="office">${esc(tidy(contestTitle(c)))}</span>${district ? `<span class="district">${esc(district)}</span>` : ''}</legend>
      ${c.numberVotingFor && c.numberVotingFor !== '1' ? `<p class="fine">Vote for up to ${esc(c.numberVotingFor)}</p>` : ''}
      <ul class="options">
        ${cands.map((cand) => `
          <li>
            <label class="option">
              <input type="radio" name="${esc(name)}" value="${esc(cand.name)}" data-key="${esc(c.key)}" ${chosen === cand.name ? 'checked' : ''}>
              <span><span class="cand">${esc(tidy(cand.name))}</span>${cand.party ? `<span class="party">${esc(cand.party)}</span>` : ''}</span>
            </label>
            ${candidateLinks(cand)}
          </li>`).join('')}
        <li><label class="option"><input type="radio" name="${esc(name)}" value="__undecided" data-key="${esc(c.key)}" ${!chosen || chosen === '__undecided' ? 'checked' : ''}><span class="cand muted">Undecided</span></label></li>
      </ul>
      <p class="print-only print-pick">☐ ${esc(tidy(pickedName))}</p>
    </fieldset>`;
}

const SOCIAL = {
  facebook: (id) => `https://www.facebook.com/${id}`,
  twitter: (id) => `https://x.com/${id}`,
  youtube: (id) => `https://www.youtube.com/${id}`,
  instagram: (id) => `https://www.instagram.com/${id}`,
};

function candidateLinks(cand) {
  const items = [];
  if (cand.candidateUrl) items.push(link(cand.candidateUrl, 'Website'));
  for (const ch of cand.channels || []) {
    const type = String(ch.type || '').toLowerCase();
    const url = safeUrl(ch.id) || (SOCIAL[type] ? SOCIAL[type](encodeURIComponent(String(ch.id).replace(/^@/, ''))) : null);
    if (url) items.push(link(url, ch.type));
  }
  return items.length ? `<p class="cand-links no-print">${items.join(' · ')}</p>` : '';
}

function referendum(c, picks) {
  const name = `pick-${c.key}`;
  const chosen = picks[c.key] || '__undecided';
  const opts = (c.referendumBallotResponses?.length ? c.referendumBallotResponses : ['Yes', 'No']);
  return `
    <fieldset class="card contest">
      <legend><span class="office">${esc(tidy(c.referendumTitle || contestTitle(c)))}</span>${c.referendumSubtitle ? `<span class="district">${esc(c.referendumSubtitle)}</span>` : ''}</legend>
      ${c.referendumText ? `<details class="no-print"><summary>Full text</summary><p>${esc(c.referendumText)}</p></details>` : ''}
      ${c.referendumProStatement || c.referendumConStatement ? `
        <div class="procon no-print">
          ${c.referendumProStatement ? `<div><h4>Supporters say</h4><p>${esc(c.referendumProStatement)}</p></div>` : ''}
          ${c.referendumConStatement ? `<div><h4>Opponents say</h4><p>${esc(c.referendumConStatement)}</p></div>` : ''}
        </div>` : ''}
      ${c.referendumUrl ? `<p class="no-print">${link(c.referendumUrl, 'More about this measure')}</p>` : ''}
      <ul class="options inline">
        ${opts.map((o) => `<li><label class="option"><input type="radio" name="${esc(name)}" value="${esc(o)}" data-key="${esc(c.key)}" ${chosen === o ? 'checked' : ''}><span class="cand">${esc(o)}</span></label></li>`).join('')}
        <li><label class="option"><input type="radio" name="${esc(name)}" value="__undecided" data-key="${esc(c.key)}" ${chosen === '__undecided' ? 'checked' : ''}><span class="cand muted">Undecided</span></label></li>
      </ul>
      <p class="print-only print-pick">☐ ${esc(chosen === '__undecided' ? 'Undecided' : chosen)}</p>
    </fieldset>`;
}

function dates() {
  const gate = needsData('Dates & reminders', 'Enter your address to see the elections that apply to you and add them to your calendar.');
  if (gate) return gate;
  const e = state.election;
  const list = keyDates(e, state.voterinfo);
  const others = state.upcoming.filter((x) => x.id !== e?.id);
  const canNotify = 'Notification' in window;
  return `
    <h1 tabindex="-1">Dates & reminders</h1>
    ${e ? countdownCard() : ''}
    ${list.length ? `
      <div class="toolbar">
        <p>Each calendar file includes a reminder 1 day before.</p>
        <button type="button" class="btn primary" data-action="ics-all">Download all dates (.ics)</button>
      </div>
      <ol class="dates">
        ${list.map((d, i) => `
          <li class="card date">
            <div class="date-badge" aria-hidden="true"><span>${esc(formatDay(d.date, { month: 'short' }))}</span><strong>${esc(formatDay(d.date, { day: 'numeric' }))}</strong></div>
            <div class="date-body">
              <h2>${esc(d.title)}</h2>
              <p>${esc(formatDay(d.date))} · ${daysUntil(d.date) < 0 ? 'Passed' : daysUntil(d.date) === 0 ? 'Today' : `in ${daysUntil(d.date)} days`}</p>
              <div class="row">
                <button type="button" class="btn small" data-action="ics-one" data-index="${i}">Download .ics</button>
                <a class="btn small" href="${esc(googleCalendarUrl(d))}" target="_blank" rel="noopener noreferrer">Add to Google Calendar<span class="sr-only"> (opens in new tab)</span></a>
              </div>
            </div>
          </li>`).join('')}
      </ol>` : ''}
    ${others.length ? `<div class="card"><h2>Other upcoming elections</h2><ul>${others.map((o) => `<li>${esc(o.name)} · ${esc(formatDay(o.electionDay))}</li>`).join('')}</ul></div>` : ''}
    ${canNotify ? `
      <div class="card">
        <h2>Browser reminder</h2>
        <p>Get a notification on key dates when VoteHub is open in this browser. (No background alerts; use the calendar files for those.)</p>
        <label class="switch"><input type="checkbox" data-action="notify" ${state.settings.notify && Notification.permission === 'granted' ? 'checked' : ''}> Notify me on key dates</label>
      </div>` : ''}
    <div class="card"><h2>Official information</h2>${officialLinks() || '<p>Contact your local elections office.</p>'}</div>`;
}

function districts() {
  const gate = needsData('My districts', 'Enter your address to see every district you live in.');
  if (gate) return gate;
  const list = describeAll(state.divisions?.divisions);
  return `
    <h1 tabindex="-1">Know your districts</h1>
    <p class="lead">These are the districts that cover ${esc(formatAddress(state.divisions?.normalizedInput) || 'your address')}. Each one elects someone who may appear on your ballot.</p>
    <ul class="districts">
      ${list.map((d) => `
        <li class="card district-card">
          <h2>${esc(d.label)}</h2>
          <p>${esc(d.about)}</p>
          <code class="ocd">${esc(d.id)}</code>
        </li>`).join('')}
    </ul>
    <p class="fine">Google retired its elected-officials lookup in April 2025, so VoteHub shows districts only. Your county elections office lists current officeholders.</p>`;
}

const CAMPUSES = [
  { name: 'Boca Raton', address: '777 Glades Rd, Boca Raton, FL 33431' },
  { name: 'Jupiter', address: '5353 Parkside Dr, Jupiter, FL 33458' },
  { name: 'Davie', address: '3200 College Ave, Davie, FL 33314' },
  { name: 'Fort Lauderdale', address: '111 E Las Olas Blvd, Fort Lauderdale, FL 33301' },
  { name: 'Harbor Branch', address: '5600 US-1, Fort Pierce, FL 34946' },
];

// Answers point to official Florida sources instead of restating rules.
const FAQ = [
  { q: 'Should I register with my campus address or my home address?', a: 'You can register at the address you consider your permanent residence. Updating your address changes where you vote and which local races you see.', href: 'https://dos.fl.gov/elections/for-voters/voter-registration/register-to-vote-or-update-your-information/', src: 'Florida Division of Elections: Register or update your information' },
  { q: 'What ID do I need at the polls?', a: 'Florida requires a current and valid photo ID with a signature. See the official list of accepted IDs before you go.', href: 'https://dos.fl.gov/elections/for-voters/voting/election-day-voting/', src: 'Florida Division of Elections: Election Day voting' },
  { q: 'Can I vote by mail?', a: 'Any registered Florida voter can request a vote-by-mail ballot. Requests have deadlines, so check them early.', href: 'https://dos.fl.gov/elections/for-voters/voting/vote-by-mail/', src: 'Florida Division of Elections: Vote-by-mail' },
  { q: 'How do I check that I am registered?', a: 'Look yourself up in the state voter information system to confirm your status, party, and precinct.', href: 'https://registration.elections.myflorida.com/CheckVoterStatus', src: 'Florida voter status lookup' },
  { q: 'I have more questions.', a: 'The Division of Elections keeps an FAQ covering polling places, provisional ballots, and more.', href: 'https://dos.fl.gov/elections/contacts/frequently-asked-questions/faq-voting/', src: 'Florida Division of Elections: Voting FAQ' },
];

function fau() {
  const s = stateBody();
  const isFl = stateInfo()?.name === 'Florida';
  const shareUrl = `${location.origin}/fau`;
  const quick = [
    s?.electionRegistrationUrl && link(s.electionRegistrationUrl, 'Register to vote in Florida', 'btn'),
    (localBody()?.absenteeVotingInfoUrl || s?.electionRulesUrl) && link(localBody()?.absenteeVotingInfoUrl || s.electionRulesUrl, 'Vote by mail', 'btn'),
    s?.electionRulesUrl && link(s.electionRulesUrl, 'Election rules', 'btn'),
  ].filter(Boolean);
  return `
    <h1 tabindex="-1">FAU campus voter hub</h1>
    <p class="lead">Pick your campus to see the polling place, early voting, and drop boxes near it. Living off campus or in a residence hall with its own mailing address? Enter it below.</p>
    <div class="campus-grid" role="group" aria-label="FAU campuses">
      ${CAMPUSES.map((c) => `<button type="button" class="btn campus" data-campus="${esc(c.address)}"><strong>${esc(c.name)}</strong><span>${esc(c.address)}</span></button>`).join('')}
    </div>
    ${addressForm({ compact: true })}
    ${statusBlock()}
    ${quick.length && isFl ? `<div class="card"><h2>Official Florida links</h2><div class="row">${quick.join('')}</div></div>` : ''}
    <section class="card">
      <h2>Student voting FAQ</h2>
      ${FAQ.map((f) => `<details class="faq"><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p><p>${link(f.href, f.src)}</p></details>`).join('')}
    </section>
    <section class="card share">
      <h2>Share this page</h2>
      <p>Post it in class announcements or print the QR code for a flyer.</p>
      <div class="share-row">
        <div id="qr" class="qr" role="img" aria-label="QR code linking to ${esc(shareUrl)}"></div>
        <div>
          <p><code>${esc(shareUrl)}</code></p>
          <button type="button" class="btn" data-action="copy-link" data-url="${esc(shareUrl)}">Copy link</button>
          <span class="copied" role="status" aria-live="polite"></span>
        </div>
      </div>
    </section>`;
}

// ---------- events ----------

function wire(path) {
  const input = view.querySelector('#address-input');
  if (input && state.mapsKey) attachAutocomplete(input, state.mapsKey, (addr) => { input.value = addr; submitAddress(addr, path); });

  if (path === '/where' && state.status === 'ready') {
    const vi = state.voterinfo || {};
    // Drawn in this order so polling places sit on top of overlapping early/drop-off pins.
    const places = [
      ...(vi.dropOffLocations || []).map((p) => ({ ...p, kind: 'dropoff' })),
      ...(vi.earlyVoteSites || []).map((p) => ({ ...p, kind: 'early' })),
      ...(vi.pollingLocations || []).map((p) => ({ ...p, kind: 'polling' })),
    ];
    const el = view.querySelector('#map');
    if (el) renderMap(el, places, state.mapsKey);
  }
  if (path === '/fau') drawQr(view.querySelector('#qr'), `${location.origin}/fau`);
}

function submitAddress(address, path) {
  const goWhere = path === '/fau';
  load(address).then(() => { if (goWhere && state.status === 'ready') navigate('/where'); });
}

document.addEventListener('submit', (ev) => {
  const form = ev.target.closest('[data-form="address"]');
  if (!form) return;
  ev.preventDefault();
  const address = form.address.value.trim();
  if (address.length >= 5) submitAddress(address, location.pathname);
});

document.addEventListener('change', (ev) => {
  const t = ev.target;
  if (t.matches('[data-form="ballot"] input[type="radio"]')) {
    const key = store.picksKey(state.election.id);
    const picks = store.get(key, {});
    picks[t.dataset.key] = t.value;
    store.set(key, picks);
    const counter = document.getElementById('pick-count');
    if (counter) counter.textContent = Object.values(picks).filter((v) => v && v !== '__undecided').length;
    const pp = t.closest('fieldset')?.querySelector('.print-pick');
    if (pp) pp.textContent = `☐ ${t.value === '__undecided' ? 'Undecided' : tidy(t.value)}`;
  }
  if (t.matches('[data-action="notify"]')) toggleNotify(t);
});

document.addEventListener('click', (ev) => {
  const a = ev.target.closest('a[data-link]');
  if (a && !ev.metaKey && !ev.ctrlKey && !ev.shiftKey && ev.button === 0) {
    ev.preventDefault();
    navigate(a.getAttribute('href'));
    document.querySelector('.nav')?.classList.remove('open');
    return;
  }
  const tab = ev.target.closest('[data-tab]');
  if (tab) { whereTab = tab.dataset.tab; render(); view.querySelector(`#tab-${whereTab}`)?.focus(); return; }

  const campus = ev.target.closest('[data-campus]');
  if (campus) { submitAddress(campus.dataset.campus, '/fau'); return; }

  const btn = ev.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  if (action === 'print') window.print();
  if (action === 'clear-picks' && confirm('Clear all your picks for this ballot?')) { store.set(store.picksKey(state.election.id), {}); render(); }
  if (action === 'ics-all') downloadIcs(keyDates(state.election, state.voterinfo), 'votehub-election-dates.ics');
  if (action === 'ics-one') { const d = keyDates(state.election, state.voterinfo)[Number(btn.dataset.index)]; downloadIcs([d], `votehub-${d.id}.ics`); }
  if (action === 'demo-on' || action === 'demo-off') { setSetting('demo', action === 'demo-on'); if (state.address) load(state.address); else render(); }
  if (action === 'copy-link') {
    navigator.clipboard?.writeText(btn.dataset.url).then(() => { btn.parentElement.querySelector('.copied').textContent = 'Copied!'; }, () => {});
  }
  if (action === 'clear-data' && confirm('Remove your saved address, ballot picks, and settings from this browser?')) {
    store.clearAll();
    Object.assign(state, { address: '', settings: { demo: false, notify: false }, status: 'idle', error: null, election: null, voterinfo: null, divisions: null, upcoming: [] });
    navigate('/');
  }
});

// Arrow-key navigation between tabs (WAI-ARIA tabs pattern).
document.addEventListener('keydown', (ev) => {
  const tab = ev.target.closest?.('[role="tab"]');
  if (!tab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(ev.key)) return;
  const tabs = [...tab.parentElement.querySelectorAll('[role="tab"]')];
  let i = tabs.indexOf(tab);
  i = ev.key === 'Home' ? 0 : ev.key === 'End' ? tabs.length - 1 : (i + (ev.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  ev.preventDefault();
  tabs[i].click();
});

window.addEventListener('popstate', () => render(true));

document.querySelector('.menu-toggle')?.addEventListener('click', (ev) => {
  const nav = document.querySelector('.nav');
  const open = nav.classList.toggle('open');
  ev.currentTarget.setAttribute('aria-expanded', String(open));
});

function setSetting(k, v) {
  state.settings = { ...state.settings, [k]: v };
  store.set('settings', state.settings);
}

async function toggleNotify(box) {
  if (!box.checked) return setSetting('notify', false);
  const perm = await Notification.requestPermission();
  box.checked = perm === 'granted';
  setSetting('notify', box.checked);
  if (box.checked) maybeNotify();
}

// Shows one notification per key date (today or tomorrow) while the tab is open.
function maybeNotify() {
  if (!state.settings.notify || !('Notification' in window) || Notification.permission !== 'granted') return;
  const shown = store.get('notified', {});
  for (const d of keyDates(state.election, state.voterinfo)) {
    const n = daysUntil(d.date);
    const tag = `${d.id}:${d.date}:${n}`;
    if ((n === 0 || n === 1) && !shown[tag]) {
      new Notification(n === 0 ? `Today: ${d.title}` : `Tomorrow: ${d.title}`, { body: d.note, tag });
      shown[tag] = true;
    }
  }
  store.set('notified', shown);
}

function drawQr(el, text) {
  if (!el || !window.qrcode) return;
  const qr = window.qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  el.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}

// ---------- boot ----------

render();
getConfig().then((cfg) => { state.mapsKey = cfg.mapsKey; });
if (state.address) load(state.address);
