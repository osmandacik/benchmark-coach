// Timer screen. Opened from a session block (with its settings) or set up by hand.
// The running timer is remembered on the phone, so it survives the app being closed or reloaded mid-workout.

import { createTimer } from '../timer.js';
import { unlockAudio } from '../audio.js';
import { sessionById } from '../data/sessions.js';
import { BENCHMARKS } from '../data/benchmarks.js';
import { esc, fmtClock, fmtTime, qs, toNum, clamp } from '../util.js';
import { on, go, rerender } from '../actions.js';

const STORE_KEY = 'benchmark-coach.timer';
const MODES = { fortime: 'For time (counts up)', amrap: 'AMRAP (counts down)', emom: 'EMOM', intervals: 'Work / rest intervals' };

let active = null; // { key, cfg, timer, params, stations, lines, label, query }
let setupMode = 'fortime';

// ---- Remembering the running timer ----

function persist() {
  try {
    const s = active?.timer.state;
    if (!s || s.status === 'idle') {
      localStorage.removeItem(STORE_KEY);
      return;
    }
    localStorage.setItem(STORE_KEY, JSON.stringify({
      query: active.query,
      s: { status: s.status, startedAt: s.startedAt, pausedTotal: s.pausedTotal, pauseStart: s.pauseStart, laps: s.laps, finishedRun: s.finishedRun },
    }));
  } catch { /* storage not available */ }
}

function readSaved() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (!saved || typeof saved.query !== 'string' || !saved.s) return null;
    const age = (Date.now() - Number(saved.s.startedAt)) / 1000;
    if (!(age >= 0 && age < 8 * 3600)) return null; // too old to be this workout
    return saved;
  } catch {
    return null;
  }
}

// ---- Settings ----

// Reads timer settings from the link. Returns null when they are not usable.
function parseCfg(params) {
  const mode = params.get('mode');
  if (!MODES[mode]) return null;
  const n = (k, lo, hi) => {
    const v = Number(params.get(k));
    return params.get(k) != null && params.get(k) !== '' && Number.isFinite(v) && v >= lo ? Math.min(v, hi) : null;
  };
  const cfg = { mode };
  if (mode === 'fortime') {
    const cap = n('cap', 1, 6 * 3600);
    if (cap) cfg.cap = cap;
  }
  if (mode === 'amrap') {
    cfg.duration = n('duration', 1, 6 * 3600);
    if (!cfg.duration) return null;
  }
  if (mode === 'emom') {
    cfg.every = n('every', 5, 3600) || 60;
    cfg.count = Math.round(n('count', 1, 240) || 0);
    if (!cfg.count) return null;
  }
  if (mode === 'intervals') {
    cfg.work = n('work', 1, 2 * 3600);
    cfg.rest = n('rest', 0, 3600) || 0;
    cfg.rounds = Math.round(n('rounds', 1, 100) || 0);
    if (!cfg.work || !cfg.rounds) return null;
  }
  return cfg;
}

function blockFor(params) {
  const session = sessionById(params.get('session'));
  return session?.blocks.find((b) => b.key === params.get('block')) || null;
}

function open(params, saved = null) {
  const cfg = parseCfg(params);
  if (!cfg) return false;
  active?.timer.destroy();
  const block = blockFor(params);
  const key = params.toString();
  active = {
    key, cfg, params, query: key,
    stations: (block?.lines || []).filter((l) => /^Min \d+:/.test(l)).map((l) => l.replace(/^Min \d+:\s*/, '')),
    lines: block?.lines || [],
    label: params.get('label') || 'Timer',
    canLog: !!(block && block.log && block.log !== 'none') || (!params.get('session') && !!BENCHMARKS[params.get('bench')]),
    lastStatus: null, lastLaps: -1,
  };
  active.timer = createTimer(cfg, paint, saved);
  return true;
}

// Called once when the app starts: pick up a timer that was running when the app closed.
export function restoreTimer() {
  const saved = readSaved();
  if (!saved || active) return;
  if (!open(new URLSearchParams(saved.query), saved.s)) {
    try { localStorage.removeItem(STORE_KEY); } catch { /* ignore */ }
  }
}

// For the "timer running" banner on other screens.
export function timerStatus() {
  const st = active?.timer.state.status;
  if (st !== 'running' && st !== 'paused') return null;
  return { label: active.label, query: active.query, status: st, clock: fmtClock(active.timer.current().main) };
}

// ---- Screen ----

