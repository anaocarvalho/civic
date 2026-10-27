import { json } from './_civic.mjs';

// GET /.netlify/functions/config -> public browser config.
// Only the referrer-restricted Maps browser key is exposed here, never the Civic key.
export default async () =>
  json({ mapsKey: process.env.GOOGLE_MAPS_BROWSER_KEY || null }, 200, 300);
