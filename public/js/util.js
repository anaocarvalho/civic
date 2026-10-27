// Small DOM + formatting helpers. All API text goes through esc()/safeUrl() before rendering.

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function safeUrl(url) {
  try {
    const u = new URL(String(url));
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}

export function link(url, text, cls = '') {
  const href = safeUrl(url);
  if (!href) return '';
  return `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer"${cls ? ` class="${cls}"` : ''}>${esc(text)}<span class="sr-only"> (opens in new tab)</span></a>`;
}

export function formatAddress(a = {}) {
  const street = (a.addressLine && a.addressLine.length ? a.addressLine.join(', ') : [a.line1, a.line2, a.line3].filter(Boolean).join(', '));
  const cityLine = [a.city, [a.state, a.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return [street, cityLine].filter(Boolean).join(', ');
}

// Civic API data is often ALL CAPS; make it readable without mangling mixed case.
export function tidy(text) {
  const s = String(text ?? '');
  if (s !== s.toUpperCase() || !/[A-Z]/.test(s)) return s;
  return s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

// Dates from the API are "YYYY-MM-DD"; treat them as local calendar dates.
export function parseDay(ymd) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function toYmd(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function formatDay(ymd, opts = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) {
  return parseDay(ymd).toLocaleDateString('en-US', opts);
}

export function daysUntil(ymd, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((parseDay(ymd) - today) / 86400000);
}

export function directionsUrl(place) {
  const dest = place.latitude && place.longitude ? `${place.latitude},${place.longitude}` : formatAddress(place.address);
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`;
}
