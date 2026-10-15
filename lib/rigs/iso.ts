// 2.5D kit for rigs: actors are tiny 3D models in world grid units (gx, gy, z), drawn flat-shaded on a 2D
// canvas with the same 2:1 projection the iso city films use. Draw in world px; the film's camera transform
// (setTransform(zoom, 0, 0, zoom, ox, oy)) does the rest, so line widths scale with the camera.
// Pure functions of their inputs, no state.

export type V2 = [number, number];
export type V3 = [number, number, number];
export type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a: V3): V3 => mul(a, 1 / (len(a) || 1));
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const lerp3 = (a: V3, b: V3, p: number): V3 => [a[0] + (b[0] - a[0]) * p, a[1] + (b[1] - a[1]) * p, a[2] + (b[2] - a[2]) * p];

// Toward the viewer: a face is visible when dot(normal, VIEW) > 0, and larger depth() is drawn later
export const VIEW: V3 = [1, 1, 1];
export const depth = (p: V3) => p[0] + p[1] + p[2];

export interface Iso {
  tw: number;                       // tile width in world px (city films: 8u)
  p: (q: V3) => V2;                 // world → world px
  px: number;                       // world px per unit for a sphere radius (the projection is not uniform)
}
export function isoView(tw: number): Iso {
  return { tw, px: tw * 0.66, p: (q) => [(q[0] - q[1]) * tw / 2, (q[0] + q[1]) * tw / 4 - q[2] * tw / 2] };
}

// Local frame of a body: x forward along heading, y to its side, z up. pitch > 0 dips the nose, roll tilts sideways.
export function frame(origin: V3, heading: number, pitch = 0, roll = 0, pivotZ = 0) {
  const ch = Math.cos(heading), sh = Math.sin(heading), cp = Math.cos(pitch), spn = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
  const rot = (x: number, y: number, z: number): V3 => {
    z -= pivotZ;
    [x, z] = [x * cp + z * spn, -x * spn + z * cp];          // pitch about local y
    [y, z] = [y * cr - z * sr, y * sr + z * cr];             // roll about local x
    z += pivotZ;
    return [x * ch - y * sh, x * sh + y * ch, z];
  };
  return {
    at: (x: number, y: number, z: number): V3 => add(origin, rot(x, y, z)),
    dir: (x: number, y: number, z: number): V3 => { const a = rot(x, y, z + pivotZ), b = rot(0, 0, pivotZ); return sub(a, b); },
    heading,
  };
}

