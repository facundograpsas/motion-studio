// Routes, motion profiles and footsteps: how an actor moves through the world without sliding.
// Distance along a route is the master clock of locomotion: wheel spin = distance / radius, and a planted
// foot is a fixed world point until the body has travelled past it. All pure functions of t.
import { spring } from '../motion.js';
import type { V2, V3 } from './iso.ts';

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));

// ---- Routes: polylines in grid units with rounded corners, parametrised by arc length ----------------
export interface RoutePoint { p: V2; heading: number; curvature: number }
export interface Route { L: number; at: (s: number) => RoutePoint }
type Seg = { len: number; at: (d: number) => RoutePoint };

export function route(pts: V2[], radius = 0.5): Route {
  const segs: Seg[] = [], dir = (a: V2, b: V2): V2 => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
  const line = (a: V2, b: V2) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), [dx, dy] = dir(a, b), heading = Math.atan2(dy, dx);
    if (len > 1e-9) segs.push({ len, at: (d) => ({ p: [a[0] + dx * d, a[1] + dy * d], heading, curvature: 0 }) });
  };
  let start = pts[0];
  for (let i = 1; i < pts.length - 1; i++) {
    const din = dir(pts[i - 1], pts[i]), dout = dir(pts[i], pts[i + 1]);
    const turn = Math.atan2(din[0] * dout[1] - din[1] * dout[0], din[0] * dout[0] + din[1] * dout[1]);
    const room = Math.min(Math.hypot(pts[i][0] - start[0], pts[i][1] - start[1]), Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]) / 2);
    const tan = Math.min(radius * Math.tan(Math.abs(turn) / 2), room), r = tan / (Math.tan(Math.abs(turn) / 2) || 1);
    const a: V2 = [pts[i][0] - din[0] * tan, pts[i][1] - din[1] * tan];
    line(start, a);
    if (Math.abs(turn) > 1e-6) {
      const sg = Math.sign(turn), c: V2 = [a[0] - din[1] * sg * r, a[1] + din[0] * sg * r];
      const a0 = Math.atan2(a[1] - c[1], a[0] - c[0]), h0 = Math.atan2(din[1], din[0]);
      segs.push({ len: Math.abs(turn) * r, at: (d) => { const ang = a0 + sg * d / r; return { p: [c[0] + r * Math.cos(ang), c[1] + r * Math.sin(ang)], heading: h0 + sg * d / r, curvature: sg / r }; } });
    }
    start = [pts[i][0] + dout[0] * tan, pts[i][1] + dout[1] * tan];
  }
  line(start, pts[pts.length - 1]);
  const L = segs.reduce((a, s) => a + s.len, 0);
  return {
    L,
    at(s) {
      let d = clamp(s, 0, L);
      for (const sg of segs) { if (d <= sg.len) return sg.at(d); d -= sg.len; }
      return segs[segs.length - 1].at(segs[segs.length - 1].len);
    },
  };
}

// ---- Motion profiles: distance s(t), speed v(t), acceleration a(t) ---------------------------------
export interface Motion { s: (t: number) => number; v: (t: number) => number; a: (t: number) => number; D: number }

// Walk/drive at a steady pace with cosine ramps at both ends (ramp r = fraction of the time at each end).
// audio cue sheets reproduce this exact curve to place footsteps on the plants.
export function cruise(t0: number, t1: number, D: number, r = 0.22): Motion {
  const T = t1 - t0, vmax = D / (T * (1 - r)), ta = r * T;
  const at = (t: number): [number, number, number] => {
    const tau = t - t0;
    if (tau <= 0) return [0, 0, 0];
    if (tau >= T) return [D, 0, 0];
    if (tau < ta) { const q = tau / ta; return [vmax * ta * (q - Math.sin(Math.PI * q) / Math.PI) / 2, vmax * (1 - Math.cos(Math.PI * q)) / 2, vmax * Math.PI / (2 * ta) * Math.sin(Math.PI * q)]; }
    if (tau < T - ta) return [vmax * ta / 2 + vmax * (tau - ta), vmax, 0];
    const q = (tau - (T - ta)) / ta;
    return [vmax * ta / 2 + vmax * (T - 2 * ta) + vmax * ta * (q + Math.sin(Math.PI * q) / Math.PI) / 2, vmax * (1 + Math.cos(Math.PI * q)) / 2, -vmax * Math.PI / (2 * ta) * Math.sin(Math.PI * q)];
  };
  return { s: (t) => at(t)[0], v: (t) => at(t)[1], a: (t) => at(t)[2], D };
}

