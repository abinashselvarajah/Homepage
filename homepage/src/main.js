import './style.css';
import * as THREE from 'three';

const { clamp, lerp, smoothstep, degToRad } = THREE.MathUtils;

const canvas = document.querySelector('#bg');
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x05060f, 0.0032);
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 1200);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setClearColor(0x000000, 0);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);

// Procedural textures: 3D value noise sampled on the sphere, so they tile seamlessly
function hash3(x, y, z) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const fx = x - xi, fy = y - yi, fz = z - zi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const l = (a, b, t) => a + (b - a) * t;
  return l(
    l(l(hash3(xi, yi, zi), hash3(xi + 1, yi, zi), u), l(hash3(xi, yi + 1, zi), hash3(xi + 1, yi + 1, zi), u), v),
    l(l(hash3(xi, yi, zi + 1), hash3(xi + 1, yi, zi + 1), u), l(hash3(xi, yi + 1, zi + 1), hash3(xi + 1, yi + 1, zi + 1), u), v),
    w
  );
}
function fbm(x, y, z, oct = 5) {
  let a = 0.5, f = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f, z * f); n += a; f *= 2; a *= 0.5; }
  return s / n;
}
const toTexture = canvas => {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
};
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function makeTexture(w, h, painter) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  for (let py = 0; py < h; py++) {
    const lat = (0.5 - (py + 0.5) / h) * Math.PI;
    const y = Math.sin(lat), r = Math.cos(lat);
    for (let px = 0; px < w; px++) {
      const lon = ((px + 0.5) / w) * Math.PI * 2;
      const [R, G, B, A = 255] = painter(r * Math.cos(lon), y, r * Math.sin(lon));
      const o = (py * w + px) * 4;
      img.data[o] = R; img.data[o + 1] = G; img.data[o + 2] = B; img.data[o + 3] = A;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = toTexture(c);
  tex.anisotropy = 4;
  return tex;
}

const painters = {
  earth(x, y, z) {
    const e = fbm(x * 2 + 3, y * 2, z * 2, 6);
    const d = fbm(x * 8, y * 8, z * 8, 3);
    const h = e + (d - 0.5) * 0.12;
    let c;
    if (h < 0.5) {
      c = mix([6, 24, 82], [28, 112, 196], smoothstep(h, 0.28, 0.5));
    } else {
      const l = clamp((h - 0.5) / 0.22, 0, 1);
      c = mix([52, 132, 62], [168, 142, 82], clamp(l * 1.5, 0, 1));
      c = mix(c, [225, 225, 228], smoothstep(l, 0.75, 1));
      if (h < 0.515) c = mix([60, 160, 170], c, (h - 0.5) / 0.015); // shallow coast
    }
    return mix(c, [244, 248, 255], smoothstep(Math.abs(y) + (d - 0.5) * 0.15, 0.82, 0.92));
  },
  clouds(x, y, z) {
    const c = fbm(x * 3 + 9, y * 3 + 4, z * 3, 5);
    return [255, 255, 255, clamp((c - 0.5) * 3.4, 0, 1) * 235];
  },
  moon(x, y, z) {
    const n = fbm(x * 5, y * 5, z * 5, 5);
    const crater = smoothstep(fbm(x * 12 + 4, y * 12, z * 12, 2), 0.62, 0.72) * 0.35;
    const v = 120 + n * 90 - crater * 80;
    return [v, v, v * 1.03];
  },
  mars(x, y, z) {
    const n = fbm(x * 3, y * 3, z * 3, 6);
    let c = mix([118, 48, 24], [210, 128, 78], n);
    c = mix(c, [64, 28, 20], smoothstep(fbm(x * 2 + 5, y * 2, z * 2, 4), 0.55, 0.72) * 0.8);
    return mix(c, [244, 240, 236], smoothstep(Math.abs(y), 0.9, 0.95));
  },
  pluto(x, y, z) {
    const n = fbm(x * 4, y * 4, z * 4, 5);
    let c = mix([112, 80, 62], [196, 166, 140], n);
    c = mix(c, [150, 98, 70], smoothstep(fbm(x * 2 + 8, y * 2, z * 2, 3), 0.55, 0.75) * 0.6);
    // the pale heart-shaped plain (Tombaugh Regio)
    const d = Math.hypot(x - 0.55, (y + 0.05) * 1.4, z - 0.75);
    return mix(c, [238, 224, 206], clamp(1 - d / 0.3, 0, 1) * 0.9);
  },
  jupiter(x, y, z) {
    const warp = fbm(x * 3, y * 6, z * 3, 4);
    const t = (Math.sin((y + warp * 0.22) * 20) + 1) / 2;
    let c = mix(mix([244, 226, 196], [186, 124, 84], t), [150, 90, 56], smoothstep(fbm(x * 2, y * 10, z * 2, 3), 0.55, 0.8));
    const p = [0.78, -0.3, 0.55];
    const d = Math.hypot(x - p[0], (y - p[1]) * 1.6, z - p[2]);
    return mix(c, [196, 72, 42], clamp(1 - d / 0.22, 0, 1));
  },
  saturn(x, y, z) {
    const w = fbm(x * 2, y * 5, z * 2, 3);
    const t = (Math.sin((y + w * 0.12) * 28) + 1) / 2;
    return mix(mix([236, 214, 160], [200, 168, 112], t), [176, 150, 108], smoothstep(w, 0.5, 0.7) * 0.5);
  },
  uranus(x, y, z) {
    const n = fbm(x * 2, y * 4, z * 2, 3);
    return mix(mix([150, 228, 232], [104, 190, 218], (y + 1) / 2), [180, 238, 240], n * 0.35);
  },
  neptune(x, y, z) {
    const n = fbm(x * 2, y * 7, z * 2, 4);
    let c = mix([28, 62, 196], [70, 120, 245], n);
    const d = Math.hypot(x + 0.5, (y + 0.25) * 1.8, z - 0.8);
    return mix(c, [14, 28, 120], clamp(1 - d / 0.3, 0, 1) * 0.8);
  },
};

function ringTexture(kind) {
  const w = 512, c = document.createElement('canvas');
  c.width = w; c.height = 1;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, 1);
  for (let i = 0; i < w; i++) {
    const t = i / (w - 1);
    let a, col;
    if (kind === 'saturn') {
      a = (0.35 + 0.65 * fbm(t * 40, 1.3, 0.7, 4)) * smoothstep(t, 0, 0.06) * (1 - smoothstep(t, 0.94, 1));
      if (t > 0.58 && t < 0.66) a *= 0.08; // Cassini division
      if (t < 0.28) a *= 0.45;
      col = mix([190, 164, 120], [244, 226, 186], fbm(t * 24, 5, 2, 3));
    } else {
      a = (smoothstep(t, 0.18, 0.2) - smoothstep(t, 0.24, 0.26) + smoothstep(t, 0.68, 0.7) - smoothstep(t, 0.74, 0.76)) * 0.55;
      col = [190, 230, 240];
    }
    img.data.set([col[0], col[1], col[2], clamp(a, 0, 1) * 255], i * 4);
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c);
}