function setupForm(note = '') {
  const field = (id, label, value, max) => `<label class="field">${label}<input class="input" id="${id}" type="number" inputmode="decimal" min="0" max="${max}" value="${value}"></label>`;
  let fields = '';
  if (setupMode === 'fortime') fields = field('t-min', 'Time cap in minutes (0 = no cap)', 15, 300);
  if (setupMode === 'amrap') fields = field('t-min', 'Minutes', 12, 300);
  if (setupMode === 'emom') fields = `<div class="grid-2">${field('t-count', 'Rounds', 10, 240)}${field('t-every', 'Seconds per round', 60, 3600)}</div>`;
  if (setupMode === 'intervals') {
    fields = `<div class="grid-2">${field('t-work', 'Work (minutes)', 5, 120)}${field('t-rest', 'Rest (minutes)', 2, 60)}</div>${field('t-rounds', 'Rounds', 4, 100)}`;
  }
  return `<section class="stack"><h1>Timer</h1>
    <p class="muted small">Every part of a session has its own "Start timer" button. Use this one for anything else.</p></section>
    ${note ? `<p class="note warn">${esc(note)}</p>` : ''}
    <section class="card">
      <label class="field">Type<select class="input" id="t-mode" data-change="timer-mode">
        ${Object.entries(MODES).map(([k, v]) => `<option value="${k}" ${k === setupMode ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      ${fields}
      <button class="btn primary big block" data-action="timer-setup">Set timer</button></section>`;
}

function controls() {
  const st = active.timer.state.status;
  const mode = active.cfg.mode;
  const laps = mode !== 'emom';
  if (st === 'idle') return '<button class="btn primary block round-btn" data-action="timer-start">Start</button>';
  if (st === 'running') {
    return `${laps ? '<button class="btn block round-btn" data-action="timer-lap">+1 round</button>' : ''}
      <div class="btn-row"><button class="btn" data-action="timer-pause">Pause</button>
      ${mode === 'fortime' ? '<button class="btn good" data-action="timer-finish">Done</button>' : ''}</div>`;
  }
  if (st === 'paused') {
    return `<div class="btn-row"><button class="btn primary" data-action="timer-resume">Resume</button>
      ${mode === 'fortime' ? '<button class="btn good" data-action="timer-finish">Done</button>' : ''}
      <button class="btn ghost" data-action="timer-reset">Reset</button></div>`;
  }
  return `<div class="btn-row">${active.canLog ? '<button class="btn primary" data-action="timer-log">Log result</button>' : ''}
    <button class="btn ghost" data-action="timer-reset">Reset</button></div>`;
}

function lapsHtml() {
  const laps = active.timer.state.laps;
  if (!laps.length) return '';
  const splits = laps.map((t, i) => t - (laps[i - 1] || 0));
  const shown = splits.slice(-12);
  const first = splits.length - shown.length;
  return `<div class="stack"><div class="row between"><span class="eyebrow">Rounds: ${laps.length}</span>
    <button class="btn small ghost" data-action="timer-unlap">Undo last</button></div>
    ${active.cfg.mode === 'intervals' ? '' : `<div class="laps">${shown.map((s, i) => `<span>R${first + i + 1} ${fmtTime(s)}</span>`).join('')}</div>`}</div>`;
}

function paint(snap) {
  const face = document.getElementById('timer-face');
  if (!active || !face || face.dataset.key !== active.key) return;
  face.className = `timer-face ${snap.phase}`;
  document.getElementById('timer-phase').textContent =
    { countdown: 'Get ready', work: active.cfg.mode === 'intervals' ? 'Work' : 'Go', rest: 'Rest', done: 'Done' }[snap.phase];
  document.getElementById('timer-digits').textContent = fmtClock(snap.main);
  let sub = snap.sub;
  if (active.stations.length && snap.index != null) sub += ` · ${active.stations[snap.index % active.stations.length]}`;
  document.getElementById('timer-sub').textContent = sub;
  const st = active.timer.state.status;
  if (active.lastStatus !== st || active.lastLaps !== active.timer.state.laps.length) {
    active.lastStatus = st;
    active.lastLaps = active.timer.state.laps.length;
    document.getElementById('timer-controls').innerHTML = controls();
    document.getElementById('timer-laps').innerHTML = lapsHtml();
    persist();
  }
}

export function renderTimer(params) {
  if (!params.get('mode')) {
    const t = timerStatus();
    const banner = t ? `<section class="note accent stack"><b>${t.status === 'paused' ? 'Paused' : 'Running'}: ${esc(t.label)}</b>
      <a class="btn" href="#/timer?${t.query}">Back to the timer</a></section>` : '';
    return banner + setupForm();
  }

  const key = params.toString();
  if (!active || active.key !== key) {
    const busy = active && ['running', 'paused'].includes(active.timer.state.status);
    if (busy && !confirm(`"${active.label}" is still running. Stop it and open this timer?`)) {
      const stay = `#/timer?${active.query}`;
      setTimeout(() => go(stay));
      return '';
    }
    const saved = readSaved();
    if (!open(params, saved?.query === key ? saved.s : null)) {
      return setupForm('That timer link was not complete. Set the timer here instead.');
    }
    persist();
  }
  active.lastStatus = null;
  const snap = active.timer.current();
  const bench = BENCHMARKS[params.get('bench')];
  const session = sessionById(params.get('session'));
  const back = session ? `#/day/${session.id}` : bench ? `#/bench/${bench.id}` : '#/timer';
  return `<a class="back" href="${back}">← Back</a>
    <section class="stack tight"><h2>${esc(active.label)}</h2>
    ${session ? `<span class="faint">${esc(session.title)}</span>` : bench ? `<span class="faint">${esc(bench.name)}</span>` : ''}</section>
    <div id="timer-face" data-key="${esc(key)}" class="timer-face ${snap.phase}">
      <span id="timer-phase" class="timer-phase">${snap.phase === 'countdown' ? 'Ready' : snap.phase === 'done' ? 'Done' : ''}</span>
      <span id="timer-digits" class="timer-digits">${fmtClock(snap.main)}</span>
      <span id="timer-sub" class="timer-sub">${esc(snap.sub)}</span>
    </div>
    <div id="timer-controls" class="stack">${controls()}</div>
    <div id="timer-laps">${lapsHtml()}</div>
    ${active.lines.length ? `<section class="card flat"><ul class="lines">${active.lines.map((l, i) => `<li class="${i === 0 && /:$/.test(l) ? 'head' : ''}">${esc(l)}</li>`).join('')}</ul></section>` : ''}
    <p class="faint">10-second countdown, then beeps at 3-2-1 and at every change. On iPhone, turn off silent mode to hear them. The screen stays on while the timer runs.</p>`;
}

