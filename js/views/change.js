// Changing a session when the day does not go to plan:
//   #/change/<session>         missing equipment, sore knee/back, swap days, swap the test, skip
//   #/block/<session>/<block>  easier/harder, swap one movement, pick a different workout
//   #/other/<session>          "I did something else"

import { getState, update, setDay, dayCfg, putLog, removeLogs, setDone } from '../store.js';
import { sessionById } from '../data/sessions.js';
import {
  weekSessions, daysFor, movedDays, sessionTitle, testOrder, testFor, dateFor, ordOf, parseSessionId,
} from '../data/calendar.js';
import { BENCHMARKS } from '../data/benchmarks.js';
import { EQUIP, BODY, MOVES, altsOf, blockedBy, moveName, lineText } from '../data/moves.js';
import { TRACKS, levelAt, amount, addTweak, resetTrack } from '../adapt.js';
import { esc, fmtDate, weekdayShort, todayISO, toast, toNum, isISO, listText, cap } from '../util.js';
import { on, rerender, go } from '../actions.js';
import { notFound, rowsHtml, sessionStatus } from './session.js';

const chip = (label, isOn, attrs) => `<button type="button" class="chip ${isOn ? 'on' : ''}" aria-pressed="${isOn}" ${attrs}>${esc(label)}</button>`;

// ---- Change a whole session ----

export function renderChange(id) {
  const session = sessionById(id);
  if (!session) return notFound('Session');
  const st = getState();
  const p = st.profile;
  const day = dayCfg(id);
  const status = sessionStatus(id);
  const open = !status.done && !status.skipped && !status.other;

  const gear = session.equip.filter((k) => !p.missing.includes(k));
  const allOff = gear.length > 0 && gear.every((k) => day.missing.includes(k));
  const never = session.equip.filter((k) => p.missing.includes(k));

  const limits = `<section class="card"><h2>Something missing or sore?</h2>
    <p class="muted small">Tap what you cannot use for this session. The movements are swapped for you.</p>
    ${gear.length ? `<div class="chips">${gear.map((k) => chip(`No ${EQUIP[k].toLowerCase()}`, day.missing.includes(k), `data-action="toggle-limit" data-session="${id}" data-id="${k}"`)).join('')}</div>` : ''}
    <div class="chips">${Object.entries(BODY).map(([k, name]) => chip(name, day.missing.includes(k), `data-action="toggle-limit" data-session="${id}" data-id="${k}"`)).join('')}</div>
    ${gear.length ? `<button class="btn ${allOff ? '' : 'ghost'}" data-action="bodyweight" data-session="${id}">${allOff ? 'Bodyweight only is on · tap to undo' : 'No equipment at all (bodyweight only)'}</button>` : ''}
    ${never.length ? `<p class="faint">Never at your gym (set in Profile): ${esc(listText(never.map((k) => EQUIP[k].toLowerCase())))}.</p>` : ''}
    ${session.isTest ? '<p class="faint">The benchmark test itself is never changed, so your results stay comparable.</p>' : ''}
    <a class="btn primary" href="#/day/${id}">Show the session</a>
  </section>`;

  // Swap the test with a later one
  let tests = '';
  if (open && session.type === 'test' && session.week <= 12) {
    const order = testOrder(p);
    const later = [];
    for (let w = session.week + 1; w <= 12; w++) {
      if (order[w - 1] === order[session.week - 1] || st.done[`W${w}-test`]) continue;
      later.push(`<button class="btn" data-action="swap-test" data-week="${session.week}" data-with="${w}">
        ${esc(BENCHMARKS[order[w - 1]].name)} <span class="faint">planned ${esc(fmtDate(dateFor(p, w, 'test')))}</span></button>`);
      if (later.length >= 5) break;
    }
    if (later.length) {
      tests = `<section class="card"><h2>Test a different benchmark</h2>
        <p class="muted small">Trade places with a later test. ${esc(BENCHMARKS[session.benchId].name)} moves to that date.</p>
        ${later.join('')}</section>`;
    }
  }

  // Trade days inside the week
  let days = '';
  if (open) {
    const others = weekSessions(p, session.week).filter((s) => s.id !== id && !st.done[s.id] && !st.skipped[s.id]);
    if (others.length) {
      days = `<section class="card"><h2>Do a different session instead</h2>
        <p class="muted small">The two sessions trade days, this week only.</p>
        ${others.map((s) => `<button class="btn" data-action="swap-days" data-session="${id}" data-with="${s.type}">
          ${esc(sessionTitle(p, s.week, s.type))} <span class="faint">planned ${esc(weekdayShort(s.date))}</span></button>`).join('')}
      </section>`;
    }
  }

  const away = open ? `<section class="card"><h2>Not training?</h2>
    <button class="btn" data-action="skip-session" data-session="${id}">Skip this session</button>
    <button class="btn" data-action="push-plan" data-days="1">Push the whole plan back 1 day</button>
    <p class="faint">Skipping keeps the dates. Pushing moves every remaining session one day later.</p>
  </section>
  <section class="card"><h2>Did something else?</h2>
    <p class="muted small">A class, a hike, a competition: log it and this session counts as done.</p>
    <a class="btn" href="#/other/${id}">Log a different workout</a></section>` : '';

  return `<a class="back" href="#/day/${id}">← Back to the session</a>
    <section class="stack"><h1>Change this session</h1><p class="muted">${esc(session.title)} · ${esc(fmtDate(session.date))}</p></section>
    ${limits}${tests}${days}${away}`;
}

