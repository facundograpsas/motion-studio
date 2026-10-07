# Motion studio

Videos made from code: every film is a program that paints any frame on demand; headless Chromium
renders it and ffmpeg encodes it. Opus writes the program, renders it, looks at its own frames and fixes them.

## Layout
- `films/<name>/index.html` — one film. Canvas `#c`, `mountFilm({ dur, init, draw })` from `/lib/motion.js`.
- `films/<name>/audio/` — `score.json` (synth music) or `track.wav` (supplied), `cues.json` (SFX), `beats.json` (grid).
- `films/<name>/docs/` — `style_guide.md`, `shotlist.md`, `review_log.md` (and `ANIMATION_GUIDE.md` when using subagents).
- `films/<name>/refs/`, `assets/` — references and real product assets for that film.
- `films/_template/` — starting point. `films/demo/` — working example of every piece of the pipeline.
- `lib/motion.js` — springs, `track()`, `indicator()`, `swapAlpha()`, `rng()`, `format()`, beat helpers.
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
- Closed-form springs only (`springP(t, 'snappy'|'base'|'heavy'|'playful')`). No linear tweens.
  Tiny overshoot on UI, none on type. Any value with more than one target uses `track()`.
- Text inside a morphing container: `swapAlpha()` + clip to the shape.
- The last frame equals the first when the piece loops (positions and velocities).

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

## Loop before you show me anything
1. `npm run draft` + `npm run review`, then OPEN contact.png and phone.png and LOOK at them.
   Use `--at <t>` for a strip around any fast action.
2. Score 1-10: hook in first 2s · readability at phone size · motion quality · variety ·
   composition · brand accuracy · sound sync. Log in `docs/review_log.md`.
3. Fix the 3 worst problems. Re-render only the affected seconds (`--from/--to`). Repeat until every score is 8+.
4. Only then the full render (`npm run film`).

## Effort
medium for small fixes and re-renders · xhigh for new films · max for flagship pieces.

## Keys and secrets
APIs (ElevenLabs, fal, …) are read from `.env` by name, e.g. "the ElevenLabs key is
ELEVENLABS_API_KEY in .env". Never paste a key in a prompt, a film file or a commit. `.env` is gitignored.
