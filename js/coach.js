// Benchmark coaching: ladder levels, targets that react to your last results, pacing checkpoints, rep breakdowns.

import { getState } from './store.js';
import { BENCHMARKS, benchLevel } from './data/benchmarks.js';
import { fmtTime, fmtRoundsReps } from './util.js';

// How much better the next target is than your best:
// after a hit (or a first test) 5%, after one miss 3%, after two or more misses 1.5%.
export const IMPROVE = [0.05, 0.03, 0.015];

export function isLadder(benchId) {
  return BENCHMARKS[benchId].levels.length > 1;
}

// All results for a benchmark, oldest first.
export function testLogs(benchId) {
  return getState().logs
    .filter((l) => l.kind === 'test' && l.bench === benchId)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.at || 0) - (b.at || 0)));
}

// The score that moves a ladder up from a level, or null.
function ladderGoal(bench, levelIndex) {
  const lv = bench.levels[levelIndex];
  if (lv?.targetTime) return { time: lv.targetTime };
  if (lv?.targetRounds) return { reps: lv.targetRounds * bench.perRound };
  return null;
}

function beats(goal, score) {
  if (goal.time != null) return score.time != null && score.time <= goal.time;
  return (score.reps || 0) >= goal.reps;
}

// Current ladder level: the start level, plus one for every level whose goal has been hit since.
// Worked out from the logs, so fixing or deleting a wrong result also fixes the level.
export function ladderIndex(benchId) {
  const bench = BENCHMARKS[benchId];
  const st = getState().bench[benchId] || {};
  let lv = benchLevel(bench, st.level).index;
  if (bench.levels.length < 2) return 0;
  for (const l of testLogs(benchId)) {
    if (l.modified || (l.at || 0) <= (st.setAt || 0)) continue;
    const goal = ladderGoal(bench, lv);
    if ((l.level || 0) === lv && lv < bench.levels.length - 1 && goal && beats(goal, l.score)) lv += 1;
  }
  return lv;
}

export function currentLevel(benchId) {
  return benchLevel(BENCHMARKS[benchId], ladderIndex(benchId));
}

// Positive when score a is better than score b.
export function compareScores(benchId, a, b) {
  const bench = BENCHMARKS[benchId];
  if (bench.format === 'fortime') {
    const aDone = a.time != null;
    const bDone = b.time != null;
    if (aDone && bDone) return b.time - a.time;
    if (aDone !== bDone) return aDone ? 1 : -1;
  }
  return (a.reps || 0) - (b.reps || 0);
}

// Results that count at a level (changed / scaled versions do not).
function scored(benchId, levelIndex) {
  return testLogs(benchId).filter((l) => (l.level || 0) === levelIndex && !l.modified);
}

export function bestAt(benchId, levelIndex) {
  return scored(benchId, levelIndex)
    .reduce((best, l) => (!best || compareScores(benchId, l.score, best.score) > 0 ? l : best), null);
}

// How many of the latest tests at this level missed their target.
function missStreak(benchId, levelIndex) {
  const logs = scored(benchId, levelIndex);
  let n = 0;
  for (let i = logs.length - 1; i >= 0 && logs[i].hit === false; i--) n += 1;
  return n;
}

export function fmtScore(benchId, score) {
  if (!score) return '–';
  const bench = BENCHMARKS[benchId];
  if (bench.format === 'fortime') {
    return score.time != null ? fmtTime(score.time) : `Capped, ${score.reps || 0} reps`;
  }
  if (bench.format === 'amrap-rounds') return fmtRoundsReps(score.reps || 0, bench.perRound);
  return `${score.reps || 0} reps`;
}

// Target for the next test of a benchmark at its current level.
//   source: 'baseline' (no score yet), 'ladder' (the level-up score), 'step' (halfway to the level-up score,
//           used when it is still far away), 'improve' (a bit better than your best), 'finish' (beat the cap).
export function targetFor(benchId) {
  const bench = BENCHMARKS[benchId];
  const level = currentLevel(benchId);
  const best = bestAt(benchId, level.index);
  const goal = ladderGoal(bench, level.index);
  const timed = bench.format === 'fortime';

  if (goal && !(best && beats(goal, best.score))) {
    if (!best) return { ...goal, source: 'ladder' };
    if (goal.time != null) {
      const t = best.score.time;
      if (t == null || (t - goal.time) / t <= 0.10) return { ...goal, source: 'ladder' };
      return { time: Math.round((t + goal.time) / 2), levelUp: goal, source: 'step', from: best };
    }
    const r = best.score.reps || 0;
    if (r <= 0 || (goal.reps - r) / r <= 0.10) return { ...goal, source: 'ladder' };
    return { reps: Math.ceil((r + goal.reps) / 2), levelUp: goal, source: 'step', from: best };
  }

  if (!best) return { source: 'baseline' };
  const misses = missStreak(benchId, level.index);
  const rate = IMPROVE[Math.min(misses, IMPROVE.length - 1)];
  const s = best.score;
  if (timed && s.time != null) {
    return { time: Math.max(1, Math.round(s.time * (1 - rate))), source: 'improve', from: best, misses };
  }
  const reps = Math.max((s.reps || 0) + 1, Math.ceil((s.reps || 0) * (1 + rate)));
  if (timed) {
    if (bench.cap && bench.totalReps && reps >= bench.totalReps) return { time: bench.cap, source: 'finish', from: best, misses };
    return { reps, capped: true, source: 'improve', from: best, misses };
  }
  return { reps, source: 'improve', from: best, misses };
}

