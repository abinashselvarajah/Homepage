import './style.css';
import * as THREE from 'three';

const { clamp, lerp, smoothstep } = THREE.MathUtils;

const canvas = document.querySelector('#bg');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 1000);
camera.position.z = 50;
scene.add(camera);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);

/* ---------- lights (the rig travels with the camera so the rocket is always lit) ---------- */
scene.add(new THREE.HemisphereLight(0xbcd7ff, 0x1a1030, 1.1));
const key = new THREE.DirectionalLight(0xffffff, 2.6);
key.position.set(6, 9, 8);
key.target.position.set(0, 0, -30);
const rim = new THREE.DirectionalLight(0x6fa8ff, 1.6);
rim.position.set(-8, 2, -6);
rim.target.position.set(0, 0, -30);
camera.add(key, key.target, rim, rim.target);

/* ---------- torus ---------- */
const torus = new THREE.Mesh(
  new THREE.TorusGeometry(10, 3, 16, 100),
  new THREE.MeshStandardMaterial({ color: 0xff6347 })
);
const torusLight = new THREE.PointLight(0xffffff, 2000);
torusLight.position.set(20, 20, 20);
scene.add(torus, torusLight);

/* ---------- stars along the flight path ---------- */
const starGeo = new THREE.SphereGeometry(0.25, 12, 12);
const starMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
for (let i = 0; i < 300; i++) {
  const star = new THREE.Mesh(starGeo, starMat);
  star.position.set(
    THREE.MathUtils.randFloatSpread(120),
    THREE.MathUtils.randFloatSpread(120),
    THREE.MathUtils.randFloat(-150, 60)
  );
  scene.add(star);
}

/* ---------- rocket (nose along local +y) ---------- */
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, metalness: 0.25, roughness: 0.35, ...o });
const redMat = std(0xe8392e);
const whiteMat = std(0xf4f6fa);
const darkMat = std(0x2b2f3a, { metalness: 0.6, roughness: 0.4 });

const rocket = new THREE.Group();
const body = new THREE.Group(); // rolls around its own axis
rocket.add(body);

const lathe = (pts, mat, seg = 40) => new THREE.Mesh(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg), mat);

// fuselage
body.add(lathe([[0.001, -3.2], [0.8, -3.2], [0.95, -2.9], [1, -2.4], [1, 2]], whiteMat));
// ogive nose cone
const nosePts = [];
for (let k = 0; k <= 16; k++) {
  const t = k / 16;
  nosePts.push([Math.max(0.001, Math.pow(1 - t * t, 0.7)), 2 + 3.4 * t]);
}
body.add(lathe(nosePts, redMat));
// nozzle
const nozzle = lathe([[0.5, -3.1], [0.45, -3.6], [0.7, -4.3], [0.78, -4.3], [0.52, -3.5], [0.58, -3.1]], darkMat);
nozzle.material.side = THREE.DoubleSide;
body.add(nozzle);
// colour bands
for (const y of [1.6, -1.9]) {
  const band = new THREE.Mesh(new THREE.TorusGeometry(1.005, 0.09, 12, 48), redMat);
  band.rotation.x = Math.PI / 2;
  band.position.y = y;
  body.add(band);
}
// portholes
for (const [a, y] of [[0, 0.5], [Math.PI, 0.5]]) {
  const w = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.1, 12, 32), darkMat);
  const glass = new THREE.Mesh(
    new THREE.SphereGeometry(0.46, 24, 16),
    new THREE.MeshStandardMaterial({ color: 0x7fd4ff, emissive: 0x2a8fd6, emissiveIntensity: 0.9, roughness: 0.1 })
  );
  glass.scale.z = 0.25;
  w.add(ring, glass);
  w.position.set(Math.sin(a) * 0.98, y, Math.cos(a) * 0.98);
  w.rotation.y = a;
  body.add(w);
}
// swept fins
const finShape = new THREE.Shape();
finShape.moveTo(0, 1.2);
finShape.quadraticCurveTo(1.2, 0.2, 2, -1.6);
finShape.lineTo(2, -2.2);
finShape.lineTo(0, -1.2);
finShape.closePath();
const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.14, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 });
finGeo.translate(0, 0, -0.07);
for (let k = 0; k < 4; k++) {
  const holder = new THREE.Group();
  const fin = new THREE.Mesh(finGeo, redMat);
  fin.position.set(0.85, -1.6, 0);
  holder.add(fin);
  holder.rotation.y = (k * Math.PI) / 2;
  body.add(holder);
}

// flame (scaled from its top so it grows downward)
const flame = new THREE.Group();
flame.position.y = -4.2;
const glow = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false };
const outer = new THREE.Mesh(new THREE.ConeGeometry(0.75, 3.6, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0xff7a1a, opacity: 0.75, ...glow }));
const inner = new THREE.Mesh(new THREE.ConeGeometry(0.42, 2.4, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff0a0, opacity: 0.95, ...glow }));
outer.rotation.x = inner.rotation.x = Math.PI;
outer.position.y = -1.8;
inner.position.y = -1.2;
flame.add(outer, inner);
body.add(flame);
const flameLight = new THREE.PointLight(0xff8a30, 40, 25);
flameLight.position.y = -5.5;
body.add(flameLight);

rocket.scale.setScalar(0.8);
scene.add(rocket);

/* ---------- exhaust trail ---------- */
const MAX = 320, LIFE = 1.3;
const tPos = new Float32Array(MAX * 3), tCol = new Float32Array(MAX * 3), tVel = new Float32Array(MAX * 3);
const tAge = new Float32Array(MAX).fill(1e9);
let head = 0;
const trailGeo = new THREE.BufferGeometry();
trailGeo.setAttribute('position', new THREE.BufferAttribute(tPos, 3));
trailGeo.setAttribute('color', new THREE.BufferAttribute(tCol, 3));
const trail = new THREE.Points(trailGeo, new THREE.PointsMaterial({
  size: 1.1, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
}));
trail.frustumCulled = false;
scene.add(trail);