// ---- colour -----------------------------------------------------------------
// accepts '#rrggbb' or 'rgb(r,g,b)', so shade(mix(a, b, p), k) chains
const hex = (c: string) => c[0] === '#' ? [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)) : (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
export const shade = (c: string, k: number) => `rgb(${hex(c).map((v) => Math.round(Math.min(255, Math.max(0, v * k)))).join(',')})`;
export const mix = (a: string, b: string, p: number) => { const A = hex(a), B = hex(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * Math.min(1, Math.max(0, p)))).join(',')})`; };
export const rgba = (c: string, a: number) => `rgba(${hex(c).join(',')},${a})`;
// Same light as the city boxes: top ×1.25, +gx faces ×0.85, +gy faces ×0.62
export const lightK = (n: V3) => Math.min(1.3, Math.max(0.45, 0.75 + 0.1 * n[0] - 0.13 * n[1] + 0.5 * n[2]));

// ---- primitives ---------------------------------------------------------------
export function poly(g: Ctx, iso: Iso, pts: V3[], fill: string) {
  g.beginPath(); pts.forEach((q, i) => { const [x, y] = iso.p(q); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath();
  g.fillStyle = fill; g.fill();
}
export const facing = (pts: V3[]) => dot(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0])), VIEW);

// Convex solid: faces wound so their normal points out. Only faces turned to the viewer are painted, so
// order never matters inside one solid.
export function solid(g: Ctx, iso: Iso, verts: V3[], faces: number[][], color: string | ((n: V3, i: number) => string)) {
  const mid = mul(verts.reduce(add, [0, 0, 0] as V3), 1 / verts.length);
  faces.forEach((f, i) => {
    const pts = f.map((k) => verts[k]);
    let n = norm(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0])));
    if (dot(n, sub(pts[0], mid)) < 0) n = mul(n, -1);            // a convex solid's faces point away from its centre
    if (dot(n, VIEW) <= 1e-6) return;
    poly(g, iso, pts, typeof color === 'string' ? shade(color, lightK(n)) : color(n, i));
  });
}

// Axis-aligned box in a frame (centre on the floor of the box), e.g. a parcel or a crate
export function box3(g: Ctx, iso: Iso, f: ReturnType<typeof frame>, c: V3, size: V3, color: string) {
  const [x, y, z] = c, [a, b, h] = [size[0] / 2, size[1] / 2, size[2]];
  const v = [[-a, -b, 0], [a, -b, 0], [a, b, 0], [-a, b, 0], [-a, -b, h], [a, -b, h], [a, b, h], [-a, b, h]].map(([i, j, k]) => f.at(x + i, y + j, z + k));
  solid(g, iso, v, BOX_FACES, color);
  return v;
}
// Counter-clockwise seen from outside, so cross(v1 - v0, v2 - v0) is the outward normal
export const BOX_FACES = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];

// A circle of radius r in the plane through c with normal n (wheels, shadows, lamps): an ellipse on screen
export function disc(g: Ctx, iso: Iso, c: V3, n: V3, r: number, fill: string) {
  const e1 = norm(Math.abs(n[2]) < 0.9 ? cross(n, [0, 0, 1]) : cross(n, [1, 0, 0])), e2 = norm(cross(n, e1));
  onPlane(g, iso, c, mul(e1, r), mul(e2, r), () => { g.beginPath(); g.arc(0, 0, 1, 0, Math.PI * 2); g.fillStyle = fill; g.fill(); });
}

// Paint in a plane: unit square coordinates (u, v) map to c + u·ex + v·ey. The projection is affine, so
// anything drawn here (windows, a logo, a light pool) lands on the 3D surface exactly.
export function onPlane(g: Ctx, iso: Iso, c: V3, ex: V3, ey: V3, paint: () => void) {
  const [ox, oy] = iso.p(c), [ax, ay] = iso.p(add(c, ex)), [bx, by] = iso.p(add(c, ey));
  g.save(); g.transform(ax - ox, ay - oy, bx - ox, by - oy, ox, oy); paint(); g.restore();
}

// Limb: a round-capped stroke through 3D points, radius r in world units
export function capsule(g: Ctx, iso: Iso, pts: V3[], r: number, color: string) {
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = color; g.lineWidth = 2 * r * iso.px;
  g.beginPath(); pts.forEach((q, i) => { const [x, y] = iso.p(q); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); g.restore();
}
export function sphere(g: Ctx, iso: Iso, c: V3, r: number, color: string) {
  const [x, y] = iso.p(c); g.beginPath(); g.arc(x, y, r * iso.px, 0, Math.PI * 2); g.fillStyle = color; g.fill();
}
// Two circles joined by their outer tangents (a torso that is wider at the chest)
export function taper(g: Ctx, iso: Iso, a: V3, ra: number, b: V3, rb: number, color: string) {
  const [ax, ay] = iso.p(a), [bx, by] = iso.p(b), r1 = ra * iso.px, r2 = rb * iso.px;
  const d = Math.hypot(bx - ax, by - ay) || 1e-6, ang = Math.atan2(by - ay, bx - ax), off = Math.acos(Math.max(-1, Math.min(1, (r1 - r2) / d)));
  g.beginPath(); g.arc(ax, ay, r1, ang + off, ang - off + Math.PI * 2); g.arc(bx, by, r2, ang - off, ang + off); g.closePath();
  g.fillStyle = color; g.fill();
}

// Two-bone IK: joint between root and end for bone lengths a, b, bending toward `bend`
export function ik(root: V3, end: V3, a: number, b: number, bend: V3): V3 {
  const d0 = sub(end, root), d = Math.min(len(d0), a + b - 1e-4), u = norm(d0);
  const x = (a * a - b * b + d * d) / (2 * d), h = Math.sqrt(Math.max(0, a * a - x * x));
  const side = norm(sub(bend, mul(u, dot(bend, u))));
  return add(root, add(mul(u, x), mul(side, h)));
}
