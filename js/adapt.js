// Auto-adjusting difficulty.
// Every main part of a session belongs to a "track" (engine intervals, back squat, ...).
// After each session you say how that part went; the next session on the same track adjusts:
//   Too easy        -> one step harder
//   Just right      -> no change (two in a row move an eased track one step back toward the plan)
//   Too hard        -> one step easier
//   Couldn't finish -> two steps easier
// A step is 2.5 kg for lifts, 5% for interval time / set sizes / reps, 10% for Zone 2 minutes.
// Levels are always worked out from the logs, so editing or deleting a log fixes the plan too.

import { getState, update } from './store.js';
import { ordOf, allSessions } from './data/calendar.js';
import { clamp, fmtNum, fmtKg, todayISO, addDays } from './util.js';

export const OUTCOMES = { easy: 'Too easy', right: 'Just right', hard: 'Too hard', fail: "Couldn't finish" };

export const TRACKS = {
  engine: { name: 'Engine intervals', kind: 'pct', step: 0.05, min: -6, max: 4, up: 'longer', down: 'shorter' },
  squat: { name: 'Back squat', kind: 'kg', step: 2.5, min: -6, max: 4, up: 'heavier', down: 'lighter' },
  'gym-emom': { name: 'Gymnastics EMOM', kind: 'pct', step: 0.05, min: -6, max: 4, up: 'bigger sets', down: 'smaller sets' },
  'gym-db': { name: 'DB piece', kind: 'pct', step: 0.05, min: -6, max: 4, up: 'more reps', down: 'fewer reps' },
  z2: { name: 'Zone 2', kind: 'pct', step: 0.1, min: -4, max: 0, up: 'longer', down: 'shorter' },
  cj: { name: 'Clean & jerk', kind: 'kg', step: 2.5, min: -6, max: 4, up: 'heavier', down: 'lighter' },
  snatch: { name: 'Snatch', kind: 'kg', step: 2.5, min: -6, max: 4, up: 'heavier', down: 'lighter' },
};

// Easy return period after time off: everything a bit lighter.
export const EASE_PCT = 0.85;
export const EASE_KG = 0.9;
export const EASE_DAYS = 7;

function applyOutcome(st, t, outcome) {
  const move = (d, why) => {
    const next = clamp(st.steps + d, t.min, t.max);
    if (next !== st.steps) { st.steps = next; st.why = why; }
  };
  if (outcome === 'easy') { move(1, 'it felt too easy'); st.rights = 0; }
  else if (outcome === 'hard') { move(-1, 'it felt too hard'); st.rights = 0; }
  else if (outcome === 'fail') { move(-2, 'you could not finish it'); st.rights = 0; }
  else if (outcome === 'right') {
    st.rights += 1;
    if (st.steps < 0 && st.rights >= 2) { move(1, 'the last two went well'); st.rights = 0; }
  }
  if (st.steps === 0) st.why = '';
  return st;
}

// Level of a track for a session at plan position `ord` (only earlier sessions count).
function fold(trackId, ord) {
  const t = TRACKS[trackId];
  const st = { steps: 0, rights: 0, why: '' };
  if (!t) return st;
  const s = getState();
  const events = [];
  for (const tw of s.tweaks) {
    if (tw.track === trackId && tw.ord <= ord) events.push({ o: tw.ord, k: 0, at: tw.at || 0, tw });
  }
  for (const l of s.logs) {
    if (l.kind !== 'block' || l.track !== trackId || !l.outcome) continue;
    if (t.kind === 'kg' && l.swapped) continue; // a different lift says nothing about this one
    const o = ordOf(l.sessionId);
    if (o == null || o >= ord) continue;
    events.push({ o, k: 1, at: l.at || 0, log: l });
  }
  events.sort((a, b) => a.o - b.o || a.k - b.k || a.at - b.at);
  for (const e of events) {
    if (e.tw) {
      const next = clamp(e.tw.set != null ? e.tw.set : st.steps + (e.tw.d || 0), t.min, t.max);
      if (next !== st.steps) { st.steps = next; st.why = next ? 'you set it' : ''; }
      st.rights = 0;
    } else applyOutcome(st, t, e.log.outcome);
  }
  return st;
}

export function levelAt(trackId, ord = Infinity) {
  const { steps, why } = fold(trackId, ord);
  return { steps, why };
}

// "about 5% longer" / "2.5 kg lighter".
// Percentages are approximate: the session rounds to whole reps, half minutes or 5 minutes.
export function amount(trackId, steps) {
  const t = TRACKS[trackId];
  if (!t || !steps) return 'as planned';
  const n = Math.abs(steps) * t.step;
  const size = t.kind === 'kg' ? fmtKg(n) : `about ${fmtNum(n * 100)}%`;
  return `${size} ${steps > 0 ? t.up : t.down}`;
}

