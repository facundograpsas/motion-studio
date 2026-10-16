// Voice-over as the film's clock. One ElevenLabs call per line (cached by content), word timings from the
// API's character alignment, lines laid end to end, and timeline.src.json references resolved into timeline.json.
// node tools/vo.ts films/<name> [--fit]
//   --fit   no API calls: estimate each line from its words (~150 wpm + pauses) to check the script fits
// Input  audio/vo.json   { voice, model?, settings?, start?, gap?, lines: [{ id, text, gap?, at? }] }
//        timeline.src.json (optional) — like timeline.json, but any string "@ref" is resolved:
//          "@l3" line start · "@l3.end" line end · "@l3:finds" start of that word (· "#2" second one)
//          "@end" last line's end · any of them + an offset: "@l3:finds+0.2", "@l2.end-0.1"
// Output audio/vo/<id>.mp3 + <id>.json (cache), audio/vo.wav, audio/vo_words.json, timeline.json
// The key is ELEVENLABS_API_KEY in .env (never in a film file).
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const { positionals, values: opt } = parseArgs({ allowPositionals: true, options: { fit: { type: 'boolean', default: false } } });
if (!positionals[0]) { console.error('usage: node tools/vo.ts films/<name> [--fit]'); process.exit(1); }
const ROOT = resolve(import.meta.dirname, '..'), film = resolve(positionals[0]), audio = join(film, 'audio');
const cfg = JSON.parse(readFileSync(join(audio, 'vo.json'), 'utf8'));
const model = cfg.model ?? 'eleven_multilingual_v2';
const settings = cfg.settings ?? { stability: 0.5, similarity_boost: 0.75, style: 0.2 };
type Word = { w: string; key: string; from: number; to: number };
type Line = { id: string; text: string; from: number; to: number; words: Word[] };

const keyOf = (w: string) => w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9']/g, '');

// Words from a character alignment (times relative to the line's own audio)
function wordsFrom(al: { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] }): Word[] {
  const out: Word[] = [];
  let cur: Word | null = null;
  al.characters.forEach((ch, i) => {
    if (/\s/.test(ch)) { cur = null; return; }
    if (!cur) { cur = { w: '', key: '', from: al.character_start_times_seconds[i], to: 0 }; out.push(cur); }
    cur.w += ch; cur.to = al.character_end_times_seconds[i];
  });
  for (const w of out) w.key = keyOf(w.w);
  return out.filter((w) => w.key);
}

// --fit: estimated words, no audio. 150 wpm, +0.28 s per sentence end, +0.12 s per comma/dash.
function estimate(text: string) {
  let t = 0;
  return text.split(/\s+/).filter(Boolean).map((w) => {
    const from = t; t += 60 / 150;
    if (/[.!?…]$/.test(w)) t += 0.28; else if (/[,;:—–-]$/.test(w)) t += 0.12;
    return { w, key: keyOf(w), from, to: t - 0.05 };
  });
}