// Planets
// thin rim glow, only on the sunlit limb (L = world-space direction to the key light)
const atmosphereMat = (color, strength) => new THREE.ShaderMaterial({
  uniforms: { c: { value: new THREE.Color(color) }, k: { value: strength }, L: { value: new THREE.Vector3(0, 1, 0) } },
  vertexShader: `varying vec3 vN; varying vec3 vW;
    void main(){ vN = normalize(normalMatrix * normal); vW = normalize(mat3(modelMatrix) * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform vec3 c; uniform float k; uniform vec3 L; varying vec3 vN; varying vec3 vW;
    void main(){
      float rim = pow(max(0.0, 0.7 - dot(vN, vec3(0.0, 0.0, 1.0))), 2.5);
      float lit = smoothstep(-0.15, 0.55, dot(normalize(vW), L));
      float a = rim * lit * k;
      gl_FragColor = vec4(c * a, a);
    }`,
  side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
});

function createPlanet(o) {
  const group = new THREE.Group();
  const tilt = new THREE.Group();
  tilt.rotation.set(o.tilt?.[0] ?? 0.2, 0, o.tilt?.[1] ?? 0.1);
  group.add(tilt);

  const res = o.res ?? 512;
  const map = makeTexture(res, res / 2, painters[o.paint]);
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(o.radius, 96, 64),
    new THREE.MeshStandardMaterial({ map, roughness: o.rough ?? 0.9, bumpMap: o.bump ? map : null, bumpScale: o.bump ?? 1 })
  );
  tilt.add(mesh);

  const atm = new THREE.Mesh(new THREE.SphereGeometry(o.radius * 1.035, 64, 48), atmosphereMat(o.atmosphere, o.atmK));
  group.add(atm);

  const planet = { group, mesh, atm, radius: o.radius, spin: o.spin };

  if (o.clouds) {
    planet.clouds = new THREE.Mesh(
      new THREE.SphereGeometry(o.radius * 1.012, 96, 64),
      new THREE.MeshStandardMaterial({ map: makeTexture(1024, 512, painters.clouds), transparent: true, roughness: 1, depthWrite: false })
    );
    tilt.add(planet.clouds);
  }
  if (o.rings) {
    const [inner, outer] = o.rings.range.map(v => v * o.radius);
    const geo = new THREE.RingGeometry(inner, outer, 160, 1);
    const pos = geo.attributes.position, uv = geo.attributes.uv, v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      uv.setXY(i, (v.length() - inner) / (outer - inner), 0.5);
    }
    const ring = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      map: ringTexture(o.rings.kind), transparent: true, side: THREE.DoubleSide, roughness: 0.85, depthWrite: false,
    }));
    ring.rotation.x = Math.PI / 2;
    tilt.add(ring);
  }
  if (o.moon) {
    planet.moon = new THREE.Mesh(
      new THREE.SphereGeometry(o.radius * 0.26, 32, 24),
      new THREE.MeshStandardMaterial({ map: makeTexture(256, 128, painters.moon), roughness: 1 })
    );
    group.add(planet.moon);
  }
  scene.add(group);
  return planet;
}

