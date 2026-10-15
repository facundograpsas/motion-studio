// Vehicle rig on the 2.5D iso kit: a delivery van and a small traffic car, flat-shaded with the city light.
// A body is one or more convex side profiles (x forward, z up) extruded across the width, so every part is a
// convex solid that needs no face sorting. Decals (windows, stripe, wordmark, door, lamps, wheel arches) are
// painted in the plane of the face they sit on and clipped to it, so they turn with the body and never pop.
// Pure function of its inputs: the caller drives every value from t (wheel = distance / wheelR, never skids).
import type { V3, Ctx, Iso } from './iso.ts';
import { VIEW, add, mul, dot, norm, frame, poly, onPlane, disc, shade, mix, rgba, lightK } from './iso.ts';

export type XZ = [number, number];

export interface VehiclePart {
  profile: XZ[];                 // convex side profile (x forward, z up), counter-clockwise
  halfWidth: number;             // extruded ±halfWidth on local y
  paint: 'body' | 'cabin';       // 'body' carries stripe, wordmark, door, arches and lamps
  glass?: number[];              // profile edges (i → i+1) painted as glass: windshield, rear window
  windows?: XZ[][];              // side windows (x, z), painted on both sides
  logo?: { x: number; z: number; h: number };   // wordmark centre and height on the sides (cargo box)
  panel?: XZ[];                  // livery panel behind the wordmark (x, z); painted when look.panel is set
}
export interface VehicleSpec {
  len: number; wid: number; parts: VehiclePart[];
  wheelR: number; wheelX: [number, number]; wheelY: number;   // wheelX = [rear, front] axle x
  door: { x0: number; x1: number; z0: number; z1: number } | null;   // driver door on the local −y side, hinged at its FRONT edge x1
  lights: { head: [number, number]; tail: [number, number] };        // z ranges of head / tail lamps
  tyreW?: number;                // tyre width (default 0.09)
  archR?: number;                // wheel-arch radius (default 1.2 × wheelR)
  stripe?: [number, number];     // z range of the accent stripe along the lower sides
  rearDoors?: boolean;           // split seam on the rear face (cargo doors)
}
export interface VehicleLook {
  body: string; accent: string; glass: string;
  logo?: Path2D[];               // wordmark paths (SVG units), white on the cargo sides
  logoBox?: [number, number, number, number];   // the paths' viewBox [x, y, w, h]; required with logo
  logoInk?: string;              // default white
  panel?: string;                // livery panel colour behind the wordmark (optional)
}
export interface VehicleState {
  pos: [number, number];         // ground point under the body centre
  heading: number;               // radians, 0 = +gx
  wheel: number;                 // wheel spin angle = distance travelled / wheelR
  pitch?: number;                // + = nose dips (braking); body only, pivot at axle height
  roll?: number;
  steer?: number;                // front wheel yaw (radians)
  door?: number;                 // driver door 0 closed … 1 open (≈ 95° outward)
  lights?: number;               // headlights 0…1 (lamps + light pool on the ground, composite 'lighter')
  brake?: number;                // tail lamps brighten 0…1
  ground?: boolean;              // false: shadow + light pool already drawn by vehicleGround() in the film's ground pass
}