// Line shown on a block when it differs from the plan. `plan` is the planned value, e.g. "5 min".
export function adjText(trackId, lv, eased, plan = '') {
  const t = TRACKS[trackId];
  const parts = [];
  if (t && lv?.steps) {
    const how = t.kind === 'kg' ? amount(trackId, lv.steps) : (lv.steps > 0 ? t.up : t.down);
    parts.push(`${how} than planned${plan ? ` (plan: ${plan})` : ''}${lv.why ? ` because ${lv.why}` : ''}`);
  }
  if (eased) parts.push(`${parts.length ? 'and ' : ''}lighter for your easy return week${!parts.length && plan ? ` (plan: ${plan})` : ''}`);
  if (!parts.length) return '';
  const text = parts.join(', ');
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

// What picking an outcome will do to the next session on this track.
export function nextChange(trackId, ord, outcome) {
  const t = TRACKS[trackId];
  if (!t) return { d: 0, text: '' };
  const before = fold(trackId, ord);
  const after = applyOutcome({ ...before }, t, outcome);
  const d = after.steps - before.steps;
  if (!d) {
    if (outcome === 'easy' && before.steps >= t.max) return { d, text: trackId === 'z2' ? 'Zone 2 is meant to feel easy: no change.' : 'Already at the top step: no change.' };
    if ((outcome === 'hard' || outcome === 'fail') && before.steps <= t.min) return { d, text: 'Already at the lowest step: no change.' };
    return { d, text: 'Next time: no change.' };
  }
  const back = after.steps === 0 ? ' (back to the plan)' : '';
  return { d, text: `Next time: ${amount(trackId, d)}${back}.` };
}

function nowOrd() {
  const p = getState().profile;
  const today = todayISO();
  const next = allSessions(p).find((s) => s.date >= today);
  return next ? ordOf(next.id) : 0;
}

// Manual change: one step easier or harder from session `ord` on.
// Returns false when the track is already at its limit (nothing changes).
export function addTweak(trackId, d, ord = null) {
  if (!TRACKS[trackId]) return false;
  const view = ord == null ? Infinity : ord;
  const at = ord == null ? nowOrd() : ord;
  const before = fold(trackId, view).steps;
  const tweak = { track: trackId, ord: at, d, at: Date.now() };
  getState().tweaks.push(tweak);
  if (fold(trackId, view).steps === before) {
    getState().tweaks.pop();
    return false;
  }
  update(() => {});
  return true;
}

export function resetTrack(trackId, ord = nowOrd()) {
  if (!TRACKS[trackId]) return;
  update((s) => {
    s.tweaks = s.tweaks.filter((tw) => !(tw.track === trackId && tw.ord >= ord));
    s.tweaks.push({ track: trackId, ord, set: 0, at: Date.now() });
  });
}

// ---- Press: no fixed weight in the plan, so suggest one from the last logged weight ----

export function pressAdvice(mv, ord = Infinity) {
  const last = getState().logs
    .filter((l) => l.kind === 'block' && l.key === 'barbell-press' && l.mv === mv && l.score?.kg > 0)
    .map((l) => ({ l, o: ordOf(l.sessionId) }))
    .filter((x) => x.o != null && x.o < ord)
    .sort((a, b) => b.o - a.o)[0]?.l;
  if (!last) return null;
  const d = { easy: 2.5, right: 0, hard: -2.5, fail: -5 }[last.outcome] ?? 0;
  const kg = Math.max(2.5, last.score.kg + d);
  const felt = OUTCOMES[last.outcome] ? `, ${OUTCOMES[last.outcome].toLowerCase()}` : '';
  return { kg, text: `${d ? 'Try' : 'Use'} ${fmtKg(kg)} (last time: ${fmtKg(last.score.kg)}${felt})` };
}

// ---- Easy return period ----

export function easeOn(profile, iso) {
  const e = profile.ease;
  return !!e && iso >= e.from && iso <= e.until;
}

export function startEase() {
  const from = todayISO();
  update((s) => { s.profile.ease = { from, until: addDays(from, EASE_DAYS - 1) }; });
}

export function stopEase() {
  update((s) => { s.profile.ease = null; });
}

// ---- Running the cycle again ----
// Keeps benchmark history and the current difficulty levels, clears the session ticks.
export function startNewCycle(startISO) {
  const levels = Object.keys(TRACKS).map((id) => ({ id, steps: fold(id, Infinity).steps }));
  update((s) => {
    const n = s.profile.cycle || 1;
    for (const l of s.logs) if (l.sessionId && !String(l.sessionId).includes(':')) l.sessionId = `c${n}:${l.sessionId}`;
    s.done = {};
    s.skipped = {};
    s.notes = {};
    s.day = {};
    s.tweaks = levels.filter((x) => x.steps).map((x) => ({ track: x.id, ord: 0, set: x.steps, at: Date.now() }));
    Object.assign(s.profile, { cycle: n + 1, startDate: startISO, shift: 0, weekDays: {}, ease: null });
  });
}
