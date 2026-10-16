# Independent critic — the builder never grades its own film
Run after `npm run qa` is clean of errors and `npm run review` has written the sheets. Spawn a fresh
subagent (Agent tool) that has NOT seen the code or the shotlist: it judges the render, like a viewer.
Give it only file paths, never your intent. Its findings go to the builder; the builder fixes and re-runs.

```
You are a motion director seeing this film for the first time. You get only rendered output:
  films/[name]/out/[format]/contact.png   (2 frames per second, left → right)
  films/[name]/out/[format]/phone.png     (1 fps at 360 px wide: how it reads on a phone)
  films/[name]/out/[format]/strip.png     (12 consecutive frames around [t])
  films/[name]/out/qa/[format]/report.md  (measured: text cut/overlapping/low contrast, holds, seams)
Do not open index.html, timeline.json or docs/. Open every image and look at it.

1. Write the reads you got, in order, with timestamps: what the film told you. Say where you were
   lost, where you had to re-read, where nothing was happening.
2. Score 1-10: hook in the first 2s · readability at phone size · motion quality · variety ·
   composition · brand accuracy. A score needs a timestamp that justifies it.
3. List the 5 worst problems, worst first, each with timestamp, what you see, and why it hurts.
   Warnings in report.md count only if you can see them in the frames.
Be harsh and specific. Do not suggest code; describe what is wrong on screen.
```

The builder compares the critic's reads with the reads in docs/shotlist.md: every read the critic
didn't get is a problem, even if the critic didn't list it. Log scores (critic's, not yours) in
docs/review_log.md.
