// Movement catalog: what each movement needs, what it loads, and what can replace it.
// Sessions list movements as items ({ mv, qty, ... }) so the app can swap them:
//   - by hand ("Adjust" on a block), for one session or every time
//   - automatically, when equipment is missing or the knee / back is sore
//
// Item fields: mv (id below), qty, sets + reps, kg + kgNote, load (text), label (name override),
//              pre / post (text around it), main (the lift a weight track follows).

import { roundTo, fmtKg, cap } from '../util.js';

export const EQUIP = {
  rower: 'Rower',
  bike: 'Bike',
  ski: 'Ski erg',
  run: 'Running',
  bar: 'Pull-up bar',
  rope: 'Jump rope',
  ball: 'Wall ball',
  box: 'Box',
  kb: 'Kettlebell',
  db: 'Dumbbells',
  barbell: 'Barbell',
};

export const BODY = {
  knee: 'Knee sore',
  back: 'Back sore',
};

export const LIMIT_NAMES = { ...EQUIP, ...BODY };

// sec: seconds per unit at a steady pace (used to convert between cardio pieces).
// step: rounding for converted amounts.  x: rep ratio for an alternative.
export const MOVES = {
  // ---- cardio ----
  row: { name: 'cal row', short: 'Row', needs: ['rower'], sec: 3.6, alts: ['bike', 'ski', 'run', 'jacks', 'climbers'] },
  rowm: { name: 'm row', short: 'Row', needs: ['rower'], sec: 0.21, step: 50, alts: ['run', 'bike', 'ski', 'jacks', 'climbers'] },
  bike: { name: 'cal bike', short: 'Bike', needs: ['bike'], sec: 3.6, alts: ['row', 'ski', 'run', 'jacks', 'climbers'] },
  ski: { name: 'cal ski', short: 'Ski erg', needs: ['ski'], sec: 4, alts: ['row', 'bike', 'run', 'jacks', 'climbers'] },
  run: { name: 'm run', short: 'Run', needs: ['run'], stress: ['knee'], sec: 0.27, step: 50, alts: ['row', 'bike', 'ski', 'jacks', 'climbers'] },
  jacks: { name: 'jumping jacks', stress: ['knee'], sec: 0.9, step: 5, alts: ['climbers'] },
  climbers: { name: 'mountain climbers (count each leg)', short: 'Mountain climbers', sec: 0.6, step: 10 },

  // ---- pulling / hanging ----
  pullup: { name: 'pull-ups', one: 'pull-up', needs: ['bar'], alts: ['jumppullup', 'ringrow', 'dbrow', 'proney'] },
  jumppullup: { name: 'jumping pull-ups', needs: ['bar'] },
  ringrow: { name: 'ring rows', needs: ['bar'] },
  dbrow: { name: 'DB rows per arm', short: 'DB rows', needs: ['db'] },
  proney: { name: 'prone Y-raises (lying face down)', short: 'Prone Y-raises' },
  t2b: { name: 'toes-to-bar', needs: ['bar'], alts: ['kneeraise', 'vup', { to: 'situp', x: 1.5 }] },
  kneeraise: { name: 'hanging knee raises', needs: ['bar'] },
  vup: { name: 'V-ups' },
  situp: { name: 'sit-ups', one: 'sit-up', alts: ['vup'] },
  bmu: {
    name: 'bar muscle-ups', one: 'bar muscle-up', needs: ['bar'],
    alts: [{ to: 'c2b', x: 2 }, 'burpeepullup', { to: 'pullup', x: 3 }, { to: 'burpee', x: 2 }],
  },
  c2b: { name: 'chest-to-bar pull-ups', needs: ['bar'] },
  burpeepullup: { name: 'burpee pull-ups', needs: ['bar'] },

  // ---- jumping / bodyweight ----
  du: { name: 'double-unders', needs: ['rope'], alts: [{ to: 'su', x: 1.5 }, { to: 'linehop', x: 1.5 }] },
  su: { name: 'single-unders', needs: ['rope'] },
  linehop: { name: 'line hops (side to side)', short: 'Line hops' },
  pushup: { name: 'push-ups', one: 'push-up', alts: ['kneepushup', 'inclinepushup'] },
  kneepushup: { name: 'knee push-ups' },
  inclinepushup: { name: 'hand-elevated push-ups' },
  pikepushup: { name: 'pike push-ups' },
  burpee: { name: 'burpees', one: 'burpee', alts: ['stepburpee'] },
  stepburpee: { name: 'step-back burpees (no jump)', short: 'Step-back burpees' },
  latburpee: { name: 'lateral burpees over the DB', short: 'Lateral burpees', needs: ['db'], alts: ['lineburpee', 'burpee', 'stepburpee'] },
  lineburpee: { name: 'lateral burpees over a line', short: 'Burpees over a line' },
  airsquat: { name: 'air squats', stress: ['knee'], alts: ['benchsquat', 'glutebridge'] },
  benchsquat: { name: 'squats to a bench (sit, stand)', short: 'Squats to a bench' },
  glutebridge: { name: 'glute bridges' },
  lunge: { name: 'walking lunges', stress: ['knee'] },
  boxjump: {
    name: 'box jumps', needs: ['box'], stress: ['knee'],
    alts: [{ to: 'stepup', load: 'alternate legs' }, { to: 'airsquat', x: 1.5 }, { to: 'glutebridge', x: 1.5 }],
  },
  stepup: { name: 'box step-ups', needs: ['box'] },

  // ---- dumbbell / kettlebell / ball ----
  stepover: {
    name: 'DB box step-overs', needs: ['box', 'db'],
    alts: [{ to: 'stepup', load: 'alternate legs' }, 'lunge', { to: 'airsquat', x: 1.5 }, { to: 'glutebridge', x: 1.5 }],
  },
  wallball: {
    name: 'wall balls', needs: ['ball'], stress: ['knee'],
    alts: ['dbthruster', { to: 'thruster', load: 'empty bar' }, { to: 'airsquat', x: 1.5 }, 'dbpushpress', { to: 'glutebridge', x: 1.5 }],
  },
  dbthruster: { name: 'DB thrusters', needs: ['db'], stress: ['knee'], load: 'light, 2 × 7.5–10 kg' },
  thruster: {
    name: 'thrusters', one: 'thruster', needs: ['barbell'], stress: ['knee'],
    alts: [{ to: 'dbthruster', load: 'about the same total weight' }, 'wallball', { to: 'airsquat', x: 1.5 },
      { to: 'bbpushpress', keepLoad: true }, 'dbpushpress', { to: 'glutebridge', x: 1.5 }],
  },
  kbswing: {
    name: 'KB swings', needs: ['kb'], stress: ['back'],
    alts: ['dbswing', { to: 'glutebridge', x: 1.5 }, { to: 'airsquat', x: 1.5 }],
  },
  dbswing: { name: 'DB swings (two hands on one DB)', short: 'DB swings', needs: ['db'], stress: ['back'], load: 'one heavy DB' },
  dbsnatch: {
    name: 'alternating DB snatches', short: 'DB snatches', needs: ['db'], stress: ['back'],
    alts: [{ to: 'dbhangcto', keepLoad: true }, { to: 'kbswing', load: '24 kg' }, 'dbpushpress', { to: 'burpee', x: 0.6 }],
  },
  dbhangcto: {
    name: 'DB hang clean-to-overhead', needs: ['db'],
    alts: [{ to: 'dbsnatch', keepLoad: true }, 'dbpushpress', { to: 'burpee', x: 0.6 }],
  },
  dblunge: {
    name: 'DB front-rack lunges', needs: ['db'], stress: ['knee'],
    alts: [{ to: 'dbstepup', keepLoad: true }, 'lunge', { to: 'airsquat', x: 1.5 }, { to: 'glutebridge', x: 1.5 }],
  },
  dbstepup: { name: 'DB box step-ups', needs: ['db', 'box'] },
  dbpushpress: {
    name: 'DB push press', needs: ['db'], load: '2 × 15 kg',
    alts: [{ to: 'bbpushpress', load: '30 kg' }, 'pikepushup', 'pushup'],
  },
  bbpushpress: { name: 'barbell push press', needs: ['barbell'] },

  // ---- strength (sets × reps at a weight) ----
  backsquat: {
    name: 'back squats', one: 'back squat', needs: ['barbell'], stress: ['knee'],
    alts: [
      { to: 'boxsquat', kg: 0.85 },
      { to: 'gobletsquat', repsX: 2, load: 'heaviest DB you can move smoothly, 3 s down' },
      { to: 'tempoairsquat', repsX: 3, load: '3 s down, 1 s pause' },
      { to: 'slglutebridge', repsX: 3 },
    ],
  },
  boxsquat: { name: 'box squats (to a box at knee height)', short: 'Box squats', needs: ['barbell', 'box'] },
  gobletsquat: { name: 'goblet squats', needs: ['db'], stress: ['knee'] },
  tempoairsquat: { name: 'tempo air squats', stress: ['knee'] },
  slglutebridge: { name: 'single-leg glute bridges per leg', short: 'Single-leg glute bridges' },
  cj: {
    name: 'clean & jerks', one: 'clean & jerk', needs: ['barbell'], stress: ['back'],
    alts: [{ to: 'hpcpp', kg: 0.85 }, { to: 'dbcj', x: 3, load: 'two moderate DBs' }, { to: 'burpee', x: 4 }],
  },
  hpcpp: { name: 'hang power cleans + push press', one: 'hang power clean + push press', needs: ['barbell'] },
  dbcj: { name: 'DB hang clean & jerks', needs: ['db'] },
  snatch: {
    name: 'snatches', one: 'snatch', needs: ['barbell'], stress: ['back'],
    alts: [{ to: 'hps', kg: 0.85 }, { to: 'dbhangcto', x: 3, load: 'one heavy DB, switch arms each rep' }, { to: 'burpee', x: 4 }],
  },
  hps: { name: 'hang power snatches', one: 'hang power snatch', needs: ['barbell'] },
  pushpress: {
    name: 'push press', needs: ['barbell'],
    alts: [{ to: 'dbpushpress', repsX: 2, load: 'heavy pair' }, { to: 'pikepushup', repsX: 2 }],
  },
  strictpress: {
    name: 'strict press', needs: ['barbell'],
    alts: [{ to: 'dbstrictpress', repsX: 1.5, load: 'heavy pair' }, { to: 'pikepushup', repsX: 2 }],
  },
  dbstrictpress: { name: 'DB strict press', needs: ['db'] },
};

