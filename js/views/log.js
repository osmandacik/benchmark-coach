// Logging.
//   #/finish/<session>  one screen for the whole session: a score where there is one, and how each part went.
//                       Opening it again edits the same log (never a duplicate).
//   #/log?bench=<id>    a benchmark result outside the plan (from the Benchmarks tab)
//   #/done              what was saved and what changes next time

import { getState, putLog, removeLogs, setDone, update } from '../store.js';
import { sessionById } from '../data/sessions.js';
import { ordOf, parseSessionId } from '../data/calendar.js';
import { BENCHMARKS, benchLevel } from '../data/benchmarks.js';
import { currentLevel, targetFor, snapTarget, fmtTarget, fmtScore, meetsTarget } from '../coach.js';
import { OUTCOMES, TRACKS, levelAt, nextChange, amount, pressAdvice } from '../adapt.js';
import { esc, todayISO, toast, toNum, isISO, fmtDate, cap } from '../util.js';
import { on, go } from '../actions.js';
import { notFound } from './session.js';

let ctx = null;        // { id } of the session being logged, or { benchId } for a loose benchmark result
let lastResult = null; // shown on #/done

const val = (id) => document.getElementById(id)?.value?.trim() ?? '';
const loggable = (b) => b.log && b.log !== 'none';

// ---- Inputs ----

function timeInputs(prefix, sec) {
  const has = sec != null && Number.isFinite(sec);
  const m = has ? Math.floor(sec / 60) : '';
  const s = has ? String(Math.round(sec % 60)).padStart(2, '0') : '';
  return `<div class="time-inputs">
    <input class="input" id="${prefix}-min" type="number" inputmode="numeric" min="0" max="600" placeholder="min" aria-label="Minutes" value="${m}">
    <span>:</span>
    <input class="input" id="${prefix}-sec" type="number" inputmode="numeric" min="0" max="59" placeholder="sec" aria-label="Seconds" value="${s}"></div>`;
}

// null = empty, NaN = not usable, otherwise seconds
function readTime(prefix) {
  const m = toNum(val(`${prefix}-min`), { max: 600, int: true });
  const s = toNum(val(`${prefix}-sec`), { max: 3600, int: true });
  if (m == null && s == null) return null;
  if (Number.isNaN(m) || Number.isNaN(s)) return NaN;
  const total = (m || 0) * 60 + (s || 0);
  return total > 0 ? total : NaN;
}

function numField(id, label, value, { step = 1, max = '' } = {}) {
  return `<label class="field">${esc(label)}<input class="input" id="${id}" type="number" inputmode="decimal" min="0" max="${max}" step="${step}" value="${value ?? ''}"></label>`;
}

function testFields(benchId, pre = {}, ex = null) {
  const bench = BENCHMARKS[benchId];
  const sc = ex?.score || {};
  let html;
  if (bench.format === 'fortime') {
    const capped = !!pre.capped || (!!ex && sc.time == null);
    html = `<div id="t-time-wrap" class="stack ${capped ? 'hidden' : ''}"><span class="label">Your time</span>${timeInputs('t', pre.time ?? sc.time ?? null)}</div>
      ${bench.cap ? `<label class="check"><input type="checkbox" id="t-capped" data-change="toggle-capped" ${capped ? 'checked' : ''}> I hit the ${Math.round(bench.cap / 60)}-minute cap</label>
      <div id="t-cap-wrap" class="${capped ? '' : 'hidden'}">${numField('t-capreps', `Reps done at the cap${bench.totalReps ? ` (out of ${bench.totalReps})` : ''}`, capped ? sc.reps : '')}</div>` : ''}`;
  } else if (bench.format === 'amrap-rounds') {
    const total = sc.reps;
    html = `<div class="grid-2">${numField('t-rounds', 'Rounds', pre.rounds ?? (total != null ? Math.floor(total / bench.perRound) : ''))}
      ${numField('t-reps', 'Extra reps', total != null ? total % bench.perRound : '', { max: bench.perRound - 1 })}</div>`;
  } else {
    html = numField('t-total', 'Total reps', sc.reps);
  }
  return `${html}
    <label class="check"><input type="checkbox" id="t-mod" ${ex?.modified ? 'checked' : ''}> I changed something (movement, weight or reps)</label>
    <p class="faint">Changed versions are kept in your history but do not count for targets or the ladder.</p>`;
}

