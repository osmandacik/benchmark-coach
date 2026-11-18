// Builds the session for any week / type, already adjusted for:
//   - how earlier sessions went (adapt.js: weight, interval time, set sizes, reps, Zone 2 minutes)
//   - an easy return period after time off
//   - missing equipment or a sore knee / back (movements are swapped automatically)
//   - swaps and alternative workouts picked by hand
// Benchmark tests are never changed, so results stay comparable.

import { weekInfo, sessionId, dateFor, testFor, benchOn, sessionTitle, validSession, parseSessionId, ordOf } from './calendar.js';
import { warmup, cooldown, zone2, mixedCardio, scale, pctLoad, pctLabel } from './blocks.js';
import { MOVES, EQUIP, resolveItem, lineText } from './moves.js';
import { BENCHMARKS, benchLevel } from './benchmarks.js';
import { TRACKS, levelAt, adjText, easeOn, pressAdvice, EASE_PCT, EASE_KG } from '../adapt.js';
import { currentLevel, paceHint } from '../coach.js';
import { getState, dayCfg } from '../store.js';
import { roundTo, fmtKg } from '../util.js';

const it = (mv, qty, load) => ({ mv, qty, ...(load ? { load } : {}) });
const CARDIO = ['rower', 'bike', 'ski', 'run'];

// ---- Scaling helpers ----

function pctLevel(c, track, plan = '') {
  const lv = levelAt(track, c.ord);
  return { lv, m: (1 + TRACKS[track].step * lv.steps) * (c.eased ? EASE_PCT : 1), adj: adjText(track, lv, c.eased, plan) };
}

function kgLevel(c, track, base) {
  const lv = levelAt(track, c.ord);
  let kg = base + TRACKS[track].step * lv.steps;
  if (c.eased) kg = roundTo(kg * EASE_KG, 2.5);
  kg = Math.max(20, kg);
  return { lv, kg, adj: kg === base ? '' : adjText(track, lv, c.eased) };
}

// ---- Monday: engine (threshold intervals) + back squat ----

const ENGINE = {
  1: { n: 4, work: 5, rest: 2, menu: 'A' },
  2: { n: 4, work: 6, rest: 2, menu: 'B' },
  3: { n: 5, work: 5, rest: 1.5, menu: 'C' },
  4: { n: 4, work: 7, rest: 2, menu: 'D' },
  5: { n: 3, work: 5, rest: 2, menu: 'A', easy: true },
  6: { n: 3, work: 8, rest: 2, menu: 'B' },
  7: { n: 3, work: 9, rest: 2, menu: 'C' },
  8: { n: 2, work: 12, rest: 3, menu: 'D' },
  9: { n: 2, work: 12, rest: 2, menu: 'A' },
  10: { n: 2, work: 8, rest: 3, menu: 'B', easy: true },
  11: { n: 1, work: 20, rest: 0, menu: 'A', race: true },
  12: { n: 1, work: 20, rest: 0, menu: 'A', race: true },
  13: { n: 3, work: 4, rest: 2, menu: 'B', easy: true },
};

const ENGINE_MENUS = {
  A: { label: 'Row, toes-to-bar, wall balls', items: (p) => [it('row', 12), it('t2b', 10), it('wallball', 12, `${p.weights.open231ball} kg`)] },
  B: { label: 'Bike, DB snatches, burpees', items: (p) => [it('bike', 12), it('dbsnatch', 10, `${p.weights.open241} kg`), it('burpee', 8)] },
  C: { label: 'Run, KB swings, pull-ups', items: () => [it('run', 200), it('kbswing', 12, '24 kg'), it('pullup', 8)] },
  D: { label: 'Ski, box jumps, push-ups', items: () => [it('ski', 12), it('boxjump', 10, '60 cm, step down'), it('pushup', 10)] },
};

const SQUAT = {
  1: [4, 5, 0.70], 2: [4, 5, 0.725], 3: [4, 5, 0.75], 4: [4, 5, 0.75], 5: [3, 5, 0.60],
  6: [5, 3, 0.75], 7: [5, 3, 0.775], 8: [5, 3, 0.80], 9: [5, 3, 0.80], 10: [3, 3, 0.65],
  11: [3, 3, 0.80], 12: [3, 2, 0.825], 13: [2, 3, 0.65],
};

function menuInfo(slot, menus, current, planned, p) {
  return {
    slot,
    current,
    planned,
    options: Object.entries(menus).map(([id, m]) => ({ id, label: m.label, moves: m.items ? m.items(p).map((x) => x.mv) : m.moves })),
  };
}

