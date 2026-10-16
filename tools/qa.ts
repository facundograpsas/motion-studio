// Measured QA for a seek(t) film: what the eye misses in contact sheets, checked numerically.
// node tools/qa.ts films/<name> [--format 9x16|1x1|16x9|4x5|all] [--fps 10] [--scale 0.5] [--hold 1.5]
// Layout (every fillText/strokeText is recorded, blocks or not): text cut by the frame, text crowding
//   the edge, texts on top of each other, text across the border of a card or chip, low contrast
//   against the real pixels behind them.
// Reading: every text stays on screen at least max(0.7 s, 0.25 + chars/17).
// Frames: empty frames, holds where nothing moves for longer than --hold seconds.
// Seam gate (each scene `from` in timeline.json): empty frames at the cut, a side at rest (dead beat),
//   direction or Z sign flipping across the cut.
// Writes films/<name>/out/qa/<format>/report.md + report.json + one marked PNG per issue.
// Exit code 1 when there are errors (warnings don't fail).
import { chromium, type Page } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { extname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const FORMATS: Record<string, [number, number]> = { '9x16': [1080, 1920], '1x1': [1080, 1080], '16x9': [1920, 1080], '4x5': [1080, 1350] };
const { positionals, values: opt } = parseArgs({
  allowPositionals: true,
  options: {
    format: { type: 'string', default: '9x16' },
    fps: { type: 'string', default: '10' },
    scale: { type: 'string', default: '0.5' },
    hold: { type: 'string', default: '1.5' },
  },
});
const filmDir = positionals[0];
if (!filmDir) { console.error('usage: node tools/qa.ts films/<name> [--format 9x16|all] [--fps 10]'); process.exit(1); }
const ROOT = resolve(import.meta.dirname, '..'), film = resolve(filmDir);
const FPS = Number(opt.fps), SCALE = Number(opt.scale), HOLD = Number(opt.hold);
const formats = opt.format === 'all' ? ['9x16', '1x1', '16x9'] : [opt.format!];

const MIME: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.wav': 'audio/wav', '.mp4': 'video/mp4',
};
const server = createServer(async (req, res) => {
  const path = join(ROOT, decodeURIComponent(new URL(req.url!, 'http://x').pathname));
  if (!path.startsWith(ROOT)) return res.writeHead(403).end();
  const body = await readFile(path).catch(() => null);
  if (!body) return res.writeHead(404).end();
  if (extname(path) === '.ts') return res.writeHead(200, { 'content-type': 'text/javascript' }).end(stripTypeScriptTypes(body.toString()));
  res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' }).end(body);
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const port = (server.address() as { port: number }).port;

// Scene boundaries: every top-level timeline.json object with from/to; the cut is its `from`
const TL = JSON.parse(await readFile(join(film, 'timeline.json'), 'utf8').catch(() => '{}')); // older films have none: no seam gate
const cuts: { id: string; t: number }[] = Object.entries(TL)
  .filter(([, v]: [string, any]) => v && typeof v === 'object' && typeof v.from === 'number' && typeof v.to === 'number' && v.from > 0)
  .map(([id, v]: [string, any]) => ({ id, t: v.from }));
const nearCut = (t: number, pad = 0.4) => cuts.some((c) => Math.abs(t - c.t) < pad);

// ---- In-page probes ----------------------------------------------------------
// Records the box of every text drawn on a full-frame canvas (the main canvas or a full-size layer;
// layers composite at identity outside seams, and seams are skipped).
function hookText(size: { W: number; H: number }) {
  const w = window as any;
  w.__qaText = []; w.__qaOn = false;
  // canvas of each recorded text, so a later opaque fillRect / clearRect over it hides it (a veil, a new scene)
  const owner = new WeakMap<object, any>();
  const box = (ctx: any, x: number, y: number, x2: number, y2: number) => {
    const T = ctx.getTransform(), xs: number[] = [], ys: number[] = [];
    for (const px of [x, x2]) for (const py of [y, y2]) { xs.push(T.a * px + T.c * py + T.e); ys.push(T.b * px + T.d * py + T.f); }
    return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
  };
  const cover = (ctx: any, r: { x0: number; y0: number; x1: number; y1: number }) => {
    for (const tx of w.__qaText) if (owner.get(tx) === ctx.canvas && tx.x0 >= r.x0 - 1 && tx.y0 >= r.y0 - 1 && tx.x1 <= r.x1 + 1 && tx.y1 <= r.y1 + 1) tx.alpha = 0;
  };
  // boxes: rect/roundRect paths that get filled or stroked (cards, chips) — text must sit inside or outside, not across
  w.__qaBoxes = [];
  const pending = new WeakMap<object, any[]>();
  for (const P of [CanvasRenderingContext2D.prototype, OffscreenCanvasRenderingContext2D.prototype] as any[]) {
    const fillRect = P.fillRect, clearRect = P.clearRect, beginPath = P.beginPath, rect = P.rect, roundRect = P.roundRect, fill = P.fill, stroke = P.stroke;
    P.beginPath = function (this: any) { beginPath.call(this); pending.delete(this); };
    for (const [name, fn] of [['rect', rect], ['roundRect', roundRect]] as const) {
      P[name] = function (this: any, x: number, y: number, rw: number, rh: number, ...rest: any[]) {
        fn.call(this, x, y, rw, rh, ...rest);
        if (w.__qaOn) { const l = pending.get(this) ?? []; l.push(box(this, x, y, x + rw, y + rh)); pending.set(this, l); }
      };
    }
    for (const [name, fn] of [['fill', fill], ['stroke', stroke]] as const) {
      P[name] = function (this: any, ...a: any[]) {
        fn.apply(this, a);
        if (!w.__qaOn || this.globalAlpha < 0.6 || this.canvas.width !== size.W || this.canvas.height !== size.H) return;
        for (const b of pending.get(this) ?? []) w.__qaBoxes.push(b);
        pending.delete(this);
      };
    }
    P.fillRect = function (this: any, x: number, y: number, rw: number, rh: number) {
      fillRect.call(this, x, y, rw, rh);
      const opaque = typeof this.fillStyle !== 'string' || !/rgba\([^)]*,\s*0?\.\d+\)/.test(this.fillStyle);
      if (w.__qaOn && this.globalAlpha >= 0.95 && opaque) cover(this, box(this, x, y, x + rw, y + rh));
    };
    P.clearRect = function (this: any, x: number, y: number, rw: number, rh: number) {
      clearRect.call(this, x, y, rw, rh);
      if (w.__qaOn) cover(this, box(this, x, y, x + rw, y + rh));
    };
    for (const fn of ['fillText', 'strokeText']) {
      const orig = P[fn];
      P[fn] = function (this: any, s: string, x: number, y: number, ...rest: any[]) {
        orig.call(this, s, x, y, ...rest);
        if (!w.__qaOn || !String(s).trim() || this.canvas.width !== size.W || this.canvas.height !== size.H) return;
        const m = this.measureText(s), T = this.getTransform(), paint = this[fn === 'fillText' ? 'fillStyle' : 'strokeStyle'];
        const fontPx = Number((/([\d.]+)px/.exec(this.font) ?? [0, 0])[1]) * Math.sqrt(Math.abs(T.a * T.d - T.b * T.c));
        const tx = { s: String(s), ...box(this, x - m.actualBoundingBoxLeft, y - m.actualBoundingBoxAscent, x + m.actualBoundingBoxRight, y + m.actualBoundingBoxDescent),
          alpha: this.globalAlpha, color: typeof paint === 'string' ? paint : null, px: fontPx };
        owner.set(tx, this.canvas); w.__qaText.push(tx);
      };
    }
  }
}

// Paints frame t and measures it: texts (+ contrast), ink coverage/centroid/spread on a thumbnail,
// and mean change vs the previous call's thumbnail.
function probe(t: number) {
  const w = window as any;
  w.__qaText = []; w.__qaBoxes = []; w.__qaOn = true; w.seek(t); w.__qaOn = false;
  const c = document.getElementById('c') as HTMLCanvasElement, W = c.width, H = c.height;
  const TW = 160, TH = Math.max(1, Math.round(160 * H / W));
  const th = (w.__qaThumb ??= new OffscreenCanvas(TW, TH)).getContext('2d', { willReadFrequently: true })!;
  th.clearRect(0, 0, TW, TH); th.drawImage(c, 0, 0, TW, TH);
  const d = th.getImageData(0, 0, TW, TH).data;
  // background = most common quantized colour
  const hist = new Map<number, number>();
  for (let i = 0; i < d.length; i += 4) { const k = (d[i] >> 4) << 8 | (d[i + 1] >> 4) << 4 | d[i + 2] >> 4; hist.set(k, (hist.get(k) ?? 0) + 1); }
  const bgk = [...hist].sort((a, b) => b[1] - a[1])[0][0];
  const bg = [((bgk >> 8) & 15) * 16 + 8, ((bgk >> 4) & 15) * 16 + 8, (bgk & 15) * 16 + 8];
  let ink = 0, sx = 0, sy = 0, diff = 0, moved = 0, mass = 0;   // mass: how strongly the content shows (fades lower it)
  const prev: Uint8ClampedArray | undefined = w.__qaPrev, inkPts: number[] = [];
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const dd = Math.max(Math.abs(d[i] - bg[0]), Math.abs(d[i + 1] - bg[1]), Math.abs(d[i + 2] - bg[2]));
    mass += dd;
    if (dd > 28) {
      ink++; const x = (p % TW) / TW, y = Math.floor(p / TW) / TH; sx += x; sy += y; inkPts.push(x, y);
    }
    if (prev) {
      const dd = Math.abs(d[i] - prev[i]) + Math.abs(d[i + 1] - prev[i + 1]) + Math.abs(d[i + 2] - prev[i + 2]);
      diff += dd; if (dd > 30) moved++;
    }
  }
  w.__qaPrev = new Uint8ClampedArray(d);
  const cx = ink ? sx / ink : 0.5, cy = ink ? sy / ink : 0.5;
  let spread = 0;
  for (let i = 0; i < inkPts.length; i += 2) spread += Math.hypot(inkPts[i] - cx, inkPts[i + 1] - cy);
  // contrast: text colour vs the median-luminance pixel behind it that isn't text-coloured
  const main = c.getContext('2d')!;
  const parse = (s: string) => s.startsWith('#') ? [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16)).concat(1)
    : (/rgba?\(([^)]+)\)/.exec(s)?.[1].split(',').map(Number) ?? null);
  const lum = (r: number, g: number, b: number) => [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
    .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
  const texts = w.__qaText.map((tx: any) => {
    const col = tx.color && parse(tx.color);
    const x0 = Math.max(0, Math.floor(tx.x0)), y0 = Math.max(0, Math.floor(tx.y0)), x1 = Math.min(W, Math.ceil(tx.x1)), y1 = Math.min(H, Math.ceil(tx.y1));
    let contrast = null;
    if (col && tx.alpha >= 0.9 && x1 - x0 > 2 && y1 - y0 > 2) {
      const px = main.getImageData(x0, y0, x1 - x0, y1 - y0).data, back: [number, number, number, number][] = [];
      for (let i = 0; i < px.length; i += 4) {
        if (Math.abs(px[i] - col[0]) + Math.abs(px[i + 1] - col[1]) + Math.abs(px[i + 2] - col[2]) > 80) back.push([px[i], px[i + 1], px[i + 2], lum(px[i], px[i + 1], px[i + 2])]);
      }
      if (back.length > 0.15 * (px.length / 4)) {
        back.sort((a, b) => a[3] - b[3]);
        const b = back[back.length >> 1], a = (col[3] ?? 1) * tx.alpha;
        const lt = lum(...(col.slice(0, 3).map((v: number, i: number) => a * v + (1 - a) * b[i]) as [number, number, number]));
        contrast = (Math.max(lt, b[3]) + 0.05) / (Math.min(lt, b[3]) + 0.05);
      }
    }
    return { ...tx, contrast };
  });
  const boxes = w.__qaBoxes.filter((b: any) => b.x1 - b.x0 > 4 && b.y1 - b.y0 > 4 && (b.x1 - b.x0) * (b.y1 - b.y0) < 0.9 * W * H);
  return { texts, boxes, ink: ink / (TW * TH), mass: mass / (TW * TH * 255), cx, cy, spread: ink ? spread / ink : 0, diff: prev ? diff / (TW * TH * 3) : null, moved: prev ? moved : null };
}