// real planets in solar-system order (from Earth outwards, plus Pluto); the text sections follow this list
const planets = [
  createPlanet({ radius: 12, paint: 'earth', res: 1024, bump: 1.2, clouds: true, moon: true, atmosphere: 0x5aa8ff, atmK: 1.1, tilt: [0.25, 0.4], spin: 0.00008, rough: 0.6 }),
  createPlanet({ radius: 7, paint: 'mars', res: 1024, bump: 2.0, atmosphere: 0xff8a5a, atmK: 0.35, tilt: [0.3, -0.3], spin: 0.00007 }),
  createPlanet({ radius: 18, paint: 'jupiter', res: 1024, atmosphere: 0xf2b27a, atmK: 0.18, tilt: [0.1, 0.1], spin: 0.00012 }),
  createPlanet({ radius: 12, paint: 'saturn', res: 1024, atmosphere: 0xe9cf8a, atmK: 0.18, tilt: [0.5, -0.35], spin: 0.0001, rings: { kind: 'saturn', range: [1.35, 2.35] } }),
  createPlanet({ radius: 10, paint: 'uranus', atmosphere: 0x9eeef2, atmK: 0.5, tilt: [0.3, 1.35], spin: 0.00008, rings: { kind: 'uranus', range: [1.5, 2.1] } }),
  createPlanet({ radius: 10, paint: 'neptune', atmosphere: 0x6f8cff, atmK: 0.55, tilt: [0.2, 0.2], spin: 0.00009 }),
  createPlanet({ radius: 5, paint: 'pluto', res: 1024, bump: 1.5, atmosphere: 0x7fa0d8, atmK: 0.2, tilt: [0.25, -0.3], spin: 0.00006 }),
];
const N = planets.length;

