/* Small helpers shared across the app: identifiers, randomness, dates. */

export function uid() {
  if (globalThis.crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

/* Fisher and Yates, on a copy so callers keep their own order. */
export function shuffle(list) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function sample(list, count) {
  return shuffle(list).slice(0, Math.max(0, count));
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export const DAY_MS = 86400000;

/* Local calendar day as YYYY-MM-DD. Never UTC: a review done at 23h belongs
   to the day the learner experienced, not to tomorrow. */
export function dayKey(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

export function startOfDay(ts = Date.now()) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function addDays(ts, days) {
  const d = new Date(ts);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

export function lastDayKeys(count, from = new Date()) {
  const keys = [];
  for (let i = count - 1; i >= 0; i--) keys.push(dayKey(new Date(addDays(from.getTime(), -i))));
  return keys;
}

export function formatDuration(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m + ':' + String(s).padStart(2, '0');
}

/* Bytes as base64, a slice at a time so a picture does not overflow the
   argument list of fromCharCode. */
export function toBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function fromBase64(text) {
  return Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
}

export function pct(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}