on('toggle-limit', (el) => {
  const { session: id, id: key } = el.dataset;
  if (!parseSessionId(id) || !(EQUIP[key] || BODY[key])) return;
  setDay(id, (d) => {
    d.missing = d.missing.includes(key) ? d.missing.filter((x) => x !== key) : [...d.missing, key];
  });
  rerender();
});

on('bodyweight', (el) => {
  const id = el.dataset.session;
  const session = sessionById(id);
  if (!session) return;
  const gear = session.equip.filter((k) => !getState().profile.missing.includes(k));
  setDay(id, (d) => {
    const body = d.missing.filter((x) => BODY[x]);
    const allOff = gear.every((k) => d.missing.includes(k));
    d.missing = allOff ? body : [...body, ...Object.keys(EQUIP)];
  });
  rerender();
});

on('swap-days', (el) => {
  const parsed = parseSessionId(el.dataset.session);
  const other = el.dataset.with;
  if (!parsed || !parseSessionId(`W${parsed.week}-${other}`)) return;
  const p = getState().profile;
  const wasToday = dateFor(p, parsed.week, parsed.type) === todayISO();
  update((s) => {
    s.profile.weekDays[parsed.week] = movedDays(s.profile, parsed.week, parsed.type, daysFor(s.profile, parsed.week)[other]);
  });
  toast('Sessions swapped for this week.');
  go(wasToday ? '#/today' : `#/day/W${parsed.week}-${other}`);
});

on('swap-test', (el) => {
  const a = Number(el.dataset.week);
  const b = Number(el.dataset.with);
  if (![a, b].every((w) => Number.isInteger(w) && w >= 1 && w <= 12) || a === b) return;
  update((s) => {
    const order = [...testOrder(s.profile)];
    [order[a - 1], order[b - 1]] = [order[b - 1], order[a - 1]];
    s.profile.testOrder = order;
  });
  toast(`Now testing ${BENCHMARKS[testFor(getState().profile, a)].name}.`);
  go(`#/day/W${a}-test`);
});

// ---- Adjust one part of a session ----

