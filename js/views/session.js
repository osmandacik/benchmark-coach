// Session screen (Today, and any day opened from the Plan).

import { getState, update } from '../store.js';
import { buildSession, sessionById } from '../data/sessions.js';
import { slotOn, nextSessionFrom, allSessions, movedDays, ordOf, parseSessionId, TOTAL_WEEKS } from '../data/calendar.js';
import { BENCHMARKS } from '../data/benchmarks.js';
import { EQUIP, BODY, moveName } from '../data/moves.js';
import { targetFor, fmtTarget, fmtScore, bestAt, currentLevel, pacingPlan, breakdownFor } from '../coach.js';
import { OUTCOMES, startEase, stopEase } from '../adapt.js';
import {
  esc, fmtTime, fmtDate, fmtLongDate, fmtShortDate, fmtKg, fmtNum, todayISO, addDays, daysBetween, qs, toast, plural, listText,
} from '../util.js';
import { on, rerender, go } from '../actions.js';

export const notFound = (what = 'Page') => `<section class="card"><h1>${esc(what)} not found</h1>
  <p class="muted">The link may be old.</p><a class="btn primary" href="#/today">Back to today</a></section>`;

export function fmtBlockScore(log) {
  if (!log) return '';
  const s = log.score || {};
  let main = '';
  if (s.time != null) main = fmtTime(s.time);
  else if (s.rounds != null) main = `${plural(s.rounds, 'round')}${s.reps ? ` + ${s.reps}` : ''}`;
  else if (s.value != null) main = plural(Number(fmtNum(s.value)), 'round');
  else if (s.kg != null) main = fmtKg(s.kg);
  else if (s.pullup != null || s.t2b != null) main = `Pull-ups ${s.pullup ?? '–'}, toes-to-bar ${s.t2b ?? '–'}`;
  return [main, OUTCOMES[log.outcome] || ''].filter(Boolean).join(' · ');
}

export function timerHref(session, block) {
  const params = { label: block.title, session: session?.id || '', block: block.key, bench: block.bench || '' };
  for (const [k, v] of Object.entries(block.timer || {})) if (v != null) params[k] = v;
  return `#/timer?${qs(params)}`;
}

export function sessionStatus(id) {
  const st = getState();
  return {
    done: st.done[id] || null,
    skipped: st.skipped[id] || null,
    other: st.logs.find((l) => l.kind === 'other' && l.sessionId === id) || null,
  };
}

// "no rower, no wall ball, knee sore"
export function limitsText(ids) {
  return listText(ids.map((x) => (BODY[x] ? BODY[x].toLowerCase() : `no ${EQUIP[x].toLowerCase()}`)));
}

function blockedText(ids) {
  const gear = ids.filter((x) => EQUIP[x]).map((x) => EQUIP[x].toLowerCase());
  const body = ids.filter((x) => BODY[x]).map((x) => x);
  if (gear.length) return `needs ${listText(gear)}`;
  return `hard on the ${listText(body)}`;
}

export function rowsHtml(block) {
  return `<ul class="lines">${block.rows.map((r, i) => {
    const head = i === 0 && /:$/.test(r.text);
    let tag = '';
    if (r.swapped) tag = ` <span class="tag">instead of ${esc(moveName(r.orig.mv).toLowerCase())}</span>`;
    else if (r.blocked?.length) tag = ` <span class="tag warn">${esc(blockedText(r.blocked))}</span>`;
    return `<li class="${head ? 'head' : ''}">${esc(r.text)}${tag}</li>`;
  }).join('')}</ul>`;
}

// Most recent earlier log of the same workout (same block and same structure).
function lastSame(block, ord) {
  if (!block.variant || !['number', 'time', 'rounds'].includes(block.log)) return null;
  return getState().logs
    .filter((l) => l.kind === 'block' && l.key === block.key && l.variant === block.variant)
    .map((l) => ({ l, o: ordOf(l.sessionId) }))
    .filter((x) => x.o != null && x.o < ord)
    .sort((a, b) => b.o - a.o)[0]?.l || null;
}

