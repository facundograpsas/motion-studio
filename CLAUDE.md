# Motion studio

Videos made from code: every film is a program that paints any frame on demand; headless Chromium
renders it and ffmpeg encodes it. Opus writes the program, renders it, looks at its own frames and fixes them.

## Layout
- `films/<name>/index.html` — one film. Canvas `#c`, `mountFilm({ dur, init, draw })` from `/lib/motion.js`.
- `films/<name>/audio/` — `score.json` (synth music) or `track.wav` (supplied), `cues.json` (SFX), `beats.json` (grid).
- `films/<name>/docs/` — `style_guide.md`, `shotlist.md`, `review_log.md` (and `ANIMATION_GUIDE.md` when using subagents).
- `films/<name>/refs/`, `assets/` — references and real product assets for that film.
- `films/_template/` — starting point. `films/demo/` — working example of every piece of the pipeline.
- `lib/motion.js` — springs, `track()`, `indicator()`, `swapAlpha()`, `rng()`, `format()`, beat helpers,
  seams (`cutCurve()`, `zoomThrough()`), `nudge()`, `waterfall()`.
- `tools/*.ts` (Node 26 runs TS natively), `tools/beats.py` (uses `.venv`).
- `prompts/` — prompt patterns (one-liner, brand, reference, UI-morph spec, director brief, critique pass).
- `references/` — cloned repos for study only (gitignored, never run their code from here).

## Commands
```
npm run new -- <name> [--dur 15 --bpm 120]     scaffold films/<name> from the template
npm run preview                                 live preview + scrubber at http://localhost:5173/
npm run draft -- films/<name> [--format 16x9]   half-res, 30fps, no blur — fast animatic / checks
npm run render -- films/<name> [--from 4 --to 6] full quality 60fps, 4 subframes motion blur
npm run film -- films/<name> [--format all]     music → sfx → render → mix -14 LUFS → review sheets
npm run review -- <video.mp4> [--at 4.2]        contact.png, phone.png, poster.png, loop_check.mp4, strip.png
npm run beats -- <song.wav> > films/<name>/audio/beats.json
```
Formats: `9x16` (1080x1920, default), `1x1`, `16x9`, `4x5`. Output: `films/<name>/out/<format>/final.mp4`.

## Render contract
- Every film is a pure function of time: `window.seek(t)` paints frame t.
- No CSS transitions, no setTimeout, no requestAnimationFrame in render mode, no state carried
  between frames. Seeded noise only (`rng(seed)`), never Math.random.
- Lay out in units from `format()` (`u` = 1% of the short side, `cx/cy`, `vertical`), never fixed
  pixels, so 9:16, 1:1 and 16:9 come from the same timeline. Reframe per format, don't crop.
- Load fonts explicitly in `init()` (`document.fonts.load`) — canvas text doesn't trigger loading.
- Determinism check: render the same range twice and compare `ffmpeg -i x.mp4 -f framemd5 - | md5`.

## Motion
- In-scene motion: closed-form springs only (`springP(t, 'snappy'|'base'|'heavy'|'playful')`). No linear tweens.
  Seams are the exception: mirrored power eases via `cutCurve()` / `zoomThrough()`.
  Tiny overshoot on UI, none on type. Any value with more than one target uses `track()`.
- Text inside a morphing container: `swapAlpha()` + clip to the shape.
- The last frame equals the first when the piece loops (positions and velocities).

