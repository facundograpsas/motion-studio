// Motion library for seek(t) films. Runs in the browser (ES module).
// Every function here is a pure function of time: no timers, no carried state.

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, p) => a + (b - a) * p;
export const remap = (x, a, b, c = 0, d = 1) => lerp(c, d, clamp((x - a) / (b - a)));

// Closed-form damped spring, 0 → 1. k = stiffness, d = damping.
export function spring(t, k = 170, d = 26) {
  if (t <= 0) return 0;
  const w0 = Math.sqrt(k), z = d / (2 * w0);
  if (z < 1) {
    const wd = w0 * Math.sqrt(1 - z * z);
    return 1 - Math.exp(-z * w0 * t) * (Math.cos(wd * t) + (z * w0 / wd) * Math.sin(wd * t));
  }
  return 1 - Math.exp(-w0 * t) * (1 + w0 * t); // z >= 1 treated as critical
}

// Presets (step 08 of the course)
export const SPRINGS = {
  snappy: [320, 30],  // buttons, toggles, leading edges
  base: [170, 26],    // cards, containers, camera
  heavy: [90, 20],    // big type, 3D objects, logo lockups
  playful: [200, 12], // mascots, stickers (visible overshoot)
};
const sp = (preset) => (Array.isArray(preset) ? preset : SPRINGS[preset] ?? SPRINGS.base);

export const springP = (t, preset = 'base') => spring(t, ...sp(preset));

// A value with several targets: one spring per change, summed. keys: [[time, value], ...]
export function track(t, keys, preset = 'base') {
  const [k, d] = sp(preset);
  let v = keys[0][1];
  for (let i = 1; i < keys.length; i++) v += (keys[i][1] - keys[i - 1][1]) * spring(t - keys[i][0], k, d);
  return v;
}

// Tab indicator that stretches: leading edge stiffer than trailing edge. stops: [[time, x], ...]
export function indicator(t, stops, width = 120) {
  const lead = track(t, stops, 'snappy');
  const trail = track(t, stops, [140, 22]);
  return { left: Math.min(lead, trail), right: Math.max(lead, trail) + width };
}

// Text inside a morphing box: in after the morph starts, out before the next one
export const swapAlpha = (t, tIn, tOut) =>
  Math.min(clamp((t - tIn - 0.08) / 0.12), clamp((tOut - 0.1 - t) / 0.1));

// Seamless loop: pin the last frame to the first
export const loopT = (t, dur) => ((t % dur) + dur) % dur;

// Power eases — for seams only (mirrored in/out so velocity matches at the cut); in-scene motion uses springs
export const powIn = (p, n = 4) => clamp(p) ** n;
export const powOut = (p, n = 4) => 1 - (1 - clamp(p)) ** n;

/**
 * Cut the curve: velocity-matched seam between two scenes at tCut (motion doctrine).
 * Outgoing accelerates (power4.in), cut lands mid-motion, incoming continues the SAME direction
 * and decelerates (power4.out). Partial travel (~12% of the frame), never full off-screen.
 * Returns { out: {x, y, alpha}, in: {x, y, alpha} } — offsets in px along dir ('left'|'right'|'up'|'down').
 */
export function cutCurve(t, tCut, { W, H }, dir = 'left', exit = 0.3, entry = 0.3) {
  const [ax, ay] = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[dir];
  const dist = 0.12 * (ax ? W : H);
  const pe = clamp((t - (tCut - exit)) / exit), pi = clamp((t - tCut) / entry);
  const o = powIn(pe) * dist, i = (1 - powOut(pi)) * dist;
  return {
    out: { x: ax * o, y: ay * o, alpha: t < tCut ? 1 - clamp((t - (tCut - exit)) / (exit - 0.02)) : 0 }, // dies ~0.02s before the cut: no dead air
    in: { x: -ax * i, y: -ay * i, alpha: t < tCut ? 0 : 0.35 + 0.65 * clamp(pi / 0.5) }, // ignites mid-path
  };
}

/**
 * Zoom-through seam. 'push' = everything grows (deeper into the same thought),
 * 'pull' = everything shrinks (arrival / payoff). Never both texts visible; swap at peak blur.
 * Returns { out: {scale, blur, alpha}, in: {scale, blur, alpha} }. blur in px (10 text, 18-20 full frame).
 */
