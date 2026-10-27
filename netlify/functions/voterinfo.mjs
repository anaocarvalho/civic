import { civic, cleanAddress, fail } from './_civic.mjs';

// GET /.netlify/functions/voterinfo?address=...&electionId=... (cached 1h)
export default async (req) => {
  if (req.method !== 'GET') return fail('method', 'Use GET.', 405);
  const params = new URL(req.url).searchParams;
  const address = cleanAddress(params.get('address'));
  if (!address) return fail('address', 'Enter a full street address.', 400);
  const electionId = params.get('electionId') || '';
  if (electionId && !/^\d{1,10}$/.test(electionId)) return fail('election', 'Invalid election ID.', 400);
  return civic('/voterinfo', { address, electionId }, 60 * 60);
};
