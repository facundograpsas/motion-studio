// A person as a tiny 3D skeleton (IK legs and arms, torso, head) drawn flat in the iso world.
// Feet come from footsteps() in world space, so a planted foot never slides; everything else hangs off the
// pelvis. Any heading works: the face, hair and limbs are placed in 3D and sorted by depth every frame.
import { add, box3, capsule, cross, disc, dot, frame, ik, mul, norm, onPlane, shade, sphere, sub, taper, VIEW } from './iso.ts';
import type { Ctx, Iso, V3 } from './iso.ts';
import type { Foot } from './path.ts';

export interface Look {
  skin: string; hair: string; top: string; bottom: string; shoes: string;
  hairStyle?: 'short' | 'long' | 'bun'; cap?: string; seed?: number;
}
// Hand targets in body space: x forward, y to the body's left, z height above the ground at standing pelvis
export type Hand = V3;
export interface PersonPose {
  t: number;
  pos: V3;                    // ground point under the pelvis
  heading: number;
  feet?: [Foot, Foot];        // [left, right] in world space; omitted = standing, feet together
  bob?: number;               // 0…1 gait bob (1 = mid-stance), scaled by walk
  walk?: number;              // 0…1 how much the body is walking (bob, lean)
  run?: number;               // 0…1 running: more lean, elbows bent, a bigger bounce (feet from footsteps(…, duty 0.35))
  sit?: number;               // 0…1 sitting: hips down and back onto a seat ~0.2 high (top of a 0.2 bench), feet tucked in
  lean?: number;              // extra forward lean, radians
  squat?: number;             // 0…1 knees bend (anticipation, landing)
  hands?: { l?: Hand; r?: Hand };
  swing?: number;             // −1…1 arm swing from the gait (used by hands that have no target)
  headYaw?: number;
  headPitch?: number;         // + looks down (at a phone)
  eyes?: 'open' | 'happy' | 'closed' | 'wide';
  mouth?: 'flat' | 'smile' | 'open' | 'o';
}
export interface Extra { at: V3; draw: () => void }   // something to sort with the body (a carried box)

// Proportions (world units; the person is ~0.72 tall)
export const BODY = { thigh: 0.145, shin: 0.145, pelvis: 0.3, hip: 0.045, torso: 0.19, shoulder: 0.08, upper: 0.12, fore: 0.12, head: 0.088 };

export const HANDS = {
  carry: { l: [0.15, 0.1, 0.36], r: [0.15, -0.1, 0.36] } as { l: Hand; r: Hand },
  give: { l: [0.27, 0.1, 0.42], r: [0.27, -0.1, 0.42] } as { l: Hand; r: Hand },
  phone: { l: [0.15, 0.04, 0.44], r: [0.16, -0.035, 0.445] } as { l: Hand; r: Hand },   // with headPitch ≈ 0.5 and phone()
};

// The body's frame (for placing held objects in the same space as the hands)
export function bodyFrame(p: PersonPose) {
  return frame(frame(p.pos, p.heading).at(-0.07 * (p.sit ?? 0), 0, pelvisDrop(p)), p.heading);
}
// walking lowers the hips (so the stance leg reaches a full stride) and bobs them up at mid-stance; a run
// bounces more (low at mid-stance, high in the air); sitting puts the hips on the seat
const pelvisDrop = (p: PersonPose) => {
  const run = p.run ?? 0, bob = p.bob ?? 0;
  return (p.walk ?? 0) * (1 - run) * (-0.03 + 0.014 * bob) + run * (-0.045 + 0.05 * bob) - (p.squat ?? 0) * 0.07 - (p.sit ?? 0) * 0.09;
};
const mixV = (a: V3, b: V3, k: number): V3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