export function renderBlockPage(id, key) {
  const session = sessionById(id);
  const block = session?.blocks.find((b) => b.key === key);
  if (!block || block.bench) return notFound('That part of the session');
  const st = getState();
  const day = dayCfg(id);
  const limits = new Set(session.limits);
  const ord = ordOf(id);

  let difficulty = '';
  if (block.track && TRACKS[block.track]) {
    const lv = levelAt(block.track, ord);
    difficulty = `<section class="card"><h2>Difficulty</h2>
      <div class="stepper">
        <button class="btn" data-action="tweak" data-track="${block.track}" data-ord="${ord}" data-d="-1">Easier</button>
        <span class="stepper-val">${lv.steps ? esc(cap(amount(block.track, lv.steps))) : 'As planned'}</span>
        <button class="btn" data-action="tweak" data-track="${block.track}" data-ord="${ord}" data-d="1">Harder</button>
      </div>
      <p class="faint">Changes this session and the ones after it. How you log each session keeps adjusting it too.</p>
      ${lv.steps ? `<button class="btn small ghost" data-action="tweak-reset" data-track="${block.track}" data-ord="${ord}">Back to the plan</button>` : ''}
    </section>`;
  }

  const swappable = block.rows.filter((r) => r.orig && altsOf(r.orig.mv).length);
  const moves = swappable.length ? `<section class="card"><h2>Swap a movement</h2>
    ${swappable.map((r) => {
      const mv = r.orig.mv;
      const attrs = (to) => `data-action="swap-move" data-session="${id}" data-block="${esc(key)}" data-mv="${mv}" data-to="${to}"`;
      const options = [
        chip(`${moveName(mv)} (planned)`, !r.swapped, attrs(mv)),
        ...altsOf(mv).map((a) => chip(moveName(a.to), r.item.mv === a.to, attrs(a.to))),
      ].join('');
      let now = '';
      if (r.swapped) {
        const reason = r.why === 'auto' ? ` Swapped for you: ${esc(listText(blockedBy(mv, limits).map((x) => (EQUIP[x] ? `no ${EQUIP[x].toLowerCase()}` : BODY[x].toLowerCase()))) || 'your usual swap is not possible today')}.` : '';
        const always = st.swaps[mv] === r.item.mv;
        now = `<p class="small">Now: <b>${esc(r.text)}</b>.${reason}</p>
          <label class="check"><input type="checkbox" data-change="swap-always" data-mv="${mv}" data-to="${r.item.mv}" ${always ? 'checked' : ''}>
          Always swap ${esc(moveName(mv).toLowerCase())} for ${esc(moveName(r.item.mv).toLowerCase())}</label>`;
      } else if (r.blocked?.length) {
        now = '<p class="small">No alternative fits what you have today. Pick one yourself.</p>';
      }
      return `<div class="swap-row"><span class="label">${esc(lineText(r.orig))}</span><div class="chips">${options}</div>${now}</div>`;
    }).join('')}
  </section>` : '';

  let menu = '';
  if (block.menu) {
    menu = `<section class="card"><h2>Different workout</h2>
      <p class="muted small">Same goal, other movements.</p>
      ${block.menu.options.map((o) => {
        const blocked = [...new Set(o.moves.flatMap((m) => blockedBy(m, limits)))];
        return `<button class="option ${o.id === block.menu.current ? 'on' : ''}" data-action="pick-menu" data-session="${id}" data-block="${esc(key)}"
          data-slot="${block.menu.slot}" data-id="${o.id}" data-planned="${block.menu.planned}">
          <b>${esc(o.label)}</b>
          <span class="faint">${o.id === block.menu.planned ? 'Planned' : 'Alternative'}${blocked.length ? ' · some movements will be swapped today' : ''}</span></button>`;
      }).join('')}
    </section>`;
  }

  const changed = Object.keys(day.swaps).some((k) => k.startsWith(`${key}:`)) || (block.menu && day.menu[block.menu.slot]);
  return `<a class="back" href="#/day/${id}">← Back to the session</a>
    <section class="stack"><h1>Adjust: ${esc(block.title)}</h1></section>
    <section class="card flat">${rowsHtml(block)}${block.adj ? `<p class="adj">${esc(block.adj)}</p>` : ''}</section>
    ${difficulty}${moves}${menu}
    ${changed ? `<button class="btn ghost" data-action="block-reset" data-session="${id}" data-block="${esc(key)}" data-slot="${block.menu?.slot || ''}">Undo my swaps for this part</button>` : ''}
    <a class="btn primary big block" href="#/day/${id}">Done</a>`;
}

on('tweak', (el) => {
  const { track } = el.dataset;
  const ord = Number(el.dataset.ord);
  const d = Number(el.dataset.d) > 0 ? 1 : -1;
  if (!TRACKS[track] || !Number.isFinite(ord)) return;
  if (!addTweak(track, d, ord)) toast(d > 0 ? 'That is the hardest step.' : 'That is the easiest step.');
  rerender();
});

on('tweak-reset', (el) => {
  const ord = Number(el.dataset.ord);
  if (!TRACKS[el.dataset.track] || !Number.isFinite(ord)) return;
  resetTrack(el.dataset.track, ord);
  rerender();
});

on('swap-move', (el) => {
  const { session: id, block, mv, to } = el.dataset;
  if (!parseSessionId(id) || !MOVES[mv] || !MOVES[to]) return;
  const session = sessionById(id);
  const limits = new Set(session?.limits || []);
  const swapKey = `${block}:${mv}`;
  setDay(id, (d) => {
    if (to !== mv) d.swaps[swapKey] = to;
    // Going back to the planned movement must also beat an automatic or "always" swap.
    else if (getState().swaps[mv] || blockedBy(mv, limits).length) d.swaps[swapKey] = mv;
    else delete d.swaps[swapKey];
  });
  rerender();
});

