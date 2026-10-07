// Synthesize UI sound effects from a cue list (step 09).
// node tools/sfx.ts <cues.json> <out.wav>      cues: [{"t":0.5,"type":"click","gain":1}, ...]
// Types: click, pop, thump, whoosh, tick, rise, type (keyboard)
import { readFileSync, writeFileSync } from 'node:fs';

const [cuesPath, outPath] = process.argv.slice(2);
if (!cuesPath || !outPath) { console.error('usage: node tools/sfx.ts <cues.json> <out.wav>'); process.exit(1); }
const SR = 48000;
const cues: { t: number; type: string; gain?: number }[] = JSON.parse(readFileSync(cuesPath, 'utf8'));
const buf = new Float32Array(Math.ceil((Math.max(0, ...cues.map((c) => c.t)) + 2) * SR));

let s = 42; const noise = () => (s = (s * 1664525 + 1013904223) >>> 0) / 2147483648 - 1;
const VOICES: Record<string, [number, (t: number) => number]> = {
  click: [0.05, (t) => Math.sin(2 * Math.PI * 1800 * t) * Math.exp(-t * 90) * 0.5],
  tick: [0.03, (t) => Math.sin(2 * Math.PI * 3200 * t) * Math.exp(-t * 160) * 0.3],
  pop: [0.15, (t) => Math.sin(2 * Math.PI * (600 + 900 * t) * t) * Math.exp(-t * 30) * 0.4],
  thump: [0.5, (t) => Math.sin(2 * Math.PI * (90 - 60 * t) * t) * Math.exp(-t * 9) * 0.9],
  whoosh: [0.35, (t) => noise() * Math.sin(Math.PI * Math.min(1, t / 0.35)) * 0.25],
  rise: [1.0, (t) => (noise() * 0.5 + Math.sin(2 * Math.PI * (200 + 600 * t) * t) * 0.5) * t * 0.25],
  type: [0.04, (t) => noise() * Math.exp(-t * 120) * 0.3],
};
for (const c of cues) {
  const v = VOICES[c.type];
  if (!v) throw new Error(`unknown sfx type "${c.type}" (have: ${Object.keys(VOICES).join(', ')})`);
  const [len, fn] = v, start = Math.floor(c.t * SR), gain = c.gain ?? 1;
  for (let i = 0; i < len * SR && start + i < buf.length; i++) buf[start + i] += fn(i / SR) * gain;
}

const n = buf.length, b = Buffer.alloc(44 + n * 2); // 16-bit mono WAV
b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8);
b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
b.write('data', 36); b.writeUInt32LE(n * 2, 40);
for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, buf[i])) * 32767), 44 + i * 2);
writeFileSync(outPath, b);
console.log(`✔ ${outPath} (${cues.length} cues)`);