export function person(g: Ctx, iso: Iso, p: PersonPose, L: Look, extras: Extra[] = []) {
  const B = BODY, f = frame(p.pos, p.heading), drop = pelvisDrop(p), fwd = f.dir(1, 0, 0), side = f.dir(0, 1, 0);
  const run = p.run ?? 0, sit = p.sit ?? 0;
  const lean = (p.lean ?? 0) + (p.walk ?? 0) * (1 - run) * 0.08 + run * 0.2 - sit * 0.04;
  const pelvis = f.at(-0.07 * sit, 0, B.pelvis + drop);
  const chest = add(pelvis, add(mul(fwd, Math.sin(lean) * B.torso), [0, 0, Math.cos(lean) * B.torso + 0.003 * Math.sin(p.t * 2.3)]));
  const pitch = p.headPitch ?? 0;
  const headC = add(chest, add(mul(fwd, Math.sin(lean) * 0.05 + Math.sin(pitch) * 0.025), [0, 0, 0.15 - Math.sin(pitch) * 0.012]));
  const feet: [Foot, Foot] = p.feet ?? [
    { p: f.at(0.11 * sit, 0.05, 0), heading: p.heading }, { p: f.at(0.11 * sit, -0.05, 0), heading: p.heading }];

  // Draw order inside one body: fixed layers (legs < torso < head), and limbs, hair and held things go in
  // front of or behind the torso by their horizontal depth relative to it. Height must not count here.
  const parts: { d: number; draw: () => void }[] = [];
  const hd = (q: V3) => q[0] + q[1], torsoD = hd(pelvis);
  const layer = (q: V3, front: number, back: number) => { const rel = hd(q) - torsoD; return (rel > 0 ? front : back) + rel * 0.1; };
  // shadow first, under everything
  disc(g, iso, add(p.pos, [0, 0, 0.002]), [0, 0, 1], 0.15, 'rgba(2,8,24,0.32)');

  // legs: hip → knee (IK, bends forward) → ankle on the world foot; then the shoe along the foot's heading
  feet.forEach((ft, i) => {
    const sgn = i === 0 ? 1 : -1, hip = add(pelvis, mul(side, sgn * B.hip));
    const fdir: V3 = [Math.cos(ft.heading), Math.sin(ft.heading), 0], ankle = add(ft.p, [0, 0, 0.035]);
    const knee = ik(hip, ankle, B.thigh, B.shin, add(fdir, mul(side, sgn * 0.04)));
    const far = dot(mul(side, sgn), VIEW) < 0, col = far ? shade(L.bottom, 0.82) : L.bottom;
    parts.push({ d: -2 + (hd(knee) - torsoD) * 0.1, draw: () => {
      capsule(g, iso, [hip, knee, ankle], 0.03, col);
      capsule(g, iso, [add(ankle, add(mul(fdir, -0.02), [0, 0, -0.012])), add(ankle, add(mul(fdir, 0.055), [0, 0, -0.014]))], 0.027, far ? shade(L.shoes, 0.8) : L.shoes);
    } });
  });

  // torso: pants at the hips, the top tapering out to the chest
  parts.push({ d: 0, draw: () => {
    sphere(g, iso, pelvis, 0.064, L.bottom);
    taper(g, iso, add(pelvis, mul(sub(chest, pelvis), 0.22)), 0.062, chest, 0.074, L.top);
  } });

  // arms: shoulder → elbow (IK, bends back and out) → hand target; idle hands hang and swing with the gait
  (['l', 'r'] as const).forEach((k, i) => {
    const sgn = i === 0 ? 1 : -1, sw = (p.swing ?? 0) * sgn * -1;
    const sh = add(chest, add(mul(side, sgn * B.shoulder), [0, 0, 0.015]));
    const idle = mixV(mixV([sw * 0.09, sgn * 0.1, 0.27 + Math.abs(sw) * 0.02], [0.06 + sw * 0.15, sgn * 0.11, 0.37 + Math.abs(sw) * 0.03], run), [0.12, sgn * 0.075, 0.33], sit);
    const tgt = p.hands?.[k] ?? idle;
    const hand = f.at(tgt[0], tgt[1], tgt[2] + drop);
    const elbow = ik(sh, hand, B.upper, B.fore, add(mul(fwd, -1), add(mul(side, sgn * 0.6), [0, 0, -0.2])));
    const far = dot(mul(side, sgn), VIEW) < 0;
    parts.push({ d: layer(mul(add(elbow, hand), 0.5), 1.5, -0.5), draw: () => {
      capsule(g, iso, [sh, elbow], 0.026, far ? shade(L.top, 0.82) : L.top);
      capsule(g, iso, [elbow, hand], 0.022, far ? shade(L.skin, 0.85) : L.skin);
      sphere(g, iso, hand, 0.026, far ? shade(L.skin, 0.85) : L.skin);
    } });
  });

  // head, hair, face
  const yaw = p.heading + (p.headYaw ?? 0), face: V3 = [Math.cos(yaw), Math.sin(yaw), 0];
  if (L.hairStyle === 'long') {
    const back = add(headC, mul(face, -0.03));
    parts.push({ d: layer(add(back, mul(face, -0.05)), 0.6, -0.6), draw: () =>
      taper(g, iso, back, B.head * 0.98, add(back, add(mul(face, -0.012), [0, 0, -0.17])), B.head * 0.82, L.hair) });
  }
  parts.push({ d: 1, draw: () => head(g, iso, p, L, headC, yaw, pitch) });
  for (const e of extras) parts.push({ d: layer(e.at, 1.2, -0.6), draw: e.draw });

  parts.sort((a, b) => a.d - b.d).forEach((q) => q.draw());
}

