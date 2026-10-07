"""Measure the beat grid of a supplied track (step 09).

Usage: .venv/bin/python tools/beats.py song.wav > films/<name>/audio/beats.json
The film reads this file: state changes on beats, big moments on downbeats, SFX on hits.
"""
import json
import sys

import librosa
import numpy as np


def main(path: str) -> None:
    y, sr = librosa.load(path, sr=None, mono=True)
    tempo, frames = librosa.beat.beat_track(y=y, sr=sr, units="frames")
    beats = librosa.frames_to_time(frames, sr=sr).round(3).tolist()

    onset = librosa.onset.onset_strength(y=y, sr=sr)
    peaks = librosa.util.peak_pick(
        onset, pre_max=3, post_max=3, pre_avg=3, post_avg=5, delta=0.5, wait=10
    )
    json.dump(
        {
            "bpm": float(np.atleast_1d(tempo)[0]),
            "beats": beats,  # state changes go here
            "downbeats": beats[::4],  # big moments go here
            "hits": librosa.frames_to_time(peaks, sr=sr).round(3).tolist(),  # SFX go here
            "duration": round(float(len(y) / sr), 3),
        },
        sys.stdout,
        indent=1,
    )


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("usage: tools/beats.py <song.wav|mp3>")
    main(sys.argv[1])