// Lighting: a warm key and a cool rim point light per planet, plus soft ambient fill
scene.add(new THREE.AmbientLight(0x2c3270, 0.6));
const rimColors = [0x4aa8ff, 0xff5c8a, 0x9a6bff, 0x38d6c4, 0xff7ad9, 0x5a6bff];
const KEY_D = 62, RIM_D = 70;
planets.forEach((p, k) => {
  p.key = new THREE.PointLight(0xffe4bd, 4.4 * KEY_D * KEY_D, 190, 2);
  p.rim = new THREE.PointLight(rimColors[k], 1.5 * RIM_D * RIM_D, 190, 2);
  scene.add(p.key, p.rim);
});

// Stars: random colours, three sizes, soft round sprites
const spriteTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.85)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();

const SPZ = 80, CAMD = 55;
const starLayers = [[1100, 1.1], [500, 1.9], [160, 3.2]].map(([count, size]) => {
  const pos = new Float32Array(count * 3), col = new Float32Array(count * 3), color = new THREE.Color();
  for (let i = 0; i < count; i++) {
    pos.set([
      THREE.MathUtils.randFloatSpread(520),
      THREE.MathUtils.randFloatSpread(360),
      THREE.MathUtils.randFloat(-SPZ * N - 250, 120),
    ], i * 3);
    color.setHSL(Math.random(), THREE.MathUtils.randFloat(0.45, 1), THREE.MathUtils.randFloat(0.68, 0.9));
    col.set([color.r, color.g, color.b], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({
    size, map: spriteTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  scene.add(pts);
  return mat;
});

// Rocket (nose along local +y)
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, metalness: 0.25, roughness: 0.35, ...o });
const redMat = std(0xe8392e), whiteMat = std(0xf4f6fa), darkMat = std(0x2b2f3a, { metalness: 0.6, roughness: 0.4 });

const rocket = new THREE.Group();
const body = new THREE.Group();
rocket.add(body);
const lathe = (pts, mat, seg = 40) => new THREE.Mesh(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg), mat);

body.add(lathe([[0.001, -3.2], [0.8, -3.2], [0.95, -2.9], [1, -2.4], [1, 2]], whiteMat));
const nosePts = [];
for (let k = 0; k <= 16; k++) { const t = k / 16; nosePts.push([Math.max(0.001, Math.pow(1 - t * t, 0.7)), 2 + 3.4 * t]); }
body.add(lathe(nosePts, redMat));
const nozzle = lathe([[0.5, -3.1], [0.45, -3.6], [0.7, -4.3], [0.78, -4.3], [0.52, -3.5], [0.58, -3.1]], darkMat);
nozzle.material.side = THREE.DoubleSide;
body.add(nozzle);
for (const y of [1.6, -1.9]) {
  const band = new THREE.Mesh(new THREE.TorusGeometry(1.005, 0.09, 12, 48), redMat);
  band.rotation.x = Math.PI / 2; band.position.y = y; body.add(band);
}
for (const a of [0, Math.PI]) {
  const w = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.1, 12, 32), darkMat);
  const glass = new THREE.Mesh(new THREE.SphereGeometry(0.46, 24, 16),
    new THREE.MeshStandardMaterial({ color: 0x7fd4ff, emissive: 0x2a8fd6, emissiveIntensity: 0.9, roughness: 0.1 }));
  glass.scale.z = 0.25;
  w.add(ring, glass);
  w.position.set(Math.sin(a) * 0.98, 0.5, Math.cos(a) * 0.98);
  w.rotation.y = a; body.add(w);
}
const finShape = new THREE.Shape();
finShape.moveTo(0, 1.2); finShape.quadraticCurveTo(1.2, 0.2, 2, -1.6); finShape.lineTo(2, -2.2); finShape.lineTo(0, -1.2); finShape.closePath();
const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.14, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 });
finGeo.translate(0, 0, -0.07);
for (let k = 0; k < 4; k++) {
  const holder = new THREE.Group(), fin = new THREE.Mesh(finGeo, redMat);
  fin.position.set(0.85, -1.6, 0); holder.add(fin); holder.rotation.y = (k * Math.PI) / 2; body.add(holder);
}
const flame = new THREE.Group();
flame.position.y = -4.2;
const glow = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false };
const outer = new THREE.Mesh(new THREE.ConeGeometry(0.75, 3.6, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0xff7a1a, opacity: 0.75, ...glow }));
const inner = new THREE.Mesh(new THREE.ConeGeometry(0.42, 2.4, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff0a0, opacity: 0.95, ...glow }));
outer.rotation.x = inner.rotation.x = Math.PI;
outer.position.y = -1.8; inner.position.y = -1.2;
flame.add(outer, inner); body.add(flame);
const flameLight = new THREE.PointLight(0xff8a30, 60, 40, 2);
flameLight.position.y = -5.5;
body.add(flameLight);

