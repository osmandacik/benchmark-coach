// App state, saved in this device's browser storage (localStorage).
// Nothing is ever sent to a server. Use Profile > Backup to keep a copy.
// Everything read from storage or from a backup file is cleaned first, so bad data cannot break the app.

import { uid, isISO, clamp, toast } from './util.js';
import { BENCHMARKS } from './data/benchmarks.js';
import { LIMIT_NAMES, EQUIP, MOVES } from './data/moves.js';

const KEY = 'benchmark-coach.v1';
const TYPES = ['engine', 'gym', 'aerobic', 'barbell', 'test'];

export function defaultState() {
  return {
    v: 2,
    profile: {
      startDate: '2026-11-16',
      shift: 0, // days the whole plan has been pushed back
      cycle: 1,
      // Session type -> day offset in the training week (0 = first day, a Monday by default).
      days: { engine: 0, gym: 1, aerobic: 2, barbell: 3, test: 5 },
      weekDays: {},    // week -> day offsets, when sessions were swapped inside one week
      testOrder: null, // custom order of the 12 weekly tests (null = default rotation)
      missing: [],     // equipment my gym never has
      ease: null,      // { from, until }: easy return period after time off
      unbroken: { pullup: 25, t2b: 30, du: 100, bmu: 5, hspu: 20 },
      maxes: { backSquat: 100, cleanJerk: 80, snatch: 60, deadliftCap: 80 },
      weights: { fran: 43, jackie: 20, open231: 43, open231ball: 9, open241: 22.5 },
    },
    // Ladder start level per benchmark (only Cindy and Angie have more than one level).
    // Level-ups are worked out from the logged results after `setAt`.
    bench: {
      jackie: { level: 0 }, cindy: { level: 0 }, fran: { level: 0 },
      open241: { level: 0 }, angie: { level: 0 }, open231: { level: 0 },
    },
    logs: [
      { id: 'seed-angie', date: '2026-11-13', kind: 'test', bench: 'angie', level: 0,
        score: { time: 720 }, notes: 'Before the cycle', seed: true, at: 1 },
      { id: 'seed-cindy', date: '2026-11-13', kind: 'test', bench: 'cindy', level: 0,
        score: { reps: 300 }, notes: 'Before the cycle', seed: true, at: 1 },
    ],
    done: {},    // sessionId -> ISO date it was completed
    skipped: {}, // sessionId -> ISO date it was skipped
    notes: {},   // sessionId -> free text
    day: {},     // sessionId -> { missing: [], swaps: {}, menu: {} } changes for one session
    swaps: {},   // movement -> alternative, used every time
    tweaks: [],  // difficulty changes made by hand: { track, ord, d | set, at }
    meta: { lastExport: null },
  };
}

let state = null;
let saveFailed = false;

// ---- Cleaning ----

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const str = (v, max = 200) => (typeof v === 'string' ? v.slice(0, max) : '');

function numIn(v, fallback, lo, hi) {
  if (v === null || v === '' || typeof v === 'boolean') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? clamp(n, lo, hi) : fallback;
}

// Day offsets must be five different days (0–6); otherwise fall back to `base` (or null).
function cleanDays(saved, base) {
  const fallback = base ? { ...base } : null;
  if (!isObj(saved)) return fallback;
  const out = {};
  for (const t of TYPES) out[t] = Math.round(numIn(saved[t], -1, -1, 6));
  const vals = Object.values(out);
  return vals.every((v) => v >= 0) && new Set(vals).size === TYPES.length ? out : fallback;
}

function cleanNums(saved, base, lo, hi) {
  const out = { ...base };
  if (isObj(saved)) for (const k of Object.keys(base)) out[k] = numIn(saved[k], base[k], lo, hi);
  return out;
}

function cleanDateMap(saved) {
  const out = {};
  if (isObj(saved)) for (const [k, v] of Object.entries(saved)) if (isISO(v)) out[String(k).slice(0, 40)] = v;
  return out;
}

