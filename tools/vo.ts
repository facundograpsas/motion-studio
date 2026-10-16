// Voice-over as the film's clock. The whole script is one read, the way a narrator reads it: one ElevenLabs call
// (cached by content). A line whose "gap" is at least `breath` (default 0.6 s) gets a planned pause written into the
// text (<break time="1.2s" />), so the narrator pauses inside the same take — separate calls sound like cuts.
// Only a line with "at" (a fixed start time) starts a separate take. Lines with "take": "takes/x.wav" use that file
// instead — a take chosen by ear (another model, acting tags, several tries); its word timings come from
// ElevenLabs forced alignment, and the line's "gap" is the silence before it.
// Word timings come from the API's character alignment and are cut back into lines; timeline.src.json references
// are resolved into timeline.json.
// node tools/vo.ts films/<name> [--fit]
//   --fit   no API calls: estimate from the words (vo.json "wpm", default 160, + pauses) to check the script fits
// Input  audio/vo.json   { voice, model?, settings?, start?, breath?, wpm?, lines: [{ id, text, gap?, at?, take?, pad? }] }
//        "pad": seconds of extra silence after a line — the take is split in the natural pause and the rest pushed
//        later, so a scene gets room without regenerating an approved read
//        timeline.src.json (optional) — like timeline.json, but any string "@ref" is resolved:
//          "@l3" line start · "@l3.end" line end · "@l3:finds" start of that word (· "#2" second one)
//          "@end" last line's end · any of them + an offset: "@l3:finds+0.2", "@l2.end-0.1"
// Output audio/vo/<id>.mp3 + <id>.json (cache), audio/vo.wav, audio/vo_words.json, timeline.json
// The key is ELEVENLABS_API_KEY in .env (never in a film file).
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const { positionals, values: opt } = parseArgs({ allowPositionals: true, options: { fit: { type: 'boolean', default: false } } });
if (!positionals[0]) { console.error('usage: node tools/vo.ts films/<name> [--fit]'); process.exit(1); }
const ROOT = resolve(import.meta.dirname, '..'), film = resolve(positionals[0]), audio = join(film, 'audio');
const cfg = JSON.parse(readFileSync(join(audio, 'vo.json'), 'utf8'));
const model = cfg.model ?? 'eleven_multilingual_v2';
const settings = cfg.settings ?? { stability: 0.5, similarity_boost: 0.75, style: 0.2 };
type Word = { w: string; key: string; from: number; to: number; at: number }; // at = character index in the text
type Line = { id: string; text: string; from: number; to: number; words: Word[] };

const keyOf = (w: string) => w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9']/g, '');

// Words from a character alignment (times relative to the line's own audio)
function wordsFrom(al: { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] }): Word[] {
  const out: Word[] = [];
  let cur: Word | null = null;
  al.characters.forEach((ch, i) => {
    if (/\s/.test(ch)) { cur = null; return; }
    if (!cur) { cur = { w: '', key: '', from: al.character_start_times_seconds[i], to: 0, at: i }; out.push(cur); }
    cur.w += ch; cur.to = al.character_end_times_seconds[i];
  });
  for (const w of out) w.key = keyOf(w.w);
  return out.filter((w) => w.key);
}

// --fit: estimated words, no audio. wpm words a minute, +0.28 s per sentence end, +0.12 s per comma/dash.
function estimate(text: string) {
  let t = 0, at = 0;
  return text.split(/(\s+)/).flatMap((w) => {
    const i = at; at += w.length;
    if (!w.trim()) return [];
    const from = t; t += 60 / (cfg.wpm ?? 160);
    if (/[.!?…]$/.test(w)) t += 0.28; else if (/[,;:—–-]$/.test(w)) t += 0.12;
    return [{ w, key: keyOf(w), from, to: t - 0.05, at: i }];
  });
}

function apiKey() {
  if (!process.env.ELEVENLABS_API_KEY && existsSync(join(ROOT, '.env'))) process.loadEnvFile(join(ROOT, '.env'));
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error('ELEVENLABS_API_KEY is not set (.env)');
  return key;
}