function engineBlocks(c) {
  const { p, week } = c;
  const [sets, reps, pct] = SQUAT[week];
  const base = pctLoad(p.maxes.backSquat, pct);
  const sq = kgLevel(c, 'squat', base);
  const squat = {
    key: 'engine-squat',
    track: 'squat',
    title: 'Back squat',
    minutes: 15,
    lines: [
      { mv: 'backsquat', sets, reps, kg: sq.kg, kgNote: sq.kg === base ? `${pctLabel(pct)} of ${p.maxes.backSquat}` : `plan: ${fmtKg(base)}`, main: true },
      'Rest 2 min between sets',
    ],
    note: 'Maintenance only: smooth, fast reps. Stop the set if the knee complains.',
    adj: sq.adj,
    log: 'feel',
  };

  const e = ENGINE[week];
  const en = pctLevel(c, 'engine', `${e.work} min`);
  const work = scale(e.work, en.m, 0.5, 3);
  const menuId = ENGINE_MENUS[c.day.menu.engine] ? c.day.menu.engine : e.menu;
  const head = e.n === 1
    ? `${work} min AMRAP at race pace of:`
    : `${e.n} × ${work} min, rest ${e.rest} min. Each interval is an AMRAP of:`;
  const note = e.race
    ? 'Race pace: a long test of your engine. Even splits. Beat last time.'
    : e.easy
      ? 'Easy week: about RPE 6, smooth movement, no grinding.'
      : 'Hard but steady (RPE 7–8): a pace you could hold for 25–30 min. Every interval within one round of the first.';
  const engine = {
    key: 'engine-intervals',
    track: 'engine',
    title: e.n === 1 ? `Engine: ${work}-minute AMRAP` : 'Engine intervals',
    minutes: Math.round(e.n * work + (e.n - 1) * e.rest),
    lines: [head, ...ENGINE_MENUS[menuId].items(p)],
    note,
    adj: work === e.work ? '' : en.adj,
    variant: `${menuId}-${e.n}x${work}`,
    timer: e.n === 1
      ? { mode: 'amrap', duration: work * 60 }
      : { mode: 'intervals', work: work * 60, rest: e.rest * 60, rounds: e.n },
    log: 'number',
    logLabel: e.n === 1 ? 'Rounds completed' : 'Total rounds (all intervals)',
    menu: menuInfo('engine', ENGINE_MENUS, menuId, e.menu, p),
  };

  return [warmup('engine', 12, c.limits), squat, engine, cooldown(8, c.limits)];
}

// ---- Tuesday: gymnastics density (EMOM) + DB piece + Zone 2 ----

const GYM = {
  1: { min: 12, pct: 0.40, st: ['pullup', 't2b'] },
  2: { min: 12, pct: 0.45, st: ['pullup', 't2b'] },
  3: { min: 14, pct: 0.50, st: ['pullup', 't2b'] },
  4: { min: 10, pct: 0.50, st: ['pullup', 't2b'], maxCheck: true },
  5: { min: 8, pct: 0.35, st: ['pullup', 't2b'] },
  6: { min: 15, pct: 0.50, st: ['pullup', 't2b', 'du'] },
  7: { min: 15, pct: 0.55, st: ['pullup', 't2b', 'du'] },
  8: { min: 18, pct: 0.55, st: ['pullup', 't2b', 'du'] },
  9: { min: 12, pct: 0.55, st: ['pullup', 't2b', 'du'], maxCheck: true },
  10: { min: 9, pct: 0.40, st: ['pullup', 't2b', 'du'] },
  11: { min: 12, pct: 0.60, st: ['pullup', 't2b', 'bmu'] },
  12: { min: 10, pct: 0.60, st: ['pullup', 't2b'], maxCheck: true },
  13: { min: 8, pct: 0.35, st: ['pullup', 't2b'] },
};

const STATION_LABEL = { pullup: 'butterfly pull-ups' };

const DB_ROTATION = { 1: 'A', 2: 'B', 3: 'C', 4: 'D', 5: 'A', 6: 'B', 7: 'C', 8: 'D', 9: 'A', 10: 'B', 11: 'C', 12: 'D' };

const DB_MENUS = {
  A: { label: 'Snatches, step-overs, burpees (for time)', moves: ['dbsnatch', 'stepover', 'burpee'] },
  B: { label: 'Lunges, push press, bike (AMRAP)', moves: ['dblunge', 'dbpushpress', 'bike'] },
  C: { label: 'Snatches, lateral burpees, row (EMOM)', moves: ['dbsnatch', 'latburpee', 'row'] },
  D: { label: 'Clean-to-overhead, wall balls, run (for time)', moves: ['dbhangcto', 'wallball', 'run'] },
};

