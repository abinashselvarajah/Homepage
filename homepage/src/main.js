import './style.css';
import * as THREE from 'three';

const canvas = document.querySelector('#bg');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 1000);
camera.position.z = 50;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);

const torus = new THREE.Mesh(
  new THREE.TorusGeometry(10, 3, 16, 100),
  new THREE.MeshStandardMaterial({ color: 0xff6347 })
);
scene.add(torus);

const light = new THREE.PointLight(0xffffff, 2000);
light.position.set(20, 20, 20);
scene.add(light, new THREE.AmbientLight(0xffffff, 0.4));


// rocket: built from primitives, nose points down -z (into the screen)
const rocket = new THREE.Group();
const body = new THREE.Group();
const mat = (c, extra = {}) => new THREE.MeshStandardMaterial({ color: c, ...extra });
const hull = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 5, 24), mat(0xf5f5f5, { metalness: 0.3, roughness: 0.4 }));
const nose = new THREE.Mesh(new THREE.ConeGeometry(1, 2.5, 24), mat(0xe03c31));
nose.position.y = 3.75;
const window_ = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 16), mat(0x4fc3f7, { emissive: 0x1565c0 }));
window_.position.set(0, 1, 0.85);
window_.scale.z = 0.5;
body.add(hull, nose, window_);
for (let i = 0; i < 3; i++) {
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2, 1.6), mat(0xe03c31));
  const a = (i / 3) * Math.PI * 2;
  fin.position.set(Math.sin(a) * 1.3, -2, Math.cos(a) * 1.3);
  fin.rotation.y = a;
  body.add(fin);
}
const flame = new THREE.Mesh(
  new THREE.ConeGeometry(0.7, 3, 16),
  new THREE.MeshBasicMaterial({ color: 0xffa726 })
);
flame.rotation.x = Math.PI;
flame.position.y = -3.9;
body.add(flame);
body.rotation.x = -Math.PI / 2;
rocket.add(body);
rocket.scale.setScalar(1.2);
scene.add(rocket);

// stars spread along the camera's path so the fly-through is visible
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

// scroll progress 0..1, smoothed
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

// reveal text on scroll
const io = new IntersectionObserver(
  entries => entries.forEach(e => e.isIntersecting && e.target.classList.add('visible')),
  { threshold: 0.3 }
);
document.querySelectorAll('main > *').forEach(el => { el.classList.add('reveal'); io.observe(el); });

renderer.setAnimationLoop(time => {
  current += (target - current) * 0.08;
  torus.rotation.x = time / 2000 + current * 6;
  torus.rotation.y = time / 1000 + current * 4;
  camera.position.z = 50 - current * 180;
  camera.position.x = Math.sin(current * Math.PI * 2) * 15;
  camera.position.y = Math.cos(current * Math.PI * 2) * 6;
  camera.lookAt(0, 0, camera.position.z - 50);

  // rocket flies ahead of the camera, weaving once per section
  const weave = current * Math.PI * 8;
  rocket.position.set(
    camera.position.x + Math.sin(weave) * 9,
    camera.position.y + Math.cos(weave * 0.5) * 4 - 2,
    camera.position.z - 30
  );
  rocket.rotation.z = -Math.cos(weave) * 0.5;      // bank into the turn
  rocket.rotation.y = Math.sin(weave) * 0.15;
  body.rotation.y = time / 400;                     // slow roll
  const flick = 1 + Math.sin(time / 40) * 0.2 + current * 0.5;
  flame.scale.set(1, flick, 1);
  renderer.render(scene, camera);
});