const _tail = new THREE.Vector3(), _down = new THREE.Vector3();
function spawn(power) {
  const i = head; head = (head + 1) % MAX;
  const j = () => (Math.random() - 0.5);
  tPos.set([_tail.x + j() * 0.8, _tail.y + j() * 0.8, _tail.z + j() * 0.8], i * 3);
  tVel.set([_down.x * (4 + power * 6) + j() * 1.5, _down.y * (4 + power * 6) + j() * 1.5, _down.z * (4 + power * 6) + j() * 1.5], i * 3);
  tAge[i] = 0;
}
function updateTrail(dt) {
  for (let i = 0; i < MAX; i++) {
    tAge[i] += dt;
    const f = Math.max(0, 1 - tAge[i] / LIFE);
    tPos[i * 3] += tVel[i * 3] * dt;
    tPos[i * 3 + 1] += tVel[i * 3 + 1] * dt;
    tPos[i * 3 + 2] += tVel[i * 3 + 2] * dt;
    tCol[i * 3] = f;
    tCol[i * 3 + 1] = 0.55 * f * f;
    tCol[i * 3 + 2] = 0.12 * f * f * f;
  }
  trailGeo.attributes.position.needsUpdate = true;
  trailGeo.attributes.color.needsUpdate = true;
}

/* ---------- scroll ---------- */
const sections = [...document.querySelectorAll('main > *')];
const N = sections.length;
let target = 0, current = 0;
const updateTarget = () => {
  const max = document.documentElement.scrollHeight - innerHeight;
  target = max > 0 ? scrollY / max : 0;
};
addEventListener('scroll', updateTarget, { passive: true });
updateTarget();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  updateTarget();
});

// text alternates left/right, so the rocket waits on the opposite side of each section
const io = new IntersectionObserver(
  entries => entries.forEach(e => e.isIntersecting && e.target.classList.add('visible')),
  { threshold: 0.3 }
);
sections.forEach(el => { el.classList.add('reveal'); io.observe(el); });

function waypoint(i) {
  const narrow = camera.aspect < 0.9;
  return { x: (i % 2 === 0 ? 1 : -1) * (narrow ? 0.4 : 0.55), y: narrow ? -0.55 : 0.05 };
}

/* ---------- loop ---------- */
const D = 30; // rocket distance in front of camera
const _local = new THREE.Vector3(), _q = new THREE.Quaternion(), _qz = new THREE.Quaternion(), _qx = new THREE.Quaternion();
const Z = new THREE.Vector3(0, 0, 1), X = new THREE.Vector3(1, 0, 0), UP = new THREE.Vector3(0, 1, 0);
let prev = null, vx = 0, vy = 0, heading = 0, last = 0;

renderer.setAnimationLoop(time => {
  const dt = Math.min((time - last) / 1000, 0.05);
  last = time;

  current += (target - current) * 0.08;
  torus.rotation.x = time / 2000 + current * 6;
  torus.rotation.y = time / 1000 + current * 4;

  camera.position.z = 50 - current * 180;
  camera.position.x = Math.sin(current * Math.PI * 2) * 15;
  camera.position.y = Math.cos(current * Math.PI * 2) * 6;
  camera.lookAt(0, 0, camera.position.z - 50);
  camera.updateMatrixWorld();

  // which section pair are we between, and how far along the hop?
  const s = clamp(current * (N - 1), 0, N - 1);
  const i = Math.min(Math.floor(s), N - 2);
  const e = smoothstep(s - i, 0.2, 0.8); // dwell near each section, fly in between
  const a = waypoint(i), b = waypoint(i + 1);
  const px = lerp(a.x, b.x, e);
  const py = lerp(a.y, b.y, e) + Math.sin(Math.PI * e) * 0.35 + Math.sin(time / 700) * 0.03;

  const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * D;
  const halfW = halfH * camera.aspect;
  _local.set(px * halfW, py * halfH, -D);
  rocket.position.copy(camera.localToWorld(_local));

  // screen-space velocity -> nose points where it's going, upright when hovering
  const ux = px * camera.aspect, uy = py;
  if (prev) { vx += ((ux - prev.x) - vx) * 0.2; vy += ((uy - prev.y) - vy) * 0.2; }
  prev = { x: ux, y: uy };
  const speed = Math.hypot(vx, vy);
  const power = smoothstep(speed, 0.002, 0.02);
  const goal = speed > 0.004 ? Math.atan2(-vx, vy) : 0;
  heading += (((goal - heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * 0.12;

  _qz.setFromAxisAngle(Z, heading);
  _qx.setFromAxisAngle(X, 0.35);
  rocket.quaternion.copy(camera.quaternion).multiply(_qz).multiply(_qx);
  body.rotation.y = time / 900 + e * Math.PI * 2; // slow roll plus a full barrel roll per hop

  // flame
  const flick = 1 + Math.sin(time / 35) * 0.08 + Math.sin(time / 53) * 0.06;
  const len = (0.75 + power * 0.9) * flick;
  flame.scale.set(1 + power * 0.1, len, 1 + power * 0.1);
  flameLight.intensity = 30 + power * 40;

  // exhaust
  rocket.updateMatrixWorld();
  _tail.set(0, -4.4 * 0.8, 0).applyMatrix4(rocket.matrixWorld);
  _down.copy(UP).negate().applyQuaternion(rocket.quaternion);
  for (let k = 0; k < 2 + Math.round(power * 3); k++) spawn(power);
  updateTrail(dt);

  renderer.render(scene, camera);
});
