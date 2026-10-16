---
name: motion-reel
description: Make a product or showreel motion video rendered from code in this studio. Use when the user asks for a launch video, showreel, product reel, animated explainer, motion ad or any film in films/. Example — "/motion-reel for https://x.com, 20s, vertical, reference ./refs/frame.png".
---

# Motion reel

Follow CLAUDE.md (render contract, look, timing, sound, critique loop). This skill is the pipeline.

## Inputs to collect first
Product + URL (or subject), duration, formats (9:16 / 1:1 / 16:9), brand colors + fonts,
a reference (frame, video or image folder), music (file → audio/track.wav, or "synthesize").
Ask only for what is missing; sensible defaults: 15s, 9:16 first, synthesized music at 120 BPM.

## Pipeline
For investor, brand or launch films use the staged workflow in CLAUDE.md ("Workflow: stages and gates"): one fresh
agent per stage (`prompts/10-` … `15-`), documents in `docs/` with DRAFT/APPROVED, `docs/PROGRESS.md` as the
resume point, voice-over through `npm run vo`. The steps below are the short path for quick reels.

1. `npm run new -- <name> --dur <s> --bpm <bpm>`.
2. Gather assets from the URL with Playwright into films/<name>/assets. List them.
3. If a reference exists, write docs/style_guide.md from it (prompts/03-reference.md).
4. Music: edit audio/score.json (sections, chords, key) or drop audio/track.wav and run
   `npm run beats -- films/<name>/audio/track.wav > films/<name>/audio/beats.json`.
5. Write docs/shotlist.md on the beat grid, and the same beats into timeline.json (scenes + named moments): per shot time range, event, reads, sustained-motion route,
   SFX, and the seam out of it (cut the curve in CURRENT by default; reserved vectors only with a reason).
   Show it and wait for OK.
6. Build index.html with lib/motion.js springs and lib/blocks.js (lib/gl.js for 3D devices and post fx), laid out in `u` units for every format; scenes read
   their times from timeline.json (`k`), never typed numbers. Write audio/cues.py against the same
   timeline (`npm run sfx -- --list` for generators) and run `npm run sfx -- films/<name>`.
7. `npm run qa -- films/<name> --format all` (no errors) → `npm run draft` → `npm run review` → open
   contact.png/phone.png → independent critic subagent (prompts/07-independent-critic.md) → fix → repeat. 3 rounds minimum, until every score is 8+. Log in docs/review_log.md.
8. `npm run film -- films/<name> --format all` → out/<format>/final.mp4 at -14 LUFS.
9. Deliver final.mp4, contact.png, poster.png per format. Say what you'd improve next.

## Hard rules
- Real product UI only. Never invent screens.
- No Math.random, no timers, no CSS transitions in render mode.
- Banned: corner labels, centered title on gradient, everything fading in.