// A take chosen by ear: word timings from ElevenLabs forced alignment (cached by file content + text)
async function align(file: string, text: string) {
  const bytes = readFileSync(file);
  const hash = createHash('sha1').update(bytes).update(text).digest('hex').slice(0, 12);
  const meta = join(audio, 'vo', `take-${basename(file)}.json`);
  const dur = Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).stdout.toString());
  let aligned: { text: string; start: number; end: number }[], fresh = false;
  const cached = existsSync(meta) ? JSON.parse(readFileSync(meta, 'utf8')) : null;
  if (cached?.hash === hash) aligned = cached.words;
  else {
    const form = new FormData();
    form.append('text', text); form.append('file', new Blob([bytes]), basename(file));
    const r = await fetch('https://api.elevenlabs.io/v1/forced-alignment', { method: 'POST', headers: { 'xi-api-key': apiKey() }, body: form });
    if (!r.ok) throw new Error(`ElevenLabs forced alignment ${r.status} on ${file}: ${(await r.text()).slice(0, 200)}`);
    aligned = (await r.json()).words;
    writeFileSync(meta, JSON.stringify({ hash, text, words: aligned }));
    fresh = true;
  }
  // place each aligned word at its character offset in the text, so takes cut into lines like synthesized ones
  const lower = text.toLowerCase(), words: Word[] = [];
  let cur = 0;
  for (const a of aligned) {
    const w = a.text.trim(), i = w ? lower.indexOf(w.toLowerCase(), cur) : -1;
    if (i < 0 || !keyOf(w)) continue;
    cur = i + w.length;
    words.push({ w, key: keyOf(w), from: a.start, to: a.end, at: i });
  }
  return { words, dur, mp3: file, fresh };
}

