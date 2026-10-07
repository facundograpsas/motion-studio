# Critique pass (step 11) — make Opus watch its own frames
Run after `npm run draft -- films/[name]` + `npm run review -- films/[name]/out/9x16/silent.mp4 --at [t]`.
Iteration is the method: the watercolor short took 163 model calls.

```
Open films/[name]/out/9x16/contact.png, strip.png and phone.png and look at them properly.
Be a harsh motion director, not a proud author.

Score 1-10: hook in first 2s · readability at phone size · motion quality (springs,
no dead frames) · variety (new thing every 2-4s) · composition · brand accuracy · sound sync.

List the 3 biggest problems with timestamps. Hunt specifically for: text overlapping during
swaps, anything sliding instead of easing, corner labels and frame borders, centered-on-gradient
shots, blurry scaled text, a dead beat with nothing happening, a stutter at the loop seam.

Fix them, re-render only the affected seconds (--from/--to), show me the new contact sheet and new scores.
Log every round in docs/review_log.md.
```
