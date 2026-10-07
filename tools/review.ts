// Review sheets for the critique loop (step 11).
// node tools/review.ts <video.mp4> [--at 4.2] [--fps 2]
// Writes next to the video: contact.png, phone.png, loop_check.mp4, poster.png, strip.png (with --at)
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';

const { positionals, values: opt } = parseArgs({
  allowPositionals: true,
  options: { at: { type: 'string' }, fps: { type: 'string', default: '2' } },
});
const video = positionals[0];
if (!video) { console.error('usage: node tools/review.ts <video.mp4> [--at 4.2]'); process.exit(1); }
const dir = dirname(video);

const ff = (...args: string[]) => {
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${args.join(' ')}`);
};
const dur = Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', video]).stdout.toString());

// Contact sheet: N frames per second, 6 across, read left→right; cell i = i / fps seconds
const fps = Number(opt.fps), n = Math.max(1, Math.ceil(dur * fps)), rows = Math.ceil(n / 6);
ff('-i', video, '-vf', `fps=${fps},scale=270:-1,tile=6x${rows}`,
  '-frames:v', '1', join(dir, 'contact.png'));
// Phone test: how it reads at 360 px wide, 1 fps
ff('-i', video, '-vf', `fps=1,scale=360:-1,tile=5x${Math.ceil(Math.ceil(dur) / 5)}`, '-frames:v', '1', join(dir, 'phone.png'));
// Poster: frame at 40% of the film
ff('-ss', String(dur * 0.4), '-i', video, '-frames:v', '1', join(dir, 'poster.png'));
// Loop check: twice back to back, watch the seam
ff('-stream_loop', '1', '-i', video, '-c', 'copy', join(dir, 'loop_check.mp4'));
// Strip: 12 consecutive frames around a fast action (catch pops and overlaps)
if (opt.at) ff('-ss', String(Math.max(0, Number(opt.at) - 0.1)), '-i', video, '-vf', 'scale=320:-1,tile=12x1', '-frames:v', '1', join(dir, 'strip.png'));

console.log(`✔ review sheets in ${dir}: contact.png phone.png poster.png loop_check.mp4${opt.at ? ' strip.png' : ''}`);
