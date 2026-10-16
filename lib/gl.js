// WebGL layer for seek(t) films: a Three.js stage driven by time (never by its own clock), 3D device
// mockups whose screen is a 2D canvas the film paints every frame, and a post pass for seams and finish.
// Headless Chromium renders WebGL on SwiftShader (CPU), so frames are deterministic.
//   const S = stage(F);  const ph = phone(30 * F.u);  S.scene.add(ph.group);
//   draw(t): paintUI(ph.screen.ctx, t); ph.screen.update(); ph.group.rotation.y = …; g.drawImage(S.render(), 0, 0);
import * as THREE from '/node_modules/three/build/three.module.js';

export { THREE };

// Scene + camera + renderer on an offscreen canvas the size of the frame. World units = px at z = 0,
// so 3D layouts use the same u as the 2D scenes. fov in degrees (small = flatter, product-shot look).
export function stage(F, { fov = 24, light = true } = {}) {
  const { W, H } = F;
  const canvas = new OffscreenCanvas(W, H);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(W, H, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  const scene = new THREE.Scene();
  const dist = H / 2 / Math.tan((fov * Math.PI) / 360);
  const camera = new THREE.PerspectiveCamera(fov, W / H, dist / 20, dist * 20);
  camera.position.set(0, 0, dist);
  if (light) {
    scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.8); key.position.set(-0.6, 1, 1.2).multiplyScalar(dist); scene.add(key);
    const rim = new THREE.DirectionalLight(0xffffff, 0.9); rim.position.set(1, 0.3, -0.8).multiplyScalar(dist); scene.add(rim);
  }
  return {
    scene, camera, renderer, canvas, dist,
    // camera on a sphere around target: yaw/pitch in radians, zoom 1 = frame-filling distance
    aim(yaw = 0, pitch = 0, zoom = 1, target = [0, 0, 0]) {
      const d = dist / zoom, [tx, ty, tz] = target;
      camera.position.set(tx + d * Math.sin(yaw) * Math.cos(pitch), ty + d * Math.sin(pitch), tz + d * Math.cos(yaw) * Math.cos(pitch));
      camera.lookAt(tx, ty, tz);
    },
    render() { renderer.render(scene, camera); return canvas; },
  };
}

// 2D canvas used as a texture: paint with ctx, then update() before render()
export function screenTexture(w, h) {
  const canvas = new OffscreenCanvas(Math.round(w), Math.round(h)), ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8;
  return { canvas, ctx, texture, w: canvas.width, h: canvas.height, update() { texture.needsUpdate = true; } };
}

// rounded rectangle centered on the origin
function rounded(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
function roundedSlab(w, h, r, depth, bevel) {
  const geo = new THREE.ExtrudeGeometry(rounded(w, h, r), { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 12 });
  geo.translate(0, 0, -depth / 2);
  return geo;
}
function screenMesh(w, h, r, tex) {
  const x = -w / 2, y = -h / 2, geo = new THREE.ShapeGeometry(rounded(w, h, r), 12), uv = geo.attributes.uv, p = geo.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (p.getX(i) - x) / w, (p.getY(i) - y) / h); // shape uvs are in world units
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex.texture, toneMapped: false }));
}

// Phone w px wide. Returns { group, screen } — paint screen.ctx (screen.w × screen.h px), then screen.update().
export function phone(w, { body = 0x1a1a1c, res = 2 } = {}) {
  const h = w * 2.05, b = w * 0.045, depth = w * 0.09, r = w * 0.16;
  const group = new THREE.Group();
  group.add(new THREE.Mesh(roundedSlab(w - 2 * r * 0.1, h - 2 * r * 0.1, r * 0.9, depth, r * 0.1),
    new THREE.MeshStandardMaterial({ color: body, roughness: 0.35, metalness: 0.6 })));
  const sw = w - 2 * b, sh = h - 2 * b, screen = screenTexture(sw * res, sh * res);
  const glass = screenMesh(sw, sh, r - b, screen); glass.position.z = depth / 2 + r * 0.1 + 0.5; group.add(glass);
  return { group, screen };
}