export function testPanel(benchId) {
  const bench = BENCHMARKS[benchId];
  const level = currentLevel(benchId);
  const target = targetFor(benchId);
  const best = bestAt(benchId, level.index);
  const plan = pacingPlan(benchId, target);
  const sets = breakdownFor(benchId);
  const nextLevel = bench.levels[level.index + 1];

  let why = '';
  if (target.source === 'baseline') why = 'First test: this sets your baseline.';
  else if (target.source === 'step') why = `Halfway to the step-up score (${fmtTarget(benchId, { ...target.levelUp, source: 'ladder' }).toLowerCase()}).`;
  else if (target.source === 'ladder' && nextLevel) why = `Hit it and the next test moves up to ${nextLevel.label}.`;
  else if (target.source === 'finish') why = 'You were close to finishing last time.';
  else if (target.source === 'improve') {
    why = target.misses
      ? 'A smaller step than usual, because the last test missed its target.'
      : 'About 5% better than your best.';
  }

  return `
    <div class="target">
      <div><span class="eyebrow">Target</span><b>${esc(fmtTarget(benchId, target))}</b></div>
      <div><span class="eyebrow">Your best</span><b>${best ? esc(fmtScore(benchId, best.score)) : '–'}</b></div>
    </div>
    ${why ? `<p class="faint">${esc(why)}</p>` : ''}
    ${plan.rows.length ? `<table class="checkpoints">${plan.rows.map((r) => `<tr><td>${esc(r.label)}</td><td>${esc(r.at)}</td></tr>`).join('')}</table>
      <p class="faint">${esc(plan.note)}</p>` : `<p class="faint">${esc(plan.note)}</p>`}
    ${sets.length ? `<div class="note accent"><b>Your sets</b> (from your max unbroken)<br>${sets.map((s) => `${esc(s.label)}: ${esc(s.text)}`).join('<br>')}</div>` : ''}
    <details class="more"><summary>Strategy</summary><ul class="lines small">${bench.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></details>`;
}

function testBlockExtra(session, block, logged) {
  const bench = BENCHMARKS[block.bench];
  if (logged) {
    const t = logged.target ? fmtTarget(block.bench, logged.target) : '';
    return `<div class="target"><div><span class="eyebrow">Result${logged.modified ? ' (changed version)' : ''}</span><b>${esc(fmtScore(block.bench, logged.score))}</b></div>
      ${t ? `<div><span class="eyebrow">Target was</span><b>${esc(t)}</b></div>` : ''}</div>
      <a class="btn ghost" href="#/bench/${bench.id}">See progress</a>`;
  }
  const limits = new Set(session.limits);
  const missing = (block.needs || []).filter((x) => limits.has(x));
  const sore = Object.keys(BODY).filter((x) => limits.has(x));
  let warn = '';
  if (missing.length) {
    warn = `<p class="note warn">This test needs ${esc(listText(missing.map((x) => EQUIP[x].toLowerCase())))}.
      Swap it with a later test, or do it your way and log it as "changed".</p>`;
  } else if (sore.length) {
    warn = `<p class="note warn">You marked ${esc(listText(sore.map((x) => BODY[x].toLowerCase())))}. Tests are not adjusted: consider swapping this one with a later test.</p>`;
  }
  return warn + testPanel(block.bench);
}