scene.add(rocket);

/* exhaust trail */
const MAX = 360, LIFE = 1.4;
const tPos = new Float32Array(MAX * 3), tCol = new Float32Array(MAX * 3), tVel = new Float32Array(MAX * 3);
const tAge = new Float32Array(MAX).fill(1e9);
let head = 0;
const trailGeo = new THREE.BufferGeometry();
trailGeo.setAttribute('position', new THREE.BufferAttribute(tPos, 3));
trailGeo.setAttribute('color', new THREE.BufferAttribute(tCol, 3));
const trail = new THREE.Points(trailGeo, new THREE.PointsMaterial({
  size: 2.2, map: spriteTex, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
}));
trail.frustumCulled = false;
scene.add(trail);
const _tail = new THREE.Vector3(), _down = new THREE.Vector3();
function spawn(power) {
  const i = head; head = (head + 1) % MAX;
  const j = () => Math.random() - 0.5, sp = 4 + power * 7;
  tPos.set([_tail.x + j(), _tail.y + j(), _tail.z + j()], i * 3);
  tVel.set([_down.x * sp + j() * 2, _down.y * sp + j() * 2, _down.z * sp + j() * 2], i * 3);
  tAge[i] = 0;
}
function updateTrail(dt) {
  for (let i = 0; i < MAX; i++) {
    tAge[i] += dt;
    const f = Math.max(0, 1 - tAge[i] / LIFE);
    tPos[i * 3] += tVel[i * 3] * dt; tPos[i * 3 + 1] += tVel[i * 3 + 1] * dt; tPos[i * 3 + 2] += tVel[i * 3 + 2] * dt;
    tCol[i * 3] = f; tCol[i * 3 + 1] = 0.55 * f * f; tCol[i * 3 + 2] = 0.12 * f * f * f;
  }
  trailGeo.attributes.position.needsUpdate = true;
  trailGeo.attributes.color.needsUpdate = true;
}

