// Profile: equipment, numbers, difficulty levels, training days, backup.
// Every field saves as soon as it changes (there is no Save button to forget).

import { getState, update, exportJSON, importJSON, resetAll } from '../store.js';
import { SESSION_TYPES, TYPE_KEYS, planStart, TOTAL_WEEKS, slotOn } from '../data/calendar.js';
import { BENCHMARKS } from '../data/benchmarks.js';
import { EQUIP, moveName } from '../data/moves.js';
import { TRACKS, levelAt, amount, addTweak, resetTrack, startNewCycle } from '../adapt.js';
import { currentLevel } from '../coach.js';
import { esc, toast, todayISO, toNum, isISO, fromISO, addDays, fmtShortDate, fmtDate, cap, plural } from '../util.js';
import { on, rerender } from '../actions.js';

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// path -> [label, min, max, step]
const FIELDS = {
  'unbroken.pullup': ['Butterfly pull-ups', 1, 300, 1],
  'unbroken.t2b': ['Toes-to-bar', 1, 300, 1],
  'unbroken.du': ['Double-unders', 1, 500, 1],
  'unbroken.bmu': ['Bar muscle-ups', 1, 100, 1],
  'unbroken.hspu': ['Handstand push-ups', 1, 200, 1],
  'maxes.backSquat': ['Back squat 1RM', 20, 400, 2.5],
  'maxes.cleanJerk': ['Clean & jerk 1RM', 20, 400, 2.5],
  'maxes.snatch': ['Snatch 1RM', 20, 400, 2.5],
  'maxes.deadliftCap': ['Deadlift cap', 20, 400, 2.5],
  'weights.fran': ['Fran thrusters', 1, 200, 0.5],
  'weights.jackie': ['Jackie thrusters', 1, 200, 0.5],
  'weights.open231': ['23.1 cleans', 1, 200, 0.5],
  'weights.open231ball': ['23.1 wall ball', 1, 200, 0.5],
  'weights.open241': ['24.1 dumbbell', 1, 200, 0.5],
};

function numField(path) {
  const [label, min, max, step] = FIELDS[path];
  const [group, key] = path.split('.');
  const value = getState().profile[group][key];
  return `<label class="field">${esc(label)}<input class="input" type="number" inputmode="decimal" min="${min}" max="${max}" step="${step}"
    value="${value}" data-change="profile-num" data-path="${path}"></label>`;
}

const group = (prefix) => Object.keys(FIELDS).filter((k) => k.startsWith(prefix)).map(numField).join('');

function section(title, summary, body, open = false) {
  return `<details class="card fold" ${open ? 'open' : ''}><summary><span class="stack tight"><b>${esc(title)}</b>
    <span class="faint">${esc(summary)}</span></span></summary><div class="stack">${body}</div></details>`;
}

// First day of the plan's week as a weekday name list, so "Monday" means the real Monday.
function dayOptions(selected) {
  const first = (fromISO(planStart(getState().profile)).getDay() + 6) % 7; // 0 = Monday
  return DAY_NAMES.map((_, i) => `<option value="${i}" ${selected === i ? 'selected' : ''}>${DAY_NAMES[(first + i) % 7]}</option>`).join('');
}

function nextMonday() {
  const today = todayISO();
  const dow = (fromISO(today).getDay() + 6) % 7;
  return addDays(today, dow === 0 ? 0 : 7 - dow);
}

