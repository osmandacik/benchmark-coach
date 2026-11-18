// The six Cycle 1 benchmarks. Weights come from the profile and stay locked all cycle.
// format: 'fortime' (score = time, or reps at the cap), 'amrap-rounds' (score = reps, shown as rounds + reps),
//         'amrap-reps' (score = total reps).
// needs: equipment the test cannot be done without (tests are never auto-swapped, so results stay comparable).
// segments: relative effort of each part, used to build pacing checkpoints.
//   gym: key into profile.unbroken, so rep breakdowns follow your max unbroken sets.

export const ROTATION = ['jackie', 'cindy', 'fran', 'open241', 'angie', 'open231'];

const it = (mv, qty, extra = {}) => ({ mv, qty, ...extra });

export const BENCHMARKS = {
  jackie: {
    id: 'jackie',
    name: 'Jackie',
    format: 'fortime',
    cap: 15 * 60,
    needs: ['rower', 'barbell', 'bar'],
    summary: 'Row, light thrusters, pull-ups · about 8–12 min',
    levels: [{ label: 'Full Jackie' }],
    describe: (p) => ['1000 m row', `50 thrusters (${p.weights.jackie} kg)`, '30 pull-ups'],
    weight: (p) => `Thrusters ${p.weights.jackie} kg`,
    segments: () => [
      { label: '1000 m row', w: 0.42 },
      { label: '50 thrusters', w: 0.33 },
      { label: '30 pull-ups', w: 0.25, gym: 'pullup', reps: 30 },
    ],
    setFactor: 0.6,
    tips: [
      'Row at a pace you could hold for a 2k. Do not sprint it.',
      'Thrusters: 25 + 25, or 20 + 15 + 15. Breathe at the top, not at the bottom.',
      'Walk straight to the bar. The first pull-up set decides your time.',
    ],
    primer: [
      '2 rounds: 10 thrusters (empty bar to working weight), 5 pull-ups, 100 m row building pace',
      '1 round at race pace: 150 m row, 8 thrusters, 5 pull-ups. Rest 3 min, then go.',
    ],
    rehearsal: {
      lines: (p) => ['2 rounds, rest 2 min between:', it('rowm', 300), it('thruster', 15, { load: `${p.weights.jackie} kg` }), it('pullup', 10)],
      note: 'Hold your target race pace, not faster. Practise the transitions.',
      timer: { mode: 'fortime', cap: 8 * 60 },
    },
    minutes: 12,
  },

  cindy: {
    id: 'cindy',
    name: 'Cindy',
    format: 'amrap-rounds',
    perRound: 30,
    needs: ['bar'],
    summary: 'Bodyweight AMRAP · 10 → 15 → 20 min ladder',
    levels: [
      { label: '10 min', minutes: 10, targetRounds: 11 },
      { label: '15 min', minutes: 15, targetRounds: 16 },
      { label: '20 min (full Cindy)', minutes: 20, targetRounds: 21 },
    ],
    describe: (p, level) => [`AMRAP ${level.minutes} min:`, '5 pull-ups', '10 push-ups', '15 air squats'],
    weight: () => 'Bodyweight',
    segments: () => [
      { label: '5 pull-ups', w: 0.28, gym: 'pullup', reps: 5 },
      { label: '10 push-ups', w: 0.4 },
      { label: '15 air squats', w: 0.32 },
    ],
    setFactor: 0.5,
    tips: [
      'Same pace every round. Tap "+1 round" on the timer each time you finish a round.',
      'Push-ups decide Cindy. Break them 5 + 5 before you have to, never to failure.',
      'Use the checkpoints: if you are ahead, hold the pace instead of speeding up.',
    ],
    primer: [
      '2 rounds at easy pace: 5 pull-ups, 10 push-ups, 15 air squats',
      '1 round at target pace, then rest 3 min',
    ],
    rehearsal: {
      lines: () => ['2 × 4 min at your target round pace, rest 2 min. Rounds of:', it('pullup', 5), it('pushup', 10), it('airsquat', 15)],
      note: 'Find the rhythm that gives the target rounds per minute. It should feel easy for these 4 minutes.',
      timer: { mode: 'intervals', work: 240, rest: 120, rounds: 2 },
    },
    minutes: 20,
  },

  fran: {
    id: 'fran',
    name: 'Fran',
    format: 'fortime',
    cap: 10 * 60,
    totalReps: 90,
    needs: ['barbell', 'bar'],
    summary: 'Thrusters and pull-ups sprint · about 3–6 min',
    levels: [{ label: 'Full Fran' }],
    describe: (p) => ['21-15-9 reps for time:', `Thrusters (${p.weights.fran} kg)`, 'Pull-ups'],
    weight: (p) => `Thrusters ${p.weights.fran} kg`,
    segments: () => [
      { label: '21 thrusters', w: 0.24 },
      { label: '21 pull-ups', w: 0.22, gym: 'pullup', reps: 21 },
      { label: '15 thrusters', w: 0.17 },
      { label: '15 pull-ups', w: 0.16, gym: 'pullup', reps: 15 },
      { label: '9 thrusters', w: 0.11 },
      { label: '9 pull-ups', w: 0.10, gym: 'pullup', reps: 9 },
    ],
    setFactor: 0.8,
    tips: [
      'Thrusters: 21 as 12 + 9 (or unbroken if it feels light), 15 as 8 + 7, 9 unbroken.',
      'Go straight from the bar to the rig. Chalk before you start, not during.',
      'Round 1 fast but controlled. The race is decided in round 2.',
    ],
    primer: [
      'Thrusters building to working weight: 5, 5, 3 reps',
      '2 × 5 kipping pull-ups',
      '30 s at race pace (5 thrusters + 5 pull-ups). Rest 3 min, then go.',
    ],
    rehearsal: {
      lines: (p) => ['3 rounds, rest 2 min between:', it('thruster', 7, { load: `${p.weights.fran} kg` }), it('pullup', 7)],
      note: 'Rehearse the speed of your first round of 21. Smooth reps, fast transitions.',
      timer: null,
    },
    minutes: 8,
  },

  open241: {
    id: 'open241',
    name: 'Open 24.1',
    format: 'fortime',
    cap: 15 * 60,
    totalReps: 180,
    needs: ['db'],
    summary: 'Dumbbell snatches and burpees · 15 min cap',
    levels: [{ label: 'Full 24.1' }],
    describe: (p) => [
      'For time (15 min cap):',
      `21 DB snatches, arm 1 (${p.weights.open241} kg)`,
      '21 lateral burpees over the DB',
      '21 DB snatches, arm 2',
      '21 lateral burpees over the DB',
      'Then 15s, then 9s, the same way',
    ],
    weight: (p) => `Dumbbell ${p.weights.open241} kg`,
    segments: () => [
      { label: '21 + 21 snatches, 42 burpees', w: 0.47 },
      { label: '15 + 15 snatches, 30 burpees', w: 0.33 },
      { label: '9 + 9 snatches, 18 burpees', w: 0.20 },
    ],
    setFactor: 0.6,
    tips: [
      'Snatches: touch-and-go sets of 7 (21 = 7 + 7 + 7). Switch arms without resting.',
      'Lateral burpees: steady rhythm, one breath per rep, never stop moving.',
      'Pace the 21s at about 80%. The 15s decide your score.',
    ],
    primer: [
      'DB snatches: 5 per arm light, then 5 per arm at working weight',
      '6 lateral burpees over the DB',
      '1 min at race pace, rest 3 min, then go',
    ],
    rehearsal: {
      lines: (p) => ['2 rounds, rest 2 min between:',
        it('dbsnatch', 9, { label: 'DB snatches per arm', load: `${p.weights.open241} kg` }), it('latburpee', 9)],
      note: 'Find the burpee rhythm you can keep for 15 minutes.',
      timer: null,
    },
    minutes: 15,
  },

  angie: {
    id: 'angie',
    name: 'Angie',
    format: 'fortime',
    cap: null,
    needs: ['bar'],
    summary: 'Bodyweight chipper · 60 → 100 reps ladder',
    levels: [
      { label: '60 reps each', reps: 60, targetTime: 600 },
      { label: '70 reps each', reps: 70, targetTime: 715 },
      { label: '80 reps each', reps: 80, targetTime: 835 },
      { label: '90 reps each', reps: 90, targetTime: 960 },
      { label: '100 reps each (full Angie)', reps: 100, targetTime: 1090 },
    ],
    describe: (p, level) => [
      'For time, in order:',
      `${level.reps} pull-ups`,
      `${level.reps} push-ups`,
      `${level.reps} sit-ups`,
      `${level.reps} air squats`,
    ],
    weight: () => 'Bodyweight',
    segments: (p, level) => [
      { label: `${level.reps} pull-ups`, w: 0.3, gym: 'pullup', reps: level.reps },
      { label: `${level.reps} push-ups`, w: 0.28 },
      { label: `${level.reps} sit-ups`, w: 0.2 },
      { label: `${level.reps} air squats`, w: 0.22 },
    ],
    setFactor: 0.6,
    tips: [
      'Pull-ups: short sets from the start (your sets are listed above). Your grip has to last.',
      'Push-ups: sets of 10–15 with 3–5 breaths between. Never go to failure.',
      'Sit-ups and squats: keep moving. Take short standing breaks, not long ones.',
    ],
    primer: [
      '2 rounds: 5 pull-ups, 10 push-ups, 10 sit-ups, 10 air squats',
      '1 set of 10 pull-ups at race pace. Rest 3 min, then go.',
    ],
    rehearsal: {
      lines: () => ['Mini Angie for time:', it('pullup', 20), it('pushup', 20), it('situp', 20), it('airsquat', 20)],
      note: 'Use the same set sizes as test day and hold the target pace.',
      timer: { mode: 'fortime', cap: 6 * 60 },
    },
    minutes: 20,
  },

  open231: {
    id: 'open231',
    name: 'Open 23.1',
    format: 'amrap-reps',
    minutesCap: 14,
    totalReps: 200,
    needs: ['rower', 'bar', 'ball', 'barbell'],
    summary: 'Row, toes-to-bar, wall balls, cleans · 14 min AMRAP',
    levels: [{ label: 'Full 23.1' }],
    describe: (p) => [
      'AMRAP 14 min:',
      '60 cal row',
      '50 toes-to-bar',
      `40 wall balls (${p.weights.open231ball} kg, 3 m)`,
      `30 cleans (${p.weights.open231} kg)`,
      '20 bar muscle-ups',
    ],
    weight: (p) => `Cleans ${p.weights.open231} kg, ball ${p.weights.open231ball} kg`,
    // reps and seconds per rep (relative) for the chipper pacing
    chipper: [
      { label: '60 cal row', reps: 60, sec: 3.6 },
      { label: '50 toes-to-bar', reps: 50, sec: 3.6, gym: 't2b' },
      { label: '40 wall balls', reps: 40, sec: 3.3 },
      { label: '30 cleans', reps: 30, sec: 5.2 },
      { label: '20 bar muscle-ups', reps: 20, sec: 9, gym: 'bmu' },
    ],
    setFactor: 0.5,
    tips: [
      'Row 60 cal at a steady pace, about 4 minutes. No sprinting.',
      'Toes-to-bar: use your sets listed above, 5–8 s rest between sets.',
      'Wall balls in 2–3 big sets. Cleans: fast singles, touch-and-go only if smooth.',
    ],
    primer: [
      '2 rounds: 5 toes-to-bar, 5 wall balls, 3 cleans building to working weight',
      '30 s race-pace row. Rest 3 min, then go.',
    ],
    rehearsal: {
      lines: (p) => ['2 × 3 min, rest 2 min. Rounds of:', it('row', 15), it('t2b', 12), it('wallball', 10, { load: `${p.weights.open231ball} kg` })],
      note: 'Practise the row pace and your first toes-to-bar set size.',
      timer: { mode: 'intervals', work: 180, rest: 120, rounds: 2 },
    },
    minutes: 14,
  },
};

export function benchLevel(bench, levelIndex) {
  const i = Math.min(Math.max(Math.round(Number(levelIndex) || 0), 0), bench.levels.length - 1);
  return { index: i, ...bench.levels[i] };
}
