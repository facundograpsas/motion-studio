// Full pipeline for one film: music (if score.json and no supplied track) → sfx (cues.py, or legacy cues.json) → render → finalize.
// node tools/film.ts films/<name> [--format 9x16|1x1|16x9|all] [any render.ts flag]
import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const film = args[0];
if (!film) { console.error('usage: node tools/film.ts films/<name> [--format 9x16|all] [render flags]'); process.exit(1); }
const dir = resolve(film), audio = join(dir, 'audio'), tools = import.meta.dirname;
const fi = args.indexOf('--format');
const formatArg = fi > 0 ? args[fi + 1] : '9x16';
const passthrough = fi > 0 ? [...args.slice(1, fi), ...args.slice(fi + 2)] : args.slice(1);
const formats = formatArg === 'all' ? ['9x16', '1x1', '16x9'] : [formatArg];

const step = (script: string, ...a: string[]) => {
  const r = spawnSync('node', [join(tools, script), ...a], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

if (existsSync(join(audio, 'track.wav'))) {
  // supplied track wins: measure it so the picture follows the real beats
  const r = spawnSync(join(tools, '..', '.venv', 'bin', 'python'), ['-I', join(tools, 'beats.py'), join(audio, 'track.wav')]);
  if (r.status !== 0) { console.error(r.stderr.toString()); process.exit(1); }
  writeFileSync(join(audio, 'beats.json'), r.stdout);
  console.log('✔ measured audio/track.wav → beats.json');
} else if (existsSync(join(audio, 'score.json'))) {
  step('music.ts', join(audio, 'score.json'), join(audio, 'music.wav'));
}
if (existsSync(join(audio, 'cues.py'))) {
  const r = spawnSync(join(tools, '..', '.venv', 'bin', 'python'), ['-m', 'sfx', dir], { stdio: 'inherit', env: { ...process.env, PYTHONPATH: tools } });
  if (r.status !== 0) process.exit(r.status ?? 1);
} else if (existsSync(join(audio, 'cues.json'))) step('sfx.ts', join(audio, 'cues.json'), join(audio, 'sfx.wav')); // legacy films

for (const f of formats) {
  step('render.ts', film, '--format', f, ...passthrough);
  step('finalize.ts', film, '--format', f);
}
