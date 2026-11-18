// Beeps (Web Audio) and keeping the screen awake while the timer runs.
// iPhone: beeps are silent when the ring/silent switch is on silent.

let ctx = null;

// Must be called from a tap (browsers only allow audio after a user gesture).
export function unlockAudio() {
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    // play a silent blip so iOS fully unlocks output
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    g.gain.value = 0;
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.01);
  } catch { /* audio not available */ }
}

function tone(freq, duration, when = 0, volume = 0.6) {
  if (!ctx) return;
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'square';
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(volume, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + duration + 0.02);
}

export const beep = {
  tick: () => { tone(880, 0.12); vibrate(60); },
  go: () => { tone(1320, 0.45); vibrate(250); },
  rest: () => { tone(660, 0.35); tone(660, 0.35, 0.45); vibrate([150, 100, 150]); },
  finish: () => { tone(1320, 0.25); tone(1320, 0.25, 0.32); tone(1760, 0.6, 0.64); vibrate([200, 100, 200, 100, 400]); },
};

function vibrate(pattern) {
  try { navigator.vibrate?.(pattern); } catch { /* not supported */ }
}

// ---- Screen wake lock ----

let wakeLock = null;
let wantLock = false;

export async function keepAwake(on) {
  wantLock = on;
  try {
    if (on && 'wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch { /* not supported or denied */ }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && wantLock) keepAwake(true);
});
