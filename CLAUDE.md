# Motion studio

Videos made from code: every film is a program that paints any frame on demand; headless Chromium
renders it and ffmpeg encodes it. Opus writes the program, renders it, looks at its own frames and fixes them.

## Layout
- `films/<name>/timeline.json` — the film's clock: `duration` + one object per scene (`from`, `to` and its named
  beats, absolute seconds). The picture imports it and `audio/cues.py` reads it, so retiming is one edit.
  With a voice-over it is generated: `timeline.src.json` holds the same shape with references to words
  (`"@l3:turns"`, `"@l2.end+0.2"`, `"@end"`) and `tools/vo.ts` resolves them.
- `films/<name>/index.html` — one film. Canvas `#c`, `mountFilm({ dur, init, draw })` from `/lib/motion.js`.
- `films/<name>/audio/` — `score.json` (synth music) or `track.wav` (supplied), `cues.py` (SFX cue sheet), `beats.json` (grid),
  `vo.json` (voice-over lines → `vo/`, `vo.wav`, `vo_words.json`).
  Older films still use `cues.json` (legacy `tools/sfx.ts`); `npm run film` picks whichever exists.
- `films/<name>/docs/` — the stage documents (`PROGRESS.md`, `brief.md`, `facts.md`, `script.md`, `style_guide.md`)
  and `review_log.md` (older films: `shotlist.md`, `ANIMATION_GUIDE.md`).
- `films/<name>/refs/`, `assets/` — references and real product assets for that film.
- `films/_template/` — starting point. `films/demo/` — working example of every piece of the pipeline.
- Productions are local only: `films/*` is gitignored except the harness (`_template`, `demo`, the model sheets).
  This repo never holds a production's content, brand or data.
- `lib/motion.js` — springs (`springV(t, duration, bounce)` asks for the look, not stiffness), `track()`, `indicator()`, `swapAlpha()`, `rng()`, `format()`, beat helpers,
  seams (`cutCurve()`, `zoomThrough()`), `nudge()`, `waterfall()`, `local()` (scene beats → scene-local times).
- `lib/blocks.js` — `blocks(g, F, { PAL, UI, DISPLAY })`: the helpers films used to copy (`txt`, `measure`, `wrap`,
  `para`, `fit`, `rr`, `circle`, `ring`, `stamp`) plus `pill()`, `counter()` (lands exactly on its target),
  `bars()`, `cursor()` (click ripple), `device()` (flat phone/laptop). Use them instead of copying helpers.
- `lib/gl.js` — WebGL layer: `stage(F)` (Three.js, driven by t, world units = px), `phone()` / `laptop()` 3D
  mockups whose screen is a 2D canvas painted with blocks each frame, `postFx()` (chroma, warp, grain,
  vignette; seams ramp it to the cut and back, same amount both sides). Headless = SwiftShader, deterministic.
  Model sheet: `films/blocks-sheet/`.
- `tools/*.ts` (Node 26 runs TS natively), `tools/beats.py` and `tools/sfx/` (SFX engine, uses `.venv`;
  adapted from whaleyxbt/claude-motion, MIT).
- `prompts/` — prompt patterns (one-liner, brand, reference, UI-morph spec, director brief, critique pass, independent critic)
  and one prompt per stage of the workflow (`10-` producer … `15-` critics).
- `references/` — cloned repos for study only (gitignored, never run their code from here).

## Commands
```
npm run new -- <name> [--dur 15 --bpm 120]     scaffold films/<name> from the template
npm run preview                                 live preview + scrubber at http://localhost:5173/
npm run draft -- films/<name> [--format 16x9]   half-res, 30fps, no blur — fast animatic / checks
npm run render -- films/<name> [--from 4 --to 6] full quality 60fps, 4 subframes motion blur
npm run film -- films/<name> [--format all]     music → sfx → render → mix -14 LUFS → review sheets
npm run review -- <video.mp4> [--at 4.2]        contact.png, phone.png, poster.png, loop_check.mp4, strip.png
npm run qa -- films/<name> [--format all]       measured QA: text cut/crowding the edge/overlapping/low contrast,
                                                empty frames, holds, seam gate → out/qa/<format>/report.md
npm run vo -- films/<name> [--fit]              audio/vo.json → ElevenLabs per line (cached) → vo.wav + word timings
                                                → timeline.src.json resolved into timeline.json (--fit: estimate only)
npm run beats -- <song.wav> > films/<name>/audio/beats.json
npm run sfx -- films/<name>                     audio/cues.py + timeline.json → audio/sfx.wav
npm run sfx -- --list                           SFX generators and what each is for
```
Formats: `9x16` (1080x1920, default), `1x1`, `16x9`, `4x5`. Output: `films/<name>/out/<format>/final.mp4`.