on('toggle-capped', (el) => {
  document.getElementById('t-time-wrap')?.classList.toggle('hidden', el.checked);
  document.getElementById('t-cap-wrap')?.classList.toggle('hidden', !el.checked);
});

// -> { score, modified } | { empty: true } | { error }
function readTest(benchId) {
  const bench = BENCHMARKS[benchId];
  const modified = !!document.getElementById('t-mod')?.checked;
  if (bench.format === 'fortime') {
    if (document.getElementById('t-capped')?.checked) {
      const reps = toNum(val('t-capreps'), { max: 100000, int: true });
      if (reps == null || Number.isNaN(reps)) return { error: 'Enter the reps you had done at the cap.' };
      if (bench.totalReps && reps >= bench.totalReps) {
        return { error: `${bench.totalReps} reps means you finished: untick the cap and enter your time.` };
      }
      return { score: { reps }, modified };
    }
    const t = readTime('t');
    if (t == null) return { empty: true };
    if (Number.isNaN(t)) return { error: 'That time does not look right. Use minutes and seconds.' };
    if (bench.cap && t > bench.cap) {
      return { error: `The cap is ${Math.round(bench.cap / 60)} minutes. Tick "I hit the cap" and enter your reps.` };
    }
    return { score: { time: t }, modified };
  }
  if (bench.format === 'amrap-rounds') {
    const rounds = toNum(val('t-rounds'), { max: 200, int: true });
    const extra = toNum(val('t-reps'), { max: bench.perRound - 1, int: true });
    if (rounds == null && extra == null) return { empty: true };
    if (Number.isNaN(rounds)) return { error: 'Rounds should be a whole number.' };
    if (Number.isNaN(extra)) return { error: `Extra reps should be between 0 and ${bench.perRound - 1}.` };
    const reps = (rounds || 0) * bench.perRound + (extra || 0);
    if (reps <= 0) return { error: 'Enter at least one rep.' };
    return { score: { reps }, modified };
  }
  const total = toNum(val('t-total'), { min: 1, max: 5000, int: true });
  if (total == null) return { empty: true };
  if (Number.isNaN(total)) return { error: 'Total reps should be a whole number above 0.' };
  return { score: { reps: total }, modified };
}

// ---- Outcome chips ----

const PRESS_HINT = {
  easy: 'Next time: 2.5 kg heavier.', right: 'Next time: the same weight.',
  hard: 'Next time: 2.5 kg lighter.', fail: 'Next time: 5 kg lighter.',
};

function hintFor(block, ord, outcome) {
  if (outcome === 'skip') return 'Not logged. Nothing changes.';
  if (block.key === 'barbell-press') return PRESS_HINT[outcome] || '';
  const t = TRACKS[block.track];
  if (!t) return '';
  if (t.kind === 'kg' && block.swapped) return 'You swapped the lift, so the planned weight stays as it is.';
  return nextChange(block.track, ord, outcome).text;
}

function outcomeChips(i, selected) {
  const all = { ...OUTCOMES, skip: 'Did not do it' };
  return `<div class="chips" data-group="${i}">${Object.entries(all).map(([k, label]) => `<button type="button"
    class="chip ${k === selected ? 'on' : ''} ${k === 'skip' ? 'quiet' : ''}" aria-pressed="${k === selected}"
    data-action="pick-outcome" data-i="${i}" data-oc="${k}">${esc(label)}</button>`).join('')}</div>`;
}

