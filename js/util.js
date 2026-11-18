// Small shared helpers: HTML escaping, number/time/date handling, rounding.

export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export const cap = (text) => String(text).charAt(0).toUpperCase() + String(text).slice(1);

export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Reads a number typed by the user.
// Returns null when empty, NaN when it is not a usable number in [min, max].
export function toNum(text, { min = 0, max = 1e6, int = false } = {}) {
  const t = String(text ?? '').trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < min || n > max) return NaN;
  return int ? Math.round(n) : n;
}

// Seconds -> "m:ss" (or "h:mm:ss" above an hour).
export function fmtTime(totalSeconds) {
  if (totalSeconds == null || !Number.isFinite(Number(totalSeconds))) return '–';
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

// Timer display: always 2-digit minutes.
export function fmtClock(totalSeconds) {
  const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function fmtRoundsReps(totalReps, perRound) {
  const total = Math.max(0, Math.round(totalReps || 0));
  const rounds = Math.floor(total / perRound);
  const reps = total % perRound;
  return reps ? `${plural(rounds, 'round')} + ${reps}` : plural(rounds, 'round');
}

export function roundTo(value, step = 2.5) {
  return Math.round(value / step) * step;
}

export function fmtNum(value) {
  const v = Math.round(value * 10) / 10;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

export function fmtKg(value) {
  return `${fmtNum(value)} kg`;
}

// ---- Dates (local, ISO "YYYY-MM-DD") ----

export function toISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Parse at local noon so DST changes never shift the day.
export function fromISO(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

// True only for a real calendar date written as YYYY-MM-DD.
export function isISO(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = fromISO(value);
  return !isNaN(d) && toISO(d) === value && d.getFullYear() >= 2000 && d.getFullYear() <= 2100;
}

export function todayISO() {
  return toISO(new Date());
}

export function addDays(iso, n) {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function daysBetween(fromIso, toIso) {
  return Math.round((fromISO(toIso) - fromISO(fromIso)) / 86400000);
}

export function fmtDate(iso, opts = { weekday: 'short', month: 'short', day: 'numeric' }) {
  if (!isISO(iso)) return '–';
  return fromISO(iso).toLocaleDateString('en-GB', opts);
}

export function fmtLongDate(iso) {
  return fmtDate(iso, { weekday: 'long', day: 'numeric', month: 'long' });
}

export function fmtShortDate(iso) {
  return fmtDate(iso, { day: 'numeric', month: 'short' });
}

export function weekdayShort(iso) {
  return fmtDate(iso, { weekday: 'short' });
}

let toastTimer;
export function toast(message, ms = 2800) {
  if (typeof document === 'undefined') return;
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

export function qs(params) {
  return new URLSearchParams(params).toString();
}

// "a, b and c"
export function listText(items) {
  const list = items.filter(Boolean);
  if (list.length <= 1) return list.join('');
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}