function dbPiece(id, c, m, deload) {
  const w = `${c.p.weights.open241} kg`;
  const n = (x) => scale(x, m);
  if (id === 'A') {
    const rounds = deload ? 2 : 3;
    return {
      title: 'DB piece: for time', minutes: rounds * 4 + 1,
      lines: [`${rounds} rounds for time, rest 1 min between rounds:`, it('dbsnatch', n(16), w), it('stepover', n(12), '60 cm, DB in hand'), it('burpee', n(10))],
      note: 'Steady and unbroken. The rest minutes count in your time.',
      timer: { mode: 'fortime', cap: 15 * 60 }, log: 'time',
    };
  }
  if (id === 'B') {
    const min = deload ? 8 : 12;
    return {
      title: `DB piece: AMRAP ${min} min`, minutes: min,
      lines: [`AMRAP ${min} min:`, it('dblunge', n(12), '2 × 15 kg'), it('dbpushpress', n(10), '2 × 15 kg'), it('bike', n(12))],
      note: 'Move at a pace you could keep for 20 minutes.',
      timer: { mode: 'amrap', duration: min * 60 }, log: 'rounds',
    };
  }
  if (id === 'C') {
    return {
      title: 'DB piece: EMOM 12 min', minutes: 12,
      lines: ['EMOM 12 min, rotating:',
        { pre: 'Min 1: ', ...it('dbsnatch', n(12), w) },
        { pre: 'Min 2: ', ...it('latburpee', n(10)) },
        { pre: 'Min 3: ', ...it('row', n(12)) }],
      note: 'Each minute should take 35–40 s. This is your 24.1 rhythm.',
      timer: { mode: 'emom', every: 60, count: 12 }, log: 'feel',
    };
  }
  return {
    title: 'DB piece: for time', minutes: 14,
    lines: ['4 rounds for time:', it('dbhangcto', n(10), `${w}, 5 per arm`), it('wallball', n(15), `${c.p.weights.open231ball} kg`), it('run', 200)],
    note: 'Wall balls unbroken, run at a pace you can talk after.',
    timer: { mode: 'fortime', cap: 16 * 60 }, log: 'time',
  };
}

function gymBlocks(c) {
  const { p, week } = c;
  const g = GYM[week];
  const phase = weekInfo(week).phase.key;
  const deload = phase === 'deload';
  const em = pctLevel(c, 'gym-emom');
  const stations = g.st.map((s, i) => {
    const size = s === 'bmu' ? scale(Math.max(2, p.unbroken.bmu * 0.5), em.m) : scale(p.unbroken[s] * g.pct, em.m);
    return { pre: `Min ${i + 1}: `, mv: s, qty: size, ...(STATION_LABEL[s] ? { label: STATION_LABEL[s] } : {}) };
  });
  const blocks = [warmup('gym', 10, c.limits)];

  if (g.maxCheck) {
    blocks.push({
      key: 'gym-maxcheck',
      title: 'Max set check',
      minutes: 10,
      lines: ['Max unbroken butterfly pull-ups', 'Rest 5 min', 'Max unbroken toes-to-bar'],
      note: 'Log both numbers. If they go up, all your set sizes and race plans update.',
      needs: ['bar'],
      log: 'max',
    });
  }

  blocks.push({
    key: 'gym-emom',
    track: 'gym-emom',
    title: `Gymnastics: EMOM ${g.min} min`,
    minutes: g.min,
    lines: [`EMOM ${g.min} min, rotating:`, ...stations],
    note: `Sets are about ${Math.round(g.pct * 100)}% of your max unbroken. Every set unbroken with a good rhythm.`,
    adj: em.adj,
    variant: `${g.st.join('-')}-${Math.round(g.pct * 100)}`,
    timer: { mode: 'emom', every: 60, count: g.min },
    log: 'feel',
  });

  const planned = DB_ROTATION[week];
  if (planned) {
    const id = DB_MENUS[c.day.menu.db] ? c.day.menu.db : planned;
    const db = pctLevel(c, 'gym-db');
    blocks.push({
      key: 'gym-db',
      track: 'gym-db',
      adj: db.adj,
      variant: `${id}${deload ? '-deload' : ''}`,
      menu: menuInfo('db', DB_MENUS, id, planned, p),
      ...dbPiece(id, c, db.m, deload),
    });
  }
  const z2min = week === 13 || deload || phase === 'sharpen' ? 10 : 15;
  blocks.push({ ...zone2(z2min, 'gym-zone2', 'Zone 2 finisher', c.limits), uses: CARDIO });
  return blocks;
}