// Rodrigues rotation of v about the unit axis k
const rot = (v: V3, k: V3, a: number): V3 => add(add(mul(v, Math.cos(a)), mul(cross(k, v), Math.sin(a))), mul(k, dot(k, v) * (1 - Math.cos(a))));

// A phone held in HANDS.phone: a thin slab tilted toward the face, screen lit (sort it with the body as an Extra)
export function phone(g: Ctx, iso: Iso, p: PersonPose): Extra {
  const at = bodyFrame(p).at(0.165, 0, 0.445);
  return { at, draw: () => {
    const f = frame(at, p.heading, -1.05);
    box3(g, iso, f, [0, 0, 0], [0.075, 0.042, 0.008], '#1B2238');
    onPlane(g, iso, f.at(-0.033, -0.017, 0.0085), f.dir(0.066, 0, 0), f.dir(0, 0.034, 0), () => { g.fillStyle = '#BFF3F7'; g.fillRect(0, 0, 1, 1); });
    const [x, y] = iso.p(at), r = 0.09 * iso.px, gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(67,190,203,0.35)'); gr.addColorStop(1, 'rgba(67,190,203,0)');
    g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.restore();
  } };
}

function head(g: Ctx, iso: Iso, p: PersonPose, L: Look, c: V3, yaw: number, pitch: number) {
  const R = 0.088, [x, y] = iso.p(c), r = R * iso.px, lat: V3 = [-Math.sin(yaw), Math.cos(yaw), 0];
  const tip = (v: V3) => rot(v, lat, pitch);                     // every head direction nods with the pitch
  const face = tip([Math.cos(yaw), Math.sin(yaw), 0]), up = tip([0, 0, 1]);
  const cover = L.cap ?? L.hair, front = dot(face, VIEW) / Math.sqrt(2);   // front 1 = looking at the camera
  // cap brim: a flat disc at the forehead; behind the skull when the face turns away
  const brim = () => L.cap && disc(g, iso, add(c, add(mul(face, 0.72 * R), mul(up, 0.42 * R))), norm(add(up, mul(face, -0.25))), R * 0.62, shade(L.cap, 0.8));
  if (front < 0) brim();
  // hair volume behind and above the skull (the head covers it at the chin, so no beard)
  sphere(g, iso, add(c, add(mul(face, -0.2 * R), mul(up, 0.12 * R))), R * 1.03, L.hair);
  if (L.hairStyle === 'bun') sphere(g, iso, add(c, add(mul(face, -0.75 * R), mul(up, 0.75 * R))), R * 0.45, L.hair);
  sphere(g, iso, c, R, L.skin);
  // hair / cap inside the skull: a circle pushed back and up, clipped to the head
  g.save(); g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.clip();
  sphere(g, iso, add(c, add(mul(face, L.cap ? -0.35 * R : -0.5 * R), mul(up, L.cap ? 0.62 * R : 0.75 * R))), R, cover);
  g.restore();

  if (front > -0.25) {
    const blink = ((p.t + (L.seed ?? 0) * 0.71) % 3.4) < 0.11;
    const eyes = blink && p.eyes !== 'happy' ? 'closed' : p.eyes ?? 'open';
    for (const e of [-1, 1]) {
      const a = yaw + e * 0.42, n = tip(norm([Math.cos(a) * 0.86, Math.sin(a) * 0.86, 0.1]));
      const vis = dot(n, VIEW) / Math.sqrt(3);
      if (vis < 0.12) continue;
      const [ex, ey] = iso.p(add(c, mul(n, R))), k = Math.min(1, (vis - 0.12) * 5), sx = r * 0.12 * Math.max(0.35, vis * 1.4), sy = r * 0.16;
      g.save(); g.globalAlpha *= k; g.fillStyle = g.strokeStyle = '#1B2238'; g.lineWidth = r * 0.07; g.lineCap = 'round';
      g.beginPath();
      if (eyes === 'closed') { g.moveTo(ex - sx, ey); g.lineTo(ex + sx, ey); g.stroke(); }
      else if (eyes === 'happy') { g.arc(ex, ey + sy * 0.4, sx * 1.1, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); }
      else { g.ellipse(ex, ey, sx * (eyes === 'wide' ? 1.25 : 1), sy * (eyes === 'wide' ? 1.25 : 1), 0, 0, Math.PI * 2); g.fill(); }
      g.restore();
    }
    // mouth and blush, on the sphere below the eyes
    const n = tip(norm([Math.cos(yaw) * 0.88, Math.sin(yaw) * 0.88, -0.42])), vis = dot(n, VIEW) / Math.sqrt(3);
    if (vis > 0.1) {
      const [mx, my] = iso.p(add(c, mul(n, R))), w = r * 0.22 * Math.max(0.4, vis * 1.4), k = Math.min(1, (vis - 0.1) * 5);
      g.save(); g.globalAlpha *= k; g.strokeStyle = g.fillStyle = '#5A2430'; g.lineWidth = r * 0.07; g.lineCap = 'round'; g.beginPath();
      const m = p.mouth ?? 'flat';
      if (m === 'smile') { g.arc(mx, my - w * 0.55, w, Math.PI * 0.2, Math.PI * 0.8); g.stroke(); }
      else if (m === 'open') { g.ellipse(mx, my, w * 0.75, w * 0.55, 0, 0, Math.PI); g.fill(); }
      else if (m === 'o') { g.ellipse(mx, my, w * 0.32, w * 0.42, 0, 0, Math.PI * 2); g.fill(); }
      else { g.moveTo(mx - w * 0.5, my); g.lineTo(mx + w * 0.5, my); g.stroke(); }
      if (m === 'smile' || p.eyes === 'happy') {
        g.globalAlpha *= 0.35; g.fillStyle = '#FF8A8A';
        for (const e of [-1, 1]) { const a = yaw + e * 0.75, q = tip(norm([Math.cos(a) * 0.9, Math.sin(a) * 0.9, -0.2])); if (dot(q, VIEW) > 0.2) { const [bx, by] = iso.p(add(c, mul(q, R))); g.beginPath(); g.arc(bx, by, r * 0.12, 0, Math.PI * 2); g.fill(); } }
      }
      g.restore();
    }
  }
  if (front >= 0) brim();
}
