"""Mixer: place sounds on the film's timeline and write the SFX stem.

No loudness mastering here: tools/finalize.ts mixes this stem with the music and
normalizes the sum to -14 LUFS, so gains are relative to score.json's music
(kick ~0.8, bass ~0.2, pad ~0.06). Adapted from whaleyxbt/claude-motion (MIT).
"""

import math
import os
import random
import struct
import wave

from .synth import SR, key


class Mix:
    def __init__(self, duration, seed=11):
        random.seed(seed)
        self.n = int(SR * duration)
        self.left = [0.0] * self.n
        self.right = [0.0] * self.n
        self.count = 0

    def put(self, t, samples, gain=1.0, pan=0.0):
        """Place mono samples at t seconds. pan: -1 left, 0 centre, +1 right (equal power)."""
        ang = (pan + 1) * math.pi / 4
        gl, gr = gain * math.cos(ang), gain * math.sin(ang)
        i0 = int(t * SR)
        for k, s in enumerate(samples[: max(0, self.n - i0)]):
            if i0 + k >= 0:
                self.left[i0 + k] += s * gl
                self.right[i0 + k] += s * gr
        self.count += 1

    def put_stereo(self, t, left, right, gain=1.0):
        """Place a stereo pair (e.g. from synth.pad) at t seconds."""
        i0 = int(t * SR)
        for k, (a, b) in enumerate(zip(left[: max(0, self.n - i0)], right)):
            if i0 + k >= 0:
                self.left[i0 + k] += a * gain
                self.right[i0 + k] += b * gain
        self.count += 1

    def typing(self, start, end, chars, gain=(0.16, 0.26), jitter=0.006, spread=0.3):
        """One keystroke per character, evenly spaced from start to end, humanized."""
        for k in range(chars):
            tk = start + (end - start) * k / chars
            self.put(tk + random.uniform(-jitter, jitter), key(), random.uniform(*gain), random.uniform(-spread, spread))

    def write(self, path):
        """Write a 16-bit stereo WAV with a tanh soft clip (same safety as tools/music.ts). Returns the sample peak."""
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        frames = bytearray()
        for a, b in zip(self.left, self.right):
            frames += struct.pack("<hh", round(math.tanh(a) * 32767), round(math.tanh(b) * 32767))
        with wave.open(path, "wb") as wf:
            wf.setnchannels(2)
            wf.setsampwidth(2)
            wf.setframerate(SR)
            wf.writeframes(bytes(frames))
        return max(max(map(abs, self.left), default=0), max(map(abs, self.right), default=0))