function blockHtml(session, block, n, open) {
  const isTest = block.log === 'test';
  const logged = getState().logs.find((l) => l.sessionId === session.id && l.key === block.key && l.kind !== 'other') || null;
  const min = block.minutes ? `${block.minutes} min` : '';
  const timerBtn = block.timer ? `<a class="btn ${isTest && !logged ? 'primary' : ''}" href="${timerHref(session, block)}">Start timer</a>` : '';

  if (block.light) {
    return `<details class="card block light">
      <summary><span class="step">${n}</span><span class="block-name">${esc(block.title)}</span><span class="block-min">${min}</span></summary>
      ${rowsHtml(block)}
      ${block.note ? `<p class="faint">${esc(block.note)}</p>` : ''}
      ${timerBtn ? `<div class="btn-row">${timerBtn}</div>` : ''}
    </details>`;
  }

  const canAdjust = open && !isTest && (block.track || block.menu || block.rows.some((r) => r.orig));
  const last = logged ? null : lastSame(block, ordOf(session.id));
  const buttons = [
    timerBtn,
    canAdjust ? `<a class="btn ghost" href="#/block/${session.id}/${block.key}">Adjust or swap</a>` : '',
    open && isTest && !logged ? `<a class="btn ghost" href="#/change/${session.id}">Can't do it today?</a>` : '',
  ].filter(Boolean);

  return `
  <section class="card block ${isTest ? 'highlight' : ''}">
    <div class="block-head"><span class="step">${n}</span><h2>${esc(block.title)}</h2><span class="block-min">${min}</span></div>
    ${rowsHtml(block)}
    ${block.tip ? `<p class="adj">${esc(block.tip)}</p>` : ''}
    ${block.adj ? `<p class="adj">${esc(block.adj)}</p>` : ''}
    ${block.note ? `<p class="note">${esc(block.note)}</p>` : ''}
    ${isTest ? testBlockExtra(session, block, logged) : ''}
    ${last ? `<p class="faint">Last time (${esc(fmtShortDate(last.date))}): ${esc(fmtBlockScore(last))}. Match it with less effort, or beat it.</p>` : ''}
    ${logged && !isTest ? `<p class="logged">Logged: ${esc(fmtBlockScore(logged) || 'done')}</p>` : ''}
    ${buttons.length ? `<div class="btn-row">${buttons.join('')}</div>` : ''}
  </section>`;
}

function footerHtml(session, status) {
  const id = session.id;
  if (status.skipped) {
    return `<section class="note stack"><b>Skipped on ${esc(fmtDate(status.skipped))}</b>
      <span class="small">Nothing changes in the next sessions.</span>
      <div class="btn-row"><button class="btn" data-action="unskip" data-session="${id}">Undo skip</button>
      <a class="btn primary" href="#/finish/${id}">I did it after all</a></div></section>`;
  }
  if (status.other) {
    const o = status.other;
    return `<section class="note good stack"><b>Done on ${esc(fmtDate(o.date))}: you did something else</b>
      <span>${esc(o.title)}${o.score?.minutes ? ` · ${o.score.minutes} min` : ''}</span>
      <div class="btn-row"><a class="btn" href="#/other/${id}">Edit</a><a class="btn ghost" href="#/finish/${id}">Log this session instead</a></div></section>`;
  }
  if (status.done) {
    const notes = getState().notes[id];
    return `<section class="note good stack"><b>Done on ${esc(fmtDate(status.done))}</b>
      ${notes ? `<span class="small">${esc(notes)}</span>` : ''}
      <a class="btn" href="#/finish/${id}">Edit log</a></section>`;
  }
  return `<a class="btn primary big block" href="#/finish/${id}">${session.isTest ? 'Log result' : 'Finish session'}</a>
    <p class="faint center">${session.isTest ? 'Enter your score.' : 'One tap per part: say how it went and the next sessions adjust.'}</p>`;
}