on('pick-outcome', (el) => {
  el.parentElement.querySelectorAll('.chip').forEach((c) => {
    c.classList.toggle('on', c === el);
    c.setAttribute('aria-pressed', String(c === el));
  });
  const session = ctx?.id ? sessionById(ctx.id) : null;
  const block = session?.blocks.filter(loggable)[Number(el.dataset.i)];
  const hint = document.getElementById(`hint-${el.dataset.i}`);
  if (block && hint) hint.textContent = hintFor(block, ordOf(session.id), el.dataset.oc);
});

// ---- Finish a session ----

function blockSection(session, b, i, ex, pre, done) {
  const p = getState().profile;
  if (b.log === 'test') {
    const bench = BENCHMARKS[b.bench];
    const level = benchLevel(bench, ex ? ex.level : b.level);
    const target = ex?.target || targetFor(b.bench);
    return `<section class="card highlight"><h2>${esc(bench.name)}</h2>
      <p class="muted small">${esc(level.label)} · ${esc(bench.weight(p))} · target: ${esc(fmtTarget(b.bench, target).toLowerCase())}</p>
      ${testFields(b.bench, pre, ex)}</section>`;
  }

  const sc = ex?.score || {};
  const what = b.rows.filter((r) => r.item).map((r) => r.text.replace(/^Min \d+: /, '')).join(' · ') || b.lines[0] || '';
  if (b.log === 'max') {
    return `<section class="card"><h2>${esc(b.title)}</h2>
      <div class="grid-2">${numField(`f${i}-pu`, `Max pull-ups (best ${p.unbroken.pullup})`, sc.pullup)}
      ${numField(`f${i}-t2b`, `Max toes-to-bar (best ${p.unbroken.t2b})`, sc.t2b)}</div>
      <p class="faint">Leave empty if you did not test it.</p></section>`;
  }

  let fields = '';
  if (b.log === 'time') fields = `<span class="label">Time (optional)</span>${timeInputs(`f${i}`, pre.time ?? sc.time ?? null)}`;
  if (b.log === 'rounds') {
    fields = `<div class="grid-2">${numField(`f${i}-rounds`, 'Rounds (optional)', pre.rounds ?? sc.rounds)}${numField(`f${i}-reps`, 'Extra reps', sc.reps)}</div>`;
  }
  if (b.log === 'number') fields = numField(`f${i}-value`, `${b.logLabel || 'Score'} (optional)`, pre.rounds ?? sc.value, { step: 0.5 });
  if (b.log === 'kg') fields = numField(`f${i}-kg`, `${b.logLabel || 'Weight used (kg)'} (optional)`, sc.kg, { step: 0.5 });

  const selected = ex ? (ex.outcome || 'right') : done ? 'skip' : 'right';
  return `<section class="card"><h2>${esc(b.title)}</h2>
    <p class="muted small">${esc(what)}</p>
    ${fields}
    <span class="label">How did it go?</span>
    ${outcomeChips(i, selected)}
    <p class="hint" id="hint-${i}">${esc(hintFor(b, ordOf(session.id), selected))}</p></section>`;
}