function cleanLog(l) {
  if (!isObj(l) || !isISO(l.date) || !['test', 'block', 'other'].includes(l.kind)) return null;
  const out = { ...l, id: str(l.id, 60) || uid(), at: numIn(l.at, 0, 0, 1e15), notes: str(l.notes, 2000) };
  out.score = {};
  if (isObj(l.score)) {
    for (const [k, v] of Object.entries(l.score)) {
      const n = Number(v);
      if (v != null && v !== '' && Number.isFinite(n) && n >= 0) out.score[str(k, 20)] = n;
    }
  }
  if (out.sessionId != null) out.sessionId = str(out.sessionId, 40);
  if (l.kind === 'test') {
    const bench = BENCHMARKS[l.bench];
    if (!bench || (out.score.time == null && out.score.reps == null)) return null;
    out.level = Math.round(numIn(l.level, 0, 0, bench.levels.length - 1));
    out.modified = !!l.modified;
    out.hit = l.hit === true || l.hit === false ? l.hit : null;
    out.target = isObj(l.target) ? l.target : null;
  }
  if (l.kind === 'block') {
    if (typeof l.key !== 'string') return null;
    out.key = str(l.key, 60);
    const oc = l.outcome || l.feel; // v1 backups used "feel"
    out.outcome = ['easy', 'right', 'hard', 'fail'].includes(oc) ? oc : null;
    out.track = typeof l.track === 'string' ? str(l.track, 30) : null;
    out.swapped = !!l.swapped;
    delete out.feel;
  }
  if (l.kind === 'other') out.title = str(l.title, 200) || 'Other workout';
  return out;
}

function cleanDay(d) {
  if (!isObj(d)) return null;
  const out = { missing: [], swaps: {}, menu: {} };
  if (Array.isArray(d.missing)) out.missing = [...new Set(d.missing.filter((x) => LIMIT_NAMES[x]))];
  if (isObj(d.swaps)) {
    for (const [k, v] of Object.entries(d.swaps)) if (typeof v === 'string' && MOVES[v]) out.swaps[str(k, 80)] = v;
  }
  if (isObj(d.menu)) {
    for (const [k, v] of Object.entries(d.menu)) if (typeof v === 'string') out.menu[str(k, 20)] = str(v, 4);
  }
  return out.missing.length || Object.keys(out.swaps).length || Object.keys(out.menu).length ? out : null;
}

function clean(saved) {
  const base = defaultState();
  if (!isObj(saved)) return base;
  const sp = isObj(saved.profile) ? saved.profile : {};
  const p = base.profile;

  const profile = {
    startDate: isISO(sp.startDate) ? sp.startDate : p.startDate,
    shift: Math.round(numIn(sp.shift, 0, 0, 365)),
    cycle: Math.round(numIn(sp.cycle, 1, 1, 99)),
    days: cleanDays(sp.days, p.days),
    weekDays: {},
    testOrder: Array.isArray(sp.testOrder) && sp.testOrder.length === 12 && sp.testOrder.every((id) => BENCHMARKS[id])
      ? [...sp.testOrder] : null,
    missing: Array.isArray(sp.missing) ? [...new Set(sp.missing.filter((x) => EQUIP[x]))] : [],
    ease: isObj(sp.ease) && isISO(sp.ease.from) && isISO(sp.ease.until) ? { from: sp.ease.from, until: sp.ease.until } : null,
    unbroken: cleanNums(sp.unbroken, p.unbroken, 1, 500),
    maxes: cleanNums(sp.maxes, p.maxes, 20, 400),
    weights: cleanNums(sp.weights, p.weights, 1, 200),
  };
  if (isObj(sp.weekDays)) {
    for (const [w, map] of Object.entries(sp.weekDays)) {
      const week = Number(w);
      if (!Number.isInteger(week) || week < 1 || week > 13 || !isObj(map)) continue;
      const days = cleanDays(map, null);
      if (days) profile.weekDays[week] = days;
    }
  }

  const bench = {};
  for (const id of Object.keys(BENCHMARKS)) {
    const b = isObj(saved.bench) && isObj(saved.bench[id]) ? saved.bench[id] : {};
    bench[id] = {
      level: Math.round(numIn(b.level, 0, 0, BENCHMARKS[id].levels.length - 1)),
      setAt: numIn(b.setAt, 0, 0, 1e15),
    };
    // v1 stored level-ups directly: keep that level and ignore older results when working out new ones.
    if (saved.v !== 2 && bench[id].level > 0) bench[id].setAt = Date.now();
  }

  const logs = Array.isArray(saved.logs) ? saved.logs.map(cleanLog).filter(Boolean).slice(-5000) : base.logs;
  const seen = new Set();
  for (const l of logs) {
    while (seen.has(l.id)) l.id = uid();
    seen.add(l.id);
  }

  const day = {};
  if (isObj(saved.day)) {
    for (const [k, v] of Object.entries(saved.day)) {
      const d = cleanDay(v);
      if (d) day[str(k, 40)] = d;
    }
  }

  const swaps = {};
  if (isObj(saved.swaps)) {
    for (const [k, v] of Object.entries(saved.swaps)) if (MOVES[k] && typeof v === 'string' && MOVES[v]) swaps[k] = v;
  }

  const tweaks = [];
  if (Array.isArray(saved.tweaks)) {
    for (const t of saved.tweaks.slice(-500)) {
      if (!isObj(t) || typeof t.track !== 'string') continue;
      const tw = { track: str(t.track, 30), ord: numIn(t.ord, 0, 0, 1000), at: numIn(t.at, 0, 0, 1e15) };
      if (t.set != null) tw.set = Math.round(numIn(t.set, 0, -10, 10));
      else tw.d = Math.round(numIn(t.d, 0, -10, 10));
      tweaks.push(tw);
    }
  }

  const notes = {};
  if (isObj(saved.notes)) {
    for (const [k, v] of Object.entries(saved.notes)) if (typeof v === 'string' && v) notes[str(k, 40)] = str(v, 2000);
  }

  return {
    v: 2,
    profile,
    bench,
    logs,
    done: cleanDateMap(saved.done),
    skipped: cleanDateMap(saved.skipped),
    notes,
    day,
    swaps,
    tweaks,
    meta: { lastExport: isObj(saved.meta) && isISO(saved.meta.lastExport) ? saved.meta.lastExport : null },
  };
}