async function synth(id: string, text: string, previous: string, next: string) {
  const hash = createHash('sha1').update(JSON.stringify([cfg.voice, model, settings, text, previous, next])).digest('hex').slice(0, 12);
  const meta = join(audio, 'vo', `${id}.json`), mp3 = join(audio, 'vo', `${id}.mp3`);
  if (existsSync(meta) && existsSync(mp3)) {
    const cached = JSON.parse(readFileSync(meta, 'utf8'));
    if (cached.hash === hash) return { words: wordsFrom(cached.alignment), dur: cached.duration, mp3, fresh: false };
  }
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${cfg.voice}/with-timestamps?output_format=mp3_44100_128`, {
    method: 'POST', headers: { 'xi-api-key': apiKey(), 'content-type': 'application/json' },
    body: JSON.stringify({ text, model_id: model, voice_settings: settings, previous_text: previous || undefined, next_text: next || undefined }),
  });
  if (!r.ok) throw new Error(`ElevenLabs ${r.status} on paragraph ${id}: ${(await r.text()).slice(0, 200)}`);
  const d = await r.json();
  writeFileSync(mp3, Buffer.from(d.audio_base64, 'base64'));
  const duration = d.alignment.character_end_times_seconds.at(-1);
  writeFileSync(meta, JSON.stringify({ hash, text, duration, alignment: d.alignment }));
  return { words: wordsFrom(d.alignment), dur: duration, mp3, fresh: true };
}

// ---- Takes: one for the whole script, unless a line pins its start with "at" or uses a take file
mkdirSync(join(audio, 'vo'), { recursive: true });
const breath = cfg.breath ?? 0.6;
const paras: { lines: any[]; gap: number; at?: number; take?: string }[] = [];
for (const [i, l] of cfg.lines.entries()) {
  if (i === 0 || typeof l.at === 'number' || (l.take ?? '') !== (cfg.lines[i - 1].take ?? ''))
    paras.push({ lines: [], gap: l.gap ?? breath, at: l.at, take: l.take });
  paras.at(-1)!.lines.push(l);
}
// the take's text: lines joined by a space, or (synthesized takes) by a written pause before a planned silence
const joinTake = (ls: any[], plain = false) => {
  let text = '';
  const offs = ls.map((l, i) => {
    if (i > 0) text += !plain && (l.gap ?? 0) >= breath ? ` <break time="${Math.min(3, l.gap).toFixed(1)}s" /> ` : ' ';
    const at = text.length; text += l.text; return at;
  });
  return { text, offs };
};
const lines: Line[] = [], clips: { mp3: string; at: number; from?: number; to?: number }[] = [];
let t = cfg.start ?? 0.5, calls = 0;
for (const [p, para] of paras.entries()) {
  if (p > 0) t += para.gap;
  if (typeof para.at === 'number') t = para.at;
  const { text, offs } = joinTake(para.lines, !!para.take);
  let words: Word[], dur: number, take: string | undefined;
  if (opt.fit) {   // estimate each line on its own and add the planned pauses
    words = []; let tt = 0;
    para.lines.forEach((l, i) => {
      if (i > 0) tt += (l.gap ?? 0) >= breath ? l.gap : 0.3;
      for (const w of estimate(l.text)) words.push({ ...w, from: tt + w.from, to: tt + w.to, at: offs[i] + w.at });
      tt = words.at(-1)!.to;
    });
    dur = tt;
  }
  else {
    const prev = paras[p - 1] ? joinTake(paras[p - 1].lines).text : '', next = paras[p + 1] ? joinTake(paras[p + 1].lines).text : '';
    const s = para.take ? await align(join(audio, para.take), text) : await synth(`p${String(p + 1).padStart(2, '0')}`, text, prev, next);
    words = s.words; dur = s.dur; take = s.mp3; calls += +s.fresh;
  }
  // cut the take back into its lines by character offset (the alignment covers the pause tags too; they fall
  // between lines and belong to none)
  const per = para.lines.map((l, i) => words.filter((w) => w.at >= offs[i] && w.at < offs[i] + l.text.length));
  // "pad": extra silence after a line. The take is split in the middle of the natural pause before the next line
  // and the rest is pushed later — the read is never regenerated, only given room to breathe.
  let shift = 0, seg = 0;
  para.lines.forEach((l, i) => {
    const ws = per[i].map((w) => ({ ...w, from: t + shift + w.from, to: t + shift + w.to }));
    lines.push({ id: l.id, text: l.text, from: ws[0]?.from ?? t + shift, to: ws.at(-1)?.to ?? t + shift, words: ws });
    const pad = l.pad ?? 0;
    if (pad > 0 && i < para.lines.length - 1) {
      const cut = ((per[i].at(-1)?.to ?? seg) + (per[i + 1][0]?.from ?? seg)) / 2;
      if (take) clips.push({ mp3: take, at: t + shift + seg, from: seg, to: cut });
      seg = cut;
    }
    shift += pad;
  });
  if (take) clips.push({ mp3: take, at: t + (shift - (para.lines.at(-1).pad ?? 0)) + seg, from: seg });
  t += dur + shift;
}
const end = lines.at(-1)?.to ?? 0;
for (const l of lines) console.log(`${l.id.padEnd(6)} ${l.from.toFixed(2).padStart(6)}–${l.to.toFixed(2).padStart(6)}s  ${l.text.slice(0, 70)}`);
console.log(`${opt.fit ? '≈ estimate' : '✔ voice'}: ${lines.length} lines, ends at ${end.toFixed(2)}s${opt.fit ? '' : ` (${calls} new ElevenLabs calls)`}`);
writeFileSync(join(audio, 'vo_words.json'), JSON.stringify({ estimate: opt.fit, end, lines }, null, 1));

// ---- audio/vo.wav: every line at its place -----------------------------------------------
if (!opt.fit && clips.length) {
  const inputs = clips.flatMap((c) => ['-i', c.mp3]);
  const trim = (c: (typeof clips)[number]) => c.from === undefined ? '' : `atrim=start=${c.from.toFixed(3)}${c.to === undefined ? '' : `:end=${c.to.toFixed(3)}`},asetpts=PTS-STARTPTS,`;
  const fc = clips.map((c, i) => `[${i}]${trim(c)}aresample=48000,aformat=channel_layouts=stereo,adelay=${Math.round(c.at * 1000)}:all=1[v${i}]`).join(';') +
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
