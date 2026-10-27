// Shared helper for the Civic API proxy functions.
// Adds the server-side key, maps Google errors to friendly codes, and never logs the address.

const BASE = 'https://www.googleapis.com/civicinfo/v2';

// Netlify env var wins if set; otherwise use the bundled project key.
const CIVIC_KEY = process.env.GOOGLE_CIVIC_API_KEY || 'AIzaSyBzLebRaukoSxk0tFOzPwNPJ-OidbGEg3g';

export function json(body, status = 200, maxAgeSeconds = 0) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8' };
  headers['Cache-Control'] = status === 200 && maxAgeSeconds > 0
    ? `public, max-age=${maxAgeSeconds}`
    : 'no-store';
  return new Response(JSON.stringify(body), { status, headers });
}

export function fail(code, message, status) {
  return json({ error: { code, message } }, status);
}

export function cleanAddress(raw) {
  const address = String(raw ?? '').trim().replace(/\s+/g, ' ');
  if (address.length < 5 || address.length > 200) return null;
  return address;
}

export async function civic(path, params, maxAgeSeconds) {
  const key = CIVIC_KEY;

  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v);
  url.searchParams.set('key', key);

  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  } catch {
    return fail('network', 'Could not reach the Google Civic API. Try again in a moment.', 502);
  }

  const data = await res.json().catch(() => ({}));
  if (res.ok) return json(data, 200, maxAgeSeconds);

  const reason = data?.error?.errors?.[0]?.reason || '';
  const msg = data?.error?.message || '';
  if (res.status === 429 || /rateLimit|quota/i.test(reason)) {
    return fail('quota', 'Too many lookups right now. Please wait a minute and try again.', 429);
  }
  if (res.status === 400 && /parse|address/i.test(msg)) {
    return fail('address', "We couldn't find that address. Include street, city, and state or ZIP.", 400);
  }
  if (res.status === 400 && /election/i.test(msg)) {
    return fail('election', 'That election is not available for this address.', 404);
  }
  if (res.status === 404) {
    return fail('nodata', 'No voting information is available for this address yet.', 404);
  }
  // Log only the status and Google's reason, never the request URL (it contains the address and key).
  console.error('civic api error', res.status, reason);
  return fail('upstream', 'The Civic API returned an error. Try again later.', 502);
}