// Layout: planets alternate sides (opposite the text); rocket stops beside each planet
const rocketStops = planets.map(() => new THREE.Vector3());
const padNormal = new THREE.Vector3(-0.55, 0.72, 0.42).normalize();
function layout() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);

  const halfH = Math.tan(degToRad(camera.fov / 2)) * CAMD, halfW = halfH * camera.aspect;
  const narrow = camera.aspect < 0.9;
  const ps = clamp(camera.aspect / 1.4, 0.45, 1);

  planets.forEach((p, k) => {
    const side = k % 2 === 0 ? 1 : -1;
    const x = narrow ? side * 0.15 * halfW : side * 0.46 * halfW;
    const y = narrow ? -0.4 * halfH : 0;
    p.group.position.set(x, y, -k * SPZ);
    p.group.scale.setScalar(ps);
    const R = p.radius * ps;

    // key light: warm, from the centre side, above and in front; rim light: cool, behind the outer edge
    p.key.position.set(x - side * 40 * ps, y + 34, -k * SPZ + 44);
    p.rim.position.set(x + side * 52 * ps, y + 14, -k * SPZ - 42);

    p.atm.material.uniforms.L.value.copy(p.key.position).sub(p.group.position).normalize();

    // the rocket hovers beside each planet
    if (k > 0) rocketStops[k].set(x - side * (R * 1.25 + 5 * ps), y, -k * SPZ + R + 9);
  });

  // Earth: the rocket stands on a launch pad on the upper-left of the planet, nose along the surface normal
  const rocketScale = 0.85 * clamp(ps, 0.6, 1);
  rocket.scale.setScalar(rocketScale);
  rocketStops[0].copy(planets[0].group.position).addScaledVector(padNormal, planets[0].radius * ps + 4.4 * rocketScale + 0.15);
  measure();
  updateTarget();
}

// Scroll timeline: each planet has an orbit phase while its text is read (T = 2k .. 2k+1)
// followed by a flight phase to the next planet (T = 2k+1 .. 2k+2)
let target = 0, current = 0, marks = [];
function measure() {
  const max = document.documentElement.scrollHeight - innerHeight;
  marks = [...document.querySelectorAll('main > section')].map(el => {
    const top = el.offsetTop, h = el.offsetHeight;
    return { a: top - 0.25 * innerHeight, b: top + h - 0.75 * innerHeight };
  });
  if (marks.length) { marks[0].a = 0; marks[marks.length - 1].b = Math.max(max, marks[marks.length - 1].a + 1); }
}
function updateTarget() {
  const y = scrollY, n = Math.min(marks.length, N);
  for (let k = 0; k < n; k++) {
    const { a, b } = marks[k];
    if (y <= b) { target = 2 * k + clamp((y - a) / Math.max(1, b - a), 0, 1); return; }
    if (k < n - 1 && y < marks[k + 1].a) { target = 2 * k + 1 + (y - b) / Math.max(1, marks[k + 1].a - b); return; }
  }
  target = 2 * n - 1;
}
addEventListener('scroll', updateTarget, { passive: true });
addEventListener('resize', layout);
// lazy images and videos change section heights after load
new ResizeObserver(() => { measure(); updateTarget(); }).observe(document.querySelector('main'));

const io = new IntersectionObserver(
  entries => entries.forEach(e => e.isIntersecting && e.target.classList.add('visible')),
  // a ratio threshold never fires for sections taller than the viewport, so reveal as soon as the top enters
  { threshold: 0, rootMargin: '0px 0px -20% 0px' }
);
document.querySelectorAll('main > section').forEach(el => { el.classList.add('reveal'); io.observe(el); });

// Animation loop
const UP = new THREE.Vector3(0, 1, 0);
const path = new THREE.CubicBezierCurve3(), T = new THREE.Vector3(), tan = new THREE.Vector3();
const qGoal = new THREE.Quaternion();
let last = 0, first = true;

// one full lap around planet k, starting and ending at its hover stop, tilted so it swings behind the planet
const _o2 = new THREE.Vector3();
function orbitPos(k, o, out) {
  const c = planets[k].group.position, v = rocketStops[k];
  const dx = v.x - c.x, dz = v.z - c.z, th = o * Math.PI * 2, cs = Math.cos(th), sn = Math.sin(th);
  const r = Math.hypot(dx, dz);
  return out.set(c.x + dx * cs + dz * sn, v.y + Math.sin(th) * r * 0.3, c.z - dx * sn + dz * cs);
}