export function renderProfile() {
  const st = getState();
  const p = st.profile;
  const today = todayISO();

  const equipment = `<p class="faint">Untick what your gym does not have. Movements that need it are swapped in every session.</p>
    <div class="checks">${Object.entries(EQUIP).map(([k, name]) => `<label class="check"><input type="checkbox" data-change="profile-equip" data-id="${k}"
      ${p.missing.includes(k) ? '' : 'checked'}> ${esc(name)}</label>`).join('')}</div>
    <p class="faint">Missing something just for one day? Use "Change this session" on that day instead.</p>
    ${Object.keys(st.swaps).length ? `<span class="label">Your permanent swaps</span>
      ${Object.entries(st.swaps).map(([from, to]) => `<div class="history-row"><span>${esc(moveName(from))} → ${esc(moveName(to))}</span>
        <button class="btn small ghost" data-action="swap-remove" data-mv="${from}">Remove</button></div>`).join('')}` : ''}`;

  const levels = `<p class="faint">These move on their own from your logs: "too easy" makes the next one harder, "too hard" or "couldn't finish" makes it easier. Change them by hand here if you want.</p>
    ${Object.entries(TRACKS).map(([id, t]) => {
      const lv = levelAt(id);
      return `<div class="level-row"><span class="stack tight"><b>${esc(t.name)}</b>
        <span class="faint">${lv.steps ? esc(cap(amount(id, lv.steps))) : 'As planned'}</span></span>
        <span class="row">
          <button class="btn small" data-action="level" data-track="${id}" data-d="-1" aria-label="Make ${esc(t.name)} easier">−</button>
          <button class="btn small" data-action="level" data-track="${id}" data-d="1" aria-label="Make ${esc(t.name)} harder">+</button>
          <button class="btn small ghost" data-action="level-reset" data-track="${id}" ${lv.steps ? '' : 'disabled'}>Reset</button>
        </span></div>`;
    }).join('')}`;

  const ladders = ['cindy', 'angie'].map((id) => {
    const b = BENCHMARKS[id];
    const cur = currentLevel(id).index;
    return `<label class="field">${esc(b.name)}<select class="input" data-change="profile-ladder" data-id="${id}">
      ${b.levels.map((lv, i) => `<option value="${i}" ${cur === i ? 'selected' : ''}>${esc(lv.label)}</option>`).join('')}</select></label>`;
  }).join('');

  const days = SESSION_TYPES.map((t) => `<label class="field">${esc(t.name)}<select class="input" data-change="profile-day" data-type="${t.key}">
    ${dayOptions(p.days[t.key])}</select></label>`).join('');
  const slot = slotOn(p, today);
  const where = slot.status === 'before' ? `starts ${fmtDate(planStart(p))}` : slot.status === 'after' ? 'finished' : `week ${slot.week} of ${TOTAL_WEEKS}`;

  const lastExport = st.meta.lastExport ? fmtShortDate(st.meta.lastExport) : 'never';
  const ownLogs = st.logs.filter((l) => !l.seed).length;

  return `<section class="stack"><h1>Profile</h1>
    <p class="muted small">Changes save as you make them. Everything stays on this phone.</p></section>

  ${section('Equipment', p.missing.length ? `Missing: ${p.missing.map((k) => EQUIP[k].toLowerCase()).join(', ')}` : 'Full gym', equipment)}

  ${section('Difficulty', 'How each part of training is adjusted', levels)}

  ${section('Max unbroken reps', `Pull-ups ${p.unbroken.pullup} · toes-to-bar ${p.unbroken.t2b}`,
    `<p class="faint">Set sizes and race plans are worked out from these. The max-set checks in the plan update pull-ups and toes-to-bar for you.</p>
    <div class="grid-2">${group('unbroken.')}</div>`)}

  ${section('Strength (kg)', `Squat ${p.maxes.backSquat} · clean & jerk ${p.maxes.cleanJerk} · snatch ${p.maxes.snatch}`,
    `<div class="grid-2">${group('maxes.')}</div>
    <p class="faint">Squat and lifting weights are percentages of these. Deadlifts are never programmed above the cap.</p>`)}

  ${section('Benchmark weights (kg)', 'Locked for the whole cycle',
    `<div class="grid-2">${group('weights.')}</div>
    <p class="faint">Keep these the same all cycle so only your time and reps change.</p>`)}

  ${section('Ladder steps', `Cindy ${BENCHMARKS.cindy.levels[currentLevel('cindy').index].label} · Angie ${BENCHMARKS.angie.levels[currentLevel('angie').index].label}`,
    `<div class="grid-2">${ladders}</div>
    <p class="faint">These move up on their own when you hit a target. Set them here only to start from a different step.</p>`)}

  ${section('Training days and cycle', `Cycle ${p.cycle}, ${where}`,
    `<label class="field">Cycle start<input class="input" type="date" value="${esc(p.startDate)}" data-change="profile-start"></label>
    <div class="grid-2">${days}</div>
    <p class="faint">Picking a day that is taken swaps the two sessions.${p.shift ? ` The plan is pushed back ${plural(p.shift, 'day')} (undo on the Plan tab).` : ''}</p>
    <span class="label">Run the cycle again</span>
    <p class="faint">Starts the 13 weeks again from a new date. Benchmark history and difficulty levels are kept; session ticks are cleared.</p>
    <div class="grid-2"><label class="field">New start<input class="input" type="date" id="cycle-start" value="${nextMonday()}"></label>
      <button class="btn" style="align-self:end" data-action="cycle-restart">Start again</button></div>`)}

  ${section('Backup', `${plural(ownLogs, 'log')} on this phone · last backup: ${lastExport}`,
    `<p class="faint">Your logs live only in this browser. Save a backup every few weeks, and before changing phones.</p>
    <div class="btn-row">
      <button class="btn primary" data-action="export">Save a backup</button>
      <label class="btn">Restore from file<input type="file" accept="application/json,.json,text/plain" data-change="import" hidden></label>
    </div>
    <details class="more"><summary>Backup without a file (copy and paste)</summary>
      <div class="stack">
        <button class="btn small" data-action="export-copy">Copy backup text</button>
        <textarea class="input" id="import-text" placeholder="Paste backup text here to restore"></textarea>
        <button class="btn small" data-action="import-text">Restore from pasted text</button>
      </div></details>
    <button class="btn ghost danger" data-action="reset">Delete all data on this phone</button>`, true)}

  ${section('Install on your phone', 'Works offline once installed',
    `<ul class="lines small">
      <li><b>iPhone (Safari):</b> Share → Add to Home Screen. Always open it from the home screen icon so your data is kept.</li>
      <li><b>Android (Chrome):</b> menu ⋮ → Install app (or Add to Home screen).</li>
      <li>On iPhone, turn off silent mode to hear the timer beeps.</li>
    </ul>`)}`;
}

