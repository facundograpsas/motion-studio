# motion-studio

Studio for code-rendered motion videos with Claude Code + Opus 5.5, built from the course
"How to build motion design studio with Opus 5.5" (@0xMovez). Notes in `docs/course-notes.md`.

The prompt is 10% of the video; the other 90% is this harness: a deterministic `seek(t)` engine,
closed-form springs, synthesized score + SFX on a beat grid, multi-format export and a critique
loop where Opus looks at its own frames.

## Setup (macOS)
```
brew install node ffmpeg uv          # Node 22.18+ (runs TS natively)
npm install && npx playwright install chromium
uv venv --python 3.12 .venv && uv pip install --python .venv/bin/python -r requirements.txt
cp .env.example .env                 # only if a film needs external APIs
```

## Make a video
```
claude --model claude-opus-5-5       # /model → effort xhigh for new films, max for flagship
> /motion-reel for https://myproduct.com, 20s, vertical, reference films/x/refs/frame.png
```
Or by hand:
```
npm run new -- my-film --dur 15      # scaffold films/my-film
npm run preview                      # http://localhost:5173 — live preview with scrubber
npm run draft -- films/my-film       # fast animatic (half-res, 30fps)
npm run review -- films/my-film/out/9x16/silent.mp4 --at 4.2
npm run film -- films/my-film --format all   # final 60fps + motion blur, mixed to -14 LUFS
```
`films/demo` is a working example of the whole pipeline (scenes, springs, morph, music, SFX).
`films/blocks-sheet` shows `lib/blocks.js` (counter, bars, pill, cursor) and `lib/gl.js` (3D phone and laptop,
glitch seam). `npm run qa -- films/<name> --format all` checks layout, empty frames, holds and seams before you look.

## Prompts
`prompts/` holds the patterns from the course: one-liner showreel, brand reel, reference-first,
UI-morph XML spec, director's brief for overnight films, critique pass.

## Route B (optional frameworks)
Opus picks route A (this engine) by default. For Remotion / HyperFrames, ask for them explicitly:
```
npx skills add remotion-dev/skills       # /remotion-create, /remotion-render
npx skills add heygen-com/hyperframes    # /hyperframes + GSAP skills
claude plugin marketplace add buildwithhanif/claude-animation-skill   # hand-drawn Node canvas look
claude plugin install claude-animation@claude-animation-skill
```

## References
`references/` (gitignored, study only): PDoomVideo, ClaudeAnimationBase, claude-animation-skill,
hyperframes (skills only — motion-doctrine, cut-the-curve, seam-craft, music-to-video), Battle-of-Austerlitz-Film, awesome-ai-motion (prompt library), awesome-opus-5-5-videos (dataset).
Re-clone with `git clone --depth 1 https://github.com/<owner>/<repo> references/<repo>`.
