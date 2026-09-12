import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createMachineModel } from './machine-model';
export function createMachineScene(
  host: HTMLDivElement,
  onCrank: () => void,
  onReady: () => void,
) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 60);
  camera.position.set(5.6, 4.4, 10.2);
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8));
  renderer.setClearColor(0, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.72;
  renderer.domElement.setAttribute(
    'aria-label',
    'Interactive 3D capsule machine. Drag to rotate. Click the handle to spin or the globe to shuffle.',
  );
  renderer.domElement.setAttribute('role', 'img');
  host.appendChild(renderer.domElement);
  const pmrem = new THREE.PMREMGenerator(renderer),
    room = new RoomEnvironment(),
    env = pmrem.fromScene(room, 0.04);
  scene.environment = env.texture;
  room.dispose();
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xfff9e6, 0xab8b76, 1.2));
  const key = new THREE.DirectionalLight(0xfff4dd, 2.4);
  key.position.set(-4, 8, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -5;
  key.shadow.camera.right = 5;
  key.shadow.camera.top = 7;
  key.shadow.camera.bottom = -4;
  key.shadow.normalBias = 0.04;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 1.2);
  rim.position.set(4, 5, -4);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(0xfad7c5, 0.6);
  fill.position.set(0, 3, 7);
  scene.add(fill);
  const model = createMachineModel();
  scene.add(model.root);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 30),
    new THREE.ShadowMaterial({ color: 0x6b573a, opacity: 0.15 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  scene.add(ground);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 2.7, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.minPolarAngle = 0.85;
  controls.maxPolarAngle = 1.57;
  controls.minAzimuthAngle = -0.78;
  controls.maxAzimuthAngle = 0.78;
  controls.rotateSpeed = 0.65;
  controls.update();
  const ray = new THREE.Raycaster(),
    pointer = new THREE.Vector2(),
    velocities = model.capsules.map(() => new THREE.Vector3());
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const onMotion = () => {
    reduced = motion.matches;
    if (reduced) {
      model.root.rotation.z = 0;
      model.crank.rotation.z = 0;
      model.door.rotation.x = 0;
    }
  };
  motion.addEventListener('change', onMotion);
  let disposed = false,
    frame = 0,
    last = performance.now(),
    time = performance.now() / 1000,
    turnAt = -100,
    shakeAt = -100,
    busy = false,
    reduced = motion.matches;
  const pulse = new THREE.PointLight(0xffd687, 0, 4);
  pulse.position.set(0, 1.2, 2);
  scene.add(pulse);
  const ballCenter = new THREE.Vector3(0, 3.85, 0),
    limit = 1.26,
    diameter = Number(model.capsules[0]?.userData.radius || 0.235) * 2;
  const shove = (strength = 1) => {
    shakeAt = time;
    velocities.forEach((v, i) =>
      v.set(
        Math.sin(i * 7.9) * 1.5 * strength,
        1.5 + (i % 5) * 0.25 * strength,
        Math.cos(i * 3.7) * 1.4 * strength,
      ),
    );
  };
  function physics(dt: number) {
    for (let sub = 0; sub < 2; sub++) {
      const step = dt / 2;
      for (let i = 0; i < model.capsules.length; i++) {
        const p = model.capsules[i].position,
          v = velocities[i];
        v.y -= 3.8 * step;
        v.multiplyScalar(0.997);
        p.addScaledVector(v, step);
        const x = p.x,
          y = p.y - ballCenter.y,
          z = p.z,
          d = Math.sqrt(x * x + y * y + z * z);
        if (d > limit) {
          const n = new THREE.Vector3(x, y, z).divideScalar(d);
          p.copy(ballCenter).addScaledVector(n, limit);
          const outward = v.dot(n);
          if (outward > 0) v.addScaledVector(n, -outward * 1.45);
        }
        model.capsules[i].rotation.x += v.z * step * 1.7;
        model.capsules[i].rotation.z -= v.x * step * 1.7;
      }
      for (let i = 0; i < model.capsules.length; i++)
        for (let j = i + 1; j < model.capsules.length; j++) {
          const a = model.capsules[i].position,
            b = model.capsules[j].position,
            x = b.x - a.x,
            y = b.y - a.y,
            z = b.z - a.z,
            d2 = x * x + y * y + z * z;
          if (d2 < diameter * diameter && d2 > 0.00001) {
            const d = Math.sqrt(d2),
              n = new THREE.Vector3(x / d, y / d, z / d),
              over = (diameter - d) * 0.5;
            a.addScaledVector(n, -over);
            b.addScaledVector(n, over);
            const speed = velocities[j].clone().sub(velocities[i]).dot(n);
            if (speed < 0) {
              velocities[i].addScaledVector(n, speed * 0.52);
              velocities[j].addScaledVector(n, -speed * 0.52);
            }
          }
        }
    }
  }
  const find = (e: PointerEvent) => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      (-(e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    ray.setFromCamera(pointer, camera);
    return ray.intersectObjects(
      [model.crank, model.chamber, model.door],
      true,
    )[0];
  };
  const belongs = (obj: THREE.Object3D, target: THREE.Object3D) => {
    let p: THREE.Object3D | null = obj;
    while (p) {
      if (p === target) return true;
      p = p.parent;
    }
    return false;
  };
  let down = { x: 0, y: 0 },
    dragged = false;
  const start = (e: PointerEvent) => {
    down = { x: e.clientX, y: e.clientY };
    dragged = false;
  };
  const move = (e: PointerEvent) => {
    if (e.buttons && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5)
      dragged = true;
    const hit = find(e);
    renderer.domElement.style.cursor = hit && !dragged ? 'pointer' : 'grab';
  };
  const end = (e: PointerEvent) => {
    if (dragged) return;
    const hit = find(e);
    if (!hit) return;
    if (belongs(hit.object, model.crank) || belongs(hit.object, model.door)) {
      if (!busy) onCrank();
    } else shove(0.8);
  };
  renderer.domElement.addEventListener('pointerdown', start);
  renderer.domElement.addEventListener('pointermove', move);
  renderer.domElement.addEventListener('pointerup', end);
  function resize() {
    if (disposed) return;
    const w = host.clientWidth,
      h = host.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  resize();
  function animate(now: number) {
    if (disposed) return;
    frame = requestAnimationFrame(animate);
    const dt = Math.min((now - last) / 1000, 0.035);
    last = now;
    if (document.hidden) return;
    time = now / 1000;
    const t = time - turnAt,
      shake = time - shakeAt;
    if (!reduced) {
      physics(dt);
      model.root.rotation.z =
        shake < 0.55 ? Math.sin(shake * 35) * 0.018 * (1 - shake / 0.55) : 0;
      model.crank.rotation.z =
        t < 0.85
          ? -Math.PI * 2 * (1 - Math.pow(1 - Math.max(0, t) / 0.85, 3))
          : 0;
      model.agitator.rotation.y += busy ? dt * 5 : dt * 0.12;
    }
    model.door.rotation.x =
      !reduced && t > 0.85 && t < 1.7
        ? -Math.sin(((t - 0.85) / 0.85) * Math.PI) * 0.8
        : 0;
    pulse.intensity =
      busy && !reduced ? 0.2 + 0.5 * Math.sin(Math.max(0, t) * 8) ** 2 : 0;
    controls.update();
    renderer.render(scene, camera);
  }
  frame = requestAnimationFrame(animate);
  onReady();
  return {
    spin() {
      busy = true;
      turnAt = time;
      if (!reduced) shove(1.4);
    },
    finish() {
      busy = false;
    },
    shake() {
      if (!reduced) shove(1.1);
    },
    reset() {
      camera.position.set(5.6, 4.4, 10.2);
      controls.target.set(0, 2.7, 0);
      controls.update();
    },
    getOutlet() {
      const p = new THREE.Vector3(0, 0.65, 1.35);
      model.root.localToWorld(p);
      p.project(camera);
      return {
        x: (p.x * 0.5 + 0.5) * host.clientWidth,
        y: (-p.y * 0.5 + 0.5) * host.clientHeight,
      };
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      motion.removeEventListener('change', onMotion);
      controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', start);
      renderer.domElement.removeEventListener('pointermove', move);
      renderer.domElement.removeEventListener('pointerup', end);
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => m.dispose());
        }
      });
      env.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
