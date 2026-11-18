// The 13-week plan.

import { getState, update } from '../store.js';
import { weekSessions, weekInfo, TOTAL_WEEKS, slotOn, planStart, testFor, sessionTitle } from '../data/calendar.js';
import { BENCHMARKS } from '../data/benchmarks.js';
import { esc, fmtShortDate, weekdayShort, todayISO, addDays, toast, plural } from '../util.js';
import { on, rerender } from '../actions.js';

export function renderPlan() {
  const st = getState();
  const p = st.profile;
  const today = todayISO();
  const slot = slotOn(p, today);
  const currentWeek = slot.week || (slot.status === 'before' ? 1 : TOTAL_WEEKS);
  let doneCount = 0;
  let weeksHtml = '';

  for (let week = 1; week <= TOTAL_WEEKS; week++) {
    const info = weekInfo(week);
    const sessions = weekSessions(p, week);
    const closed = sessions.filter((s) => st.done[s.id]).length;
    doneCount += closed;
    const swapped = !!p.weekDays[week];
    const rows = sessions.map((s) => {
      const done = st.done[s.id];
      const skipped = st.skipped[s.id];
      const missed = !done && !skipped && s.date < today;
      const isTest = s.type === 'test' || (week === 13 && s.type === 'aerobic');
      const mark = done ? '<span class="tick on" aria-label="Done">✓</span>'
        : skipped ? '<span class="tick skip" aria-label="Skipped">–</span>'
          : missed ? '<span class="tick miss" aria-label="Missed">!</span>'
            : '<span class="tick" aria-label="Open"></span>';
      return `<a class="day-row ${s.date === today ? 'today' : ''} ${isTest ? 'test' : ''}" href="#/day/${s.id}">
        <span class="d">${esc(weekdayShort(s.date))}<br>${esc(fmtShortDate(s.date))}</span>
        <span class="t">${esc(sessionTitle(p, s.week, s.type))}${skipped ? ' <span class="faint">skipped</span>' : missed ? ' <span class="faint">missed</span>' : ''}</span>
        ${mark}</a>`;
    }).join('');
    const testName = week === 13 ? 'Cindy + Angie' : BENCHMARKS[testFor(p, week)].name;

    weeksHtml += `<details class="card week" ${week === currentWeek ? 'open' : ''}>
      <summary class="week-head">
        <span class="stack tight"><b>Week ${week}${week === currentWeek && slot.week ? ' · now' : ''}</b>
          <span class="faint">${esc(fmtShortDate(sessions[0].date))} · test: ${esc(testName)}</span></span>
        <span class="row"><span class="badge ${info.phase.key === 'deload' ? '' : info.phase.key === 'test' ? 'good' : 'accent'}">${esc(info.phase.name)}</span>
        <span class="faint">${closed}/${sessions.length}</span></span>
      </summary>
      <div class="stack">${rows}
        ${swapped ? `<button class="btn small ghost" data-action="reset-week" data-week="${week}">Back to the usual days this week</button>` : ''}
      </div>
    </details>`;
  }

  const start = planStart(p);
  return `<section class="hero">
    <span class="eyebrow">Cycle ${p.cycle} · Conditioning</span>
    <h1>${TOTAL_WEEKS}-week plan</h1>
    <p class="hero-meta">${esc(fmtShortDate(start))} – ${esc(fmtShortDate(addDays(start, TOTAL_WEEKS * 7 - 1)))} · ${doneCount} of ${TOTAL_WEEKS * 5} sessions done</p>
    <p class="faint">Benchmark weights stay locked. You get faster by building your 15–25 minute engine and pacing better.</p>
    <details class="more"><summary>Move the plan${p.shift ? ` (pushed back ${plural(p.shift, 'day')})` : ''}</summary>
      <div class="stack">
        <p class="faint">Use this after time off. Every session that is still open moves later.</p>
        <div class="btn-row">
          <button class="btn small" data-action="push-plan" data-days="1">Push back 1 day</button>
          <button class="btn small" data-action="push-plan" data-days="7">Push back 1 week</button>
        </div>
        ${p.shift ? `<div class="btn-row"><button class="btn small ghost" data-action="pull-plan" data-days="1">Undo 1 day</button>
          <button class="btn small ghost" data-action="pull-plan" data-days="${p.shift}">Undo all</button></div>` : ''}
      </div>
    </details>
  </section>${weeksHtml}`;
}

on('pull-plan', (el) => {
  const days = Math.max(1, Math.round(Number(el.dataset.days) || 1));
  update((s) => { s.profile.shift = Math.max(0, s.profile.shift - days); });
  toast('Plan moved forward.');
  rerender();
});

on('reset-week', (el) => {
  const week = Number(el.dataset.week);
  update((s) => { delete s.profile.weekDays[week]; });
  toast('Usual days restored for that week.');
  rerender();
});
