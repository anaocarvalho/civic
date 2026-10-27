// Calls our Netlify Functions (never Google directly, so the Civic key stays server-side).

export class ApiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

async function call(name, params = {}) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
  let res;
  try {
    res = await fetch(`/.netlify/functions/${name}${qs ? `?${qs}` : ''}`);
  } catch {
    throw new ApiError('network', "You appear to be offline. Check your connection and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data?.error?.code || 'upstream', data?.error?.message || 'Something went wrong.');
  return data;
}

export const getElections = () => call('elections');
export const getVoterInfo = (address, electionId) => call('voterinfo', { address, electionId });
export const getDivisions = (address) => call('divisions', { address });
export const getConfig = () => call('config').catch(() => ({ mapsKey: null }));