// ---- Field changes ----

on('profile-num', (el) => {
  const path = el.dataset.path;
  const spec = FIELDS[path];
  if (!spec) return;
  const [label, min, max, step] = spec;
  const v = toNum(el.value, { min, max, int: step === 1 });
  if (v == null || Number.isNaN(v)) {
    toast(`${label}: enter a number between ${min} and ${max}.`);
    rerender();
    return;
  }
  const [g, k] = path.split('.');
  update((s) => { s.profile[g][k] = v; });
  toast('Saved.', 1200);
});

on('profile-equip', (el) => {
  const id = el.dataset.id;
  if (!EQUIP[id]) return;
  update((s) => {
    const set = new Set(s.profile.missing);
    if (el.checked) set.delete(id);
    else set.add(id);
    s.profile.missing = [...set];
  });
  toast(el.checked ? `${EQUIP[id]} is available again.` : `Sessions now avoid: ${EQUIP[id].toLowerCase()}.`);
});

on('swap-remove', (el) => {
  update((s) => { delete s.swaps[el.dataset.mv]; });
  rerender();
});

on('level', (el) => {
  const d = Number(el.dataset.d) > 0 ? 1 : -1;
  if (!TRACKS[el.dataset.track]) return;
  if (!addTweak(el.dataset.track, d)) toast(d > 0 ? 'That is the hardest step.' : 'That is the easiest step.');
  rerender();
});

