# VoteHub

Enter an address, get everything you need to vote: polling place, early voting and drop-off sites on a map, a personalized sample ballot you can mark and print, key dates as calendar files, the districts you live in, and an FAU campus hub.

Built from [`docs/VoteHub_PRD.pdf`](docs/VoteHub_PRD.pdf) on the Google Civic Information API v2 (see [`docs/Google_Civic_API_Overview.pdf`](docs/Google_Civic_API_Overview.pdf)). No database: everything a user saves lives in their browser's `localStorage`.

## Pages

| Route | Feature |
| --- | --- |
| `/` | Address entry, election countdown, shortcuts |
| `/where` | F1: polling place, early voting, drop-off tabs + map + directions |
| `/ballot` | F2: sample ballot grouped Federal → State → County → Local → Referenda, picks saved per election, print/PDF checklist |
| `/dates` | F3: key dates with `.ics` download (1-day-before alarm) and Google Calendar links, optional in-tab notifications |
| `/districts` | F4: OCD division IDs in plain language with what each body does |
| `/fau` | F5: FAU campus quick picks, official Florida links, student FAQ, shareable link + QR code |

## How it works

```
public/                 static frontend (plain JS modules, no build step)
  js/app.js             router, state, pages
  js/elections.js       election selection, ballot grouping, early-voting dates
  js/ocd.js             OCD-ID → "U.S. House District 23"
  js/ics.js             calendar file + Google Calendar link generation
  js/map.js             Google Maps (if browser key set) or Leaflet/OpenStreetMap
  vendor/               Leaflet 1.9.4, qrcode-generator 1.4.4 (MIT)
netlify/functions/      thin proxies to civicinfo/v2 that add the API key
  elections.mjs         GET /elections          (cached 6h)
  voterinfo.mjs         GET /voterinfo          (cached 1h)
  divisions.mjs         GET /divisionsByAddress (cached 24h)
  config.mjs            exposes only the optional Maps browser key
```

The Civic API key is set in `netlify/functions/_civic.mjs`. A `GOOGLE_CIVIC_API_KEY` Netlify environment variable overrides it if set.

## Deploy to Netlify

1. In Netlify: **Add new site → Import an existing project →** pick this repo, branch `main`.
2. Build settings come from `netlify.toml` (publish `public`, functions in `netlify/functions`, no build command). Click **Deploy**.
3. Optional: add `GOOGLE_MAPS_BROWSER_KEY` under **Site configuration → Environment variables** for Google Maps + Places Autocomplete. Restrict that key by HTTP referrer to your Netlify domain. Without it the app uses an OpenStreetMap map and a plain address field.

## Run locally

```
npm run dev     # http://localhost:8888 (serves public/ and runs the functions)
npm test        # unit tests for districts, dates, ballot grouping, .ics
npm run check   # syntax check
```

## Demo mode

Real ballot data only appears near an election and coverage varies by county. On the ballot page, **Preview with Google's test election** switches to election ID 2000 with a sample Los Angeles address so you can demo the full ballot, picks, and print flow. Turn it off from the banner.

## Notes

- Neutral by design: candidates appear in API order with no ratings or endorsements.
- Google retired the Representatives API in April 2025, so `/districts` shows districts, not officials.
- **Clear my data** in the footer wipes everything VoteHub stored in the browser.
