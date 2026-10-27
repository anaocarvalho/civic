import { civic, fail } from './_civic.mjs';

// GET /.netlify/functions/elections -> civicinfo/v2/elections (cached 6h)
export default async (req) => {
  if (req.method !== 'GET') return fail('method', 'Use GET.', 405);
  return civic('/elections', {}, 6 * 60 * 60);
};