export function renderFinish(id, params) {
  const session = sessionById(id);
  if (!session) return notFound('Session');
  const st = getState();
  const blocks = session.blocks.filter(loggable);
  const mine = st.logs.filter((l) => l.sessionId === id && l.kind !== 'other');
  const done = st.done[id] && mine.length ? st.done[id] : null;
  const today = todayISO();
  ctx = { id };

  const preKey = params.get('block');
  const n = (k) => {
    const v = toNum(params.get(k), { max: 100000 });
    return v == null || Number.isNaN(v) ? null : v;
  };
  const pre = (b) => (b.key === preKey ? { time: n('time'), rounds: n('rounds'), capped: params.get('capped') === '1' } : {});

  return `<a class="back" href="#/day/${id}">← Back to the session</a>
    <section class="stack"><h1>${done ? 'Edit log' : session.isTest ? 'Log result' : 'Finish session'}</h1>
      <p class="muted">${esc(session.title)} · ${esc(fmtDate(session.date))}</p></section>
    ${blocks.map((b, i) => blockSection(session, b, i, mine.find((l) => l.key === b.key), pre(b), !!done)).join('')}
    <section class="card">
      <label class="field">Date<input class="input" id="f-date" type="date" max="${today}" value="${esc(done || today)}"></label>
      <label class="field">Notes (optional)<textarea class="input" id="f-notes" maxlength="2000" placeholder="Splits, set sizes, how the knee felt…">${esc(st.notes[id] || '')}</textarea></label>
    </section>
    <button class="btn primary big block" data-action="finish-save">Save</button>
    ${done ? `<button class="btn ghost danger block" data-action="finish-delete" data-session="${id}">Delete this log</button>` : ''}`;
}

function readDate(id) {
  const d = val(id);
  return isISO(d) && d <= todayISO() ? d : todayISO();
}

// Keeps profile max sets in line with a max-set check (and lets a typo be corrected).
function applyMax(score, old) {
  const out = [];
  update((s) => {
    const u = s.profile.unbroken;
    for (const [k, name] of [['pullup', 'pull-ups'], ['t2b', 'toes-to-bar']]) {
      const v = score[k];
      if (v == null) continue;
      if (v > u[k]) {
        u[k] = v;
        out.push(`New max ${name}: ${v}. Set sizes and race plans are updated.`);
      } else if (v < u[k] && old?.[k] === u[k]) {
        u[k] = v;
        out.push(`Max ${name} corrected to ${v}.`);
      } else if (v < u[k]) out.push(`Max ${name} stays at ${u[k]} (today ${v}).`);
    }
  });
  return out;
}

function saveTest(benchId, r, base, same) {
  const bench = BENCHMARKS[benchId];
  const ex = same ? getState().logs.find(same) : null;
  const before = currentLevel(benchId).index;
  const levelIdx = ex ? ex.level : before;
  const target = ex?.target || snapTarget(targetFor(benchId));
  const hit = r.modified ? null : meetsTarget(benchId, r.score, target);
  putLog({ ...base, kind: 'test', bench: benchId, level: levelIdx, score: r.score, target, hit, modified: r.modified }, same);

  const after = currentLevel(benchId);
  const next = fmtTarget(benchId, targetFor(benchId)).toLowerCase();
  let message;
  if (r.modified) message = 'Saved as a changed version. It is in your history but does not count for targets or the ladder.';
  else if (after.index > before) message = `Target hit! ${bench.name} moves up to ${after.label}.`;
  else if (after.index < before) message = `${bench.name} is back on ${after.label}.`;
  else if (hit === null) message = `Baseline saved. Next target: ${next}.`;
  else if (hit) message = `Target hit. Next target: ${next}.`;
  else message = `The target was ${fmtTarget(benchId, target).toLowerCase()}. Next target: ${next}.`;
  return {
    benchId,
    title: `${bench.name} · ${benchLevel(bench, levelIdx).label}`,
    score: fmtScore(benchId, r.score),
    hit: hit === true,
    message,
  };
}

let savedAt = 0;

