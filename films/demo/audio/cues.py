"""SFX for the demo. Every time comes from timeline.json (tl); offsets from a beat are fine.

    npm run sfx -- films/demo
"""

from sfx.synth import chime, click, pop, thump, whoosh

A_MINOR = [880.0, 1046.5, 1318.5]  # score.json: key A, minor


def score(mix, tl):
    hook, grid, pill = tl["hook"], tl["grid"], tl["pill"]

    mix.put(hook["title"], thump(), 1.0)
    mix.put(hook["bar"], whoosh(0.3, 600, 2800, peak=0.4), 0.4, pan=-0.3)

    mix.put(grid["from"], pop(500, 1200), 0.55)
    mix.put(pill["from"] - 0.4, whoosh(0.45, 300, 3000, peak=0.85), 0.5)  # into the zoom seam

    mix.put(pill["from"], click(1800), 0.6)
    mix.put(pill["label"], pop(700, 1500), 0.55)
    mix.put(pill["check"], click(2400), 0.55)
    mix.put(pill["check"], chime(A_MINOR, dur=1.2, tau=0.4), 0.12)
    mix.put(pill["collapse"], click(3200, dur=0.03), 0.4)