// The parts of a target worth storing with a result.
export function snapTarget(t) {
  if (!t) return { source: 'baseline' };
  const out = { source: t.source };
  if (t.time != null) out.time = t.time;
  if (t.reps != null) out.reps = t.reps;
  if (t.capped) out.capped = true;
  return out;
}

export function fmtTarget(benchId, target) {
  const bench = BENCHMARKS[benchId];
  if (!target || target.source === 'baseline' || (target.time == null && target.reps == null)) return 'Baseline test';
  if (target.source === 'finish') return `Finish under the ${Math.round(target.time / 60)}-minute cap`;
  if (target.time != null) return `Under ${fmtTime(target.time)}`;
  if (bench.format === 'amrap-rounds') return `${fmtRoundsReps(target.reps, bench.perRound)} or more`;
  if (target.capped) return `${target.reps}+ reps by the cap`;
  return `${target.reps}+ reps`;
}

export function meetsTarget(benchId, score, target) {
  if (!target || target.source === 'baseline' || (target.time == null && target.reps == null)) return null;
  if (target.time != null) return score.time != null && score.time <= target.time;
  if (score.time != null) return true; // finished under the cap beats any reps target
  return (score.reps || 0) >= target.reps;
}

// ---- Pacing ----

export function pacingPlan(benchId, target) {
  const bench = BENCHMARKS[benchId];
  const p = getState().profile;
  const level = currentLevel(benchId);

  if (bench.format === 'amrap-rounds') {
    const reps = target?.reps > 0 ? target.reps : level.targetRounds * bench.perRound;
    const rounds = reps / bench.perRound;
    const secPerRound = (level.minutes * 60) / rounds;
    const step = level.minutes <= 10 ? 2 : 5;
    const rows = [];
    for (let m = step; m <= level.minutes; m += step) {
      const done = Math.floor((m * 60 / secPerRound) * bench.perRound);
      rows.push({ label: `At ${m}:00`, at: fmtRoundsReps(done, bench.perRound) });
    }
    return { rows, note: `One round every ${Math.round(secPerRound)} s.` };
  }

  if (bench.format === 'amrap-reps') {
    const goal = target?.reps > 0 ? Math.min(target.reps, bench.totalReps) : 150;
    let left = goal;
    let baseTime = 0;
    for (const seg of bench.chipper) {
      const n = Math.min(seg.reps, left);
      baseTime += n * seg.sec;
      left -= n;
      if (left <= 0) break;
    }
    const factor = (bench.minutesCap * 60) / (baseTime || 1);
    const rows = [];
    let cum = 0;
    let reps = 0;
    for (const seg of bench.chipper) {
      if (reps + seg.reps > goal) {
        if (goal > reps) rows.push({ label: `${goal - reps} ${seg.label.replace(/^\d+ /, '')}`, at: `${bench.minutesCap}:00` });
        break;
      }
      cum += seg.reps * seg.sec * factor;
      reps += seg.reps;
      rows.push({ label: `Finish ${seg.label}`, at: fmtTime(cum) });
    }
    const note = target?.reps > 0 ? `Pace for ${goal} reps.` : 'No score yet: pace shown for 150 reps. It updates after your first test.';
    return { rows, note };
  }

  // for time
  const total = target?.time ?? target?.from?.score?.time ?? null;
  if (!total) return { rows: [], note: 'No checkpoints yet. Start controlled and finish strong.' };
  const segs = bench.segments(p, level);
  const sum = segs.reduce((a, s) => a + s.w, 0);
  let cum = 0;
  const rows = segs.map((s) => {
    cum += s.w;
    return { label: `Finish ${s.label}`, at: fmtTime((total * cum) / sum) };
  });
  return { rows, note: `Checkpoints for ${fmtTime(total)}.` };
}

// ---- Rep breakdowns from max unbroken sets ----

export function repSets(reps, max, factor) {
  const size = Math.max(1, Math.round(max * factor));
  const n = Math.max(1, Math.ceil(reps / size));
  const base = Math.floor(reps / n);
  const extra = reps % n;
  return Array.from({ length: n }, (_, i) => base + (i < extra ? 1 : 0));
}

export function breakdownFor(benchId) {
  const bench = BENCHMARKS[benchId];
  const p = getState().profile;
  const level = currentLevel(benchId);
  const segs = bench.chipper || bench.segments(p, level);
  return segs
    .filter((s) => s.gym && p.unbroken[s.gym] > 0 && s.reps > 0)
    .map((s) => {
      const sets = repSets(s.reps, p.unbroken[s.gym], bench.setFactor);
      // Long chippers would print dozens of sets: show the pattern instead.
      const text = sets.length > 8 ? `${sets.length} sets of about ${sets[0]}` : sets.join(' + ');
      return { label: s.label, text };
    });
}

export function paceHint(benchId) {
  const target = targetFor(benchId);
  const plan = pacingPlan(benchId, target);
  const first = plan.rows[0];
  if (target.source === 'baseline') return 'The test will set your baseline: rehearse a pace you could repeat.';
  const head = `Test target: ${fmtTarget(benchId, target).toLowerCase()}.`;
  return first ? `${head} ${first.label} at ${first.at}.` : head;
}
