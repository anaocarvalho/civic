// Map of voting locations. Uses Google Maps when a referrer-restricted browser key is configured,
// otherwise Leaflet + OpenStreetMap (vendored). A text list is always rendered next to it.
import { directionsUrl, esc, formatAddress, tidy } from './util.js';

export const KINDS = {
  polling: { label: 'Election Day polling place', color: '#0f766e' },
  early: { label: 'Early voting site', color: '#b45309' },
  dropoff: { label: 'Ballot drop-off', color: '#7c3aed' },
};

let googlePromise = null;
let leafletPromise = null;

export function loadGoogle(key) {
  if (!key) return Promise.resolve(null);
  if (window.google?.maps) return Promise.resolve(window.google);
  googlePromise ??= new Promise((resolve) => {
    window.__votehubMapsReady = () => resolve(window.google);
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places&v=weekly&loading=async&callback=__votehubMapsReady`;
    s.async = true;
    s.onerror = () => resolve(null);
    document.head.append(s);
  });
  return googlePromise;
}

function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  leafletPromise ??= new Promise((resolve) => {
    const css = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: '/vendor/leaflet/leaflet.css' });
    const s = Object.assign(document.createElement('script'), { src: '/vendor/leaflet/leaflet.js' });
    s.onload = () => resolve(window.L);
    s.onerror = () => resolve(null);
    document.head.append(css, s);
  });
  return leafletPromise;
}

function popupHtml(p) {
  return `<strong>${esc(tidy(p.address?.locationName || KINDS[p.kind].label))}</strong><br>${esc(tidy(formatAddress(p.address)))}<br><a href="${esc(directionsUrl(p))}" target="_blank" rel="noopener noreferrer">Get directions</a>`;
}

export async function renderMap(el, places, mapsKey) {
  const pts = places.filter((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude));
  if (!pts.length) { el.hidden = true; return; }
  el.hidden = false;

  const g = await loadGoogle(mapsKey);
  if (g?.maps) {
    const map = new g.maps.Map(el, { mapTypeControl: false, streetViewControl: false });
    const bounds = new g.maps.LatLngBounds();
    const info = new g.maps.InfoWindow();
    for (const p of pts) {
      const pos = { lat: p.latitude, lng: p.longitude };
      const marker = new g.maps.Marker({
        position: pos, map, title: p.address?.locationName || KINDS[p.kind].label,
        icon: { path: g.maps.SymbolPath.CIRCLE, scale: 8, fillColor: KINDS[p.kind].color, fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 },
      });
      marker.addListener('click', () => { info.setContent(popupHtml(p)); info.open({ map, anchor: marker }); });
      bounds.extend(pos);
    }
    if (pts.length === 1) { map.setCenter(bounds.getCenter()); map.setZoom(15); } else map.fitBounds(bounds);
    return;
  }

  const L = await loadLeaflet();
  if (!L) { el.hidden = true; return; }
  el._leaflet?.remove();
  const map = L.map(el, { scrollWheelZoom: false });
  el._leaflet = map;
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);
  const markers = pts.map((p) => L.circleMarker([p.latitude, p.longitude], {
    radius: 8, color: '#fff', weight: 2, fillColor: KINDS[p.kind].color, fillOpacity: 1,
  }).bindPopup(popupHtml(p)).addTo(map));
  if (pts.length === 1) map.setView([pts[0].latitude, pts[0].longitude], 15);
  else map.fitBounds(L.featureGroup(markers).getBounds().pad(0.1));
}

// Optional Places Autocomplete on the address input (only with a Maps browser key).
export async function attachAutocomplete(input, mapsKey, onPick) {
  const g = await loadGoogle(mapsKey);
  if (!g?.maps?.places?.Autocomplete || input.dataset.ac) return;
  input.dataset.ac = '1';
  const ac = new g.maps.places.Autocomplete(input, { componentRestrictions: { country: 'us' }, fields: ['formatted_address'], types: ['address'] });
  ac.addListener('place_changed', () => {
    const addr = ac.getPlace()?.formatted_address;
    if (addr) onPick(addr);
  });
}