on('swap-always', (el) => {
  const { mv, to } = el.dataset;
  if (!MOVES[mv] || !MOVES[to]) return;
  update((s) => {
    if (el.checked) s.swaps[mv] = to;
    else delete s.swaps[mv];
  });
  toast(el.checked ? 'Saved: used in every session from now on.' : 'Only for this session now.');
  rerender();
});

on('pick-menu', (el) => {
  const { session: id, block, slot, id: option, planned } = el.dataset;
  if (!parseSessionId(id) || !slot) return;
  setDay(id, (d) => {
    if (option === planned) delete d.menu[slot];
    else d.menu[slot] = option;
    for (const k of Object.keys(d.swaps)) if (k.startsWith(`${block}:`)) delete d.swaps[k];
  });
  rerender();
});

on('block-reset', (el) => {
  const { session: id, block, slot } = el.dataset;
  if (!parseSessionId(id)) return;
  setDay(id, (d) => {
    for (const k of Object.keys(d.swaps)) if (k.startsWith(`${block}:`)) delete d.swaps[k];
    if (slot) delete d.menu[slot];
  });
  rerender();
});

// ---- "I did something else" ----

const EFFORTS = { easy: 'Easy', moderate: 'Moderate', hard: 'Hard' };

export function renderOther(id) {
  const session = sessionById(id);
  if (!session) return notFound('Session');
  const st = getState();
  const ex = st.logs.find((l) => l.kind === 'other' && l.sessionId === id);
  const today = todayISO();
  const effort = ex?.effort || 'moderate';
  return `<a class="back" href="#/day/${id}">← Back to the session</a>
    <section class="stack"><h1>Log a different workout</h1>
      <p class="muted">Instead of ${esc(session.title)} · ${esc(fmtDate(session.date))}</p></section>
    <section class="card">
      <label class="field">What did you do?<input class="input" id="o-title" type="text" maxlength="200" placeholder="Class WOD, 10 km hike, competition…" value="${esc(ex?.title || '')}"></label>
      <label class="field">Minutes<input class="input" id="o-min" type="number" inputmode="numeric" min="1" max="600" value="${ex?.score?.minutes ?? ''}"></label>
      <span class="label">How hard was it?</span>
      <div class="chips" data-group="effort">${Object.entries(EFFORTS).map(([k, v]) => chip(v, k === effort, `data-action="pick-chip" data-value="${k}"`)).join('')}</div>
      <label class="field">Date<input class="input" id="o-date" type="date" max="${today}" value="${esc(ex?.date || today)}"></label>
      <p class="faint">The session counts as done. Your difficulty levels do not change.</p>
    </section>
    <button class="btn primary big block" data-action="other-save" data-session="${id}">Save</button>
    ${ex ? `<button class="btn ghost danger block" data-action="other-delete" data-session="${id}">Delete this entry</button>` : ''}`;
}

// Generic single-choice chips (used by small forms).
on('pick-chip', (el) => {
  el.parentElement.querySelectorAll('.chip').forEach((c) => {
    c.classList.toggle('on', c === el);
    c.setAttribute('aria-pressed', String(c === el));
  });
});

on('other-save', (el) => {
  const id = el.dataset.session;
  if (!parseSessionId(id)) return;
  const title = (document.getElementById('o-title')?.value || '').trim().slice(0, 200);
  if (!title) { toast('Write what you did first.'); return; }
  const minutes = toNum(document.getElementById('o-min')?.value, { min: 1, max: 600, int: true });
  if (Number.isNaN(minutes)) { toast('Minutes should be between 1 and 600.'); return; }
  let date = document.getElementById('o-date')?.value;
  if (!isISO(date) || date > todayISO()) date = todayISO();
  const effort = document.querySelector('[data-group="effort"] .chip.on')?.dataset.value || 'moderate';
  removeLogs((l) => l.sessionId === id && l.kind === 'block');
  putLog({ kind: 'other', sessionId: id, key: 'other', date, title, effort, score: minutes != null ? { minutes } : {}, notes: '' },
    (l) => l.kind === 'other' && l.sessionId === id);
  setDone(id, date);
  toast('Saved. Session counted as done.');
  go(`#/day/${id}`);
});

on('other-delete', (el) => {
  const id = el.dataset.session;
  if (!parseSessionId(id) || !confirm('Delete this entry? The session will be open again.')) return;
  removeLogs((l) => l.kind === 'other' && l.sessionId === id);
  setDone(id, null);
  go(`#/day/${id}`);
});