## Workflow: stages and gates (films that matter: investor, brand, launch)
One agent doing everything loses focus. Each stage is done by an agent with a clean context that reads only the
APPROVED documents of the stage before and writes one document; only the user moves a document from DRAFT to
APPROVED. The hand-off is the document on disk, never the chat. `docs/PROGRESS.md` says where the film is.

| # | stage | prompt | writes | gate |
|---|---|---|---|---|
| 0 | brief + facts | `10-producer-brief` | `docs/brief.md`, `docs/facts.md` | user, text |
| 1 | script → story critic | `11-scriptwriter`, `16-story-critic` | `docs/script.md` (+ `npm run vo --fit`) | critic, then user |
| 2 | direction (3 → 1, jury) | `12-director` | `docs/style_guide.md` | user picks |
| 3 | voice | `13-storyboard` | `audio/vo.json`, `timeline.src.json` | user listens |
| 4 | storyboard from code | `13-storyboard` | one still per beat | user, pixels |
| 5 | build: test scene, then the rest | `14-scene-builder` | `index.html` (one scene per builder) | test scene |
| 6 | QA + three critics | `15-critics` | `out/qa/`, `docs/review_log.md` | side by side |
| 7 | sound + master | — | `out/<format>/final.mp4` | — |
| 8 | learn | — | every user note becomes a rule here or in the skill | — |

- Prose gates facts, pixels gate the look. Nothing is built before the script is APPROVED.
- `facts.md` or it isn't on screen: every number has a source and a kind (result · target · illustrative · stated).
- Fix the highest artifact that caused a problem (script → timeline → code), not the pixel.

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
- One personality per film (premium · corporate · energetic · playful). Investor and finance films: premium,
  `springV(t, 0.35–0.6, 0)`, no overshoot anywhere. Exits last 65–75 % of their entrance; duration grows with
  distance (×1.3 for double the distance).
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
- Template mechanics: scenes paint on the layer `g`; `SEAMS` maps an incoming scene id to its seam; the compositor applies it.

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
- One hero at a time; everything else dims to 40–60 %. Never more than a third of the elements moving at once,
  and nothing travels more than a third of the frame without a change of key.
- Reactions ignite on the same frame as their cause.
- Single entry ≤ ~0.8s; longer buildups are staggers. Total stagger ≤ 0.5s. Cascades overlap, they
  don't queue: `waterfall()` (gaps shrink ×0.84), heavier elements travel further. Arrivals are binary-on
  with a spring, not fades.
- Group repositioning: `nudge()` (slow ramp · linear burst · long tail); reveal new content during the burst.

## Characters and vehicles (`lib/rigs/`)
- Actors are tiny 3D models in iso world units, drawn flat: `iso.ts` (projection, shaded convex solids,
  `onPlane()` decals, IK), `path.ts` (routes with rounded corners, `cruise()`/`keyed()` motion, `follow()`
  spring filter, `footsteps()`), `person.ts` (IK skeleton, face, hair, hand targets; poses: walk, `run` with
  `footsteps(…, duty 0.35)`, `sit`, phone via `HANDS.phone` + `headPitch` + `phone()`), `vehicle.ts` (van, car).
  Written in TS; the preview and render servers strip the types.
  Model sheets to check a rig change at every angle: `films/people-sheet/`, `films/rig-sheet/` (vehicles).
- Locomotion is driven by distance, never by time: wheel spin = distance / radius; feet come from
  `footsteps()`, where a planted foot is a fixed world point (zero slide, verify numerically if you change it).
  Set a walk's step count in timeline.json so `cues.py` can put footsteps on the plants.
- Characters are the exception to "no idle wobble": blinks, breathing and weight are allowed on people,
  never on UI. Act with anticipation (squat before a hop), follow-through (body pitch from `follow()`),
  and give the other actor room (step back, turn toward them).