// ---- Wednesday: Zone 2 + mobility ----

const Z2 = { 1: 40, 2: 40, 3: 45, 4: 45, 5: 30, 6: 45, 7: 50, 8: 50, 9: 50, 10: 30, 11: 40, 12: 35, 13: 30 };

function aerobicBlocks(c) {
  const z = pctLevel(c, 'z2', `${Z2[c.week]} min`);
  const min = scale(Z2[c.week], z.m, 5, 15);
  return [
    {
      key: 'aerobic-z2',
      track: 'z2',
      title: `Zone 2: ${min} min easy`,
      minutes: min,
      lines: [mixedCardio(min, c.limits)],
      note: 'Conversational pace: full sentences, nose breathing. If you can\'t talk, slow down. The first 5 minutes are your warm-up.',
      adj: min === Z2[c.week] ? '' : z.adj,
      timer: { mode: 'fortime', cap: min * 60 },
      uses: CARDIO,
      log: 'feel',
    },
    {
      key: 'aerobic-mobility',
      title: 'Mobility',
      minutes: 15,
      lines: [
        '90/90 hip switches, 2 min',
        'Couch stretch, 1 min per side',
        'Pigeon stretch, 1 min per side',
        'Hamstring stretch, 1 min per side',
        'Floor thoracic rotations, 10 per side',
        'Ankle rocks, 10 per side',
        c.limits.has('bar') ? 'Child\'s pose with long arms, 3 × 30 s' : 'Dead hang, 3 × 30 s',
      ],
      log: 'none',
      light: true,
    },
    {
      key: 'aerobic-core',
      title: 'Core',
      minutes: 6,
      lines: ['3 rounds: 30 s hollow hold, 10 bird dogs per side, 20 s side plank per side'],
      log: 'none',
      light: true,
    },
  ];
}

// ---- Thursday: barbell + pace rehearsal ----

// [EMOM minutes, reps per minute, % of max]
const OLY = {
  1: [10, 2, 0.65], 2: [10, 2, 0.65], 3: [10, 2, 0.675], 4: [10, 2, 0.675], 5: [8, 2, 0.55],
  6: [10, 2, 0.70], 7: [10, 2, 0.725], 8: [10, 2, 0.75], 9: [10, 2, 0.75], 10: [8, 2, 0.60],
  11: [8, 1, 0.775], 12: [8, 1, 0.80], 13: [6, 2, 0.55],
};

function barbellBlocks(c) {
  const { p, week } = c;
  const [min, reps, pct] = OLY[week];
  const track = week % 2 === 1 ? 'cj' : 'snatch';
  const max = track === 'cj' ? p.maxes.cleanJerk : p.maxes.snatch;
  const base = pctLoad(max, pct);
  const ld = kgLevel(c, track, base);
  const phase = weekInfo(week).phase.key;

  const oly = {
    key: `barbell-${track}`,
    track,
    title: track === 'cj' ? 'Clean & jerk' : 'Snatch',
    minutes: min,
    lines: [{ pre: `EMOM ${min} min: `, mv: track, qty: reps, kg: ld.kg, kgNote: ld.kg === base ? `${pctLabel(pct)} of ${max}` : `plan: ${fmtKg(base)}`, main: true }],
    note: 'Technique first: fast elbows, full extension. Two misses in a row: drop 5 kg.',
    adj: ld.adj,
    timer: { mode: 'emom', every: 60, count: min },
    log: 'feel',
  };

  const press = phase === 'build'
    ? { title: 'Push press', item: { mv: 'pushpress', sets: 4, reps: 4, post: ' at RPE 7–8' }, rest: 'Rest 90 s between sets' }
    : phase === 'base'
      ? { title: 'Strict press', item: { mv: 'strictpress', sets: 3, reps: 6, post: ' at RPE 7' }, rest: 'Rest 90 s between sets' }
      : { title: 'Strict press', item: { mv: 'strictpress', sets: 3, reps: 5, post: ', light and fast' }, rest: 'Rest 60–90 s between sets' };

  const benchId = testFor(p, week);
  const bench = BENCHMARKS[benchId];
  const rehearsal = {
    key: `rehearsal-${benchId}`,
    title: `Pace rehearsal: ${bench.name}`,
    minutes: 12,
    lines: bench.rehearsal.lines(p),
    note: `${bench.rehearsal.note} ${paceHint(benchId)}`,
    timer: bench.rehearsal.timer,
    log: 'none',
  };

  return [
    warmup('barbell', 10, c.limits),
    oly,
    { key: 'barbell-press', title: press.title, minutes: 10, lines: [{ ...press.item, main: true }, press.rest], log: 'kg', logLabel: 'Weight used (kg)' },
    rehearsal,
    cooldown(6, c.limits),
  ];
}