export function moveName(id) {
  const m = MOVES[id];
  return m ? (m.short || cap(m.name)) : String(id);
}

export function altsOf(id) {
  const m = MOVES[id];
  if (!m?.alts) return [];
  return m.alts.map((a) => (typeof a === 'string' ? { to: a } : a)).filter((a) => MOVES[a.to]);
}

// What stops this movement today: equipment or body-part ids found in `limits`.
export function blockedBy(id, limits) {
  const m = MOVES[id];
  if (!m || !limits?.size) return [];
  return [...(m.needs || []), ...(m.stress || [])].filter((x) => limits.has(x));
}

export function lineText(it) {
  if (typeof it === 'string') return it;
  const m = MOVES[it?.mv];
  if (!m) return String(it?.label || it?.mv || '');
  const count = it.sets != null ? `${it.sets} × ${it.reps}` : it.qty != null ? String(it.qty) : '';
  const name = it.label || (it.qty === 1 && it.sets == null && m.one ? m.one : m.name);
  let text = `${it.pre || ''}${count ? `${count} ` : ''}${name}`;
  if (it.kg != null) text += ` at ${fmtKg(it.kg)}${it.kgNote ? ` (${it.kgNote})` : ''}`;
  else if (it.load) text += ` (${it.load})`;
  return text + (it.post || '');
}

