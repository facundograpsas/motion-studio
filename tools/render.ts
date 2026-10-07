// Render a seek(t) film to MP4.
// node tools/render.ts films/<name> [--format 9x16|1x1|16x9] [--fps 60] [--sub 4] [--dur N]
//                                   [--from S] [--to S] [--workers 4] [--crf 16] [--draft]
// --draft = half resolution, 30 fps, no motion blur (animatic / fast checks).
// Output: films/<name>/out/<format>/silent.mp4
import { chromium, type Page } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdir, rm, writeFile, stat } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const FORMATS: Record<string, [number, number]> = {
  '9x16': [1080, 1920],
  '1x1': [1080, 1080],
  '16x9': [1920, 1080],
  '4x5': [1080, 1350],
};

const { positionals, values: opt } = parseArgs({
  allowPositionals: true,
  options: {
    format: { type: 'string', default: '9x16' },
    fps: { type: 'string' },
    sub: { type: 'string' },
    dur: { type: 'string' },
    from: { type: 'string', default: '0' },
    to: { type: 'string' },
    workers: { type: 'string', default: '4' },
    crf: { type: 'string', default: '16' },
    draft: { type: 'boolean', default: false },
  },
});

const filmDir = positionals[0];
if (!filmDir) {
  console.error('usage: node tools/render.ts films/<name> [--format 9x16] [--draft] ...');
  process.exit(1);
}
const ROOT = resolve(import.meta.dirname, '..');
const film = resolve(filmDir);
const [fw, fh] = FORMATS[opt.format!] ?? (() => { throw new Error(`unknown format ${opt.format}`); })();
const scale = opt.draft ? 0.5 : 1;
const W = Math.round(fw * scale / 2) * 2, H = Math.round(fh * scale / 2) * 2;
const FPS = Number(opt.fps ?? (opt.draft ? 30 : 60));
const SUB = Number(opt.sub ?? (opt.draft ? 1 : 4));
const WORKERS = Math.max(1, Number(opt.workers));

// Static server over the repo root so films can import /lib/motion.js and fetch beats.json
const MIME: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
  '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf', '.wav': 'audio/wav', '.mp4': 'video/mp4',
};
const server = createServer(async (req, res) => {
  const path = join(ROOT, decodeURIComponent(new URL(req.url!, 'http://x').pathname));
  if (!path.startsWith(ROOT)) return res.writeHead(403).end();
  const body = await readFile(path).catch(() => null);
  if (!body) return res.writeHead(404).end();
  res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' }).end(body);
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const port = (server.address() as { port: number }).port;
const url = `http://127.0.0.1:${port}/${film.slice(ROOT.length + 1)}/index.html?render=1&w=${W}&h=${H}`;

const browser = await chromium.launch();

async function openPage(): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('[film error]', e.message));
  await page.goto(url);
  await page.waitForFunction(() => (window as any).__filmReady !== undefined);
  await page.evaluate(() => (window as any).__filmReady);
  return page;
}

const probe = await openPage();
const filmDur: number = await probe.evaluate(() => (window as any).__film.dur);
const DUR = Number(opt.dur ?? filmDur);
const t0 = Number(opt.from), t1 = Math.min(Number(opt.to ?? DUR), DUR);
// A canvas with id="c" is grabbed directly (fast); otherwise the full page is screenshotted (DOM films)
const hasCanvas = await probe.evaluate(() => document.querySelector('canvas#c') instanceof HTMLCanvasElement);
await probe.close();

const outDir = join(film, 'out', opt.format!);
const tmp = join(outDir, '.segments');
await rm(tmp, { recursive: true, force: true });
await mkdir(tmp, { recursive: true });

const firstFrame = Math.round(t0 * FPS), lastFrame = Math.round(t1 * FPS); // [first, last)
const totalFrames = lastFrame - firstFrame;
const per = Math.ceil(totalFrames / WORKERS);
const started = performance.now();
let done = 0;

async function renderSegment(idx: number, from: number, to: number): Promise<string> {
  const page = await openPage();
  const file = join(tmp, `seg${String(idx).padStart(3, '0')}.mp4`);
  // tmix averages SUB consecutive subframes; select keeps the last of each group (motion blur)
  const vf = SUB > 1
    ? `tmix=frames=${SUB},select='eq(mod(n\\,${SUB})\\,${SUB - 1})',setpts=N/${FPS}/TB`
    : `setpts=N/${FPS}/TB`;
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS * SUB), '-i', '-',
    '-vf', vf, '-r', String(FPS), '-c:v', 'libx264', '-crf', opt.crf!, '-preset', 'medium', '-pix_fmt', 'yuv420p', file],
    { stdio: ['pipe', 'inherit', 'inherit'] });
  const closed = new Promise<number>((r) => ff.on('close', r));
  for (let f = from; f < to; f++) {
    for (let s = 0; s < SUB; s++) {
      // subframes trail the frame time so frame f still ends exactly at t = f / FPS
      const t = (f - (SUB - 1 - s) / SUB) / FPS;
      const png = hasCanvas
        ? Buffer.from(await page.evaluate((tt) => {
            (window as any).seek(Math.max(0, tt));
            return (document.getElementById('c') as HTMLCanvasElement).toDataURL('image/png').split(',')[1];
          }, t), 'base64')
        : (await page.evaluate((tt) => (window as any).seek(Math.max(0, tt)), t), await page.screenshot({ type: 'png' }));
      if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once('drain', r));
    }
    if (++done % FPS === 0) {
      const el = (performance.now() - started) / 1000;
      console.log(`rendered ${(done / FPS).toFixed(0)}s / ${(totalFrames / FPS).toFixed(1)}s  (${(done / el).toFixed(1)} fps)`);
    }
  }
  ff.stdin.end();
  if ((await closed) !== 0) throw new Error(`ffmpeg failed on segment ${idx}`);
  await page.close();
  return file;
}

const jobs: Promise<string>[] = [];
for (let i = 0; i < WORKERS; i++) {
  const from = firstFrame + i * per, to = Math.min(lastFrame, from + per);
  if (from < to) jobs.push(renderSegment(i, from, to));
}
const segments = await Promise.all(jobs);
await browser.close();
server.close();

const list = join(tmp, 'list.txt');
await writeFile(list, segments.map((s) => `file '${s}'`).join('\n'));
const out = join(outDir, 'silent.mp4');
await new Promise<void>((ok, fail) =>
  spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', out], { stdio: 'inherit' })
    .on('close', (c) => (c === 0 ? ok() : fail(new Error('concat failed')))));
await rm(tmp, { recursive: true, force: true });

const secs = ((performance.now() - started) / 1000).toFixed(1);
console.log(`✔ ${out}  ${W}x${H} ${FPS}fps sub=${SUB} ${(t1 - t0).toFixed(2)}s  (${(await stat(out)).size >> 10} KB, ${secs}s)`);
