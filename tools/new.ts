// Scaffold a new film from films/_template.
// node tools/new.ts <name> [--dur 15] [--bpm 120]
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const { positionals, values: opt } = parseArgs({
  allowPositionals: true,
  options: { dur: { type: 'string', default: '15' }, bpm: { type: 'string', default: '120' } },
});
const name = positionals[0];
if (!name || !/^[a-z0-9-]+$/.test(name)) { console.error('usage: node tools/new.ts <kebab-name> [--dur 15] [--bpm 120]'); process.exit(1); }
const ROOT = resolve(import.meta.dirname, '..'), dir = join(ROOT, 'films', name);
if (existsSync(dir)) { console.error(`films/${name} already exists`); process.exit(1); }

cpSync(join(ROOT, 'films', '_template'), dir, { recursive: true, filter: (src) => !src.includes('/out') });
for (const d of ['audio', 'docs', 'refs', 'assets']) mkdirSync(join(dir, d), { recursive: true });
const dur = Number(opt.dur), bpm = Number(opt.bpm);

// timeline.json is the film's clock (picture + cues.py): set the duration and stretch the last scene to it
const tlPath = join(dir, 'timeline.json'), tl = JSON.parse(readFileSync(tlPath, 'utf8'));
tl.duration = dur;
const scenes = Object.values(tl).filter((v: any) => typeof v === 'object');
(scenes.at(-1) as any).to = dur;
writeFileSync(tlPath, JSON.stringify(tl, null, 1) + '\n');
writeFileSync(join(dir, 'audio', 'score.json'), JSON.stringify({
  bpm, dur, seed: 1, key: 'A', scale: 'minor', chords: [0, 5, 3, 4],
  sections: [
    { from: 0, to: 2, layers: ['pad', 'kick'] },
    { from: 2, to: dur - 1, layers: ['pad', 'kick', 'hat', 'bass', 'arp'] },
    { from: dur - 1, to: dur, layers: ['pad'] },
  ],
}, null, 1));
writeFileSync(join(dir, 'docs', 'review_log.md'), `# Review log — ${name}\n\n| round | hook | phone read | motion | variety | composition | brand | sound | 3 worst problems |\n|---|---|---|---|---|---|---|---|---|\n`);

console.log(`✔ films/${name} (${dur}s @ ${bpm} BPM)
  stages:   films/${name}/docs/PROGRESS.md   (brief → script → direction → voice → storyboard → build → critics)
  preview:  npm run preview            → http://localhost:5173/films/${name}/
  draft:    npm run draft -- films/${name}
  sfx:      npm run sfx -- films/${name}      (audio/cues.py on timeline.json)
  final:    npm run film -- films/${name}`);
