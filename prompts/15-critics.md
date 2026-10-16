# Stage 6 — Three critics (fresh agents, render only)
Each critic sees only rendered output (final.mp4 sheets, strips, out/qa report) — never code, script or intent.
Run them as three separate agents, each looking for one thing:

1. **Sync** — strips at every voice anchor (`npm run review -- … --at <t>`): does the picture change on the word
   that causes it? Hits exact, things to read slightly early, nothing lands between words by accident.
2. **Silent motion** — contact.png and phone.png with no sound: what does the film say with the sound off?
   Where is nothing in flight, where do two things fight for the eye, what is hard to read on a phone?
3. **Recall** — watch once, then write the claim and every number you remember. A read you can't recall failed,
   even if it looked good (if you remember the animation and not the words, the animation won).

Each finding: blocker / fix / polish, timestamp, what is on screen, why it hurts. The builder fixes the highest
artifact that caused it (script → timeline → code), not the pixel. A new version replaces the old one only if a
fresh judge prefers it side by side without knowing which is newer. Two rounds that don't converge → ask the user.