// ---- Load / save ----

export function load() {
  let saved = null;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) saved = JSON.parse(raw);
  } catch (err) {
    console.warn('Could not read saved data', err);
  }
  state = clean(saved);
  return state;
}

export function getState() {
  return state || load();
}

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    saveFailed = false;
    return true;
  } catch (err) {
    console.warn('Could not save data', err);
    if (!saveFailed) toast('Could not save on this phone. Free up storage or leave private browsing.', 6000);
    saveFailed = true;
    return false;
  }
}

export function update(mutator) {
  mutator(getState());
  return save();
}

// ---- Logs ----

// Adds a log, or replaces the one matched by `same` (so saving twice never creates duplicates).
export function putLog(entry, same) {
  let saved = null;
  update((s) => {
    const i = same ? s.logs.findIndex(same) : -1;
    if (i >= 0) {
      saved = { ...entry, id: s.logs[i].id, at: s.logs[i].at };
      s.logs[i] = saved;
    } else {
      saved = { id: uid(), at: Date.now(), ...entry };
      s.logs.push(saved);
    }
  });
  return saved;
}

export function removeLogs(match) {
  update((s) => { s.logs = s.logs.filter((l) => !match(l)); });
}

export function deleteLog(id) {
  removeLogs((l) => l.id === id);
}

export function setDone(sessionId, isoDate) {
  update((s) => {
    if (isoDate) {
      s.done[sessionId] = isoDate;
      delete s.skipped[sessionId];
    } else delete s.done[sessionId];
  });
}

// ---- One-session changes (missing equipment, swaps, alternative workout) ----

const EMPTY_DAY = Object.freeze({ missing: Object.freeze([]), swaps: Object.freeze({}), menu: Object.freeze({}) });

export function dayCfg(sessionId) {
  return getState().day[sessionId] || EMPTY_DAY;
}

export function setDay(sessionId, mutator) {
  update((s) => {
    const cur = s.day[sessionId];
    const d = { missing: [...(cur?.missing || [])], swaps: { ...(cur?.swaps || {}) }, menu: { ...(cur?.menu || {}) } };
    mutator(d);
    if (d.missing.length || Object.keys(d.swaps).length || Object.keys(d.menu).length) s.day[sessionId] = d;
    else delete s.day[sessionId];
  });
}

// ---- Backup ----

export function exportJSON() {
  return JSON.stringify({ app: 'benchmark-coach', exportedAt: new Date().toISOString(), state: getState() }, null, 2);
}

export function importJSON(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('That is not a backup file (it could not be read).');
  }
  const incoming = parsed?.state ?? parsed;
  if (!isObj(incoming) || !isObj(incoming.profile) || !Array.isArray(incoming.logs)) {
    throw new Error('That is not a Benchmark Coach backup.');
  }
  state = clean(incoming);
  save();
}

export function resetAll() {
  state = defaultState();
  save();
}

// Ask the browser not to clear our data under storage pressure (best effort).
export async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch { /* not supported */ }
}