// Distance keys [[t, s], ...]: monotone cubic through them, at rest at both ends (Fritsch–Butland tangents).
// Interior keys set where the actor is when (a corner at a beat, the start of braking at a beat).
export function keyed(keys: [number, number][]): Motion {
  const n = keys.length, h = keys.slice(1).map((k, i) => k[0] - keys[i][0]), dl = keys.slice(1).map((k, i) => (k[1] - keys[i][1]) / h[i]);
  const m = keys.map((_, i) => {
    if (i === 0 || i === n - 1 || dl[i - 1] * dl[i] <= 0) return 0;
    const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1];
    return (w1 + w2) / (w1 / dl[i - 1] + w2 / dl[i]);
  });
  const at = (t: number): [number, number, number] => {
    if (t <= keys[0][0]) return [keys[0][1], 0, 0];
    if (t >= keys[n - 1][0]) return [keys[n - 1][1], 0, 0];
    let i = 0; while (t > keys[i + 1][0]) i++;
    const H = h[i], x = (t - keys[i][0]) / H, [s0, s1, m0, m1] = [keys[i][1], keys[i + 1][1], m[i] * H, m[i + 1] * H];
    const s = (2 * x ** 3 - 3 * x ** 2 + 1) * s0 + (x ** 3 - 2 * x ** 2 + x) * m0 + (-2 * x ** 3 + 3 * x ** 2) * s1 + (x ** 3 - x ** 2) * m1;
    const v = ((6 * x ** 2 - 6 * x) * s0 + (3 * x ** 2 - 4 * x + 1) * m0 + (-6 * x ** 2 + 6 * x) * s1 + (3 * x ** 2 - 2 * x) * m1) / H;
    const a = ((12 * x - 6) * s0 + (6 * x - 4) * m0 + (-12 * x + 6) * s1 + (6 * x - 2) * m1) / (H * H);
    return [s, v, a];
  };
  return { s: (t) => at(t)[0], v: (t) => at(t)[1], a: (t) => at(t)[2], D: keys[n - 1][1] };
}

// Spring-filtered signal: what a body on a spring does when its input moves (a van body pitching against
// acceleration, a camera trailing its subject). Convolution with the spring's step response, so still a
// pure function of t. k/d as in springs(); win must cover the settle time.
export function follow(t: number, f: (t: number) => number, k = 60, d = 12, win = 1.6, n = 40): number {
  let y = 0, prev = 0;
  for (let i = 1; i <= n; i++) {
    const tau = (i / n) * win, sNow = spring(tau, k, d);
    y += (sNow - prev) * f(t - tau + win / n / 2); prev = sNow;
  }
  return y + (1 - prev) * f(t - win);
}

// ---- Footsteps -------------------------------------------------------------------------------------
// The walk is planned in distance: n = round(D / step) equal steps (so the last plant lands exactly on D).
// Step k (right foot on odd k, left on even) carries its foot from plant k − 2 to plant k = k·h: it lifts
// when the body passes (k − 2 + duty)·h and lands at (k − duty)·h. duty 0.5 = a walk (one foot always
// down); below ~0.4 both feet leave the ground between steps = a run. The first step starts at s = 0 from
// feet together and a closing step brings the trailing foot alongside at D. A planted foot never moves.
export interface Foot { p: V3; heading: number }
export interface Gait { feet: [Foot, Foot]; swing: number; bob: number }  // feet [left (+side), right]; swing −1…1 for the arms; bob 0…1 (1 = top of the bounce)

export function footsteps(rt: Route, D = rt.L, step = 0.32, width = 0.1, lift = 0.07, duty = 0.5) {
  const finite = Number.isFinite(D), n = finite ? Math.max(1, Math.round(D / step)) : Infinity, h = finite ? D / n : step;
  const plant = (k: number) => Math.min(Math.max(0, k * h), D);
  const footAt = (s: number, side: number, up = 0): Foot => {
    const r = rt.at(s), w = (side * width) / 2;
    return { p: [r.p[0] - Math.sin(r.heading) * w, r.p[1] + Math.cos(r.heading) * w, up], heading: r.heading };
  };
  const swingFoot = (from: number, to: number, side: number, q: number): [Foot, number] => {
    const e = (1 - Math.cos(Math.PI * clamp(q))) / 2;
    return [footAt(from + (to - from) * e, side, Math.sin(Math.PI * clamp(q)) * lift * clamp((to - from) / h * 2)), from + (to - from) * e];
  };
  // last regular step of each foot; the foot whose last step is n − 1 takes the closing step
  const lastOf = (side: number) => (((n % 2 === 1) === (side < 0)) ? n : n - 1);
  const foot = (s: number, side: number): [Foot, number] => {
    if (finite && s >= D) return [footAt(D, side), D];
    if (finite && lastOf(side) === n - 1 && s >= (n - 1 + duty) * h) return swingFoot(plant(n - 1), D, side, (s - (n - 1 + duty) * h) / (D - (n - 1 + duty) * h));
    let k = Math.floor(s / h + 2 - duty);
    if ((k % 2 === 1) !== (side < 0)) k--;                     // this foot's parity
    if (finite) k = Math.min(k, lastOf(side));
    if (k < (side < 0 ? 1 : 2)) return [footAt(0, side), 0];  // has not moved yet
    const s0 = Math.max(0, (k - 2 + duty) * h), s1 = (k - duty) * h;
    if (s >= s1) return [footAt(plant(k), side), plant(k)];
    return swingFoot(plant(k - 2), plant(k), side, (s - s0) / (s1 - s0));
  };
  const runs = duty < 0.45;
  return (s: number): Gait => {
    s = Math.max(0, s);
    const [l, dl] = foot(s, 1), [r, dr] = foot(s, -1), c = Math.cos((2 * Math.PI * s) / h);
    const settle = finite && s >= D ? 0 : 1;
    return { feet: [l, r], swing: clamp((dl - dr) / h, -1, 1), bob: settle * (runs ? 0.5 - 0.5 * c : 0.5 + 0.5 * c) };
  };
}
