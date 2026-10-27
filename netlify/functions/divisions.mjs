import { civic, cleanAddress, fail } from './_civic.mjs';

// GET /.netlify/functions/divisions?address=... -> civicinfo/v2/divisionsByAddress (cached 24h)
export default async (req) => {
  if (req.method !== 'GET') return fail('method', 'Use GET.', 405);
  const address = cleanAddress(new URL(req.url).searchParams.get('address'));
  if (!address) return fail('address', 'Enter a full street address.', 400);
  return civic('/divisionsByAddress', { address }, 24 * 60 * 60);
};