async function synth(id: string, text: string) {
  const hash = createHash('sha1').update(JSON.stringify([cfg.voice, model, settings, text])).digest('hex').slice(0, 12);
  const meta = join(audio, 'vo', `${id}.json`), mp3 = join(audio, 'vo', `${id}.mp3`);
  if (existsSync(meta) && existsSync(mp3)) {
    const cached = JSON.parse(readFileSync(meta, 'utf8'));
    if (cached.hash === hash) return { words: wordsFrom(cached.alignment), dur: cached.duration, mp3, fresh: false };
  }
  if (!process.env.ELEVENLABS_API_KEY && existsSync(join(ROOT, '.env'))) process.loadEnvFile(join(ROOT, '.env'));
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error('ELEVENLABS_API_KEY is not set (.env)');
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${cfg.voice}/with-timestamps?output_format=mp3_44100_128`, {
    method: 'POST', headers: { 'xi-api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({ text, model_id: model, voice_settings: settings }),
  });
  if (!r.ok) throw new Error(`ElevenLabs ${r.status} on line ${id}: ${(await r.text()).slice(0, 200)}`);
  const d = await r.json();
  writeFileSync(mp3, Buffer.from(d.audio_base64, 'base64'));
  const duration = d.alignment.character_end_times_seconds.at(-1);
  writeFileSync(meta, JSON.stringify({ hash, text, duration, alignment: d.alignment }));
  return { words: wordsFrom(d.alignment), dur: duration, mp3, fresh: true };
}

// ---- Lay the lines end to end --------------------------------------------------
mkdirSync(join(audio, 'vo'), { recursive: true });
const lines: Line[] = [], clips: { mp3: string; at: number }[] = [];
let t = cfg.start ?? 0.5, calls = 0;
for (const [i, l] of cfg.lines.entries()) {
  if (i > 0) t += l.gap ?? cfg.gap ?? 0.35;
  if (typeof l.at === 'number') t = l.at;
  let words: Word[], dur: number;
  if (opt.fit) { words = estimate(l.text); dur = words.at(-1)?.to ?? 0; }
  else { const s = await synth(l.id, l.text); words = s.words; dur = s.dur; clips.push({ mp3: s.mp3, at: t }); calls += +s.fresh; }
  lines.push({ id: l.id, text: l.text, from: t, to: t + dur, words: words.map((w) => ({ ...w, from: t + w.from, to: t + w.to })) });
  t += dur;
}
const end = lines.at(-1)?.to ?? 0;
for (const l of lines) console.log(`${l.id.padEnd(6)} ${l.from.toFixed(2).padStart(6)}–${l.to.toFixed(2).padStart(6)}s  ${l.text.slice(0, 70)}`);
console.log(`${opt.fit ? '≈ estimate' : '✔ voice'}: ${lines.length} lines, ends at ${end.toFixed(2)}s${opt.fit ? '' : ` (${calls} new ElevenLabs calls)`}`);
writeFileSync(join(audio, 'vo_words.json'), JSON.stringify({ estimate: opt.fit, end, lines }, null, 1));

// ---- audio/vo.wav: every line at its place -----------------------------------------------
if (!opt.fit && clips.length) {
  const inputs = clips.flatMap((c) => ['-i', c.mp3]);
  const fc = clips.map((c, i) => `[${i}]aresample=48000,aformat=channel_layouts=stereo,adelay=${Math.round(c.at * 1000)}:all=1[v${i}]`).join(';') +
    ';' + clips.map((_, i) => `[v${i}]`).join('') + `amix=inputs=${clips.length}:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=7,aresample=48000,apad=whole_dur=${(end + 1).toFixed(2)}[out]`; // speech at -16 LUFS
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', fc, '-map', '[out]', join(audio, 'vo.wav')], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  console.log(`✔ ${join(audio, 'vo.wav')}`);
}

// ---- timeline.src.json → timeline.json --------------------------------------------------
const src = join(film, 'timeline.src.json');
if (existsSync(src)) {
  const byId = Object.fromEntries(lines.map((l) => [l.id, l]));
  const ref = (s: string): number => {
    const m = /^@([\w-]+)(?:\.(end))?(?::([^#+\-]+)(?:#(\d+))?)?([+-][\d.]+)?$/.exec(s);
    if (!m) throw new Error(`bad reference ${s}`);
    const [, id, isEnd, word, nth, off] = m;
    let v: number;
    if (id === 'end') v = end;
    else {
      const l = byId[id]; if (!l) throw new Error(`${s}: no line "${id}" in vo.json`);
      if (word) {
        const hits = l.words.filter((w) => w.key === keyOf(word)), w = hits[(Number(nth) || 1) - 1];
        if (!w) throw new Error(`${s}: "${word}" not in line ${id} (${l.words.map((x) => x.key).join(' ')})`);
        v = isEnd ? w.to : w.from;
      } else v = isEnd ? l.to : l.from;
    }
    return Math.round((v + Number(off ?? 0)) * 1000) / 1000;
  };
  const walk = (x: any): any => typeof x === 'string' && x.startsWith('@') ? ref(x)
    : Array.isArray(x) ? x.map(walk) : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, walk(v)])) : x;
  writeFileSync(join(film, 'timeline.json'), JSON.stringify(walk(JSON.parse(readFileSync(src, 'utf8'))), null, 1) + '\n');
  console.log(`✔ timeline.src.json → timeline.json`);
}