export function renderSession(session, { heading = '' } = {}) {
  const today = todayISO();
  const status = sessionStatus(session.id);
  const p = getState().profile;
  const open = !status.done && !status.skipped && !status.other;
  const slot = slotOn(p, today);
  const canMove = open && session.date !== today && (slot.status === 'session' || slot.status === 'rest') && slot.week === session.week;

  const shown = session.limits.filter((x) => BODY[x] || session.equip.includes(x));
  const info = [];
  if (shown.length) info.push(`Adjusted for: ${limitsText(shown)}.`);
  if (session.eased) info.push('Easy return week: a bit lighter than planned.');

  let n = 0;
  return `
  <section class="hero">
    <span class="eyebrow">${esc(heading || fmtLongDate(session.date))}</span>
    <h1>${esc(session.title)}</h1>
    <p class="hero-meta">${heading ? `${esc(fmtLongDate(session.date))} · ` : ''}about ${session.minutes} min</p>
    <div class="row"><span class="badge ${session.isTest ? 'good' : 'accent'}">Week ${session.week} · ${esc(session.phase.name)}</span>
      ${status.done ? '<span class="badge good">Done</span>' : status.skipped ? '<span class="badge">Skipped</span>' : ''}</div>
    ${info.length ? `<p class="adj">${esc(info.join(' '))}</p>` : ''}
    ${open ? `<div class="btn-row">
      <a class="btn" href="#/change/${session.id}">Change this session</a>
      ${canMove ? `<button class="btn ghost" data-action="move-today" data-session="${session.id}">Do it today</button>` : ''}
    </div>` : ''}
  </section>
  ${session.blocks.map((b) => blockHtml(session, b, ++n, open)).join('')}
  ${footerHtml(session, status)}`;
}

// ---- Today ----

function missedList(p, today) {
  const st = getState();
  const from = addDays(today, -10);
  return allSessions(p).filter((s) => s.date < today && s.date >= from && !st.done[s.id] && !st.skipped[s.id]);
}

function missedBanner(p, today) {
  const missed = missedList(p, today);
  if (!missed.length) return '';
  if (missed.length >= 3) {
    return `<section class="note warn stack">
      <b>Welcome back. You missed ${missed.length} sessions.</b>
      <span class="small">Pick how to continue:</span>
      <button class="btn" data-action="ease-back">Carry on, with one easier week</button>
      <button class="btn" data-action="push-plan" data-days="7">Push the whole plan back 1 week</button>
      <button class="btn ghost" data-action="skip-missed">Carry on as planned</button>
    </section>`;
  }
  const s = missed[missed.length - 1];
  const session = buildSession(s.week, s.type);
  return `<section class="note warn stack">
    <span><b>Missed: ${esc(session.title)}</b> (${esc(fmtDate(s.date))})</span>
    <div class="btn-row"><a class="btn small" href="#/day/${s.id}">Open it</a>
    <button class="btn small" data-action="skip-session" data-session="${s.id}">Skip it</button>
    <button class="btn small" data-action="push-plan" data-days="1">Push plan 1 day</button></div>
  </section>`;
}

function easeBanner(p, today) {
  const e = p.ease;
  if (!e || today > e.until) return '';
  return `<section class="note accent stack"><span><b>Easy return week</b> until ${esc(fmtDate(e.until))}: sessions are about 15% lighter.</span>
    <button class="btn small" data-action="ease-stop">End it now</button></section>`;
}

function backupNudge() {
  const st = getState();
  const own = st.logs.filter((l) => !l.seed).length;
  const last = st.meta.lastExport;
  if (own < 5 || (last && daysBetween(last, todayISO()) < 21)) return '';
  return `<p class="faint center">Your logs live only on this phone. <a href="#/profile">Back them up</a>
    (last backup: ${last ? esc(fmtShortDate(last)) : 'never'}).</p>`;
}

