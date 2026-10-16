// Mix audio, normalize to -14 LUFS, mux with the picture, build review sheets.
// node tools/finalize.ts films/<name> [--format 9x16]
// Inputs (all optional except the video): out/<format>/silent.mp4, audio/music.wav (or track.wav), audio/sfx.wav,
// audio/vo.wav (tools/vo.ts) — with a voice-over the music ducks under it (sidechain), SFX don't
// Output: out/<format>/final.mp4 + contact/phone/poster/loop_check
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const { positionals, values: opt } = parseArgs({ allowPositionals: true, options: { format: { type: 'string', default: '9x16' } } });
if (!positionals[0]) { console.error('usage: node tools/finalize.ts films/<name> [--format 9x16]'); process.exit(1); }
const film = resolve(positionals[0]);
const out = join(film, 'out', opt.format!);
const video = join(out, 'silent.mp4'), final = join(out, 'final.mp4');
if (!existsSync(video)) { console.error(`missing ${video}: run tools/render.ts first`); process.exit(1); }

const run = (cmd: string, args: string[]) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  if (r.status !== 0) { console.error(r.stderr); throw new Error(`${cmd} failed`); }
  return r.stderr;
};

// a supplied track.wav wins over synthesized music.wav
const a = (f: string) => join(film, 'audio', f);
const music = existsSync(a('track.wav')) ? a('track.wav') : a('music.wav');
const tracks = [music, a('sfx.wav'), a('vo.wav')].filter(existsSync);
if (tracks.length === 0) {
  run('ffmpeg', ['-y', '-i', video, '-c', 'copy', final]);
  console.log('⚠ no audio in audio/ — final.mp4 is silent');
} else {
  const inputs = tracks.flatMap((t) => ['-i', t]);
  const idx = (f: string) => tracks.indexOf(f) + 1, hasVo = existsSync(a('vo.wav')), hasMusic = existsSync(music);
  // voice-over present: the music becomes a bed (-7 dB) and ducks further while the voice speaks (sidechain key)
  const duck = hasVo && hasMusic
    ? `[${idx(a('vo.wav'))}:a]asplit=2[vk][vm];[${idx(music)}:a]volume=0.45[mb];[mb][vk]sidechaincompress=threshold=0.02:ratio=8:attack=15:release=400[md];`
    : '';
  const labels = tracks.map((t) => (duck && t === music ? '[md]' : duck && t === a('vo.wav') ? '[vm]' : `[${idx(t)}:a]`));
  const amix = `${duck}${labels.join('')}amix=inputs=${tracks.length}:normalize=0`;
  // two-pass loudnorm: measure, then apply linearly (one pass undershoots on short clips)
  const target = 'I=-14:TP=-1:LRA=11';
  const m = JSON.parse(run('ffmpeg', ['-i', video, ...inputs, '-filter_complex', `${amix},loudnorm=${target}:print_format=json`, '-f', 'null', '-'])
    .match(/\{[^{}]*"input_i"[^{}]*\}/)![0]);
  const mix = `${amix},loudnorm=${target}:linear=true:measured_I=${m.input_i}:measured_TP=${m.input_tp}:` +
    `measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset},aresample=48000[a]`;
  run('ffmpeg', ['-y', '-i', video, ...inputs, '-filter_complex', mix, '-map', '0:v', '-map', '[a]',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-shortest', final]);
  const lufs = run('ffmpeg', ['-i', final, '-af', 'ebur128', '-f', 'null', '-']).match(/I:\s+(-?[\d.]+) LUFS\s*\n\s*Threshold/);
  console.log(`✔ mixed ${tracks.map((t) => t.split('/').pop()).join(' + ')} → ${lufs?.[1] ?? '?'} LUFS integrated`);
}

spawnSync('node', [join(import.meta.dirname, 'review.ts'), final], { stdio: 'inherit' });
console.log(`✔ ${final}`);