// ---- Actions ----

on('timer-mode', (el) => {
  if (MODES[el.value]) setupMode = el.value;
  rerender();
});

on('timer-setup', () => {
  const read = (id, opts, fallback) => {
    const v = toNum(document.getElementById(id)?.value, opts);
    return v == null || Number.isNaN(v) ? fallback : v;
  };
  const mode = MODES[setupMode] ? setupMode : 'fortime';
  const p = { mode, label: 'Custom timer' };
  if (mode === 'fortime') {
    const min = read('t-min', { max: 300 }, 0);
    if (min > 0) p.cap = Math.round(min * 60);
  }
  if (mode === 'amrap') p.duration = Math.round(clamp(read('t-min', { max: 300 }, 12), 0.5, 300) * 60);
  if (mode === 'emom') {
    p.count = Math.round(clamp(read('t-count', { max: 240 }, 10), 1, 240));
    p.every = Math.round(clamp(read('t-every', { max: 3600 }, 60), 5, 3600));
  }
  if (mode === 'intervals') {
    p.work = Math.round(clamp(read('t-work', { max: 120 }, 5), 0.1, 120) * 60);
    p.rest = Math.round(clamp(read('t-rest', { max: 60 }, 0), 0, 60) * 60);
    p.rounds = Math.round(clamp(read('t-rounds', { max: 100 }, 4), 1, 100));
  }
  go(`#/timer?${qs(p)}`);
});

// Every timer button works on the timer on screen; if there is none (stale screen), just redraw.
const act = (fn) => () => {
  if (!active) { rerender(); return; }
  fn(active.timer);
  persist();
};

on('timer-start', act((t) => { unlockAudio(); t.start(); }));
on('timer-pause', act((t) => t.pause()));
on('timer-resume', act((t) => { unlockAudio(); t.resume(); }));
on('timer-finish', act((t) => t.finish()));
on('timer-lap', act((t) => t.addLap()));
on('timer-unlap', act((t) => t.removeLap()));
on('timer-reset', act((t) => {
  const st = t.state.status;
  if ((st === 'running' || st === 'paused') && !confirm('Reset the timer? The time so far is lost.')) return;
  t.reset();
  rerender();
}));

on('timer-log', () => {
  if (!active) return;
  const s = active.timer.state;
  const p = active.params;
  const cfg = active.cfg;
  const out = {};
  if (cfg.mode === 'fortime') {
    const run = s.finishedRun ?? 0;
    if (cfg.cap && run >= cfg.cap) out.capped = 1;
    else out.time = Math.max(1, Math.round(run));
  } else if (s.laps.length) out.rounds = s.laps.length;

  const session = sessionById(p.get('session'));
  const target = session
    ? `#/finish/${session.id}?${qs({ block: p.get('block') || '', ...out })}`
    : `#/log?${qs({ bench: p.get('bench') || '', ...out })}`;
  go(target);
});

// Sound needs a tap after the app was reopened: any tap while a timer runs unlocks it again.
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', () => {
    if (active?.timer.state.status === 'running') unlockAudio();
  }, { passive: true });
}
