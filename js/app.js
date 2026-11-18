// App entry: hash router, tab bar, delegated events, offline support.
// A broken screen or button never takes the whole app down: errors are caught and explained.

import { load, getState, requestPersistence } from './store.js';
import { slotOn, weekInfo, TOTAL_WEEKS } from './data/calendar.js';
import { dispatch, setRerender } from './actions.js';
import { renderToday, renderDay, notFound } from './views/session.js';
import { renderChange, renderBlockPage, renderOther } from './views/change.js';
import { renderFinish, renderBenchLog, renderDone } from './views/log.js';
import { renderPlan } from './views/plan.js';
import { renderBenchList, renderBenchDetail } from './views/bench.js';
import { renderTimer, restoreTimer, timerStatus } from './views/timer.js';
import { renderProfile } from './views/profile.js';
import { esc, todayISO, toast } from './util.js';

const app = document.getElementById('app');

function route() {
  const hash = location.hash.replace(/^#/, '') || '/today';
  const [path, query = ''] = hash.split('?');
  const parts = path.split('/').filter(Boolean).map((x) => {
    try { return decodeURIComponent(x); } catch { return x; }
  });
  return { parts, params: new URLSearchParams(query) };
}

function view({ parts, params }) {
  const [head, a, b] = parts;
  switch (head) {
    case undefined:
    case 'today': return renderToday();
    case 'day': return renderDay(a);
    case 'change': return renderChange(a);
    case 'block': return renderBlockPage(a, b);
    case 'other': return renderOther(a);
    case 'finish': return renderFinish(a, params);
    case 'done': return renderDone();
    case 'plan': return renderPlan();
    case 'bench': return a ? renderBenchDetail(a) : renderBenchList();
    case 'log': return renderBenchLog(params);
    case 'timer': return renderTimer(params);
    case 'profile': return renderProfile();
    default: return notFound();
  }
}

const TAB_FOR = {
  today: 'today', day: 'today', change: 'today', block: 'today', other: 'today', finish: 'today', done: 'today',
  plan: 'plan', bench: 'bench', log: 'bench', timer: 'timer', profile: 'profile',
};

function topbarMeta() {
  const p = getState().profile;
  const slot = slotOn(p, todayISO());
  if (slot.status === 'before') return slot.daysUntil === 1 ? 'Starts tomorrow' : `Starts in ${slot.daysUntil} days`;
  if (slot.status === 'after') return `Cycle ${p.cycle} complete`;
  return `Week ${slot.week} of ${TOTAL_WEEKS} · ${weekInfo(slot.week).phase.name}`;
}

function errorHtml(err) {
  return `<section class="card"><h1>This screen hit a problem</h1>
    <p class="muted">Your logs are safe. Try going back; if it keeps happening, save a backup and reload the app.</p>
    <p class="faint">${esc(err?.message || String(err))}</p>
    <a class="btn primary" href="#/today">Back to today</a>
    <button class="btn" data-action="export">Save a backup</button>
    <button class="btn ghost" data-action="reload">Reload the app</button></section>`;
}

let lastPath = null;

function render() {
  const r = route();
  const path = r.parts.join('/');
  // Redrawing the same screen keeps folded sections as the user left them.
  const folds = path === lastPath ? [...app.querySelectorAll('details')].map((d) => d.open) : null;

  let html;
  try {
    html = view(r);
  } catch (err) {
    console.error(err);
    html = errorHtml(err);
  }
  const t = r.parts[0] === 'timer' ? null : timerStatus();
  const banner = t ? `<a class="timer-pill" href="#/timer?${t.query}">Timer ${t.status === 'paused' ? 'paused' : 'running'}: ${esc(t.label)} · tap to open</a>` : '';
  app.innerHTML = banner + html;
  if (folds) app.querySelectorAll('details').forEach((d, i) => { if (i < folds.length) d.open = folds[i]; });
  lastPath = path;

  const tab = TAB_FOR[r.parts[0] || 'today'];
  document.querySelectorAll('.tabbar a').forEach((a) => {
    const on = a.dataset.tab === tab;
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  try {
    document.getElementById('topbar-meta').textContent = topbarMeta();
  } catch { /* keep the old text */ }
}

setRerender(render);

function run(name, el, event) {
  try {
    const result = dispatch(name, el, event);
    if (result?.catch) result.catch((err) => { console.error(err); toast('That did not work. Please try again.'); });
  } catch (err) {
    console.error(err);
    toast('That did not work. Please try again.');
  }
}

window.addEventListener('hashchange', () => {
  render();
  window.scrollTo(0, 0);
});

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  if (el.dataset.action === 'reload') { location.reload(); return; }
  run(el.dataset.action, el, e);
});

document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-change]');
  if (el) run(el.dataset.change, el, e);
});

// Refresh when the app comes back to the front on a new day.
let lastDay = todayISO();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || todayISO() === lastDay) return;
  lastDay = todayISO();
  const editing = ['finish', 'other', 'log', 'timer'].includes(route().parts[0]);
  if (!editing) render();
});

// The app open in two tabs: pick up what the other one saved.
window.addEventListener('storage', (e) => {
  if (e.key !== 'benchmark-coach.v1') return;
  load();
  const editing = ['finish', 'other', 'log', 'timer'].includes(route().parts[0]);
  if (!editing) render();
});

load();
restoreTimer();
render();
requestPersistence();

// Offline caching only on the real site (on localhost it would serve stale files while editing).
const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !isLocal) {
  navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Offline mode unavailable', err));
}
