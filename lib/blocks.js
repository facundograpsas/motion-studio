// Reusable drawing blocks for seek(t) films: the helpers every film used to copy by hand, plus
// a few composed pieces (counter, bars, pill, cursor, device). Pure functions of their inputs.
//   const B = blocks(g, F, { PAL, UI, DISPLAY });
//   B.txt('Hola', x, y, { size: 4 }); B.counter(t, [[0, 0], [k.count, 745]], x, y, { size: 9 });
// Sizes are in u (1% of the short side), like format(). tools/qa.ts reads every fillText, so
// layout checks work whether a film uses these blocks or not.
import { clamp, track, springP, powOut } from './motion.js';

export const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
export const rgba = (c, a) => `rgba(${hex(c).join(',')},${a})`;
// spring → opacity that is fully on early in the spring (arrivals are binary-on, not fades)
export const on = (s) => clamp(s * 1.7);

export function blocks(g, F, { PAL = {}, UI = 'sans-serif', DISPLAY = UI, MONO = 'monospace', locale = 'es-AR' } = {}) {
  const { u } = F;
  const ink = PAL.ink ?? '#111', bg = PAL.bg ?? '#fff', accent = PAL.accent ?? ink;
  const fmtInt = (n) => Math.round(n).toLocaleString(locale);

  function setFont(size, weight = 500, font = UI) { g.font = `${weight} ${size * u}px ${font}`; g.letterSpacing = '0px'; }
  function measure(s, size, weight = 500, font = UI, ls = 0) {
    setFont(size, weight, font); g.letterSpacing = `${ls}px`;
    const w = g.measureText(s).width; g.letterSpacing = '0px'; return w;
  }
  function txt(s, x, y, { size = 3, weight = 500, color = ink, align = 'left', font = UI, alpha = 1, ls = 0, baseline = 'alphabetic' } = {}) {
    if (alpha <= 0) return;
    g.save(); g.globalAlpha *= clamp(alpha); g.fillStyle = color; setFont(size, weight, font);
    g.textAlign = align; g.textBaseline = baseline; g.letterSpacing = `${ls}px`; g.fillText(s, x, y); g.restore();
  }
  // largest size ≤ size at which s fits in maxW (labels that must never clip)
  const fit = (s, maxW, size, weight = 500, font = UI) => Math.min(size, size * maxW / Math.max(1, measure(s, size, weight, font)));
  function wrap(s, maxW, size, weight = 500, font = UI) {
    const lines = [];
    let line = '';
    for (const w of s.split(/\s+/)) {
      const next = line ? `${line} ${w}` : w;
      if (line && measure(next, size, weight, font) > maxW) { lines.push(line); line = w; } else line = next;
    }
    if (line) lines.push(line);
    return lines;
  }
  // wrapped paragraph; returns its height in px. lead = line height in multiples of size
  function para(s, x, y, maxW, opts = {}) {
    const { size = 3, weight = 500, font = UI, lead = 1.3 } = opts;
    const lines = wrap(s, maxW, size, weight, font);
    lines.forEach((l, i) => txt(l, x, y + i * size * lead * u, opts));
    return lines.length * size * lead * u;
  }
  function rr(x, y, w, h, r, fill, stroke, lw = 0.2) {
    g.beginPath(); g.roundRect(x, y, w, h, Math.max(0, Math.min(r, h / 2, w / 2)));
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw * u; g.stroke(); }
  }
  function circle(x, y, r, fill, alpha = 1) {
    g.save(); g.globalAlpha *= alpha; g.fillStyle = fill; g.beginPath(); g.arc(x, y, Math.max(0, r), 0, Math.PI * 2); g.fill(); g.restore();
  }
  // one-shot ripple that ignites on a hit (tl = time since the hit)
  function ring(x, y, r, tl, color = accent, lw = 0.25) {
    if (tl < 0 || tl > 0.7) return;
    const p = powOut(tl / 0.7, 3);
    g.save(); g.strokeStyle = rgba(color, 0.9 * (1 - p)); g.lineWidth = lw * u;
    g.beginPath(); g.arc(x, y, r * (1 + 1.4 * p), 0, Math.PI * 2); g.stroke(); g.restore();
  }
  // rubber stamp that slams in (overshoot on scale, no fade)
  function stamp(s, x, y, tl, { size = 3, color = accent, rot = -0.12, font = UI } = {}) {
    if (tl < 0) return;
    const k = 1 + 0.6 * (1 - springP(tl, 'playful')), w = measure(s, size, 800, font) + 2.4 * size * u / 3, h = size * 1.6 * u;
    g.save(); g.translate(x, y); g.rotate(rot); g.scale(k, k);
    rr(-w / 2, -h / 2, w, h, 0.6 * u, null, color, 0.35);
    txt(s, 0, 0, { size, weight: 800, color, align: 'center', baseline: 'middle', font, ls: 1 });
    g.restore();
  }
  // chip with auto width; returns { w, h } so callers can lay out next to it
  function pill(s, x, y, { size = 2.2, fill = accent, color = bg, align = 'left', weight = 700, font = UI, pad = 1.6, alpha = 1 } = {}) {
    const w = measure(s, size, weight, font) + 2 * pad * u, h = size * 2 * u;
    const x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    g.save(); g.globalAlpha *= alpha; rr(x0, y - h / 2, w, h, h / 2, fill);
    txt(s, x0 + w / 2, y, { size, weight, color, align: 'center', baseline: 'middle', font });
    g.restore();
    return { w, h };
  }
  // number that springs between targets and LANDS on them: within half a unit it snaps, so a
  // count to 12 never sits at 11 on an asymptote. keys: [[time, value], ...]
  function counter(t, keys, x, y, { preset = 'heavy', format = fmtInt, prefix = '', suffix = '', ...o } = {}) {
    let v = track(t, keys, preset);
    const target = keys.filter(([k]) => k <= t).at(-1)?.[1] ?? keys[0][1];
    if (Math.abs(v - target) < 0.5) v = target;
    txt(`${prefix}${format(v)}${suffix}`, x, y, { font: o.font ?? DISPLAY, weight: 700, ...o, ls: o.ls ?? 0 });
    return v;
  }
  // bar chart in the box (x, y, w, h). data: [{ label, value, color? }]. Bars grow on a waterfall
  // from t0; labels sit under the bars, values ride the bar tops. horizontal = rows instead of columns.
  function bars(t, x, y, w, h, data, { t0 = 0, gap = 0.06, max, horizontal = false, size = 2, color = accent, labelColor = PAL.ink2 ?? ink, valueFmt = fmtInt } = {}) {
    const top = max ?? Math.max(...data.map((d) => d.value)), n = data.length;
    data.forEach((d, i) => {
      const s = springP(t - t0 - i * gap * 0.84 ** i, 'base'), v = d.value * clamp(s, 0, 1.05), c = d.color ?? color;
      if (horizontal) {
        const rowH = h / n, bh = rowH * 0.56, by = y + i * rowH, labelW = w * 0.3, bw = (w - labelW - 8 * u) * v / top;
        txt(d.label, x + labelW - u, by + bh / 2, { size, color: labelColor, align: 'right', baseline: 'middle' });
        rr(x + labelW, by, Math.max(0, bw), bh, Math.min(bh / 2, 0.8 * u), c);
        txt(valueFmt(v), x + labelW + bw + u, by + bh / 2, { size, weight: 700, align: 'left', baseline: 'middle', alpha: on(s) });
      } else {
        const colW = w / n, bw = colW * 0.6, bx = x + i * colW + (colW - bw) / 2, bh = (h - 5 * size * u) * v / top, base = y + h - 2.4 * size * u;
        rr(bx, base - bh, bw, Math.max(0, bh), Math.min(bw / 2, 0.8 * u), c);
        txt(valueFmt(v), bx + bw / 2, base - bh - 0.8 * u, { size, weight: 700, align: 'center', alpha: on(s) });
        txt(d.label, bx + bw / 2, base + 1.4 * size * u, { size: fit(d.label, colW * 0.95, size), color: labelColor, align: 'center' });
      }
    });
  }
  // pointer at its hotspot (x, y). press = time since the last click (≥0 dips the cursor and fires a ripple)
  function cursor(x, y, { press = -1, scale = 1, fill = ink, stroke = bg } = {}) {
    const dip = press >= 0 ? 1 - 0.18 * Math.sin(Math.PI * clamp(press / 0.18)) : 1, s = 3.4 * u * scale * dip;
    if (press >= 0) ring(x, y, 2.2 * u * scale, press, accent, 0.35);
    g.save(); g.translate(x, y); g.scale(s, s);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(0, 1.25); g.lineTo(0.3, 0.97); g.lineTo(0.52, 1.42); g.lineTo(0.7, 1.34);
    g.lineTo(0.48, 0.9); g.lineTo(0.88, 0.88); g.closePath();
    g.lineJoin = 'round'; g.lineWidth = 0.09; g.strokeStyle = stroke; g.fillStyle = fill; g.stroke(); g.fill();
    g.restore();
  }
  // flat device frame; drawScreen(sx, sy, sw, sh) paints the screen, clipped to it. w = device width
  function device(kind, x, y, w, drawScreen, { body = '#111', alpha = 1 } = {}) {
    g.save(); g.globalAlpha *= alpha;
    if (kind === 'phone') {
      const h = w * 2.05, b = w * 0.045, r = w * 0.16;
      rr(x, y, w, h, r, body);
      g.beginPath(); g.roundRect(x + b, y + b, w - 2 * b, h - 2 * b, r - b); g.clip();
      drawScreen(x + b, y + b, w - 2 * b, h - 2 * b);
      g.restore(); g.save(); g.globalAlpha *= alpha;
      rr(x + w * 0.36, y + b * 1.6, w * 0.28, w * 0.075, w * 0.04, body); // island
    } else {
      const h = w * 0.62, b = w * 0.025;
      rr(x, y, w, h, w * 0.02, body);
      g.beginPath(); g.rect(x + b, y + b, w - 2 * b, h - 2 * b); g.clip();
      drawScreen(x + b, y + b, w - 2 * b, h - 2 * b);
      g.restore(); g.save(); g.globalAlpha *= alpha;
      rr(x - w * 0.08, y + h, w * 1.16, w * 0.03, w * 0.012, body); // base
    }
    g.restore();
  }

  return { u, fmtInt, setFont, measure, txt, fit, wrap, para, rr, circle, ring, stamp, pill, counter, bars, cursor, device };
}
