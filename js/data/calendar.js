// 13-week Cycle 1 calendar: phases, which session falls on which day, and the weekly test order.

import { addDays, daysBetween } from '../util.js';
import { ROTATION, BENCHMARKS } from './benchmarks.js';

export const TOTAL_WEEKS = 13;

export const PHASES = [
  { key: 'base', name: 'Base', weeks: [1, 2, 3, 4], goal: 'Aerobic base, steady pacing, smooth sets' },
  { key: 'deload', name: 'Deload', weeks: [5], goal: 'Lighter week: recover and absorb' },
  { key: 'build', name: 'Build', weeks: [6, 7, 8, 9], goal: 'Longer hard efforts, race-pace practice' },
  { key: 'deload', name: 'Deload', weeks: [10], goal: 'Lighter week: recover and absorb' },
  { key: 'sharpen', name: 'Sharpen', weeks: [11, 12], goal: '20-minute efforts at race pace' },
  { key: 'test', name: 'Test', weeks: [13], goal: 'Taper and final tests' },
];

// Session types in the order they appear in a training week.
export const SESSION_TYPES = [
  { key: 'engine', name: 'Engine + squat' },
  { key: 'gym', name: 'Gymnastics + DB' },
  { key: 'aerobic', name: 'Zone 2 + mobility' },
  { key: 'barbell', name: 'Barbell + pace' },
  { key: 'test', name: 'Benchmark test' },
];

export const TYPE_KEYS = SESSION_TYPES.map((t) => t.key);

export function weekInfo(week) {
  const phase = PHASES.find((p) => p.weeks.includes(week));
  if (!phase) return null;
  return { week, phase, phaseWeek: phase.weeks.indexOf(week) + 1 };
}

export function planStart(profile) {
  return addDays(profile.startDate, profile.shift || 0);
}

export function validSession(week, type) {
  return Number.isInteger(week) && week >= 1 && week <= TOTAL_WEEKS && TYPE_KEYS.includes(type);
}

export function sessionId(week, type) {
  return `W${week}-${type}`;
}

export function parseSessionId(id) {
  const m = /^W(\d{1,2})-([a-z]+)$/.exec(id || '');
  if (!m) return null;
  const week = Number(m[1]);
  return validSession(week, m[2]) ? { week, type: m[2] } : null;
}

// Position of a session in the plan (used to decide what counts as "earlier").
export function ordOf(id) {
  const p = parseSessionId(id);
  return p ? p.week * 10 + TYPE_KEYS.indexOf(p.type) : null;
}

// The 12 weekly tests in order. Tests can be swapped between weeks.
export function testOrder(profile) {
  const o = profile?.testOrder;
  const ok = Array.isArray(o) && o.length === 12 && o.every((id) => BENCHMARKS[id]);
  return ok ? o : [...ROTATION, ...ROTATION];
}

// Which benchmark is tested on the test day of a given week.
export function testFor(profile, week) {
  if (week >= 1 && week <= 12) return testOrder(profile)[week - 1];
  if (week === 13) return 'angie';
  return null;
}

// Week 13 has a second final test (Cindy) on the aerobic day.
export function extraTestFor(week, type) {
  return week === 13 && type === 'aerobic' ? 'cindy' : null;
}

export function benchOn(profile, week, type) {
  return extraTestFor(week, type) || (type === 'test' ? testFor(profile, week) : null);
}

export function sessionTitle(profile, week, type) {
  const benchId = benchOn(profile, week, type);
  if (benchId) return `Test: ${BENCHMARKS[benchId].name}`;
  return SESSION_TYPES.find((t) => t.key === type)?.name || type;
}

// Day offsets for one week: the usual training days, unless sessions were swapped that week.
export function daysFor(profile, week) {
  return profile.weekDays?.[week] || profile.days;
}

export function dateFor(profile, week, type) {
  return addDays(planStart(profile), (week - 1) * 7 + daysFor(profile, week)[type]);
}

// What is planned on a date: { week, type } or a rest day, or outside the cycle.
export function slotOn(profile, iso) {
  const diff = daysBetween(planStart(profile), iso);
  if (diff < 0) return { status: 'before', daysUntil: -diff };
  const week = Math.floor(diff / 7) + 1;
  if (week > TOTAL_WEEKS) return { status: 'after' };
  const offset = diff % 7;
  const map = daysFor(profile, week);
  const type = TYPE_KEYS.find((k) => map[k] === offset);
  return type ? { status: 'session', week, type, offset } : { status: 'rest', week, offset };
}

export function weekSessions(profile, week) {
  const map = daysFor(profile, week);
  return TYPE_KEYS
    .slice()
    .sort((a, b) => map[a] - map[b])
    .map((type) => ({ id: sessionId(week, type), week, type, date: dateFor(profile, week, type) }));
}

export function allSessions(profile) {
  const list = [];
  for (let week = 1; week <= TOTAL_WEEKS; week++) list.push(...weekSessions(profile, week));
  return list;
}

// Next session on or after a date (used on rest days and before the cycle starts).
export function nextSessionFrom(profile, iso) {
  return allSessions(profile).find((s) => s.date >= iso) || null;
}

// Day map for a week after moving one session to another day of that week.
// If another session sits on that day, the two trade places.
export function movedDays(profile, week, type, offset) {
  const map = { ...daysFor(profile, week) };
  const other = TYPE_KEYS.find((k) => k !== type && map[k] === offset);
  if (other) map[other] = map[type];
  map[type] = offset;
  return map;
}