on('finish-save', () => {
  const session = ctx?.id ? sessionById(ctx.id) : null;
  if (!session || Date.now() - savedAt < 800) return; // ignore a double tap on Save
  const id = session.id;
  const blocks = session.blocks.filter(loggable);
  const plan = [];

  // 1. Read and check everything before saving anything.
  for (const [i, b] of blocks.entries()) {
    const same = (l) => l.sessionId === id && l.key === b.key && l.kind !== 'other';
    if (b.log === 'test') {
      const r = readTest(b.bench);
      if (r.error) { toast(r.error, 4500); return; }
      if (r.empty) { toast('Enter your result first. To skip or swap the test, go back and tap "Change this session".', 5000); return; }
      plan.push({ b, same, test: r });
      continue;
    }
    if (b.log === 'max') {
      const pu = toNum(val(`f${i}-pu`), { min: 1, max: 300, int: true });
      const t2b = toNum(val(`f${i}-t2b`), { min: 1, max: 300, int: true });
      if (Number.isNaN(pu) || Number.isNaN(t2b)) { toast('Max sets should be between 1 and 300.'); return; }
      const score = {};
      if (pu != null) score.pullup = pu;
      if (t2b != null) score.t2b = t2b;
      plan.push(pu == null && t2b == null ? { b, same, remove: true } : { b, same, score, outcome: null });
      continue;
    }
    const oc = document.querySelector(`[data-group="${i}"] .chip.on`)?.dataset.oc || 'right';
    if (oc === 'skip') { plan.push({ b, same, remove: true }); continue; }
    const score = {};
    if (b.log === 'time') {
      const t = readTime(`f${i}`);
      if (Number.isNaN(t)) { toast(`${b.title}: that time does not look right.`); return; }
      if (t != null) score.time = t;
    }
    if (b.log === 'rounds') {
      const r = toNum(val(`f${i}-rounds`), { max: 500, int: true });
      const x = toNum(val(`f${i}-reps`), { max: 2000, int: true });
      if (Number.isNaN(r) || Number.isNaN(x)) { toast(`${b.title}: rounds and reps should be whole numbers.`); return; }
      if (r != null || x) score.rounds = r || 0;
      if (x) score.reps = x;
    }
    if (b.log === 'number') {
      const v = toNum(val(`f${i}-value`), { max: 1000 });
      if (Number.isNaN(v)) { toast(`${b.title}: that number does not look right.`); return; }
      if (v != null) score.value = v;
    }
    if (b.log === 'kg') {
      const v = toNum(val(`f${i}-kg`), { min: 1, max: 400 });
      if (Number.isNaN(v)) { toast(`${b.title}: the weight should be between 1 and 400 kg.`); return; }
      if (v != null) score.kg = v;
    }
    plan.push({ b, same, score, outcome: oc });
  }

  // 2. Save.
  const date = readDate('f-date');
  const notes = val('f-notes').slice(0, 2000);
  const tracks = [...new Set(blocks.map((b) => b.track).filter((t) => TRACKS[t]))];
  const before = Object.fromEntries(tracks.map((t) => [t, levelAt(t).steps]));
  const lines = [];
  let test = null;

  for (const item of plan) {
    if (item.remove) { removeLogs(item.same); continue; }
    const base = { date, sessionId: id, key: item.b.key, notes: '' };
    if (item.test) { test = saveTest(item.b.bench, item.test, base, item.same); continue; }
    const old = getState().logs.find(item.same)?.score;
    putLog({
      ...base, kind: 'block', track: item.b.track || null, variant: item.b.variant || null,
      mv: item.b.mainMv || null, swapped: !!item.b.swapped, score: item.score, outcome: item.outcome,
    }, item.same);
    if (item.b.log === 'max') lines.push(...applyMax(item.score, old));
  }
  removeLogs((l) => l.sessionId === id && l.kind === 'other');
  update((s) => {
    if (notes) s.notes[id] = notes;
    else delete s.notes[id];
  });
  setDone(id, date);

  // 3. Tell the user what changes.
  for (const t of tracks) {
    const after = levelAt(t).steps;
    if (after === before[t]) continue;
    lines.push(`${TRACKS[t].name}: ${amount(t, after - before[t])} next time${after === 0 ? ' (back to the plan)' : ''}.`);
  }
  const press = plan.find((x) => x.b.key === 'barbell-press' && !x.remove && x.score?.kg);
  if (press) {
    const tip = pressAdvice(press.b.mainMv);
    if (tip) lines.push(`${press.b.title}: ${tip.text.charAt(0).toLowerCase()}${tip.text.slice(1)}.`);
  }
  lastResult = { id, title: session.title, test, lines, logged: plan.some((x) => !x.remove) };
  savedAt = Date.now();
  go('#/done');
});

