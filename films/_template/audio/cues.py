"""SFX for this film. Every time comes from timeline.json (tl), never a typed number;
offsets from a beat (tl["hook"]["bar"] + 0.05) are fine. Generators: npm run sfx -- --list

    npm run sfx -- films/<name>
"""

from sfx.synth import pop, thump, whoosh


def score(mix, tl):
    hook = tl["hook"]
    mix.put(hook["title"], thump(), 1.0)
    mix.put(hook["bar"], whoosh(0.3, 600, 2800, peak=0.4), 0.4, pan=-0.3)
    for name, scene in tl.items():
        if name not in ("duration", "hook"):
            mix.put(scene["from"], pop(500, 1200), 0.5)  # each scene lands
