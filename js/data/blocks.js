// Shared building blocks for sessions: warm-ups, cool-downs, Zone 2 and scaling helpers.

import { roundTo } from '../util.js';

export const pctLoad = (max, pct) => roundTo(max * pct, 2.5);
export const pctLabel = (pct) => `${Math.round(pct * 1000) / 10}%`;

// Scales an amount by a multiplier, rounded to `step`.
// Any multiplier other than 1 always changes the result by at least one step,
// so "too easy" / "too hard" is never lost to rounding.
export function scale(n, m = 1, step = 1, min = step) {
  const base = Math.round(n / step) * step;
  let r = Math.round((n * m) / step) * step;
  if (m < 1 && r >= base) r = base - step;
  if (m > 1 && r <= base) r = base + step;
  return Math.max(min, r);
}

// Easy cardio that is possible today, as words for a sentence.
export function cardioChoices(limits) {
  const all = [['rower', 'row'], ['bike', 'bike'], ['run', 'jog'], ['ski', 'ski']];
  return all
    .filter(([need, word]) => !limits.has(need) && !(word === 'jog' && limits.has('knee')))
    .map(([, word]) => word);
}

function easyCardio(limits, max = 3) {
  const c = cardioChoices(limits).slice(0, max);
  if (!c.length) return limits.has('knee') ? 'brisk walk' : 'brisk walk or easy jog';
  if (c.length === 1) return `easy ${c[0]}`;
  return `easy ${c.slice(0, -1).join(', ')} or ${c[c.length - 1]}`;
}

const WARMUPS = {
  engine: (l) => [
    `3 min ${easyCardio(l, 2)}`,
    '2 rounds: 10 air squats, 10 leg swings per leg, 5 inchworms, 10 band pull-aparts',
    '2 light build-up sets of the first lift',
  ],
  gym: (l) => [
    l.has('rope') ? `2 min ${easyCardio(l, 2)}` : '2 min easy jump rope, then 30 s of double-unders',
    l.has('bar')
      ? '2 rounds: 10 arm circles each way, 10 hollow rocks, 10 superman holds, 8 push-ups'
      : '2 rounds: 10 scap pull-ups, 10 kip swings, 10 hollow rocks, 8 push-ups',
    'One easy set of each movement in the EMOM at about 30% of your max',
  ],
  barbell: (l) => [
    `3 min ${easyCardio(l, 2)}`,
    '2 rounds with an empty bar: 5 high pulls, 5 muscle cleans, 5 front squats, 5 push presses, 5 overhead squats',
    'Build to your working weight in 3–4 sets',
  ],
};

export function warmup(type, minutes, limits) {
  return { key: `${type}-warmup`, title: 'Warm-up', minutes, lines: WARMUPS[type]?.(limits) || [], log: 'none', light: true };
}

export function cooldown(minutes, limits) {
  return {
    key: 'cooldown',
    title: 'Cool-down',
    minutes,
    lines: [`4 min ${limits.has('bike') ? 'easy walk' : 'easy bike or walk'}`,
      'Hip flexor stretch, pigeon, hamstring stretch, thoracic rotations: 45 s each side'],
    log: 'none',
    light: true,
  };
}

export function zone2(minutes, key, title, limits) {
  return {
    key,
    title,
    minutes,
    lines: [`${minutes} min ${easyCardio(limits)}`],
    note: 'Conversational pace: you could talk in full sentences and breathe through your nose.',
    timer: { mode: 'fortime', cap: minutes * 60 },
    log: 'none',
    light: true,
  };
}

// "40 min easy, mixed. For example: 13 min row, 13 min bike, 14 min jog"
export function mixedCardio(minutes, limits) {
  const c = cardioChoices(limits).slice(0, 3);
  if (c.length < 2) return `${minutes} min ${easyCardio(limits)}`;
  const part = Math.floor(minutes / c.length);
  const parts = c.map((word, i) => `${i === c.length - 1 ? minutes - part * (c.length - 1) : part} min ${word}`);
  return `${minutes} min easy, mixed. For example: ${parts.join(', ')}`;
}
