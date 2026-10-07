# Reference first (step 05) — name a look, feed a frame
Without a reference Opus falls back to centered text + gradient + fade-ins. Naming a style beats describing one.
Sources: whatships.com (launch videos), Dribbble motion, competitors' launch films, your own image library.

```
Reference: films/[name]/refs/launch.mp4 (and films/[name]/refs/frames/*.png)

1. Extract one frame every 0.5s with ffmpeg. Study them.
2. Write films/[name]/docs/style_guide.md: palette (hex), type (family, weight, tracking),
   shot lengths, transition types, camera moves, texture/grain, how text enters and exits.
3. Write films/[name]/docs/shotlist.md for a [DURATION]s video about [SUBJECT] in THAT style.
   Take the grammar of the reference, never its content, logos or characters.
4. Show me both files. Wait for my OK before any code.
```

- A frame: attach it, say what to take (palette, type, grain) and what not to take (subject).
- A library: a folder of images → ask for style_guide.md from it first.
- Specify the look and constraints, not the library — let the model pick the technique.
