# Director's brief (step 10) — overnight / long-form films
They don't describe a video, they hire a crew. Donald's ~9,500-char brief → 142s music video after a 12h run.
Generate-then-trace: a video model (e.g. Seedance via FAL_KEY) renders base shots, Opus redraws them in JS on top.
See references/PDoomVideo (ANIMATION_GUIDE.md + STORYBOARD.md + src/ch/ per chapter) for the subagent pattern.

```
You are the director, animator, sound designer and render engineer for a [DURATION] film
made in code, in films/[name]. Treat this as a multi-session production. Don't rush to a final render.

## The film in one line
[LOGLINE. What the viewer should feel at the end.]

## References and inputs
- films/[name]/refs/ : [video / frames / image library]. Take the grammar, never the content.
- films/[name]/audio/track.wav : use it unchanged. Measure beats with npm run beats first.
- Skills available: [/motion-reel | /remotion-best-practices | /hyperframes | /claude-animation].
- APIs in .env: [ELEVENLABS_API_KEY, FAL_KEY]. Budget: [$X]. Be economical.

## Look
[3-5 lines: palette, type, texture, camera language. Banned looks.]

## Character bible (if any)
[Proportions, palette sampled from a sheet, expressions, an identity lock that survives every style change.]

## Beat sheet
0:00-0:02  hook: [the single most striking image]
0:02-0:10  [act 1]
...        a new visual payoff every 3-5 seconds
[END]      the last frame sets up the first frame (loop)

## Workflow, with gates
1. Write docs/style_guide.md and docs/shotlist.md (every shot: frames, camera, text, SFX, reads).
   Show me the shot list. Then continue without waiting if I don't answer in 10 minutes.
2. Build stills for every shot. Contact sheet. Critique.
3. Animatic with npm run draft and placeholder audio. Fix pacing before polish.
4. Full animation, polish pass, sound pass, final render.
5. Split work across subagents per chapter. Write docs/ANIMATION_GUIDE.md first
   so every subagent codes in the same style.

## Critique loop (every shot, at least 3 rounds)
Render 3-5 stills, score 1-10 on: hook, readability at 360px wide, motion, composition,
depth, sound sync, polish. Log scores + 3 biggest problems in docs/review_log.md. Fix. Repeat
until all are 8+.

## Deliverables
out/9x16/final.mp4 · loop_check.mp4 · poster.png · contact.png · README.md
```