on('finish-delete', (el) => {
  const id = el.dataset.session;
  if (!parseSessionId(id)) return;
  if (!confirm('Delete the log for this session? The next sessions go back to how they were before it.')) return;
  removeLogs((l) => l.sessionId === id);
  update((s) => { delete s.notes[id]; });
  setDone(id, null);
  toast('Log deleted.');
  go(`#/day/${id}`);
});

// ---- A benchmark result outside the plan ----

export function renderBenchLog(params) {
  const benchId = params.get('bench');
  const bench = BENCHMARKS[benchId];
  if (!bench) return notFound('Benchmark');
  ctx = { benchId };
  const level = currentLevel(benchId);
  const target = targetFor(benchId);
  const today = todayISO();
  const n = (k) => {
    const v = toNum(params.get(k), { max: 100000 });
    return v == null || Number.isNaN(v) ? null : v;
  };
  return `<a class="back" href="#/bench/${benchId}">← ${esc(bench.name)}</a>
    <section class="stack"><h1>Log a result</h1></section>
    <section class="card highlight"><h2>${esc(bench.name)}</h2>
      <p class="muted small">${esc(level.label)} · ${esc(bench.weight(getState().profile))} · target: ${esc(fmtTarget(benchId, target).toLowerCase())}</p>
      ${testFields(benchId, { time: n('time'), rounds: n('rounds'), capped: params.get('capped') === '1' })}
      <label class="field">Date<input class="input" id="f-date" type="date" max="${today}" value="${today}"></label>
      <label class="field">Notes (optional)<textarea class="input" id="f-notes" maxlength="2000"></textarea></label>
    </section>
    <button class="btn primary big block" data-action="bench-save">Save result</button>`;
}

on('bench-save', () => {
  const benchId = ctx?.benchId;
  if (!BENCHMARKS[benchId]) return;
  const r = readTest(benchId);
  if (r.error) { toast(r.error, 4500); return; }
  if (r.empty) { toast('Enter your result first.'); return; }
  const test = saveTest(benchId, r, { date: readDate('f-date'), notes: val('f-notes').slice(0, 2000) }, null);
  ctx = null; // a second tap on Save must not add the result twice
  lastResult = { id: null, title: BENCHMARKS[benchId].name, test, lines: [], logged: true };
  go('#/done');
});

// ---- Result ----

export function renderDone() {
  const r = lastResult;
  if (!r) {
    return `<section class="card"><h1>Saved</h1><p class="muted">Your log is stored on this phone.</p>
      <a class="btn primary" href="#/today">Back to today</a></section>`;
  }
  const test = r.test ? `<section class="card ${r.test.hit ? 'good' : 'highlight'}"><span class="eyebrow">${esc(r.test.title)}</span>
    <p class="big-number">${esc(r.test.score)}</p><p>${esc(r.test.message)}</p></section>` : '';
  const changes = r.id ? `<section class="card"><span class="eyebrow">${esc(r.title)}</span>
    <h1>${r.logged ? 'Session saved' : 'Saved'}</h1>
    ${r.lines.length ? `<h3>What changes next time</h3><ul class="lines">${r.lines.map((l) => `<li>${esc(cap(l))}</li>`).join('')}</ul>`
      : '<p class="muted">Nothing changes: the next sessions stay as they are.</p>'}
    </section>` : '';
  return `${test}${changes}
    <a class="btn primary big block" href="#/today">Back to today</a>
    <div class="btn-row">${r.test ? `<a class="btn" href="#/bench/${r.test.benchId}">See progress</a>` : ''}
    ${r.id ? `<a class="btn" href="#/day/${r.id}">Open the session</a>` : ''}<a class="btn" href="#/plan">Plan</a></div>`;
}
