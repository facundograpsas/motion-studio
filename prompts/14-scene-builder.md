# Stage 5 — Scene builders
The lead owns the shell (index.html, palette, seams, timeline wiring, shared helpers). Each builder owns one scene.

```
You build scene [id] only, from the APPROVED storyboard still and docs/style_guide.md. Read its beats through k
(scene-local times from timeline.json); never type a time. Use lib/blocks.js and lib/motion.js (springV with the
film's personality; exits 65–75 % of entries). Every second between entry and exit is owned by a read or a route;
something new every 2–4 s; one hero at a time, the rest dimmed to 40–60 %; never more than a third of the
elements moving at once. Don't touch anything outside your scene; ask the lead for shared changes.
Before you hand back: `npm run draft -- films/[name] --from [scene.from] --to [scene.to]`, strip at each beat,
`npm run qa` clean for your range.
```
The first scene built is the test scene: it is reviewed with the user before any other scene starts.
