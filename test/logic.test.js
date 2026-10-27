import test from 'node:test';
import assert from 'node:assert/strict';
import { describe, describeAll, shortLabel } from '../public/js/ocd.js';
import { buildIcs, googleCalendarUrl } from '../public/js/ics.js';
import { applicableElections, contestLevel, datesFromHours, earlyVotingRange, groupContests } from '../public/js/elections.js';
import { esc, safeUrl, tidy } from '../public/js/util.js';

test('OCD IDs become plain language', () => {
  assert.equal(describe('ocd-division/country:us/state:fl/cd:23').label, 'U.S. House District 23');
  assert.equal(describe('ocd-division/country:us/state:fl/sldu:26').label, 'State Senate District 26');
  assert.equal(describe('ocd-division/country:us/state:fl/county:palm_beach').label, 'Palm Beach County');
  assert.equal(describe('ocd-division/country:us/state:fl/county:palm_beach/school_district:palm_beach').label, 'Palm Beach School District');
  assert.equal(describe('ocd-division/country:us/state:fl/place:boca_raton').label, 'City of Boca Raton');
  assert.equal(shortLabel('ocd-division/country:us/state:fl/cd:23'), 'FL-23');
  const sorted = describeAll({ 'ocd-division/country:us/state:fl/sldl:91': {}, 'ocd-division/country:us': {} });
  assert.equal(sorted[0].label, 'United States');
});

test('elections: skips test elections and past ones, matches divisions', () => {
  const els = [
    { id: '2000', name: 'VIP Test Election', electionDay: '2031-12-06', ocdDivisionId: 'ocd-division/country:us' },
    { id: '12000', name: '2026 General', electionDay: '2026-11-03', ocdDivisionId: 'ocd-division/country:us' },
    { id: '9', name: 'Texas thing', electionDay: '2026-11-10', ocdDivisionId: 'ocd-division/country:us/state:tx' },
    { id: '8', name: 'Old', electionDay: '2020-01-01', ocdDivisionId: 'ocd-division/country:us' },
  ];
  const out = applicableElections(els, ['ocd-division/country:us', 'ocd-division/country:us/state:fl']);
  assert.deepEqual(out.map((e) => e.id), ['12000']);
});

test('early voting range parsed from hours text', () => {
  assert.deepEqual(datesFromHours('Mon, Oct 19: 7 am - 7 pm\nSun, Nov 1: 7 am - 7 pm', '2026-11-03'), ['2026-10-19', '2026-11-01']);
  const sites = [{ pollingHours: 'Mon, Oct 19: 7 am\nSun, Nov 1: 7 am' }, { startDate: '2026-10-24', endDate: '2026-10-31' }];
  assert.deepEqual(earlyVotingRange(sites, '2026-11-03'), { start: '2026-10-19', end: '2026-11-01' });
  assert.equal(earlyVotingRange([], '2026-11-03'), null);
});

test('contests grouped by level in API order', () => {
  const contests = [
    { office: 'Governor', district: { scope: 'statewide' } },
    { office: 'U.S. Senator', district: { scope: 'statewide' }, level: ['country'] },
    { type: 'Referendum', referendumTitle: 'Amendment 1' },
    { office: 'Mayor', district: { scope: 'citywide' } },
    { ballotTitle: 'MEMBER OF THE STATE ASSEMBLY', district: { scope: 'stateLower' } },
  ];
  assert.equal(contestLevel(contests[1]), 'Federal');
  assert.deepEqual(groupContests(contests).map((g) => g.level), ['Federal', 'State', 'Local', 'Referenda']);
  assert.deepEqual(groupContests(contests)[1].contests.map((c) => c.office || c.ballotTitle), ['Governor', 'MEMBER OF THE STATE ASSEMBLY']);
});

test('ics has all-day events with 1-day alarm', () => {
  const ics = buildIcs([{ id: 'eday', date: '2026-11-03', title: 'Election Day: 2026 General, FL', note: 'Vote' }], new Date('2026-10-27T00:00:00Z'));
  assert.match(ics, /DTSTART;VALUE=DATE:20261103\r\n/);
  assert.match(ics, /DTEND;VALUE=DATE:20261104\r\n/);
  assert.match(ics, /TRIGGER:-P1D/);
  assert.match(ics, /SUMMARY:Election Day: 2026 General\\, FL/);
  assert.ok(ics.split('\r\n').every((l) => l.length <= 75));
  assert.match(googleCalendarUrl({ date: '2026-11-03', title: 'X' }), /dates=20261103%2F20261104/);
});

test('escaping and URL safety', () => {
  assert.equal(esc('<img onerror=x>'), '&lt;img onerror=x&gt;');
  assert.equal(safeUrl('javascript:alert(1)'), null);
  assert.equal(safeUrl('https://dos.fl.gov/'), 'https://dos.fl.gov/');
  assert.equal(tidy('PIO PICO MIDDLE SCHOOL'), 'Pio Pico Middle School');
  assert.equal(tidy('McKinnor'), 'McKinnor');
});