// ---- specs (world units: a person is 0.72 tall, a lane is 1 wide) ------------------------------------------
const VAN_PROFILE: XZ[] = [[-0.725, 0.1], [0.725, 0.1], [0.725, 0.36], [0.68, 0.44], [0.4, 0.84], [-0.725, 0.86]];
export const VAN: VehicleSpec = {
  len: 1.45, wid: 0.72,
  parts: [{
    profile: VAN_PROFILE, halfWidth: 0.36, paint: 'body',
    glass: [3],                                                            // windshield
    windows: [[[0.2, 0.5], [0.593, 0.5], [0.397, 0.78], [0.2, 0.78]]],     // cab window, follows the A-pillar
    logo: { x: -0.31, z: 0.53, h: 0.15 },
    panel: [[-0.725, 0.4], [0.07, 0.4], [0.02, 0.66], [-0.725, 0.66]],
  }],
  wheelR: 0.13, wheelX: [-0.45, 0.47], wheelY: 0.34, tyreW: 0.09, archR: 0.158,
  door: { x0: 0.16, x1: 0.5, z0: 0.12, z1: 0.8 },
  lights: { head: [0.26, 0.33], tail: [0.2, 0.44] },
  stripe: [0.175, 0.215], rearDoors: true,
};
export const CAR: VehicleSpec = {
  len: 1.1, wid: 0.6,
  parts: [
    { profile: [[-0.55, 0.09], [0.55, 0.09], [0.55, 0.26], [0.5, 0.32], [0.16, 0.37], [-0.5, 0.37], [-0.55, 0.32]], halfWidth: 0.3, paint: 'body' },
    {
      profile: [[-0.46, 0.37], [0.16, 0.37], [-0.02, 0.6], [-0.36, 0.61], [-0.47, 0.5]], halfWidth: 0.25, paint: 'cabin',
      glass: [1, 3],                                                       // windshield, hatch window
      windows: [
        [[-0.16, 0.42], [0.086, 0.42], [-0.03, 0.565], [-0.16, 0.565]],
        [[-0.2, 0.42], [-0.2, 0.565], [-0.37, 0.565], [-0.437, 0.5], [-0.428, 0.42]],
      ],
    },
  ],
  wheelR: 0.11, wheelX: [-0.34, 0.35], wheelY: 0.26, tyreW: 0.085, archR: 0.135,
  door: null,
  lights: { head: [0.19, 0.24], tail: [0.23, 0.29] },
};

// Recommended looks on the night ground '#0A1A3D' (add `logo: Path2D[]` and its `logoBox` from a wordmark SVG)
export const VAN_LOOK: VehicleLook = { body: '#E9EEF8', accent: '#43BECB', glass: '#1B2F5C', panel: '#14428E' };
export const CAR_LOOK: VehicleLook = { body: '#6F86B8', accent: '#14428E', glass: '#1B2F5C' };

// ---- palette (night city) -----------------------------------------------------------------------------------
const TYRE = '#141A2A', SIDEWALL = '#1F2840', RIM = '#B7C2D8', HUB = '#4A5674', WELL = '#081230', INTERIOR = '#0A1433';
const SEAT = '#22356A', TRIM = '#1C2C55', GRILLE = '#121B33', LAMP = '#C9D3E8', HOT = '#FFF1CF', WARM = '#FFD58A';
const RED = '#FF4D5E', SHADOW = '#020817', SKY = '#8EB6F8', WHITE = '#FFFFFF';
const DOOR_OPEN = (95 * Math.PI) / 180, DOOR_T = 0.035;

type Frame = ReturnType<typeof frame>;
const c01 = (x: number) => Math.min(1, Math.max(0, x));
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
// iso.ts shade()/mix() take '#rrggbb' but return 'rgb()', so they cannot be chained: these return hex
const hexRGB = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const toHex = (v: number[]) => '#' + v.map((x) => Math.round(Math.min(255, Math.max(0, x))).toString(16).padStart(2, '0')).join('');
const mixHex = (a: string, b: string, p: number) => { const A = hexRGB(a), B = hexRGB(b); return toHex(A.map((v, i) => v + (B[i] - v) * c01(p))); };
const shadeHex = (c: string, k: number) => toHex(hexRGB(c).map((v) => v * k));

// ---- 2D helpers in a face plane (x, z) ----------------------------------------------------------------------
const area2 = (p: XZ[]) => p.reduce((a, q, i) => { const r = p[(i + 1) % p.length]; return a + q[0] * r[1] - r[0] * q[1]; }, 0) / 2;
function path2(g: Ctx, pts: XZ[]) { g.beginPath(); pts.forEach(([x, z], i) => (i ? g.lineTo(x, z) : g.moveTo(x, z))); g.closePath(); }
function fill2(g: Ctx, pts: XZ[], color: string) { path2(g, pts); g.fillStyle = color; g.fill(); }