## Seams: one continuous camera move, not a stack of slides
(Distilled from hyperframes' motion-doctrine / cut-the-curve; full text in `references/hyperframes/`.)
- **Vector law:** how scene A exits decides how B enters — same axis, same direction, matched
  speed, cut mid-motion on BOTH sides. Settling to rest before a cut, or starting from rest after it, is a dead beat.
- **The current:** each film picks ONE dominant direction (`CURRENT`, default left) for ordinary seams.
  Other vectors are reserved and mean something: up = elevation/reveal · Z push (`zoomThrough 'push'`,
  everything grows) = deeper into the same thought · Z pull (`'pull'`, everything shrinks) = arrival/payoff.
  Never ping-pong directions; a direction change needs a visible cause (click, impact) or a chapter break.
- **Z sign:** never answer a shrinking exit with a grow-from-small entry (or the reverse) — the most common violation.
- **Default seam = `cutCurve()`**: power4 in/out mirrored, partial travel ~12% of frame, the exit fade
  dies ~0.02s before the cut, the entry ignites at ~35% opacity mid-path. No crossfades.
- Use only 2–3 transition types per film and repeat them. Morphs of a shared element don't count.
- The incoming scene arrives composed — never empty or a speck at its first frame.
- Zoom blur: 10px on text-scale subjects, 18–20px only for full-frame surfaces. Same blur both sides of the swap.
- Template mechanics: scenes paint on the layer `g`; `SEAMS` maps a cut time to its seam; the compositor applies it.

## Performance: the scene keeps performing
- **Product / UI / kinetic-type films:** no idle wobble (breathe, float, glow pulse) to fill time — it reads
  as "the video is waiting". Every second between entry and exit is owned by a route: staged reveals ·
  camera with intent (establish → travel → arrive) · sequenced UI life (progress, counts, highlights) ·
  animated sequences (a card files into a stack) · cursor-led action (its click ignites the next beat).
  Test: pause at any second — something meaningful is mid-flight. A scene that finishes entering
  with seconds left is a planning bug: add story, not wobble.
- **Hand-drawn / character films** are the exception: there idle life and line boil ARE the medium
  (see `references/ClaudeAnimationBase/ANIMATION_GUIDE.md`).
- **Stillness before climax:** 0.3–0.75s pause between a major action and its result.
- Reactions ignite on the same frame as their cause.
- Single entry ≤ ~0.8s; longer buildups are staggers. Total stagger ≤ 0.5s. Cascades overlap, they
  don't queue: `waterfall()` (gaps shrink ×0.84), heavier elements travel further. Arrivals are binary-on
  with a spring, not fades.
- Group repositioning: `nudge()` (slow ramp · linear burst · long tail); reveal new content during the burst.

## Look
- Banned defaults: centered title on gradient, everything fading in, corner labels and frame
  borders, glow on UI chrome, generic particle bursts.
- One display face, one UI face. One accent color unless the brief says otherwise.
- Every 2 to 4 seconds something new must happen on screen. Hook in the first 2 seconds.
- With a reference: take its grammar (palette, type, pacing, transitions), never its content.
- Brand work: real screenshots, logo, colors and fonts (Playwright into `assets/`). Never invent UI.

## Timing: write the reads
For every shot, list what the viewer must understand, in order. Each read needs time to be found,
understood and registered before the next one starts. One read at a time; fast actions, held
meanings; lead the eye before an important read. Let the reads set the shot length.

## Sound
- Score and SFX are synthesized in code (`score.json`, `cues.json`) unless `audio/track.wav` is supplied.
- Place state changes on beats, big moments on downbeats, SFX on hits (`beats.json`). Mix lands at -14 LUFS.
- Trust the beat grid only when the music is genuinely rhythmic. On calm tracks the grid is a metronome
  the tracker imposed: pace by `energy` (beats.json, 2 Hz) and phrases, and never hard-cut to it.
- Audio is the clock: re-time picture to the music (or VO), never rush a read to fit a slot.
- Shot count tracks distinct treatments, not beats — extra density goes inside a shot.

## Loop before you show me anything
1. `npm run draft` + `npm run review`, then OPEN contact.png and phone.png and LOOK at them.
   Use `--at <t>` for a strip around any fast action.
2. Score 1-10: hook in first 2s · readability at phone size · motion quality · variety ·
   composition · brand accuracy · sound sync. Log in `docs/review_log.md`.
   Check every seam with a strip (`--at <cut time>`): no empty frames around the cut, same direction both sides.
3. Fix the 3 worst problems. Re-render only the affected seconds (`--from/--to`). Repeat until every score is 8+.
4. Only then the full render (`npm run film`).

## Effort
medium for small fixes and re-renders · xhigh for new films · max for flagship pieces.

## Keys and secrets
APIs (ElevenLabs, fal, …) are read from `.env` by name, e.g. "the ElevenLabs key is
ELEVENLABS_API_KEY in .env". Never paste a key in a prompt, a film file or a commit. `.env` is gitignored.