- Sort actors and buildings with footprints (iso AABB rule), not a single depth number; clip an actor to
  an opening while it is inside something (a door, a dock), minus the door leaf as it swings, so they are
  uncovered by the door instead of popping in. Check occlusion before blocking a scene:
  anything taller between an actor and the camera (a parked van) hides its feet.

## Look
- Banned defaults: centered title on gradient, everything fading in, corner labels and frame
  borders, glow on UI chrome, generic particle bursts.
- One display face, one UI face. One accent color unless the brief says otherwise.
- Every 2 to 4 seconds something new must happen on screen. Hook in the first 2 seconds.
- With a reference: take its grammar (palette, type, pacing, transitions), never its content.
- Brand work: real screenshots, logo, colors and fonts (Playwright into `assets/`). Never invent UI.

## Timing: write the reads
- Frame 0 is the cover: the promise readable, one dominant hero, real content — never a pre-animation empty state.
- Every text stays readable at least max(0.7 s, 0.25 + chars/17) the first time it shows (`npm run qa` checks it).
For every shot, list what the viewer must understand, in order. Each read needs time to be found,
understood and registered before the next one starts. One read at a time; fast actions, held
meanings; lead the eye before an important read. Let the reads set the shot length.

## Timeline
- Write every beat into `timeline.json` before scene code: scene `from`/`to` plus named moments
  (`"title": 0.1`, arrays for staggers). Scenes read them through `k` (scene-local, via `local()`); never type
  a start time inside a scene or a cue sheet. Offsets from a beat (`k.bar + 0.05`) are fine.
- Retime = edit `timeline.json`, then `npm run sfx` so the sound follows.

## Sound
- Score and SFX are synthesized in code (`score.json`, `cues.py`) unless `audio/track.wav` is supplied.
- `cues.py` is `score(mix, tl)`: `mix.put(tl["scene"]["beat"], whoosh(...), gain, pan)`, `mix.typing(start, end, chars)`,
  `mix.put_stereo()` for `pad()`. Gains are relative to the music (kick ~0.8): hero hits 0.8–1, supporting
  0.3–0.6, chimes/beds ~0.1. Tonal SFX in the key of `score.json`. Accent, don't narrate: drift stays silent.
  The stem isn't mastered alone — finalize normalizes music + SFX together to -14 LUFS.
- Place state changes on beats, big moments on downbeats, SFX on hits (`beats.json`). Mix lands at -14 LUFS.
- Trust the beat grid only when the music is genuinely rhythmic. On calm tracks the grid is a metronome
  the tracker imposed: pace by `energy` (beats.json, 2 Hz) and phrases, and never hard-cut to it.
- Audio is the clock: re-time picture to the music (or VO), never rush a read to fit a slot.
- With a voice-over, the voice is the clock: one audio per line, scene lengths come from the measured voice plus a
  pad, every cue is anchored to the word that causes it (`"@l4:turns"`), things to read land 0.02–0.06 s early.
  Never show words different from the ones being said. The music ducks under the voice (finalize does it);
  silence the music 1–3 s before the payoff and put the loudest hit on it.
- Shot count tracks distinct treatments, not beats — extra density goes inside a shot.

## Loop before you show me anything
1. `npm run qa -- films/<name> --format all` until it has no errors (it exits 1 on errors). Read the
   warnings and open the marked PNGs: fix what is real, say why the rest is intended.
2. `npm run draft` + `npm run review`, then OPEN contact.png and phone.png and LOOK at them.
   Use `--at <t>` for a strip around any fast action.
3. Independent critics: fresh subagents that only see the render and the QA report
   (`prompts/15-critics.md`, or `07-independent-critic.md` for a quick pass). The builder never grades its own film.
4. Score 1-10: hook in first 2s · readability at phone size · motion quality · variety ·
   composition · brand accuracy · sound sync. Log in `docs/review_log.md`.
   Check every seam with a strip (`--at <cut time>`): no empty frames around the cut, same direction both sides.
5. Fix the 3 worst problems. Re-render only the affected seconds (`--from/--to`). Repeat until every score is 8+.
6. Only then the full render (`npm run film`).

## Effort
medium for small fixes and re-renders · xhigh for new films · max for flagship pieces.

## Keys and secrets
APIs (ElevenLabs, fal, …) are read from `.env` by name, e.g. "the ElevenLabs key is
ELEVENLABS_API_KEY in .env". Never paste a key in a prompt, a film file or a commit. `.env` is gitignored.