// Frame t with boxes drawn over the given texts, as a PNG data URL
function marked({ t, boxes }: { t: number; boxes: { x0: number; y0: number; x1: number; y1: number }[] }) {
  (window as any).seek(t);
  const c = document.getElementById('c') as HTMLCanvasElement, o = document.createElement('canvas');
  o.width = c.width; o.height = c.height;
  const x = o.getContext('2d')!; x.drawImage(c, 0, 0);
  x.lineWidth = Math.max(2, c.width / 300); x.strokeStyle = '#ff2a2a'; x.setLineDash([x.lineWidth * 3, x.lineWidth * 2]);
  for (const b of boxes) x.strokeRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
  return o.toDataURL('image/png');
}

// ---- Run ---------------------------------------------------------------------
type Issue = { level: 'error' | 'warn'; kind: string; from: number; to: number; what: string; boxes?: any[] };
const browser = await chromium.launch();
let errors = 0;

for (const fmt of formats) {
  const [fw, fh] = FORMATS[fmt] ?? (() => { throw new Error(`unknown format ${fmt}`); })();
  const W = Math.round(fw * SCALE / 2) * 2, H = Math.round(fh * SCALE / 2) * 2, U = Math.min(W, H) / 100;
  const page: Page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('[film error]', e.message));
  await page.addInitScript(hookText, { W, H });
  await page.goto(`http://127.0.0.1:${port}/${film.slice(ROOT.length + 1)}/index.html?render=1&w=${W}&h=${H}`);
  await page.waitForFunction(() => (window as any).__filmReady !== undefined);
  await page.evaluate(() => (window as any).__filmReady);
  const dur: number = await page.evaluate(() => (window as any).__film.dur);

  // Pass 1: sample the whole film
  const samples: { t: number; r: Awaited<ReturnType<typeof probe>> }[] = [];
  for (let f = 0; f < Math.round(dur * FPS); f++) {
    const t = f / FPS;
    samples.push({ t, r: await page.evaluate(probe, t) });
  }
  const textCount = samples.reduce((a, s) => a + s.r.texts.length, 0);

  // Per-sample findings, keyed so consecutive samples merge into one time range
  const raw: { t: number; key: string; level: Issue['level']; kind: string; what: string; boxes?: any[] }[] = [];
  for (const { t, r } of samples) {
    // first/last frames may be empty on purpose when the piece loops
    if (r.ink < 0.004) raw.push(t < 0.3 || t > dur - 0.5
      ? { t, key: 'empty-ends', level: 'warn', kind: 'vacío', what: 'frame sin contenido (ok solo si la pieza loopea)' }
      : { t, key: 'empty', level: 'error', kind: 'vacío', what: 'frame sin contenido' });
    if (nearCut(t)) continue;
    const vis = r.texts.filter((x: any) => x.alpha >= 0.6);
    for (const x of vis) {
      const label = JSON.stringify(x.s.length > 40 ? x.s.slice(0, 40) + '…' : x.s);
      if (x.x0 < -2 || x.y0 < -2 || x.x1 > W + 2 || x.y1 > H + 2) raw.push({ t, key: `cut:${x.s}`, level: 'error', kind: 'cortado', what: `${label} sale del cuadro`, boxes: [x] });
      else if (Math.min(x.x0, x.y0, W - x.x1, H - x.y1) < 2 * U) raw.push({ t, key: `edge:${x.s}`, level: 'warn', kind: 'borde', what: `${label} a menos de 2u del borde`, boxes: [x] });
      const need = x.px >= 2.2 * U ? 3 : 4.5;
      if (x.contrast !== null && x.contrast < need) raw.push({ t, key: `con:${x.s}`, level: 'warn', kind: 'contraste', what: `${label} contraste ${x.contrast.toFixed(1)}:1 (mín ${need})`, boxes: [x] });
    }
    for (const x of vis) for (const b of r.boxes) {
      const ix = Math.min(x.x1, b.x1) - Math.max(x.x0, b.x0), iy = Math.min(x.y1, b.y1) - Math.max(x.y0, b.y0);
      const inside = x.x0 >= b.x0 - 2 && x.y0 >= b.y0 - 2 && x.x1 <= b.x1 + 2 && x.y1 <= b.y1 + 2;
      if (ix > 2 && iy > 2 && !inside) raw.push({ t, key: `box:${x.s}:${Math.round(b.x0)}`, level: 'error', kind: 'cruza', what: `${JSON.stringify(x.s.slice(0, 30))} cruza el borde de una caja`, boxes: [x, b] });
    }
    for (let i = 0; i < vis.length; i++) for (let j = i + 1; j < vis.length; j++) {
      const a = vis[i], b = vis[j];
      const ix = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), iy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
      if (ix <= 0 || iy <= 0) continue;
      const share = (ix * iy) / Math.min((a.x1 - a.x0) * (a.y1 - a.y0), (b.x1 - b.x0) * (b.y1 - b.y0));
      if (a.s === b.s && share > 0.8) continue; // the same text drawn twice (stroke + fill, shadow pass)
      if (share > 0.15) raw.push({ t, key: `ovl:${a.s}|${b.s}`, level: 'error', kind: 'pisado', what: `${JSON.stringify(a.s.slice(0, 30))} × ${JSON.stringify(b.s.slice(0, 30))}`, boxes: [a, b] });
    }
  }
  const issues: (Issue & { last: number })[] = [];
  const open = new Map<string, Issue & { last: number }>();
  for (const f of raw.sort((a, b) => a.t - b.t)) {
    const cur = open.get(f.key);
    // contrast is a property of the text, not of a moment: one line per text for the whole film
    if (cur && (f.t - cur.last <= 1.5 / FPS || f.kind === 'contraste')) { cur.to = cur.last = f.t; continue; }
    const iss = { level: f.level, kind: f.kind, from: f.t, to: f.t, what: f.what, boxes: f.boxes, last: f.t };
    open.set(f.key, iss); issues.push(iss);
  }
  // a layout problem has to last 2 samples to count (single-frame entry overshoots are not layout)
  const kept: Issue[] = issues.filter((i) => i.kind === 'vacío' || i.to - i.from >= 0.99 / FPS);
  // Reading time: each text must stay readable for max(0.7 s, 0.25 + chars/17) the first time it shows
  // (counters and numbers excluded; a text that comes back was already read)
  const seen = new Map<string, number>(), read = new Set<string>();
  for (const [n, { t, r }] of [...samples, { t: dur, r: { texts: [] } as any }].entries()) {
    const now = new Set<string>(r.texts.filter((x: any) => x.alpha >= 0.6 && /[a-záéíóúñ]{2}/i.test(x.s)).map((x: any) => x.s));
    for (const s of now) if (!seen.has(s)) seen.set(s, t);
    for (const [s, t0] of [...seen]) {
      if (now.has(s)) continue;
      seen.delete(s);
      if (read.has(s)) continue;
      read.add(s);
      const need = Math.max(0.7, 0.25 + s.length / 17), had = t - t0;
      if (had + 0.5 / FPS < need && n < samples.length) kept.push({ level: 'warn', kind: 'lectura', from: t0, to: t,
        what: `${JSON.stringify(s.length > 40 ? s.slice(0, 40) + '…' : s)} visible ${had.toFixed(1)}s, necesita ${need.toFixed(1)}s` });
    }
  }
  // Holds: runs where no pixel of the thumbnail visibly changes (a small packet in flight still counts)
  let holdFrom: number | null = null;
  for (const { t, r } of [...samples, { t: dur, r: { moved: Infinity } as any }]) {
    if (r.moved !== null && r.moved < 3) holdFrom ??= t - 1 / FPS;
    else if (holdFrom !== null) {
      if (t - holdFrom > HOLD) kept.push({ level: 'warn', kind: 'quieto', from: holdFrom, to: t, what: `nada se mueve durante ${(t - holdFrom).toFixed(1)}s` });
      holdFrom = null;
    }
  }

  // Pass 2: seam gate at 60 fps around each cut
  const seams: any[] = [];
  for (const c of cuts) {
    await page.evaluate(() => { (window as any).__qaPrev = undefined; });
    const fr: { t: number; r: any }[] = [];
    for (let k = -12; k < 12; k++) { const t = c.t + k / 60; fr.push({ t, r: await page.evaluate(probe, t) }); }
    const pre = fr.filter((f) => f.t < c.t), post = fr.filter((f) => f.t >= c.t);
    const energy = (fs: typeof fr) => fs.slice(1).reduce((a, f) => a + (f.r.diff ?? 0), 0) / Math.max(1, fs.length - 1);
    // centroid/spread velocity; meaningless while a side is fading through near-empty frames → 0
    const vel = (fs: typeof fr) => {
      const a = fs[0].r, b = fs.at(-1)!.r, dt = fs.at(-1)!.t - fs[0].t;
      return Math.min(a.ink, b.ink) < 0.01 ? { x: 0, y: 0, z: 0 } : { x: (b.cx - a.cx) / dt, y: (b.cy - a.cy) / dt, z: (b.spread - a.spread) / dt };
    };
    const ePre = energy(pre.slice(-4)), ePost = energy(post.slice(0, 5)), vPre = vel(pre.slice(-4)), vPost = vel(post.slice(1, 5));
    const notes: string[] = [];
    // the exit may fade through ≤3 frames (cutCurve dies ~0.02s before the cut); the entry arrives composed
    const emptyPre = pre.filter((f) => f.r.ink < 0.004).length, emptyPost = post.filter((f) => f.r.ink < 0.004).length;
    if (emptyPre > 3) notes.push(`error: la salida pasa ${emptyPre} frames vacía antes del corte`);
    if (emptyPost) notes.push(`error: la escena entrante tiene ${emptyPost} frame(s) vacío(s) (debe llegar compuesta)`);
    // crossfade: not empty (faint ghosts on a light page still count as ink) but most of the content is gone on
    // both sides of the cut. cutCurve dims ~6–7 frames around it (exit ramp + entry at 35 %); a crossfade dims 10+ on both sides.
    // reference: how strongly each scene shows 0.6 s away from the cut (outside any fade)
    const ref = Math.min((await page.evaluate(probe, c.t - 0.6)).mass, (await page.evaluate(probe, Math.min(dur - 0.01, c.t + 0.6))).mass);
    const dim = fr.filter((f) => f.r.mass < 0.35 * ref).length;
    if (ref > 0.002 && dim > 9) notes.push(`error: fundido — ${dim} frames alrededor del corte con menos del 35 % del contraste de las escenas (debe pasar en movimiento)`);
    if (ePre < 0.3) notes.push('warn: la escena saliente llega quieta al corte');
    if (ePost < 0.3) notes.push('warn: la escena entrante arranca quieta');
    const axis = Math.abs(vPre.x) + Math.abs(vPost.x) >= Math.abs(vPre.y) + Math.abs(vPost.y) ? 'x' : 'y';
    if (Math.abs(vPre[axis]) > 0.05 && Math.abs(vPost[axis]) > 0.05 && Math.sign(vPre[axis]) !== Math.sign(vPost[axis])) notes.push(`warn: la dirección en ${axis} se invierte en el corte`);
    if (Math.abs(vPre.z) > 0.08 && Math.abs(vPost.z) > 0.08 && Math.sign(vPre.z) !== Math.sign(vPost.z)) notes.push(`warn: signo Z opuesto (${vPre.z > 0 ? 'crece' : 'se achica'} → ${vPost.z > 0 ? 'crece' : 'se achica'})`);
    for (const n of notes) {
      const level = n.startsWith('error') ? 'error' : 'warn';
      kept.push({ level, kind: 'seam', from: c.t, to: c.t, what: `${c.id}: ${n.replace(/^\w+: /, '')}` });
    }
    seams.push({ id: c.id, t: c.t, energy: [ePre, ePost].map((v) => +v.toFixed(2)), velocity: [vPre, vPost].map((v) => Object.fromEntries(Object.entries(v).map(([k, x]) => [k, +x.toFixed(3)]))), ok: !notes.length });
  }
  kept.sort((a, b) => a.from - b.from);

  // Marked frames + report
  const outDir = join(film, 'out', 'qa', fmt);
  await rm(outDir, { recursive: true, force: true }); await mkdir(outDir, { recursive: true });
  const shots = [...kept.filter((i) => i.boxes && i.level === 'error'), ...kept.filter((i) => i.boxes && i.level === 'warn')].slice(0, 24);
  for (const [n, i] of shots.entries()) {
    const url: string = await page.evaluate(marked, { t: (i.from + i.to) / 2, boxes: i.boxes! });
    const file = `${String(n + 1).padStart(2, '0')}-${i.kind}-${i.from.toFixed(1)}s.png`;
    await writeFile(join(outDir, file), Buffer.from(url.split(',')[1], 'base64'));
    (i as any).png = file;
  }
  await page.close();
  const nErr = kept.filter((i) => i.level === 'error').length, nWarn = kept.length - nErr;
  errors += nErr;
  const range = (i: Issue) => i.from === i.to ? `${i.from.toFixed(2)}s` : `${i.from.toFixed(1)}–${i.to.toFixed(1)}s`;
  const md = [
    `# QA ${filmDir} · ${fmt} (${W}x${H}, ${FPS} fps de muestreo)`, '',
    `**${nErr} errores · ${nWarn} avisos** · ${samples.length} frames · ${textCount ? `${textCount} textos medidos` : 'ningún texto registrado'} · ${cuts.length} cortes`, '',
    '| nivel | qué | cuándo | detalle | frame |', '|---|---|---|---|---|',
    ...kept.map((i) => `| ${i.level} | ${i.kind} | ${range(i)} | ${i.what.replace(/\|/g, '\\|')} | ${(i as any).png ?? ''} |`),
    '', '## Seams', '', '| escena | corte | energía antes/después | velocidad antes → después (x, y, z) | ok |', '|---|---|---|---|---|',
    ...seams.map((s) => `| ${s.id} | ${s.t}s | ${s.energy.join(' / ')} | ${JSON.stringify(s.velocity[0])} → ${JSON.stringify(s.velocity[1])} | ${s.ok ? '✔' : '✘'} |`),
  ].join('\n');
  await writeFile(join(outDir, 'report.md'), md + '\n');
  await writeFile(join(outDir, 'report.json'), JSON.stringify({ format: fmt, W, H, fps: FPS, issues: kept.map(({ boxes, ...i }: any) => i), seams }, null, 1));
  console.log(`${nErr ? '✘' : '✔'} ${fmt}: ${nErr} errores, ${nWarn} avisos → ${join(outDir, 'report.md')}`);
  for (const i of kept.filter((i) => i.level === 'error').slice(0, 12)) console.log(`   ${range(i).padEnd(12)} ${i.kind.padEnd(8)} ${i.what}`);
}
await browser.close();
server.close();
process.exit(errors ? 1 : 0);
