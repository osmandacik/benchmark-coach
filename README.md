# Benchmark Coach

A phone-first web app for a 13-week CrossFit conditioning cycle (Cycle 1, starting Monday 16 November 2026).
Weights stay locked; you get faster on six benchmarks (Jackie, Cindy, Fran, Open 24.1, Angie, Open 23.1)
with targets that react to your results, pacing checkpoints, rep breakdowns from your max sets, and a timer with beeps.

Your logs are stored only in the browser on the phone you use. Nothing is sent anywhere.

## Put it online with your personal GitHub (from your personal computer)

1. Copy `benchmark-coach.zip` to your personal computer (AirDrop, USB stick or your own cloud drive) and unzip it.
2. Sign in to github.com with your personal account and create a new repository, for example `benchmark-coach`.
   Make it **Public** (free GitHub Pages needs a public repository).
3. On the empty repository page, click **uploading an existing file**. Drag in everything inside the unzipped
   folder (`index.html`, `sw.js`, `manifest.webmanifest`, `.nojekyll`, `README.md` and the `css`, `js`, `icons`
   folders), then click **Commit changes**.
   Tip: `.nojekyll` is hidden on a Mac. Press Cmd + Shift + . in Finder to show it. The app works without it.
4. Open **Settings → Pages**. Under *Build and deployment*, choose **Deploy from a branch**, branch **main**,
   folder **/ (root)**, and click **Save**.
5. After a minute or two the app is live at `https://YOUR-USERNAME.github.io/benchmark-coach/`.

## Install it on your phone

- **iPhone (Safari):** open the link, tap Share → **Add to Home Screen**. Always open it from the home screen icon;
  that keeps your data safe from Safari's automatic clean-up.
- **Android (Chrome):** open the link, menu ⋮ → **Install app**.

After the first load it works offline at the gym. On iPhone, turn off silent mode to hear the timer beeps.

## Using it day to day

1. **Today** shows the session. Warm-up and cool-down are folded; tap to open them.
2. Tap **Start timer** on a part when you do it.
3. Tap **Finish session** at the end. One tap per part says how it went; add a score where there is one.
   Opening it again edits the same log.

### The plan adjusts to you

How you log each part changes the next session of the same kind:

| You tap | Next time |
| --- | --- |
| Too easy | one step harder |
| Just right | no change (two in a row bring an eased part back toward the plan) |
| Too hard | one step easier |
| Couldn't finish | two steps easier |

A step is 2.5 kg for back squat, clean & jerk and snatch; about 5% for interval length, EMOM set sizes and DB reps;
10% for Zone 2 minutes (Zone 2 never gets longer than planned). The press suggests a weight from the last one you logged.
A session that was adjusted says so, with the reason. Editing or deleting a log undoes its effect.
You can also change any level by hand: **Adjust or swap** on a part, or **Profile → Difficulty**.

Benchmarks: hit a target and the next one is about 5% better; miss it and the next step is smaller (3%, then 1.5%).
Cindy and Angie are ladders: hit the score at your step and the next test moves up (Cindy 10 → 15 → 20 min,
Angie 60 → 100 reps). When the step-up score is still far away, the target is halfway there first.

### When the day does not go to plan

- **Equipment missing or something sore:** *Change this session* → tap "No rower", "Knee sore", and so on.
  The movements are swapped for you (for that session only). "No equipment at all" gives a bodyweight version.
- **Your gym never has something:** *Profile → Equipment*. It is avoided in every session.
- **Swap one movement:** *Adjust or swap* on that part → pick an alternative. Tick "Always swap" to keep it.
- **Different workout, same goal:** *Adjust or swap* → *Different workout* (engine intervals and the DB piece).
- **Do another session today:** *Change this session* → trade days inside the week, or open a session from the
  Plan and tap *Do it today*.
- **Can't do the test:** *Change this session* → trade it with a later test. Tests themselves are never changed;
  if you scale one anyway, tick "I changed something" so it does not count for targets.
- **Did something else** (class, hike, competition): *Change this session* → *Log a different workout*.
- **Not training:** skip the session, or push the whole plan back a day or a week (Plan → *Move the plan*).
- **Back after a break:** Today offers an easier return week (about 15% lighter for 7 days).

## Your data

- Logs and settings live only on that phone. Use **Profile → Backup → Save a backup** every few weeks and
  before changing phones. On iPhone it normally opens the share sheet: choose *Save to Files*.
- **Restore from file** (or paste the backup text) brings a backup back.
- A running timer is remembered, so closing the app mid-workout does not lose it.
- The code contains your starting numbers as defaults (max sets, lifts, locked weights and your Angie 60 and
  10-minute Cindy scores). Change them any time in Profile.

## After week 13

**Profile → Training days and cycle → Run the cycle again** starts the 13 weeks from a new date.
Benchmark history and difficulty levels are kept.

## Updating the app later

Change the files, increase `VERSION` in `sw.js` (for example `v2` → `v3`) so phones fetch the new version,
then upload the changed files to the repository again. Phones pick it up the second time the app is opened.

The `tools` folder (not in the zip) has two checks to run after any change:

```bash
node tools/behave.mjs
```

```bash
node tools/fuzz.mjs
```

## Run it locally

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.
