// localStorage wrapper. The app must work when storage is blocked, so every access is guarded.
const PREFIX = 'votehub:';

export function get(key, fallback = null) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function set(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage unavailable: picks/settings are a convenience only */
  }
}

export function clearAll() {
  try {
    Object.keys(localStorage).filter((k) => k.startsWith(PREFIX)).forEach((k) => localStorage.removeItem(k));
  } catch {
    /* nothing to clear */
  }
}

export const picksKey = (electionId) => `picks:${electionId}`;