// Laptop w px wide. open(a) sets the lid angle: 0 = closed, 1 = open (~105°). Hinge at the origin.
export function laptop(w, { body = 0xc9cacc, res = 2 } = {}) {
  const d = w * 0.68, lidH = w * 0.64, thick = w * 0.018, b = w * 0.03;
  const mat = new THREE.MeshStandardMaterial({ color: body, roughness: 0.4, metalness: 0.7 });
  const group = new THREE.Group();
  const base = new THREE.Mesh(roundedSlab(w, d, w * 0.03, thick, thick * 0.3), mat);
  base.rotation.x = -Math.PI / 2; base.position.set(0, -thick / 2, d / 2); group.add(base);
  const lid = new THREE.Group(); group.add(lid);
  const shell = new THREE.Mesh(roundedSlab(w, lidH, w * 0.03, thick * 0.6, thick * 0.2), mat);
  shell.position.set(0, lidH / 2, 0); lid.add(shell);
  const sw = w - 2 * b, sh = lidH - 2 * b, screen = screenTexture(sw * res, sh * res);
  const glass = screenMesh(sw, sh, w * 0.01, screen); glass.position.set(0, lidH / 2, thick * 0.6); lid.add(glass);
  return { group, screen, lid, depth: d, open(a) { lid.rotation.x = (1 - a) * (Math.PI / 2) - a * 0.26; } };
}

// Post pass over any canvas: chroma (px split), warp (px of domain warp), grain (0-1), vignette (0-1).
// Seams: ramp chroma/warp up to the cut and down after it, same amount both sides (like zoom blur).
// seed must come from time (e.g. Math.floor(t * 60)) so grain is frame-stable.
export function postFx(W, H) {
  const canvas = new OffscreenCanvas(W, H), gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, premultipliedAlpha: false });
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, `#version 300 es
in vec2 p; out vec2 uv; void main() { uv = p * 0.5 + 0.5; uv.y = 1.0 - uv.y; gl_Position = vec4(p, 0, 1); }`));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, `#version 300 es
precision highp float; in vec2 uv; out vec4 o; uniform sampler2D src; uniform vec2 res;
uniform float chroma, warp, grain, vignette, seed;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7)) + seed * 17.13) * 43758.5453); }
float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
void main() {
  vec2 q = uv * vec2(res.x / res.y, 1.0) * 6.0;
  vec2 w = (vec2(n(q), n(q + 7.3)) - 0.5) * 2.0 * warp / res;
  vec2 c = (uv - 0.5) * chroma / res * 2.0;
  vec4 g = texture(src, uv + w);
  o = vec4(texture(src, uv + w + c).r, g.g, texture(src, uv + w - c).b, g.a);
  o.rgb += (h(uv * res) - 0.5) * grain * 0.18;
  o.rgb *= 1.0 - vignette * 0.55 * pow(length(uv - 0.5) * 1.41, 2.2);
}`));
  gl.linkProgram(prog); gl.useProgram(prog);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  const U = Object.fromEntries(['res', 'chroma', 'warp', 'grain', 'vignette', 'seed'].map((k) => [k, gl.getUniformLocation(prog, k)]));
  gl.viewport(0, 0, W, H);
  return {
    canvas,
    apply(src, { chroma = 0, warp = 0, grain = 0, vignette = 0, seed = 0 } = {}) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      gl.uniform2f(U.res, W, H); gl.uniform1f(U.chroma, chroma); gl.uniform1f(U.warp, warp);
      gl.uniform1f(U.grain, grain); gl.uniform1f(U.vignette, vignette); gl.uniform1f(U.seed, seed % 1000);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      return canvas;
    },
  };
}
