// Benchmarks list and detail: level, target, pacing, sets, history chart.

import { getState, deleteLog, setDone } from '../store.js';
import { BENCHMARKS, ROTATION } from '../data/benchmarks.js';
import { allSessions, benchOn } from '../data/calendar.js';
import { benchTestBlock } from '../data/sessions.js';
import { currentLevel, targetFor, fmtTarget, fmtScore, bestAt, testLogs, isLadder } from '../coach.js';
import { testPanel, timerHref, notFound } from './session.js';
import { esc, fmtDate, fmtShortDate, todayISO, fmtTime, toast } from '../util.js';
import { on, rerender } from '../actions.js';

function nextTest(benchId) {
  const st = getState();
  const today = todayISO();
  return allSessions(st.profile).find((x) => x.date >= today && !st.done[x.id] && !st.skipped[x.id]
    && benchOn(st.profile, x.week, x.type) === benchId) || null;
}

export function renderBenchList() {
  const p = getState().profile;
  const items = ROTATION.map((id) => {
    const bench = BENCHMARKS[id];
    const level = currentLevel(id);
    const best = bestAt(id, level.index);
    const next = nextTest(id);
    return `<a class="card bench-item" href="#/bench/${id}">
      <div class="card-head"><h2>${esc(bench.name)}</h2>
        <span class="badge ${isLadder(id) ? 'accent' : ''}">${esc(isLadder(id) ? level.label : bench.weight(p))}</span></div>
      <span class="faint">${esc(bench.summary)}</span>
      <div class="target">
        <div><span class="eyebrow">Best</span><b>${best ? esc(fmtScore(id, best.score)) : '–'}</b></div>
        <div><span class="eyebrow">Target</span><b>${esc(fmtTarget(id, targetFor(id)))}</b></div>
      </div>
      ${next ? `<span class="faint">Next test: ${esc(fmtDate(next.date))}</span>` : ''}
    </a>`;
  }).join('');
  return `<section class="stack"><h1>Benchmarks</h1>
    <p class="muted small">One is tested each week. Miss a target and the next one is a smaller step; hit it and it moves on.</p></section>${items}`;
}

function chartSvg(benchId, logs, target) {
  const bench = BENCHMARKS[benchId];
  const timed = bench.format === 'fortime';
  const pts = logs
    .map((l) => ({ v: timed ? l.score.time : l.score.reps, d: l.date }))
    .filter((x) => Number.isFinite(x.v))
    .slice(-8);
  if (pts.length < 2) return '';
  const tv = timed ? target?.time : target?.reps;
  const vals = pts.map((x) => x.v).concat(Number.isFinite(tv) ? [tv] : []);
  const min = Math.min(...vals) * 0.95;
  const max = Math.max(...vals) * 1.05;
  const W = 320; const H = 140; const pad = 24;
  const x = (i) => pad + (i * (W - pad * 2)) / (pts.length - 1);
  const y = (v) => H - pad - ((v - min) / (max - min || 1)) * (H - pad * 2);
  const path = pts.map((pt, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(pt.v).toFixed(1)}`).join(' ');
  const fmt = (v) => (timed ? fmtTime(v) : String(v));
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(bench.name)} scores over time">
    ${Number.isFinite(tv) ? `<line class="target-line" x1="${pad}" x2="${W - pad}" y1="${y(tv).toFixed(1)}" y2="${y(tv).toFixed(1)}"/>
      <text x="${W - pad}" y="${(y(tv) - 4).toFixed(1)}" text-anchor="end">target ${esc(fmt(tv))}</text>` : ''}
    <path class="line" d="${path}"/>
    ${pts.map((pt, i) => `<circle class="pt" cx="${x(i).toFixed(1)}" cy="${y(pt.v).toFixed(1)}" r="3.5"/>
      <text x="${x(i).toFixed(1)}" y="${H - 6}" text-anchor="middle">${esc(fmtShortDate(pt.d))}</text>`).join('')}
  </svg>
  <p class="faint">${timed ? 'Time: lower is better.' : 'Reps: higher is better.'}</p>`;
}

export function renderBenchDetail(id) {
  const bench = BENCHMARKS[id];
  if (!bench) return notFound('Benchmark');
  const p = getState().profile;
  const level = currentLevel(id);
  const target = targetFor(id);
  const logs = testLogs(id);
  const atLevel = logs.filter((l) => (l.level || 0) === level.index && !l.modified);
  const next = nextTest(id);
  const block = benchTestBlock(id);

  const ladder = isLadder(id) ? `<section class="card"><h2>Ladder</h2><div class="ladder">
    ${bench.levels.map((lv, i) => `<div class="ladder-step ${i < level.index ? 'done' : i === level.index ? 'current' : ''}">
      <span class="dot"></span><span>${esc(lv.label)}</span>
      <span class="faint">${lv.targetTime ? `under ${fmtTime(lv.targetTime)}` : `${lv.targetRounds} rounds`}</span></div>`).join('')}
    </div><p class="faint">Hit the score at your step and the next test moves up one step.</p></section>` : '';

  const history = logs.length ? logs.slice().reverse().map((l) => `<div class="history-row">
      <span>${esc(fmtDate(l.date))}${isLadder(id) ? ` · ${esc(bench.levels[l.level || 0]?.label || '')}` : ''}${l.seed ? ' · before the cycle' : ''}${l.modified ? ' · changed version' : ''}</span>
      <span class="row"><b>${esc(fmtScore(id, l.score))}</b>
      <button class="btn small ghost danger" data-action="delete-log" data-id="${esc(l.id)}" aria-label="Delete this result">✕</button></span>
    </div>`).join('') : '<p class="faint">No results yet.</p>';

  return `<a class="back" href="#/bench">← Benchmarks</a>
  <section class="card highlight">
    <div class="card-head"><div class="stack tight"><h1>${esc(bench.name)}</h1>
      <span class="muted">${esc(level.label)} · ${esc(bench.weight(p))}</span></div>
      ${next ? `<span class="badge good">Next ${esc(fmtShortDate(next.date))}</span>` : ''}</div>
    <ul class="lines">${block.lines.map((l, i) => `<li class="${i === 0 && /:$/.test(l) ? 'head' : ''}">${esc(l)}</li>`).join('')}</ul>
    ${testPanel(id)}
    <div class="btn-row">
      <a class="btn primary" href="${timerHref(null, block)}">Start timer</a>
      <a class="btn" href="#/log?bench=${id}">Log a result</a>
    </div>
    ${next ? `<p class="faint">Planned tests are logged from their session: <a href="#/day/${next.id}">open ${esc(fmtShortDate(next.date))}</a>.</p>` : ''}
  </section>
  ${ladder}
  <section class="card"><h2>History</h2>
    ${chartSvg(id, atLevel, target)}
    ${history}
  </section>`;
}

on('delete-log', (el) => {
  if (!confirm('Delete this result? Targets and ladder steps are worked out again without it.')) return;
  const log = getState().logs.find((l) => l.id === el.dataset.id);
  deleteLog(el.dataset.id);
  // A planned test without its result is open again.
  const sid = log?.sessionId;
  if (sid && getState().done[sid] && !getState().logs.some((l) => l.sessionId === sid)) setDone(sid, null);
  toast('Result deleted.');
  rerender();
});