// ---- Test days ----

function testBlocks(c, benchId) {
  const bench = BENCHMARKS[benchId];
  // A test that is already logged keeps the level it was done at.
  const logged = c.id ? c.s.logs.find((l) => l.kind === 'test' && l.sessionId === c.id && l.bench === benchId) : null;
  const level = logged ? benchLevel(bench, logged.level) : currentLevel(benchId);
  let timer;
  if (bench.format === 'fortime') timer = { mode: 'fortime', cap: bench.cap };
  else if (bench.format === 'amrap-rounds') timer = { mode: 'amrap', duration: level.minutes * 60, perRound: bench.perRound };
  else timer = { mode: 'amrap', duration: bench.minutesCap * 60 };

  return [
    {
      key: `test-${benchId}-primer`,
      title: 'Warm-up and primer',
      minutes: 15,
      lines: ['5 min easy bike or row', ...bench.primer],
      log: 'none',
      light: true,
    },
    {
      key: `test-${benchId}`,
      bench: benchId,
      level: level.index,
      title: `${bench.name}: ${level.label}`,
      minutes: level.minutes || bench.minutes,
      lines: bench.describe(c.p, level),
      note: `Locked weight: ${bench.weight(c.p)}.`,
      needs: bench.needs,
      timer,
      log: 'test',
    },
    { ...zone2(12, 'test-flush', 'Easy flush', c.limits), uses: CARDIO },
    cooldown(6, c.limits),
  ];
}

// The test block on its own (for the Benchmarks tab).
export function benchTestBlock(benchId) {
  const s = getState();
  const c = { s, p: s.profile, id: null, limits: new Set() };
  return finalize(testBlocks(c, benchId)[1], { swapCtx: null, ord: Infinity });
}

// ---- Putting it together ----

function finalize(block, c) {
  const rows = (block.lines || []).map((ln) => {
    if (typeof ln === 'string') return { text: ln };
    const r = block.bench ? { item: ln, why: null } : resolveItem(ln, c.swapCtx, block.key);
    return { text: lineText(r.item), orig: ln, item: r.item, swapped: r.item.mv !== ln.mv, why: r.why, blocked: r.blocked || null };
  });
  const main = rows.find((r) => r.orig?.main);
  const out = { ...block, rows, lines: rows.map((r) => r.text), swapped: !!main?.swapped, mainMv: main?.item.mv || null };
  if (block.key === 'barbell-press' && out.mainMv) {
    const tip = pressAdvice(out.mainMv, c.ord);
    if (tip) out.tip = tip.text;
  }
  return out;
}

export function buildSession(week, type) {
  if (!validSession(week, type)) return null;
  const s = getState();
  const p = s.profile;
  const id = sessionId(week, type);
  const day = dayCfg(id);
  const limits = new Set([...p.missing, ...day.missing]);
  const date = dateFor(p, week, type);
  const c = {
    s, p, week, type, id, day, limits, date,
    ord: ordOf(id),
    eased: easeOn(p, date),
    swapCtx: { limits, daySwaps: day.swaps, always: s.swaps },
  };

  const benchId = benchOn(p, week, type);
  let raw;
  if (benchId) raw = testBlocks(c, benchId);
  else if (type === 'engine') raw = engineBlocks(c);
  else if (type === 'gym') raw = gymBlocks(c);
  else if (type === 'aerobic') raw = aerobicBlocks(c);
  else raw = barbellBlocks(c);
  const blocks = raw.map((b) => finalize(b, c));

  const used = new Set();
  for (const b of blocks) {
    for (const x of [...(b.needs || []), ...(b.uses || [])]) used.add(x);
    for (const r of b.rows) for (const x of MOVES[r.orig?.mv]?.needs || []) used.add(x);
  }

  return {
    id,
    week,
    type,
    title: sessionTitle(p, week, type),
    phase: weekInfo(week).phase,
    date,
    isTest: !!benchId,
    benchId,
    minutes: blocks.reduce((a, b) => a + (b.minutes || 0), 0),
    blocks,
    equip: Object.keys(EQUIP).filter((k) => used.has(k)),
    limits: [...limits],
    dayLimits: [...day.missing],
    eased: c.eased && !benchId,
  };
}

export function sessionById(id) {
  const parsed = parseSessionId(id);
  return parsed ? buildSession(parsed.week, parsed.type) : null;
}