export function renderToday() {
  const p = getState().profile;
  const today = todayISO();
  const slot = slotOn(p, today);

  if (slot.status === 'before') {
    const first = nextSessionFrom(p, today);
    return `<section class="note accent"><b>Cycle ${p.cycle} starts ${slot.daysUntil === 1 ? 'tomorrow' : `in ${slot.daysUntil} days`}.</b> Here is your first session.</section>
      ${renderSession(buildSession(first.week, first.type), { heading: 'First session' })}`;
  }
  if (slot.status === 'after') {
    return `<section class="hero"><span class="eyebrow">${esc(fmtLongDate(today))}</span><h1>Cycle ${p.cycle} complete</h1>
      <p class="muted">${TOTAL_WEEKS} weeks done. Check your progress, then start the next cycle when you are ready.</p>
      <div class="btn-row"><a class="btn primary" href="#/bench">See benchmarks</a><a class="btn" href="#/profile">Run the cycle again</a></div></section>`;
  }

  const top = missedBanner(p, today) + easeBanner(p, today);
  if (slot.status === 'rest') {
    const next = nextSessionFrom(p, addDays(today, 1));
    const st = getState();
    const movable = next && next.week === slot.week && !st.done[next.id] && !st.skipped[next.id];
    return `${top}<section class="hero"><span class="eyebrow">Today · ${esc(fmtLongDate(today))}</span><h1>Rest day</h1>
      <p class="muted">Sleep, eat, walk. Recovery is where the engine gets built.</p>
      ${next ? `<div class="btn-row"><a class="btn" href="#/day/${next.id}">Next: ${esc(buildSession(next.week, next.type).title)} · ${esc(fmtDate(next.date))}</a>
        ${movable ? `<button class="btn ghost" data-action="move-today" data-session="${next.id}">Do it today</button>` : ''}</div>` : ''}
      </section>${backupNudge()}`;
  }
  return `${top}${renderSession(buildSession(slot.week, slot.type), { heading: 'Today' })}${backupNudge()}`;
}

export function renderDay(id) {
  const session = sessionById(id);
  if (!session) return notFound('Session');
  const isToday = session.date === todayISO();
  return `<a class="back" href="#/plan">← Plan</a>${renderSession(session, { heading: isToday ? 'Today' : '' })}`;
}

// ---- Actions ----

function skip(ids) {
  const today = todayISO();
  update((s) => { for (const id of ids) if (!s.done[id]) s.skipped[id] = today; });
}

on('skip-session', (el) => {
  const id = el.dataset.session;
  if (!parseSessionId(id)) return;
  skip([id]);
  toast('Skipped. Nothing else changes.');
  if (location.hash.startsWith('#/change')) go(`#/day/${id}`);
  else rerender();
});

on('unskip', (el) => {
  update((s) => { delete s.skipped[el.dataset.session]; });
  rerender();
});

on('skip-missed', () => {
  skip(missedList(getState().profile, todayISO()).map((s) => s.id));
  toast('OK. Carrying on as planned.');
  rerender();
});

on('ease-back', () => {
  skip(missedList(getState().profile, todayISO()).map((s) => s.id));
  startEase();
  toast('Easy return week started: sessions are lighter for 7 days.');
  rerender();
});

on('ease-stop', () => {
  stopEase();
  toast('Back to the normal plan.');
  rerender();
});

on('push-plan', (el) => {
  const days = Number(el.dataset.days) === 7 ? 7 : 1;
  if (getState().profile.shift + days > 365) { toast('The plan cannot be pushed back any further.'); return; }
  update((s) => { s.profile.shift += days; });
  toast(`Plan pushed back ${days === 7 ? '1 week' : '1 day'}. Undo it on the Plan tab.`);
  if (location.hash.startsWith('#/change')) go('#/today');
  else rerender();
});

// Move a session of the current week to today (it trades places with today's session, if any).
on('move-today', (el) => {
  const parsed = parseSessionId(el.dataset.session);
  const p = getState().profile;
  const slot = slotOn(p, todayISO());
  if (!parsed || slot.offset == null || slot.week !== parsed.week) { toast('Only sessions of this week can be moved to today.'); return; }
  update((s) => { s.profile.weekDays[parsed.week] = movedDays(s.profile, parsed.week, parsed.type, slot.offset); });
  toast(slot.status === 'session' ? 'Swapped with today\'s session.' : 'Moved to today.');
  go('#/today');
});
