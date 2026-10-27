// Turns OCD division IDs into plain language.
// ocd-division/country:us/state:fl/cd:23 -> "U.S. House District 23"

const STATES = { al: 'Alabama', ak: 'Alaska', az: 'Arizona', ar: 'Arkansas', ca: 'California', co: 'Colorado', ct: 'Connecticut', de: 'Delaware', dc: 'District of Columbia', fl: 'Florida', ga: 'Georgia', hi: 'Hawaii', id: 'Idaho', il: 'Illinois', in: 'Indiana', ia: 'Iowa', ks: 'Kansas', ky: 'Kentucky', la: 'Louisiana', me: 'Maine', md: 'Maryland', ma: 'Massachusetts', mi: 'Michigan', mn: 'Minnesota', ms: 'Mississippi', mo: 'Missouri', mt: 'Montana', ne: 'Nebraska', nv: 'Nevada', nh: 'New Hampshire', nj: 'New Jersey', nm: 'New Mexico', ny: 'New York', nc: 'North Carolina', nd: 'North Dakota', oh: 'Ohio', ok: 'Oklahoma', or: 'Oregon', pa: 'Pennsylvania', ri: 'Rhode Island', sc: 'South Carolina', sd: 'South Dakota', tn: 'Tennessee', tx: 'Texas', ut: 'Utah', vt: 'Vermont', va: 'Virginia', wa: 'Washington', wv: 'West Virginia', wi: 'Wisconsin', wy: 'Wyoming', pr: 'Puerto Rico' };

// type code -> [label builder, what this body does, sort order]
const TYPES = {
  country: [() => 'United States', 'Federal government: President, U.S. Senate, and U.S. House are elected here.', 0],
  state: [(v) => STATES[v] || v.toUpperCase(), 'State government: Governor, Cabinet, and statewide ballot measures.', 1],
  cd: [(v) => `U.S. House District ${v}`, 'Elects one member of the U.S. House of Representatives, who votes on federal laws and the federal budget.', 2],
  sldu: [(v) => `State Senate District ${v}`, 'Elects a state senator, who votes on state laws, taxes, and the state budget.', 3],
  sldl: [(v) => `State House District ${v}`, 'Elects a state representative to the lower chamber of the state legislature.', 4],
  county: [(v) => `${titleCase(v)} County`, 'County government: sheriff, property appraiser, tax collector, and county commission.', 5],
  council_district: [(v) => `County Commission District ${v}`, 'Elects a county commissioner, who sets county budgets, zoning, and local services.', 6],
  school_district: [(v) => `${titleCase(v)} School District`, 'The school board oversees public schools, curriculum policy, and the school budget.', 7],
  place: [(v) => `City of ${titleCase(v)}`, 'City government: mayor and city council handle local police, parks, roads, and permits.', 8],
  ward: [(v) => `Ward ${v}`, 'A city ward that elects a council member.', 9],
  judicial_circuit: [(v) => `Judicial Circuit ${v}`, 'Trial courts for this area; circuit judges may appear on your ballot.', 10],
};

function titleCase(slug) {
  return String(slug).replace(/[_~-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function describe(ocdId, apiName = '') {
  const parts = String(ocdId).replace(/^ocd-division\//, '').split('/');
  const [type, value] = (parts[parts.length - 1] || '').split(':');
  const known = TYPES[type];
  if (!known) {
    return { id: ocdId, type, label: apiName ? titleCase(apiName) : titleCase(value || ocdId), about: 'A local district that may have its own races or measures.', order: 50 };
  }
  return { id: ocdId, type, label: known[0](value), about: known[1], order: known[2] };
}

export function describeAll(divisions = {}) {
  return Object.entries(divisions)
    .map(([id, d]) => describe(id, d?.name))
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, undefined, { numeric: true }));
}

// Short label used in the home summary, e.g. "FL-23"
export function shortLabel(ocdId) {
  const state = (String(ocdId).match(/state:([a-z]{2})/) || [])[1];
  const cd = (String(ocdId).match(/cd:(\d+)/) || [])[1];
  return state && cd ? `${state.toUpperCase()}-${cd}` : null;
}
