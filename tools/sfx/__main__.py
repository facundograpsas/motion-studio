"""Render a film's cue sheet to its SFX stem, or list the generators.

    npm run sfx -- films/<name>     films/<name>/audio/cues.py + timeline.json → audio/sfx.wav
    npm run sfx -- --list           generators and what each is for

A cue sheet is a Python file with score(mix, tl). Every time comes from `tl`
(the film's timeline.json, the same file index.html imports), so retiming the
timeline retimes the sound.
"""

import argparse
import importlib.util
import inspect
import json
import os
import sys

from . import synth
from .mix import Mix


def list_generators():
    for name, fn in inspect.getmembers(synth, inspect.isfunction):
        if fn.__module__ == synth.__name__ and not name.startswith("_"):
            doc = (fn.__doc__ or "").strip().splitlines()[0] if fn.__doc__ else ""
            print(f"{name}{inspect.signature(fn)}\n    {doc}")


def main():
    ap = argparse.ArgumentParser(prog="npm run sfx --", description="Render films/<name>/audio/cues.py to audio/sfx.wav.")
    ap.add_argument("film", nargs="?", help="film folder, e.g. films/demo")
    ap.add_argument("--list", action="store_true", help="list sound generators and exit")
    args = ap.parse_args()
    if args.list:
        return list_generators()
    if not args.film:
        ap.error("pass a film folder, or --list")

    cues_path = os.path.join(args.film, "audio", "cues.py")
    spec = importlib.util.spec_from_file_location("cues", cues_path)
    cues = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(cues)
    if not hasattr(cues, "score"):
        sys.exit(f"{cues_path} needs a score(mix, tl) function")
    with open(os.path.join(args.film, "timeline.json")) as f:
        tl = json.load(f)

    mix = Mix(tl["duration"], seed=getattr(cues, "SEED", 11))
    cues.score(mix, tl)
    out = os.path.join(args.film, "audio", "sfx.wav")
    peak = mix.write(out)
    clip = " (soft-clipped: lower some gains)" if peak > 1 else ""
    print(f"✔ {out} ({tl['duration']}s, {mix.count} sounds, peak {peak:.2f}{clip})")


if __name__ == "__main__":
    main()
