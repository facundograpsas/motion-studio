// Synthesize an original score on the same timeline as the picture (step 09).
// node tools/music.ts <score.json> <out.wav>
// Writes <out.wav> and beats.json next to it (same shape as tools/beats.py), so the film
// reads the exact grid the music was built on — no measuring needed.
//
// score.json:
// { "bpm": 120, "dur": 16, "seed": 1, "key": "A", "scale": "minor",
//   "chords": [0, 5, 3, 4],                 // scale degrees, one per bar, looped
//   "sections": [                           // which layers play when (seconds)
//     { "from": 0, "to": 2,  "layers": ["pad"] },
//     { "from": 2, "to": 14, "layers": ["pad", "kick", "hat", "bass", "arp"] },
//     { "from": 14, "to": 16, "layers": ["pad"] } ] }
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const [scorePath, outPath] = process.argv.slice(2);
if (!scorePath || !outPath) { console.error('usage: node tools/music.ts <score.json> <out.wav>'); process.exit(1); }
const S = JSON.parse(readFileSync(scorePath, 'utf8'));
const SR = 48000, BPM = S.bpm ?? 120, DUR = S.dur, beat = 60 / BPM, bar = beat * 4;
const L = new Float32Array(Math.ceil(DUR * SR)), R = new Float32Array(L.length);

const NOTES: Record<string, number> = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
const SCALES: Record<string, number[]> = { minor: [0, 2, 3, 5, 7, 8, 10], major: [0, 2, 4, 5, 7, 9, 11], dorian: [0, 2, 3, 5, 7, 9, 10] };
const root = 57 + (NOTES[S.key ?? 'A'] - 9), scale = SCALES[S.scale ?? 'minor'], chords: number[] = S.chords ?? [0, 5, 3, 4];
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
const degree = (d: number, oct = 0) => root + 12 * (oct + Math.floor(d / 7)) + scale[((d % 7) + 7) % 7];

let seed = S.seed ?? 1;
const noise = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2147483648 - 1;
const playing = (layer: string, t: number) => (S.sections ?? [{ from: 0, to: DUR, layers: ['pad', 'kick', 'hat', 'bass', 'arp'] }])
  .some((s: any) => t >= s.from && t < s.to && s.layers.includes(layer));

// add a voice of length `len` at time t0; pan -1..1
function add(t0: number, len: number, pan: number, fn: (t: number) => number) {
  const start = Math.floor(t0 * SR), gl = Math.cos((pan + 1) * Math.PI / 4), gr = Math.sin((pan + 1) * Math.PI / 4);
  for (let i = 0; i < len * SR && start + i < L.length; i++) { const v = fn(i / SR); L[start + i] += v * gl; R[start + i] += v * gr; }
}
const env = (t: number, a: number, r: number, len: number) => Math.min(1, t / a) * Math.min(1, Math.max(0, (len - t) / r));

const beats: number[] = [];
for (let b = 0; b * beat < DUR; b++) {
  const t = b * beat, chord = chords[Math.floor(b / 4) % chords.length];
  beats.push(+t.toFixed(3));
  if (b % 4 === 0 && playing('pad', t)) for (const [i, d] of [0, 2, 4].entries())           // warm detuned triad
    add(t, bar + 0.6, i - 1, (x) => env(x, 0.4, 0.6, bar + 0.6) * 0.06 *
      (Math.sin(2 * Math.PI * hz(degree(chord + d)) * x) + Math.sin(2 * Math.PI * hz(degree(chord + d)) * 1.004 * x)));
  if (playing('kick', t)) add(t, 0.45, 0, (x) => Math.sin(2 * Math.PI * (50 * x + 60 * (1 - Math.exp(-x * 30)) / 30)) * Math.exp(-x * 7) * 0.8);
  if (playing('hat', t)) add(t + beat / 2, 0.06, 0.3, (x) => noise() * Math.exp(-x * 80) * 0.12);
  if (playing('bass', t)) add(t, beat * 0.9, 0, (x) => {
    const f = hz(degree(chord, -2)); return Math.tanh(2 * Math.sin(2 * Math.PI * f * x)) * env(x, 0.005, 0.05, beat * 0.9) * 0.22;
  });
  if (playing('arp', t)) for (let s = 0; s < 2; s++) {                                      // 8th-note arpeggio
    const d = chord + [0, 2, 4, 7][(b * 2 + s) % 4];
    add(t + s * beat / 2, beat / 2, s ? 0.5 : -0.5, (x) => Math.sin(2 * Math.PI * hz(degree(d, 1)) * x) * Math.exp(-x * 9) * 0.1);
  }
}

// soft limiter + 24-bit-ish safety, write 16-bit stereo WAV
const n = L.length, buf = Buffer.alloc(44 + n * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVEfmt ', 8);
buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
for (let i = 0; i < n; i++) {
  buf.writeInt16LE(Math.round(Math.tanh(L[i]) * 32767), 44 + i * 4);
  buf.writeInt16LE(Math.round(Math.tanh(R[i]) * 32767), 46 + i * 4);
}
writeFileSync(outPath, buf);
const grid = { bpm: BPM, beats, downbeats: beats.filter((_, i) => i % 4 === 0), hits: [] };
writeFileSync(join(dirname(outPath), 'beats.json'), JSON.stringify(grid, null, 1));
console.log(`✔ ${outPath} (${DUR}s @ ${BPM} BPM) + beats.json (${beats.length} beats)`);