// Sutherland–Hodgman: subject ∩ convex clip polygon (keeps the subject's winding)
function clipConvex(subject: XZ[], clip: XZ[]): XZ[] {
  const sgn = area2(clip) > 0 ? 1 : -1;
  let out = subject;
  for (let i = 0; i < clip.length && out.length; i++) {
    const a = clip[i], b = clip[(i + 1) % clip.length];
    const side = (p: XZ) => sgn * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]));
    const inp = out; out = [];
    for (let j = 0; j < inp.length; j++) {
      const p = inp[j], q = inp[(j + 1) % inp.length], sp = side(p), sq = side(q);
      if (sp >= 0) out.push(p);
      if ((sp >= 0) !== (sq >= 0)) { const t = sp / (sp - sq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
    }
  }
  return out;
}
function segCircle(a: XZ, b: XZ, c: XZ, r: number): number[] {
  const dx = b[0] - a[0], dz = b[1] - a[1], fx = a[0] - c[0], fz = a[1] - c[1];
  const A = dx * dx + dz * dz, B = 2 * (fx * dx + fz * dz), C = fx * fx + fz * fz - r * r, D = B * B - 4 * A * C;
  if (D <= 0 || A === 0) return [];
  const s = Math.sqrt(D);
  return [(-B - s) / (2 * A), (-B + s) / (2 * A)].filter((t) => t > 1e-9 && t < 1 - 1e-9);
}
// A counter-clockwise polygon minus a disc (the door around its wheel arch): the boundary goes round the disc clockwise
function cutDisc(pts: XZ[], c: XZ, r: number): XZ[] {
  const n = pts.length, inside = (p: XZ) => Math.hypot(p[0] - c[0], p[1] - c[1]) < r;
  const s = pts.findIndex((p) => !inside(p));
  if (s < 0) return [];
  const out: XZ[] = [];
  let entry: XZ | null = null;
  for (let k = 0; k < n; k++) {
    const a = pts[(s + k) % n], b = pts[(s + k + 1) % n];
    if (!entry) out.push(a);
    for (const t of segCircle(a, b, c, r)) {
      const p: XZ = [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
      if (!entry) { entry = p; continue; }
      const a0 = Math.atan2(entry[1] - c[1], entry[0] - c[0]), a1 = Math.atan2(p[1] - c[1], p[0] - c[0]);
      const sweep = (((a0 - a1) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI), steps = Math.max(2, Math.ceil(sweep / 0.12));
      for (let i = 0; i <= steps; i++) { const an = a0 - (sweep * i) / steps; out.push([c[0] + r * Math.cos(an), c[1] + r * Math.sin(an)]); }
      entry = null;
    }
  }
  return out;
}

// ---- 3D helpers -----------------------------------------------------------------------------------------------
// Newell normal: outward for a counter-clockwise (seen from outside) polygon, robust to collinear points
function newell(pts: V3[]): V3 {
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    x += (a[1] - b[1]) * (a[2] + b[2]); y += (a[2] - b[2]) * (a[0] + b[0]); z += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return norm([x, y, z]);
}
function trace(g: Ctx, iso: Iso, pts: V3[]) {
  g.beginPath(); pts.forEach((q, i) => { const [x, y] = iso.p(q); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath();
}
// How squarely a face looks at the camera (0 edge-on … 1): fades effects that are not clipped to their face
const facingK = (n: V3) => c01((dot(n, VIEW) / Math.sqrt(3)) * 4);

const archR = (spec: VehicleSpec) => spec.archR ?? spec.wheelR * 1.2;
const lampW = (hw: number) => Math.min(0.12, hw * 0.3);

// Door outline in (x, z): the door rectangle inside the body profile, minus the wheel arches
function doorShape(spec: VehicleSpec) {
  const d = spec.door!, rect: XZ[] = [[d.x0, d.z0], [d.x1, d.z0], [d.x1, d.z1], [d.x0, d.z1]];
  const convex = clipConvex(rect, spec.parts[0].profile);
  let outline = convex;
  for (const x of spec.wheelX) outline = cutDisc(outline, [x, spec.wheelR], archR(spec));
  const windows = (spec.parts[0].windows ?? []).map((w) => clipConvex(w, convex)).filter((w) => w.length >= 3);
  return { outline, windows };
}

// ---- pieces -----------------------------------------------------------------------------------------------------
function shadow(g: Ctx, iso: Iso, fw: Frame, spec: VehicleSpec) {
  onPlane(g, iso, fw.at(0, 0, 0), fw.dir(1, 0, 0), fw.dir(0, 1, 0), () => {
    const L = spec.len / 2, Wd = spec.wid / 2;
    for (const [m, a] of [[0.09, 0.15], [0.035, 0.24]]) {
      g.beginPath(); g.roundRect(-L - m, -Wd - m, 2 * (L + m), 2 * (Wd + m), 0.1 + m); g.fillStyle = rgba(SHADOW, a); g.fill();
    }
  });
}

function headPool(g: Ctx, iso: Iso, fw: Frame, spec: VehicleSpec, lights: number) {
  const x0 = spec.len / 2, hw = spec.wid / 2;
  g.save(); g.globalCompositeOperation = 'lighter';
  onPlane(g, iso, fw.at(0, 0, 0), fw.dir(1, 0, 0), fw.dir(0, 1, 0), () => {
    // beam fan from the lamps, then a pool where it lands
    const lin = g.createLinearGradient(x0, 0, x0 + 1.7, 0);
    lin.addColorStop(0, rgba(WARM, 0.2 * lights)); lin.addColorStop(1, rgba(WARM, 0));
    g.beginPath(); g.moveTo(x0, -hw + 0.08); g.lineTo(x0 + 1.7, -hw - 0.42); g.lineTo(x0 + 1.7, hw + 0.42); g.lineTo(x0, hw - 0.08); g.closePath();
    g.fillStyle = lin; g.fill();
    g.save(); g.translate(x0 + 0.85, 0); g.scale(0.9, 0.62);
    const rad = g.createRadialGradient(0, 0, 0, 0, 0, 1);
    rad.addColorStop(0, rgba(WARM, 0.26 * lights)); rad.addColorStop(0.55, rgba(WARM, 0.1 * lights)); rad.addColorStop(1, rgba(WARM, 0));
    g.beginPath(); g.arc(0, 0, 1, 0, Math.PI * 2); g.fillStyle = rad; g.fill();
    g.restore();
  });
  g.restore();
}

// One wheel: a stack of discs along the axle from `from` to `to` (offsets from the tyre centre, + = outward),
// then, when `face`, the sidewall with rim, hub and spokes turned by `spin` (top of the wheel rolls forward).
function wheelPass(g: Ctx, iso: Iso, fw: Frame, spec: VehicleSpec, x: number, sgn: number, spin: number, steer: number, from: number, to: number, face: boolean) {
  const R = spec.wheelR, tw = spec.tyreW ?? 0.09, cs = Math.cos(steer), ss = Math.sin(steer);
  const c = fw.at(x, sgn * spec.wheelY, R), axle = fw.dir(-ss * sgn, cs * sgn, 0), fwd = fw.dir(cs, ss, 0), up = fw.dir(0, 0, 1);
  const outward = dot(axle, VIEW) > 0;                     // the outer sidewall looks at the camera
  const [a, b] = outward ? [from, to] : [to, from];         // paint far end first
  const n = Math.max(1, Math.ceil((Math.abs(to - from) / tw) * 7));
  for (let i = 0; i <= n; i++) disc(g, iso, add(c, mul(axle, lerp(a, b, i / n))), axle, R, TYRE);
  if (!face || Math.abs(Math.abs(b) - tw / 2) > 1e-9) return;  // a sidewall only at a real end of the tyre, not at the cut
  const fc = add(c, mul(axle, b));
  disc(g, iso, fc, axle, R * 0.94, SIDEWALL);
  if (!outward) { disc(g, iso, fc, axle, R * 0.4, HUB); return; }   // back of the wheel: no rim face
  const k = lightK(axle);
  disc(g, iso, fc, axle, R * 0.62, shade(RIM, k));
  onPlane(g, iso, fc, mul(fwd, R), mul(up, R), () => {
    g.fillStyle = shade(HUB, k);
    for (let i = 0; i < 5; i++) {
      const an = spin + (i * 2 * Math.PI) / 5, sx = Math.sin(an), cz = Math.cos(an), px = cz, pz = -sx, w = 0.075;
      g.beginPath();
      g.moveTo(sx * 0.2 + px * w, cz * 0.2 + pz * w); g.lineTo(sx * 0.56 + px * w, cz * 0.56 + pz * w);
      g.lineTo(sx * 0.56 - px * w, cz * 0.56 - pz * w); g.lineTo(sx * 0.2 - px * w, cz * 0.2 - pz * w);
      g.closePath(); g.fill();
    }
    g.beginPath(); g.arc(0, 0, 0.2, 0, Math.PI * 2); g.fillStyle = shade(HUB, k * 0.8); g.fill();
  });
}

interface Ctx3 { g: Ctx; iso: Iso; fb: Frame; spec: VehicleSpec; look: VehicleLook; door: number; lights: number; brake: number; shape: ReturnType<typeof doorShape> | null }

// Decals on a side face (plane y = ±hw), coordinates (x, z)
function sideDecals(c: Ctx3, part: VehiclePart, sgn: number, k: number) {
  const { g, iso, fb, spec, look } = c, hw = part.halfWidth, y = sgn * hw;
  // wordmark orientation: never mirrored on screen (one side reads front→back, the other back→front)
  const [ox, oy] = iso.p(fb.at(0, y, 0)), [ax, ay] = iso.p(fb.at(1, y, 0)), [bx, by] = iso.p(fb.at(0, y, 1));
  const flip = (ax - ox) * (by - oy) - (ay - oy) * (bx - ox) > 0 ? -1 : 1;
  onPlane(g, iso, fb.at(0, y, 0), fb.dir(1, 0, 0), fb.dir(0, 0, 1), () => {
    for (const w of part.windows ?? []) fill2(g, w, shade(look.glass, k));
    if (part.paint !== 'body') return;
    if (spec.stripe) { g.fillStyle = shade(look.accent, k); g.fillRect(-spec.len, spec.stripe[0], 2 * spec.len, spec.stripe[1] - spec.stripe[0]); }
    if (part.logo && look.logo && look.logoBox) {
      if (part.panel && look.panel) fill2(g, part.panel, shade(look.panel, k));
      const [vx, vy, vw, vh] = look.logoBox, s = part.logo.h / vh;
      g.save(); g.translate(part.logo.x, part.logo.z); g.scale(flip * s, -s); g.translate(-(vx + vw / 2), -(vy + vh / 2));
      g.fillStyle = shade(look.logoInk ?? WHITE, 0.55 + 0.45 * Math.min(1, k)); for (const p of look.logo) g.fill(p);
      g.restore();
    }
    const sh = c.shape, d = spec.door;
    if (sh && d) {
      if (sgn < 0 && c.door > 0) {                         // open: the cab interior where the door was
        fill2(g, sh.outline, INTERIOR);
        g.save(); path2(g, sh.outline); g.clip();
        for (const w of sh.windows) fill2(g, w, shade(look.glass, 0.75));   // far window seen through the cab
        fill2(g, [[d.x0 + 0.03, 0.3], [d.x0 + 0.16, 0.3], [d.x0 + 0.13, 0.42], [d.x0 + 0.1, 0.68], [d.x0 + 0.04, 0.7]], SEAT);
        g.restore();
      } else {                                              // closed driver door, and the passenger door opposite
        path2(g, sh.outline); g.strokeStyle = shade(look.body, k * 0.6); g.lineWidth = 0.012; g.stroke();
        g.fillStyle = shade(look.body, k * 0.55); g.fillRect(d.x0 + 0.035, 0.5, 0.06, 0.018);
      }
    }
    g.fillStyle = WELL;
    for (const x of spec.wheelX) { g.beginPath(); g.arc(x, spec.wheelR, archR(spec), 0, Math.PI * 2); g.fill(); }
  });
}

// Decals on the vertical front / rear face (plane x = x0), coordinates (y, z)
function endDecals(c: Ctx3, part: VehiclePart, x0: number, front: boolean, z0: number, z1: number, k: number) {
  const { g, iso, fb, spec, look, lights, brake } = c, hw = part.halfWidth, lw = lampW(hw);
  onPlane(g, iso, fb.at(x0, 0, 0), fb.dir(0, 1, 0), fb.dir(0, 0, 1), () => {
    g.fillStyle = shade(mixHex(look.body, GRILLE, 0.7), k); g.fillRect(-hw, z0, 2 * hw, 0.06);          // bumper
    if (front) {
      const [h0, h1] = spec.lights.head, gi = hw - 0.06 - lw;
      g.fillStyle = shade(GRILLE, k); g.fillRect(-gi, h0 - 0.05, 2 * gi, h1 - h0 + 0.05);           // grille
      g.fillStyle = mix(shadeHex(LAMP, k), HOT, lights);
      for (const s of [-1, 1]) g.fillRect(s > 0 ? hw - 0.03 - lw : -hw + 0.03, h0, lw, h1 - h0);
    } else {
      const [t0, t1] = spec.lights.tail, tw = lw * 0.6, lvl = Math.max(0.25 + 0.5 * lights, brake);
      if (spec.rearDoors) {
        g.strokeStyle = shade(look.body, k * 0.6); g.lineWidth = 0.012;
        g.beginPath(); g.moveTo(0, z0 + 0.06); g.lineTo(0, z1 - 0.04); g.stroke();
        g.fillStyle = shade(look.body, k * 0.55); g.fillRect(-0.06, 0.45, 0.045, 0.018); g.fillRect(0.015, 0.45, 0.045, 0.018);
      }
      g.fillStyle = mix(mixHex(shadeHex(RED, 0.4), RED, lvl), '#FF8A95', brake);
      for (const s of [-1, 1]) g.fillRect(s > 0 ? hw - 0.025 - tw : -hw + 0.025, t0, tw, t1 - t0);
    }
  });
}

// Windshield / rear window: glass with a pillar frame and a sky reflection
function glassDecals(c: Ctx3, part: VehiclePart, i: number, pts: V3[], k: number) {
  const { g, iso, fb, look } = c, P = part.profile, a = P[i], b = P[(i + 1) % P.length], hw = part.halfWidth;
  const at = (s: number, t: number) => fb.at(lerp(a[0], b[0], t), -hw + 2 * hw * s, lerp(a[1], b[1], t));
  poly(g, iso, [at(0.16, 0), at(0.3, 0), at(0.46, 1), at(0.32, 1)], rgba(SKY, 0.16));
  poly(g, iso, [at(0.36, 0), at(0.41, 0), at(0.57, 1), at(0.52, 1)], rgba(SKY, 0.1));
  trace(g, iso, pts); g.strokeStyle = shade(look.body, k * 0.9); g.lineWidth = 0.075 * iso.px; g.stroke();
}

// Faces of one extruded part turned to the camera: side faces carry sgn ±1, perimeter faces their profile edge
function visibleFaces(fb: Frame, part: VehiclePart) {
  const P = part.profile, n = P.length, hw = part.halfWidth, ccw = area2(P) > 0;
  const V = P.flatMap(([x, z]) => [fb.at(x, -hw, z), fb.at(x, hw, z)]);
  const orient = (q: number[]) => (ccw ? q : q.slice().reverse());
  const faces: { q: number[]; sgn: number; edge: number }[] = [
    { q: orient(P.map((_, i) => 2 * i)), sgn: -1, edge: -1 },
    { q: orient(P.map((_, i) => 2 * i + 1).reverse()), sgn: 1, edge: -1 },
  ];
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; faces.push({ q: orient([2 * i, 2 * i + 1, 2 * j + 1, 2 * j]), sgn: 0, edge: i }); }
  return faces.map((f) => { const pts = f.q.map((v) => V[v]); return { ...f, pts, nrm: newell(pts) }; })
    .filter((f) => dot(f.nrm, VIEW) > 1e-6);                  // back faces dropped
}

function drawPart(c: Ctx3, part: VehiclePart) {
  const { g, iso, look } = c, P = part.profile, n = P.length, ccw = area2(P) > 0;
  for (const f of visibleFaces(c.fb, part)) {
    const { pts, nrm } = f, k = lightK(nrm), glass = f.edge >= 0 && (part.glass ?? []).includes(f.edge);
    poly(g, iso, pts, shade(glass ? look.glass : look.body, k));
    g.save(); trace(g, iso, pts); g.clip();
    if (f.edge < 0) sideDecals(c, part, f.sgn, k);
    else if (glass) glassDecals(c, part, f.edge, pts, k);
    else if (part.paint === 'body') {
      const a = P[f.edge], b = P[(f.edge + 1) % n], len2 = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const nx = ((ccw ? 1 : -1) * (b[1] - a[1])) / len2;   // local outward normal x of this edge
      if (Math.abs(nx) > 0.97) endDecals(c, part, a[0], nx > 0, Math.min(a[1], b[1]), Math.max(a[1], b[1]), k);
    }
    g.restore();
  }
}

// The driver door as a thin slab hinged at its front edge x1, swung outward (toward −y) by up to 95°
function doorSlab(c: Ctx3) {
  const { g, iso, fb, spec, look } = c, d = spec.door!, sh = c.shape!, hw = spec.parts[0].halfWidth;
  const an = c.door * DOOR_OPEN, ca = Math.cos(an), sa = Math.sin(an);
  // e = offset along the door's outer normal: 0 = outer skin, −DOOR_T = inner trim
  const at = (x: number, z: number, e: number) => fb.at(d.x1 - (d.x1 - x) * ca + e * sa, -hw - (d.x1 - x) * sa - e * ca, z);
  const nOut = fb.dir(sa, -ca, 0), xd = fb.dir(ca, sa, 0), up = fb.dir(0, 0, 1);
  const O = sh.outline, m = O.length, w = area2(O) > 0 ? 1 : -1;
  for (let i = 0; i < m; i++) {                              // edge band (the door's thickness)
    const a = O[i], b = O[(i + 1) % m], dx = b[0] - a[0], dz = b[1] - a[1];
    const nE = norm(add(mul(xd, w * dz), mul(up, -w * dx)));
    if (dot(nE, VIEW) <= 0) continue;
    poly(g, iso, [at(a[0], a[1], 0), at(b[0], b[1], 0), at(b[0], b[1], -DOOR_T), at(a[0], a[1], -DOOR_T)], shade(look.body, lightK(nE) * 0.8));
  }
  const outer = dot(nOut, VIEW) > 0, e = outer ? 0 : -DOOR_T, nF = outer ? nOut : mul(nOut, -1), k = lightK(nF);
  const pts = O.map(([x, z]) => at(x, z, e));
  poly(g, iso, pts, shade(outer ? look.body : mixHex(look.body, TRIM, 0.65), k));
  g.save(); trace(g, iso, pts); g.clip();
  onPlane(g, iso, at(0, 0, e), xd, up, () => {
    if (outer && spec.stripe) { g.fillStyle = shade(look.accent, k); g.fillRect(d.x0 - 1, spec.stripe[0], 2, spec.stripe[1] - spec.stripe[0]); }
    for (const win of sh.windows) fill2(g, win, shade(look.glass, k));
    g.fillStyle = outer ? shade(look.body, k * 0.55) : shade(TRIM, k * 0.8);
    g.fillRect(d.x0 + 0.035, outer ? 0.5 : 0.44, outer ? 0.06 : 0.22, outer ? 0.018 : 0.03);   // handle / armrest
  });
  g.restore();
}

function glow(g: Ctx, iso: Iso, p: V3, r: number, color: string, a: number) {
  if (a <= 0.003) return;
  const [x, y] = iso.p(p), R = r * iso.px, gr = g.createRadialGradient(x, y, 0, x, y, R);
  gr.addColorStop(0, rgba(color, 0.7 * a)); gr.addColorStop(0.35, rgba(color, 0.25 * a)); gr.addColorStop(1, rgba(color, 0));
  g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = gr; g.beginPath(); g.arc(x, y, R, 0, Math.PI * 2); g.fill(); g.restore();
}

// ---- public -----------------------------------------------------------------------------------------------------
export function vehicle(g: Ctx, iso: Iso, s: VehicleState, spec: VehicleSpec, look: VehicleLook): void {
  const o: V3 = [s.pos[0], s.pos[1], 0];
  const fw = frame(o, s.heading);                                                     // wheels stay on the ground
  const fb = frame(o, s.heading, s.pitch ?? 0, s.roll ?? 0, spec.wheelR);              // body pitches about the axles
  const door = spec.door ? c01(s.door ?? 0) : 0, lights = c01(s.lights ?? 0), brake = c01(s.brake ?? 0);
  const c: Ctx3 = { g, iso, fb, spec, look, door, lights, brake, shape: spec.door ? doorShape(spec) : null };
  const hw = spec.parts[0].halfWidth, tw = spec.tyreW ?? 0.09, split = hw - spec.wheelY;   // axle offset of the body side plane
  const near = dot(fw.dir(0, 1, 0), VIEW) > 0 ? 1 : -1;                                  // side turned to the camera
  const doorSide = dot(fb.dir(0, -1, 0), VIEW) > 0;
  const wheels = spec.wheelX.flatMap((x, i) => [-1, 1].map((sgn) => ({ x, sgn, steer: i === 1 ? s.steer ?? 0 : 0 })));

  if (s.ground !== false) vehicleGround(g, iso, s, spec);
  // far wheels whole; near wheels only the part inside the body side (the body hides it except below the sill)
  for (const w of wheels) {
    if (w.sgn !== near) wheelPass(g, iso, fw, spec, w.x, w.sgn, s.wheel, w.steer, -tw / 2, tw / 2, true);
    else if (split > -tw / 2) wheelPass(g, iso, fw, spec, w.x, w.sgn, s.wheel, w.steer, -tw / 2, Math.min(split, tw / 2), false);
  }
  if (door > 0 && !doorSide) doorSlab(c);                    // open door behind the body
  for (const part of spec.parts) drawPart(c, part);         // stacked convex parts, lowest first
  // near wheels' outer part: in front of the near side face, never of the other faces (a steered tyre swings
  // inside the side plane), so clip away the lower body's other visible faces
  g.save(); g.beginPath(); g.rect(-1e6, -1e6, 2e6, 2e6);
  for (const f of visibleFaces(fb, spec.parts[0])) {
    if (f.sgn === near) continue;
    f.pts.forEach((q, i) => { const [x, y] = iso.p(q); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath();
  }
  g.clip('evenodd');
  for (const w of wheels) if (w.sgn === near) wheelPass(g, iso, fw, spec, w.x, w.sgn, s.wheel, w.steer, Math.max(split, -tw / 2), tw / 2, true);
  g.restore();
  if (door > 0 && doorSide) doorSlab(c);                     // open door in front of the body

  // lamp glows: fade with how squarely their face looks at the camera, so they never pop
  const P = spec.parts[0].profile, xf = Math.max(...P.map((p) => p[0])), xr = Math.min(...P.map((p) => p[0])), lw = lampW(hw);
  const vf = facingK(fb.dir(1, 0, 0)), vr = facingK(fb.dir(-1, 0, 0));
  const hz = (spec.lights.head[0] + spec.lights.head[1]) / 2, tz = (spec.lights.tail[0] + spec.lights.tail[1]) / 2;
  for (const sgn of [-1, 1]) {
    glow(g, iso, fb.at(xf + 0.01, sgn * (hw - 0.03 - lw / 2), hz), 0.26, WARM, lights * vf);
    glow(g, iso, fb.at(xr - 0.01, sgn * (hw - 0.025 - lw * 0.3), tz), 0.2, RED, Math.max(0.2 * lights, brake) * vr);
  }
}

// Ground decals only (soft shadow + headlight pool). Draw them for every vehicle before anything that stands on
// the ground (people, other vehicles), then call vehicle() with ground: false, so the additive pool never lights
// a solid that was painted before it.
export function vehicleGround(g: Ctx, iso: Iso, s: VehicleState, spec: VehicleSpec): void {
  const fw = frame([s.pos[0], s.pos[1], 0], s.heading), lights = c01(s.lights ?? 0);
  shadow(g, iso, fw, spec);
  if (lights > 0) headPool(g, iso, fw, spec, lights);
}

// World point on the ground just outside the driver door (where a driver stands to get in or out)
export function doorSill(s: VehicleState, spec: VehicleSpec): V3 {
  const f = frame([s.pos[0], s.pos[1], 0], s.heading), x = spec.door ? lerp(spec.door.x0, spec.door.x1, 0.4) : 0;
  return f.at(x, -spec.wid / 2 - 0.22, 0);
}
