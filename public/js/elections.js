// Election selection, ballot grouping, and key-date extraction from Civic API responses.
import { daysUntil, parseDay, toYmd } from './util.js';

export const TEST_ELECTION_ID = '2000';
const isTest = (e) => e.id === TEST_ELECTION_ID || e.id === '1001' || /test/i.test(e.name);

// Elections that apply to the user's districts, soonest first. Excludes Google's test elections.
export function applicableElections(elections = [], divisionIds = []) {
  const ids = new Set(divisionIds);
  return elections
    .filter((e) => !isTest(e) && daysUntil(e.electionDay) >= 0)
    .filter((e) => !ids.size || ids.has(e.ocdDivisionId))
    .sort((a, b) => a.electionDay.localeCompare(b.electionDay));
}

const LEVELS = ['Federal', 'State', 'County', 'Local', 'Referenda'];

export function contestLevel(c) {
  if (c.type === 'Referendum' || c.referendumTitle) return 'Referenda';
  const levels = c.level || [];
  const scope = c.district?.scope || '';
  const office = `${c.office || ''} ${c.ballotTitle || ''}`;
  if (levels.includes('country') || ['national', 'congressional'].includes(scope) || /president|u\.?s\.? (senat|represent|house)|united states|congress/i.test(office)) return 'Federal';
  if (levels.includes('administrativeArea1') || ['statewide', 'stateUpper', 'stateLower'].includes(scope)) return 'State';
  if (levels.includes('administrativeArea2') || ['countywide', 'countyCouncil', 'judicial'].includes(scope)) return 'County';
  return 'Local';
}

// Keeps API order within each level (neutral display).
export function groupContests(contests = []) {
  const groups = Object.fromEntries(LEVELS.map((l) => [l, []]));
  contests.forEach((c, i) => groups[contestLevel(c)].push({ ...c, key: contestKey(c, i) }));
  return LEVELS.map((level) => ({ level, contests: groups[level] })).filter((g) => g.contests.length);
}

export function contestKey(c, i) {
  return `${i}:${c.office || c.ballotTitle || c.referendumTitle || 'contest'}`.slice(0, 120);
}

export const contestTitle = (c) => c.office || c.ballotTitle || c.referendumTitle || 'Contest';

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

// Dates from "Mon, Oct 19: 7 am - 7 pm" lines; the year is inferred from election day.
export function datesFromHours(hours, electionDay) {
  const ed = parseDay(electionDay);
  const out = [];
  for (const m of String(hours || '').matchAll(/\b([A-Z][a-z]{2}) (\d{1,2})\b/g)) {
    const month = MONTHS[m[1].toLowerCase()];
    if (month == null) continue;
    let year = ed.getFullYear();
    if (month > ed.getMonth() + 2) year -= 1; // e.g. December dates before a January election
    out.push(toYmd(new Date(year, month, Number(m[2]))));
  }
  return out;
}

// Earliest/latest early-voting dates across all sites, or null if the API has none.
export function earlyVotingRange(sites = [], electionDay) {
  const days = [];
  for (const s of sites) {
    if (s.startDate) days.push(s.startDate);
    if (s.endDate) days.push(s.endDate);
    if (!s.startDate && !s.endDate) days.push(...datesFromHours(s.pollingHours, electionDay));
  }
  const valid = days.filter((d) => d < electionDay).sort();
  return valid.length ? { start: valid[0], end: valid[valid.length - 1] } : null;
}

export function keyDates(election, voterinfo) {
  if (!election) return [];
  const dates = [];
  const ev = earlyVotingRange(voterinfo?.earlyVoteSites, election.electionDay);
  if (ev) {
    dates.push({ id: 'ev-start', date: ev.start, title: `Early voting begins: ${election.name}`, note: 'First day of early voting at sites near you.' });
    dates.push({ id: 'ev-end', date: ev.end, title: `Last day of early voting: ${election.name}`, note: 'Final day to vote early in person.' });
  }
  dates.push({ id: 'eday', date: election.electionDay, title: `Election Day: ${election.name}`, note: 'Vote at your assigned polling place.' });
  return dates;
}