on('level-reset', (el) => {
  if (!TRACKS[el.dataset.track]) return;
  resetTrack(el.dataset.track);
  rerender();
});

on('profile-ladder', (el) => {
  const id = el.dataset.id;
  const bench = BENCHMARKS[id];
  const v = toNum(el.value, { max: (bench?.levels.length || 1) - 1, int: true });
  if (!bench || v == null || Number.isNaN(v)) return;
  update((s) => { s.bench[id] = { level: v, setAt: Date.now() }; });
  toast(`${bench.name} set to ${bench.levels[v].label}.`);
  rerender();
});

on('profile-day', (el) => {
  const type = el.dataset.type;
  const v = toNum(el.value, { max: 6, int: true });
  if (!TYPE_KEYS.includes(type) || v == null || Number.isNaN(v)) return;
  update((s) => {
    const days = s.profile.days;
    const other = TYPE_KEYS.find((k) => k !== type && days[k] === v);
    if (other) days[other] = days[type];
    days[type] = v;
    s.profile.weekDays = {};
  });
  toast('Training days saved.');
  rerender();
});

on('profile-start', (el) => {
  if (!isISO(el.value)) {
    toast('Pick a valid start date.');
    rerender();
    return;
  }
  update((s) => { Object.assign(s.profile, { startDate: el.value, shift: 0, weekDays: {} }); });
  toast('Start date saved.');
  rerender();
});

on('cycle-restart', () => {
  const start = document.getElementById('cycle-start')?.value;
  if (!isISO(start)) { toast('Pick a start date first.'); return; }
  if (!confirm(`Start the 13 weeks again on ${fmtDate(start)}? Session ticks are cleared; benchmark history and difficulty levels are kept.`)) return;
  startNewCycle(start);
  toast('New cycle ready.');
  rerender();
});

// ---- Backup ----

function markExported() {
  update((s) => { s.meta.lastExport = todayISO(); });
}

on('export', async () => {
  const name = `benchmark-coach-backup-${todayISO()}.json`;
  const text = exportJSON();
  // Phones: the share sheet ("Save to Files", AirDrop, mail) is the most reliable way to keep a file.
  try {
    const file = new File([text], name, { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Benchmark Coach backup' });
      markExported();
      rerender();
      return;
    }
  } catch (err) {
    if (err?.name === 'AbortError') return; // the user closed the share sheet
  }
  try {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    markExported();
    toast('Backup saved to your downloads.');
    rerender();
  } catch {
    toast('Could not save a file here. Use "Copy backup text" instead.', 5000);
  }
});

on('export-copy', async () => {
  try {
    await navigator.clipboard.writeText(exportJSON());
    markExported();
    toast('Backup copied. Paste it into a note or an email to yourself.', 4500);
    rerender();
  } catch {
    const box = document.getElementById('import-text');
    if (box) {
      box.value = exportJSON();
      box.select();
    }
    toast('Copy the text in the box below.', 4500);
  }
});

function restore(text) {
  if (!confirm('Restore this backup? It replaces everything saved on this phone now.')) return;
  try {
    importJSON(text);
    toast('Backup restored.');
    rerender();
  } catch (err) {
    toast(err.message || 'Could not read that backup.', 5000);
  }
}

on('import', async (el) => {
  const file = el.files?.[0];
  el.value = '';
  if (!file) return;
  if (file.size > 5e6) { toast('That file is too big to be a backup.'); return; }
  let text = '';
  try {
    text = await file.text();
  } catch {
    toast('Could not open that file.');
    return;
  }
  restore(text);
});

on('import-text', () => {
  const text = document.getElementById('import-text')?.value.trim();
  if (!text) { toast('Paste the backup text first.'); return; }
  restore(text);
});

on('reset', () => {
  if (!confirm('Delete all your logs and settings on this phone? Save a backup first if you want to keep them.')) return;
  if (!confirm('Are you sure? This cannot be undone.')) return;
  resetAll();
  toast('All data deleted.');
  rerender();
});