renderer.setAnimationLoop(time => {
  const dt = Math.min((time - last) / 1000, 0.05);
  last = time;
  current += (target - current) * (1 - Math.exp(-dt * 6));

  // which hop are we on; dwell at each planet, fly in between
  const T = clamp(current, 0, 2 * N - 1);
  const pk = Math.min(Math.floor(T / 2), N - 1), ph = T - 2 * pk;
  const orbiting = ph < 1 && pk > 0; // Earth: the rocket waits on its launch pad instead
  const s = pk + Math.max(0, ph - 1);
  const i = Math.min(Math.floor(s), N - 2);
  const e = smoothstep(s - i, 0.18, 0.82);

  camera.position.set(Math.sin(time / 6000) * 1.5, Math.cos(time / 7000), CAMD - (i + e) * SPZ);
  camera.lookAt(0, 0, camera.position.z - 100);

  planets.forEach(p => {
    p.mesh.rotation.y = time * p.spin;
    if (p.clouds) p.clouds.rotation.y = time * p.spin * 1.35;
    if (p.moon) {
      const a = time / 5200;
      p.moon.position.set(Math.cos(a) * p.radius * 1.9, Math.sin(a * 0.7) * p.radius * 0.25, Math.sin(a) * p.radius * 1.9);
      p.moon.rotation.y = a;
    }
  });
  starLayers.forEach((m, k) => { m.opacity = 0.78 + Math.sin(time / (900 + k * 400) + k) * 0.22; });

  // rocket path: cubic Bezier from stop i to stop i+1, leaving and arriving nose-up
  const A = rocketStops[i], B = rocketStops[i + 1];
  if (i === 0) T.copy(padNormal).multiplyScalar(34).setZ(T.z + (B.z - A.z) / 3 * 0.5);
  else T.set(0, 26, (B.z - A.z) / 3);
  path.v0.copy(A);
  path.v1.copy(A).add(T);
  path.v2.copy(B).sub(T);
  path.v3.copy(B);
  if (orbiting) {
    orbitPos(pk, ph, rocket.position);
    orbitPos(pk, ph + 0.002, _o2);
    tan.copy(_o2).sub(rocket.position).normalize();
  } else {
    path.getPoint(e, rocket.position);
    rocket.position.y += Math.sin(time / 700) * 0.5 * smoothstep(e, 0.02, 0.1); // gentle bob while flying

    path.getTangent(e, tan);
    tan.z *= i === 0 ? lerp(1, 0.25, smoothstep(e, 0, 0.2)) : 0.25; // show more profile than depth; exact pad normal at liftoff
    tan.normalize();
  }
  qGoal.setFromUnitVectors(UP, tan);
  if (first) { rocket.quaternion.copy(qGoal); first = false; }
  else rocket.quaternion.slerp(qGoal, 1 - Math.exp(-dt * 7));
  body.rotation.y = time / 900 + e * Math.PI * 2;

  let power = orbiting ? 0.35 : Math.sin(Math.PI * e);
  if (i === 0) power = Math.max(power, smoothstep(e, 0, 0.04) * (1 - smoothstep(e, 0.25, 0.6))); // full thrust at liftoff
  const flick = 1 + Math.sin(time / 35) * 0.08 + Math.sin(time / 53) * 0.06;
  flame.scale.set(1 + power * 0.1, (0.75 + power * 0.95) * flick, 1 + power * 0.1);
  flameLight.intensity = 50 + power * 90;

  rocket.updateMatrixWorld();
  _tail.set(0, -4.4, 0).applyMatrix4(rocket.matrixWorld);
  _down.copy(UP).negate().applyQuaternion(rocket.quaternion);
  for (let k = 0; k < 2 + Math.round(power * 3); k++) spawn(power);
  updateTrail(dt);

  renderer.render(scene, camera);
});

layout();
