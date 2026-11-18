// Timer engine: for time, AMRAP, EMOM and work/rest intervals, with a 10 s countdown and beeps.
// Time is computed from the clock (not by counting ticks), so it stays accurate if the phone lags,
// and a running timer can be picked up again after the app was closed (see `saved`).

import { beep, keepAwake } from './audio.js';

export const COUNTDOWN = 10;

export function runSeconds(cfg) {
  switch (cfg.mode) {
    case 'amrap': return cfg.duration;
    case 'emom': return cfg.every * cfg.count;
    case 'intervals': return cfg.rounds * cfg.work + (cfg.rounds - 1) * cfg.rest;
    default: return cfg.cap || Infinity;
  }
}

function buildEvents(cfg) {
  const C = COUNTDOWN;
  const ev = [];
  const warn = (at) => { for (let i = 3; i >= 1; i--) ev.push({ at: at - i, type: 'tick' }); };
  warn(C);
  ev.push({ at: C, type: 'go' });

  if (cfg.mode === 'emom') {
    for (let k = 1; k < cfg.count; k++) {
      warn(C + k * cfg.every);
      ev.push({ at: C + k * cfg.every, type: 'go' });
    }
  }
  if (cfg.mode === 'intervals') {
    const period = cfg.work + cfg.rest;
    for (let r = 0; r < cfg.rounds - 1; r++) {
      const restAt = C + r * period + cfg.work;
      warn(restAt);
      if (cfg.rest > 0) {
        ev.push({ at: restAt, type: 'rest' });
        if (cfg.rest > 3) warn(restAt + cfg.rest);
      }
      ev.push({ at: restAt + cfg.rest, type: 'go' });
    }
  }
  const end = runSeconds(cfg);
  if (Number.isFinite(end)) {
    warn(C + end);
    ev.push({ at: C + end, type: 'finish' });
  }
  return ev.sort((a, b) => a.at - b.at);
}

export function snapshot(cfg, total) {
  const C = COUNTDOWN;
  if (total < C) return { phase: 'countdown', main: Math.ceil(C - total), sub: 'Get ready', run: 0 };
  const t = total - C;
  const end = runSeconds(cfg);
  if (t >= end) return { phase: 'done', main: cfg.mode === 'fortime' ? end : 0, sub: 'Time', run: end };

  if (cfg.mode === 'amrap') {
    return { phase: 'work', main: cfg.duration - t, sub: `AMRAP ${Math.round(cfg.duration / 60)} min`, run: t };
  }
  if (cfg.mode === 'emom') {
    const idx = Math.floor(t / cfg.every);
    return { phase: 'work', main: cfg.every - (t % cfg.every), sub: `Minute ${idx + 1} of ${cfg.count}`, run: t, index: idx };
  }
  if (cfg.mode === 'intervals') {
    const period = cfg.work + cfg.rest;
    const r = Math.floor(t / period);
    const within = t - r * period;
    if (within < cfg.work) return { phase: 'work', main: cfg.work - within, sub: `Interval ${r + 1} of ${cfg.rounds}`, run: t };
    return { phase: 'rest', main: period - within, sub: `Rest · interval ${r + 2} next`, run: t };
  }
  return { phase: 'work', main: t, sub: cfg.cap ? `For time · cap ${Math.round(cfg.cap / 60)} min` : 'For time', run: t };
}

// saved: { status, startedAt, pausedTotal, pauseStart, laps, finishedRun } from an earlier run of the same timer.
export function createTimer(cfg, onUpdate, saved = null) {
  const events = buildEvents(cfg);
  const s = { status: 'idle', startedAt: 0, pausedTotal: 0, pauseStart: 0, next: 0, laps: [], finishedRun: null };
  let interval = null;

  const elapsed = () => {
    if (s.status === 'idle') return 0;
    const now = s.status === 'paused' ? s.pauseStart : Date.now();
    return Math.max(0, (now - s.startedAt - s.pausedTotal) / 1000);
  };

  function fire(total) {
    while (s.next < events.length && events[s.next].at <= total) {
      const e = events[s.next++];
      if (total - e.at < 1.5) beep[e.type](); // skip stale beeps after a long pause in the background
    }
  }

  function loop() {
    const total = elapsed();
    fire(total);
    const snap = snapshot(cfg, total);
    if (snap.phase === 'done' && s.status === 'running') {
      s.status = 'done';
      s.finishedRun = snap.run;
      stopLoop();
      keepAwake(false);
    }
    onUpdate(snap, s);
  }

  function startLoop() { stopLoop(); interval = setInterval(loop, 100); loop(); }
  function stopLoop() { if (interval) clearInterval(interval); interval = null; }

  const api = {
    state: s,
    current() {
      if (s.status === 'done') {
        const run = s.finishedRun ?? 0;
        return { phase: 'done', main: cfg.mode === 'fortime' ? run : 0, sub: 'Finished', run };
      }
      return snapshot(cfg, elapsed());
    },
    start() {
      if (s.status === 'running') return;
      Object.assign(s, { status: 'running', startedAt: Date.now(), pausedTotal: 0, pauseStart: 0, next: 0, laps: [], finishedRun: null });
      keepAwake(true);
      startLoop();
    },
    pause() {
      if (s.status !== 'running') return;
      s.status = 'paused';
      s.pauseStart = Date.now();
      stopLoop();
      keepAwake(false);
      loop();
    },
    resume() {
      if (s.status !== 'paused') return;
      s.pausedTotal += Date.now() - s.pauseStart;
      s.status = 'running';
      keepAwake(true);
      startLoop();
    },
    // Stop now (used for "Done" in for-time workouts).
    finish() {
      if (s.status !== 'running' && s.status !== 'paused') return;
      const run = Math.max(0, elapsed() - COUNTDOWN);
      if (s.status === 'paused') s.pausedTotal += Date.now() - s.pauseStart;
      s.status = 'done';
      s.finishedRun = run;
      stopLoop();
      keepAwake(false);
      beep.finish();
      onUpdate({ phase: 'done', main: run, sub: 'Finished', run }, s);
    },
    reset() {
      stopLoop();
      keepAwake(false);
      Object.assign(s, { status: 'idle', next: 0, laps: [], finishedRun: null });
      onUpdate(snapshot(cfg, 0), s);
    },
    addLap() {
      if (s.status !== 'running') return;
      const run = elapsed() - COUNTDOWN;
      if (run > 0 && s.laps.length < 500) s.laps.push(run);
      loop();
    },
    removeLap() {
      if (s.laps.length) s.laps.pop();
      onUpdate(api.current(), s);
    },
    destroy() { stopLoop(); keepAwake(false); },
  };

  if (saved && ['running', 'paused', 'done'].includes(saved.status)) {
    Object.assign(s, {
      status: saved.status,
      startedAt: Number(saved.startedAt) || Date.now(),
      pausedTotal: Number(saved.pausedTotal) || 0,
      pauseStart: Number(saved.pauseStart) || Date.now(),
      laps: Array.isArray(saved.laps) ? saved.laps.filter((x) => Number.isFinite(x)).slice(0, 500) : [],
      finishedRun: Number.isFinite(saved.finishedRun) ? saved.finishedRun : null,
    });
    const total = elapsed();
    s.next = events.findIndex((e) => e.at > total);
    if (s.next < 0) s.next = events.length;
    if (s.status === 'running') {
      keepAwake(true);
      startLoop();
    }
  }

  return api;
}