function applyAlt(item, alt) {
  const from = MOVES[item.mv];
  const to = MOVES[alt.to];
  const out = { ...item, mv: alt.to };
  delete out.label;
  delete out.load;
  delete out.kg;
  delete out.kgNote;

  if (item.qty != null) {
    const raw = from.sec && to.sec ? (item.qty * from.sec) / to.sec : item.qty * (alt.x || 1);
    const step = to.step || 1;
    out.qty = Math.max(step, Math.round(raw / step) * step);
  }
  if (item.reps != null && alt.repsX) out.reps = Math.max(1, Math.round(item.reps * alt.repsX));

  if (item.kg != null && alt.kg) {
    out.kg = Math.max(20, roundTo(item.kg * alt.kg, 2.5));
    out.kgNote = `${Math.round(alt.kg * 100)}% of the planned ${fmtKg(item.kg)}`;
  } else if (alt.keepLoad && (item.load || item.kg != null)) {
    out.load = item.load || fmtKg(item.kg);
  } else if (alt.load) out.load = alt.load;
  else if (to.load) out.load = to.load;
  return out;
}

// Picks what to actually do for one planned item.
//   ctx.daySwaps: { "blockKey:movement": alternative } chosen by hand for this session
//   ctx.always:   { movement: alternative } chosen by hand for every session
//   ctx.limits:   Set of missing equipment / sore body parts
// Returns { item, why: 'today' | 'always' | 'auto' | null, blocked?: [ids] }.
export function resolveItem(item, ctx, blockKey) {
  if (!MOVES[item?.mv]) return { item, why: null };
  const limits = ctx?.limits || new Set();
  const alts = altsOf(item.mv);
  const find = (to) => alts.find((a) => a.to === to);
  const free = (id) => blockedBy(id, limits).length === 0;

  const today = ctx?.daySwaps?.[`${blockKey}:${item.mv}`];
  if (today === item.mv) return { item, why: null };
  if (today && find(today)) return { item: applyAlt(item, find(today)), why: 'today' };

  const always = ctx?.always?.[item.mv];
  if (always && find(always)) {
    const order = [find(always), ...alts.filter((a) => a.to !== always)];
    const pick = order.find((a) => free(a.to));
    if (pick) return { item: applyAlt(item, pick), why: pick.to === always ? 'always' : 'auto' };
    return { item: applyAlt(item, find(always)), why: 'always', blocked: blockedBy(always, limits) };
  }

  const blocked = blockedBy(item.mv, limits);
  if (!blocked.length) return { item, why: null };
  const pick = alts.find((a) => free(a.to));
  if (pick) return { item: applyAlt(item, pick), why: 'auto' };
  return { item, why: null, blocked };
}

// What an alternative would look like (for the "Adjust" screen).
export function previewAlt(item, to) {
  const alt = altsOf(item.mv).find((a) => a.to === to);
  return alt ? applyAlt(item, alt) : item;
}
