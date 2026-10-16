# Stage 3–4 — Voice, then storyboard
Voice first: audio/vo.json from the APPROVED script (one line per id), `npm run vo -- films/[name]`, and
timeline.src.json with every beat as a reference to a word ("@l4:turns"). The user listens before anything is drawn.

```
Storyboard from code, not from prose: for every beat in timeline.json, write the scene's composition at its key
moment (final layout, real text, real numbers, no motion yet) in index.html, then
`npm run draft -- films/[name]` and `npm run review -- films/[name]/out/16x9/silent.mp4`.
Open contact.png. One still per beat must prove its line of the script with the sound off.
Run `npm run qa -- films/[name]` (layout must have 0 errors). Show the stills and stop: pixels gate the look.
```