export function zoomThrough(t, tCut, mode = 'push', peakBlur = 10) {
  const pe = clamp((t - (tCut - 0.2)) / 0.2), pi = clamp((t - tCut) / 0.5);
  const [outTo, inFrom] = mode === 'push' ? [1.2, 0.75] : [0.8, 1.25];
  const before = t < tCut;
  return {
    out: { scale: lerp(1, outTo, powIn(pe, 3)), blur: peakBlur * pe, alpha: before ? 1 - 0.85 * pe : 0 },
    in: { scale: lerp(inFrom, 1, powOut(pi, 5)), blur: peakBlur * (1 - powOut(pi, 5)), alpha: before ? 0 : lerp(0.15, 1, powOut(pi, 5)) },
  };
}

// Nudge curve: slow-fast-slow group slide, 0 → 1 over dur. 10% ramp-in / 65% linear burst / 25% long tail.
// Reveal new content during the burst (p ≈ 0.2–0.38 of dur); it masks the appearance.
export function nudge(t, dur = 1) {
  const p = clamp(t / dur);
  if (p < 0.2) return 0.1 * powIn(p / 0.2, 3);
  if (p < 0.38) return 0.1 + 0.65 * ((p - 0.2) / 0.18);
  return 0.75 + 0.25 * powOut((p - 0.38) / 0.62, 4);
}

// Waterfall entry: index i of n elements; returns local time for element i (gaps shrink ×0.84, overlap not queue)
export function waterfall(t, i, gap = 0.05, decay = 0.84) {
  let start = 0;
  for (let k = 0; k < i; k++) start += gap * decay ** k;
  return t - start;
}

// Seeded noise (mulberry32), never Math.random
export function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Beat helpers: beats.json from tools/beats.py or tools/music.ts
export const beatAt = (beats, i) => beats.beats[Math.min(i, beats.beats.length - 1)] ?? i * (60 / (beats.bpm || 120));
export const sinceBeat = (t, beats) => {
  let last = -Infinity;
  for (const b of beats.beats) { if (b > t) break; last = b; }
  return t - last;
};

// Format from the URL (?w=1080&h=1920). Lay scenes out in units, never fixed pixels.
export function format(defaultW = 1080, defaultH = 1920) {
  const q = new URLSearchParams(location.search);
  const W = Number(q.get('w')) || defaultW, H = Number(q.get('h')) || defaultH;
  const u = Math.min(W, H) / 100; // 1u = 1% of the short side
  return { W, H, u, cx: W / 2, cy: H / 2, vertical: H > W, square: W === H, aspect: W / H };
}

export async function loadJSON(path, fallback = null) {
  try { const r = await fetch(path); return r.ok ? await r.json() : fallback; } catch { return fallback; }
}

export const activeScene = (scenes, t) => scenes.find((s) => t >= s.from && t < s.to);

/**
 * Wire a film into the render contract.
 * film: { dur, init?: async () => void, draw: (t) => void }
 * - window.seek(t) paints frame t (used by tools/render.ts)
 * - window.__film = { dur } and window.__filmReady (promise) for the renderer
 * - In a normal browser: live preview with scrubber (space = pause, ←/→ = ±1/60s, [ ] = ±1s)
 */
export function mountFilm(film) {
  window.__film = { dur: film.dur };
  window.__filmReady = (async () => {
    await document.fonts.ready;
    if (film.init) await film.init();
    window.seek = (t) => { film.draw(t); return true; };
  })();
  const q = new URLSearchParams(location.search);
  if (navigator.webdriver || q.has('render')) return;
  window.__filmReady.then(() => preview(film));
}

function preview(film) {
  const bar = document.createElement('div');
  bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;display:flex;gap:8px;align-items:center;padding:6px 10px;background:#000c;color:#fff;font:12px ui-monospace,monospace;z-index:9';
  const input = Object.assign(document.createElement('input'), { type: 'range', min: 0, max: film.dur, step: 1 / 60 });
  input.style.flex = '1';
  const label = document.createElement('span');
  bar.append(input, label);
  document.body.append(bar);
  let playing = true, t = 0, last = performance.now();
  input.oninput = () => { t = Number(input.value); playing = false; };
  addEventListener('keydown', (e) => {
    if (e.code === 'Space') { playing = !playing; e.preventDefault(); }
    if (e.code === 'ArrowRight') { t += 1 / 60; playing = false; }
    if (e.code === 'ArrowLeft') { t -= 1 / 60; playing = false; }
    if (e.code === 'BracketRight') t += 1;
    if (e.code === 'BracketLeft') t -= 1;
  });
  (function loop(now) {
    if (playing) t += (now - last) / 1000;
    last = now;
    t = loopT(t, film.dur);
    film.draw(t);
    input.value = t;
    label.textContent = `${t.toFixed(2)}s / ${film.dur}s ${playing ? '▶' : '⏸'}`;
    requestAnimationFrame(loop);
  })(last);
}
