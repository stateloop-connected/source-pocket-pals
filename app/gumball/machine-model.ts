import * as THREE from 'three';

/**
 * A self-contained capsule machine. Y is up, the customer stands on +Z.
 * No textures, loaders, fonts, lights, renderer settings, or animation required.
 * Static geometry is batched by material. All returned pivots are root-local.
 */
export type MachineModel = {
  root: THREE.Group;
  crank: THREE.Group;
  door: THREE.Group;
  capsules: THREE.Group[];
  chamber: THREE.Mesh;
  agitator: THREE.Group;
};

type XYZ = [number, number, number];

/** Small dependency-free static geometry batcher, retaining normals and UVs. */
function geometryBatch(target: THREE.Group) {
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  return {
    add(
      geometry: THREE.BufferGeometry,
      material: THREE.Material,
      position: XYZ = [0, 0, 0],
      rotation: XYZ = [0, 0, 0],
      scale: XYZ = [1, 1, 1],
    ) {
      const quaternion = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(...rotation),
      );
      geometry.applyMatrix4(
        new THREE.Matrix4().compose(
          new THREE.Vector3(...position),
          quaternion,
          new THREE.Vector3(...scale),
        ),
      );
      if (!buckets.has(material)) buckets.set(material, []);
      buckets.get(material)!.push(geometry);
    },
    finish(prefix: string) {
      for (const [material, geometries] of buckets) {
        const flat = geometries.map((geometry) =>
          geometry.index ? geometry.toNonIndexed() : geometry,
        );
        const vertexCount = flat.reduce(
          (sum, geometry) => sum + geometry.getAttribute('position').count,
          0,
        );
        const positions = new Float32Array(vertexCount * 3);
        const normals = new Float32Array(vertexCount * 3);
        const uvs = new Float32Array(vertexCount * 2);
        let offset = 0;
        for (const geometry of flat) {
          const p = geometry.getAttribute('position');
          const n = geometry.getAttribute('normal');
          const uv = geometry.getAttribute('uv');
          for (let i = 0; i < p.count; i++) {
            positions.set([p.getX(i), p.getY(i), p.getZ(i)], (offset + i) * 3);
            normals.set([n.getX(i), n.getY(i), n.getZ(i)], (offset + i) * 3);
            if (uv) uvs.set([uv.getX(i), uv.getY(i)], (offset + i) * 2);
          }
          offset += p.count;
        }
        const merged = new THREE.BufferGeometry();
        merged.setAttribute(
          'position',
          new THREE.BufferAttribute(positions, 3),
        );
        merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
        merged.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
        merged.computeBoundingBox();
        merged.computeBoundingSphere();
        const mesh = new THREE.Mesh(merged, material);
        mesh.name = `${prefix}-${material.name}`;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        target.add(mesh);
        for (const geometry of new Set([...geometries, ...flat]))
          geometry.dispose();
      }
      buckets.clear();
    },
  };
}

function roundedRectPath(
  width: number,
  height: number,
  radius: number,
  clockwise = false,
) {
  const path = new THREE.Shape();
  const x = -width / 2,
    y = -height / 2;
  path.moveTo(x + radius, y);
  path.lineTo(x + width - radius, y);
  path.quadraticCurveTo(x + width, y, x + width, y + radius);
  path.lineTo(x + width, y + height - radius);
  path.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  path.lineTo(x + radius, y + height);
  path.quadraticCurveTo(x, y + height, x, y + height - radius);
  path.lineTo(x, y + radius);
  path.quadraticCurveTo(x, y, x + radius, y);
  if (clockwise) {
    return new THREE.Path(path.getPoints(8).reverse());
  }
  return path;
}

function plaque(width: number, height: number, depth: number, radius = 0.08) {
  return new THREE.ExtrudeGeometry(
    roundedRectPath(width, height, radius) as THREE.Shape,
    {
      depth,
      steps: 1,
      bevelEnabled: true,
      bevelSegments: 2,
      bevelSize: 0.012,
      bevelThickness: 0.009,
      curveSegments: 6,
    },
  );
}

function frame(
  width: number,
  height: number,
  openingWidth: number,
  openingHeight: number,
  depth: number,
) {
  const shape = roundedRectPath(width, height, 0.13) as THREE.Shape;
  shape.holes.push(roundedRectPath(openingWidth, openingHeight, 0.08, true));
  return new THREE.ExtrudeGeometry(shape, {
    depth,
    steps: 1,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.012,
    bevelThickness: 0.012,
    curveSegments: 6,
  });
}

function lathe(profile: [number, number][], segments = 56) {
  return new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    segments,
  );
}

function ring(radius: number, tube: number, segments = 56) {
  const geometry = new THREE.TorusGeometry(radius, tube, 6, segments);
  geometry.rotateX(Math.PI / 2);
  return geometry;
}

function cylinderAlongZ(radius: number, length: number, segments = 24) {
  const geometry = new THREE.CylinderGeometry(radius, radius, length, segments);
  geometry.rotateX(Math.PI / 2);
  return geometry;
}

function rodBetween(start: XYZ, end: XYZ, radius: number) {
  const a = new THREE.Vector3(...start),
    b = new THREE.Vector3(...end);
  const geometry = new THREE.CylinderGeometry(
    radius,
    radius,
    a.distanceTo(b),
    12,
  );
  geometry.applyQuaternion(
    new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      b.clone().sub(a).normalize(),
    ),
  );
  geometry.translate(...(a.add(b).multiplyScalar(0.5).toArray() as XYZ));
  return geometry;
}

export function createMachineModel(): MachineModel {
  const root = new THREE.Group();
  root.name = 'capsule-machine';

  const enamel = new THREE.MeshPhysicalMaterial({
    color: 0xc91e32,
    metalness: 0.24,
    roughness: 0.22,
    clearcoat: 1,
    clearcoatRoughness: 0.11,
  });
  enamel.name = 'cherry-enamel';
  const enamelDark = new THREE.MeshPhysicalMaterial({
    color: 0x6c1325,
    metalness: 0.36,
    roughness: 0.26,
    clearcoat: 1,
    clearcoatRoughness: 0.14,
  });
  enamelDark.name = 'oxblood-enamel';
  const cream = new THREE.MeshPhysicalMaterial({
    color: 0xffedc9,
    metalness: 0.08,
    roughness: 0.28,
    clearcoat: 0.7,
  });
  cream.name = 'ivory-enamel';
  const brass = new THREE.MeshStandardMaterial({
    color: 0xd4a558,
    metalness: 0.9,
    roughness: 0.22,
  });
  brass.name = 'satin-brass';
  const chrome = new THREE.MeshStandardMaterial({
    color: 0xe9dec9,
    metalness: 0.93,
    roughness: 0.19,
  });
  chrome.name = 'warm-chrome';
  const brushed = new THREE.MeshStandardMaterial({
    color: 0xb4a68b,
    metalness: 0.84,
    roughness: 0.4,
  });
  brushed.name = 'brushed-metal';
  const darkMetal = new THREE.MeshStandardMaterial({
    color: 0x323a39,
    metalness: 0.68,
    roughness: 0.34,
  });
  darkMetal.name = 'charcoal-metal';
  const black = new THREE.MeshStandardMaterial({
    color: 0x090b12,
    metalness: 0.02,
    roughness: 0.86,
  });
  black.name = 'recess';
  const rubber = new THREE.MeshStandardMaterial({
    color: 0x272125,
    roughness: 0.9,
  });
  rubber.name = 'rubber';

  const body = new THREE.Group();
  body.name = 'static-body';
  root.add(body);
  const batch = geometryBatch(body);

  // Broad, weighted stepped plinth with a floating enamel foot and fine piping.
  batch.add(
    lathe([
      [0, 0],
      [1.08, 0],
      [1.14, 0.07],
      [1.14, 0.12],
      [0, 0.12],
    ]),
    rubber,
  );
  batch.add(
    lathe([
      [0, 0.1],
      [1.24, 0.1],
      [1.3, 0.14],
      [1.3, 0.22],
      [1.27, 0.26],
      [1.16, 0.29],
      [1.15, 0.39],
      [1.09, 0.44],
      [0, 0.44],
    ]),
    enamel,
  );
  batch.add(ring(1.28, 0.016), brass, [0, 0.235, 0]);
  batch.add(ring(1.16, 0.025), cream, [0, 0.315, 0]);
  batch.add(
    lathe([
      [0, 0.39],
      [1.08, 0.39],
      [1.075, 0.48],
      [1.04, 0.59],
      [0.95, 0.97],
      [0.9, 1.35],
      [0.89, 1.76],
      [0.93, 2.03],
      [1.02, 2.26],
      [1.04, 2.35],
      [0.99, 2.43],
      [0, 2.43],
    ]),
    enamel,
  );
  batch.add(ring(1.045, 0.029), enamelDark, [0, 0.48, 0]);

  // Under-globe bowl: a cream gasket rests on a polished, fluted red collar.
  batch.add(
    lathe([
      [0, 2.29],
      [1.02, 2.29],
      [1.095, 2.34],
      [1.095, 2.42],
      [1.04, 2.48],
      [0.96, 2.53],
      [0.93, 2.59],
      [0, 2.59],
    ]),
    enamelDark,
  );
  batch.add(ring(1.077, 0.027), brass, [0, 2.39, 0]);
  batch.add(ring(0.948, 0.036), cream, [0, 2.575, 0]);
  batch.add(
    new THREE.CylinderGeometry(0.87, 0.79, 0.09, 48),
    brass,
    [0, 2.555, 0],
  );
  batch.add(
    new THREE.CylinderGeometry(0.8, 0.8, 0.035, 48),
    cream,
    [0, 2.615, 0],
  );
  for (let i = 0; i < 28; i++) {
    const angle = (i * Math.PI * 2) / 28;
    batch.add(
      new THREE.BoxGeometry(0.012, 0.068, 0.026),
      brass,
      [Math.sin(angle) * 1.096, 2.371, Math.cos(angle) * 1.096],
      [0, angle, 0],
    );
  }

  // Four shaped support fins give the pedestal a cast-metal construction.
  const fin = new THREE.Shape();
  fin.moveTo(0.84, 1.84);
  fin.lineTo(0.97, 2.24);
  fin.lineTo(1.14, 2.34);
  fin.quadraticCurveTo(1.15, 2.23, 1.04, 2.06);
  fin.lineTo(0.98, 1.83);
  fin.closePath();
  for (let i = 0; i < 4; i++) {
    const geometry = new THREE.ExtrudeGeometry(fin, {
      depth: 0.095,
      bevelEnabled: true,
      bevelSize: 0.02,
      bevelThickness: 0.02,
      bevelSegments: 2,
      steps: 1,
      curveSegments: 5,
    });
    geometry.translate(0, 0, -0.0475);
    batch.add(
      geometry,
      enamel,
      [0, 0, 0],
      [0, Math.PI / 4 + (i * Math.PI) / 2, 0],
    );
  }

  // Sculpted cap, rolled lip, cream pinstripe, and turned brass finial.
  batch.add(
    lathe([
      [0, 5.195],
      [0.74, 5.195],
      [0.815, 5.225],
      [0.845, 5.26],
      [0.833, 5.3],
      [0.78, 5.345],
      [0.7, 5.43],
      [0.57, 5.5],
      [0.37, 5.558],
      [0.16, 5.583],
      [0, 5.588],
    ]),
    enamel,
  );
  batch.add(ring(0.829, 0.018), brass, [0, 5.277, 0]);
  batch.add(ring(0.773, 0.018), cream, [0, 5.337, 0]);
  batch.add(
    new THREE.CylinderGeometry(0.15, 0.19, 0.044, 32),
    brass,
    [0, 5.605, 0],
  );
  batch.add(
    new THREE.CylinderGeometry(0.06, 0.075, 0.12, 24),
    brass,
    [0, 5.675, 0],
  );
  batch.add(
    new THREE.SphereGeometry(0.085, 20, 12),
    brass,
    [0, 5.745, 0],
    [0, 0, 0],
    [1, 0.76, 1],
  );

  // Raised coin mechanism. Fine nested surfaces catch different light angles.
  batch.add(plaque(1.03, 1.085, 0.045, 0.14), enamelDark, [0, 1.635, 0.905]);
  batch.add(plaque(0.91, 1.005, 0.056, 0.125), chrome, [0, 1.65, 0.963]);
  batch.add(plaque(0.785, 0.866, 0.011, 0.09), brushed, [0, 1.65, 1.027]);
  batch.add(plaque(0.458, 0.145, 0.013, 0.045), darkMetal, [0, 1.956, 1.046]);
  batch.add(plaque(0.35, 0.052, 0.013, 0.017), black, [0, 1.958, 1.065]);
  batch.add(
    new THREE.BoxGeometry(0.345, 0.012, 0.01),
    chrome,
    [0, 1.923, 1.082],
  );
  for (const x of [-0.352, 0.352]) {
    for (const y of [1.247, 2.048]) {
      batch.add(cylinderAlongZ(0.027, 0.022, 12), chrome, [x, y, 1.047]);
      batch.add(
        new THREE.BoxGeometry(0.029, 0.005, 0.004),
        darkMetal,
        [x, y, 1.061],
        [0, 0, x < 0 ? 0.5 : -0.45],
      );
    }
  }
  // Bezel, dark dial, radial tick engravings, and fixed bearing.
  batch.add(cylinderAlongZ(0.298, 0.04, 40), chrome, [0, 1.59, 1.074]);
  batch.add(cylinderAlongZ(0.264, 0.028, 40), darkMetal, [0, 1.59, 1.099]);
  batch.add(cylinderAlongZ(0.228, 0.03, 40), brass, [0, 1.59, 1.121]);
  batch.add(cylinderAlongZ(0.2, 0.013, 36), brushed, [0, 1.59, 1.144]);
  for (let i = 0; i < 16; i++) {
    const a = (i * Math.PI * 2) / 16;
    batch.add(
      new THREE.BoxGeometry(0.012, i % 4 ? 0.026 : 0.043, 0.004),
      cream,
      [Math.sin(a) * 0.247, 1.59 + Math.cos(a) * 0.247, 1.116],
      [0, 0, -a],
    );
  }
  // Tiny arc and arrow head mark the turn direction without any branding/text.
  batch.add(
    new THREE.TorusGeometry(0.315, 0.007, 5, 20, Math.PI * 0.68),
    enamelDark,
    [0, 1.588, 1.058],
    [0, 0, -0.19],
  );
  const arrow = new THREE.Shape();
  arrow.moveTo(-0.026, -0.022);
  arrow.lineTo(0.03, 0);
  arrow.lineTo(-0.026, 0.023);
  arrow.closePath();
  batch.add(
    new THREE.ShapeGeometry(arrow),
    enamelDark,
    [0.12, 1.88, 1.064],
    [0, 0, 2.45],
  );

  // Capsule collection recess, beveled surround, and a protruding cupped tray.
  batch.add(plaque(0.88, 0.76, 0.024, 0.15), enamelDark, [0, 0.743, 1.037]);
  batch.add(plaque(0.73, 0.629, 0.022, 0.11), black, [0, 0.745, 1.078]);
  batch.add(
    frame(0.852, 0.748, 0.661, 0.567, 0.061),
    chrome,
    [0, 0.745, 1.119],
  );
  batch.add(
    new THREE.BoxGeometry(0.655, 0.035, 0.4),
    darkMetal,
    [0, 0.425, 1.299],
  );
  batch.add(
    new THREE.BoxGeometry(0.61, 0.009, 0.345),
    rubber,
    [0, 0.451, 1.31],
  );
  batch.add(plaque(0.78, 0.105, 0.051, 0.04), chrome, [0, 0.446, 1.496]);
  for (const x of [-0.365, 0.365]) {
    batch.add(new THREE.BoxGeometry(0.062, 0.123, 0.357), chrome, [
      x,
      0.48,
      1.306,
    ]);
  }
  for (let i = 0; i < 5; i++) {
    batch.add(new THREE.BoxGeometry(0.43, 0.009, 0.011), brushed, [
      0,
      0.458,
      1.2 + i * 0.048,
    ]);
  }
  batch.add(
    new THREE.CylinderGeometry(0.035, 0.035, 0.66, 16),
    brass,
    [0, 0.985, 1.233],
    [0, 0, Math.PI / 2],
  );
  batch.finish('body');

  const crank = new THREE.Group();
  crank.name = 'crank-z-pivot';
  crank.position.set(0, 1.59, 1.173);
  crank.userData = { axis: 'z', restRotation: 0, interaction: 'turn' };
  root.add(crank);
  const crankBatch = geometryBatch(crank);
  crankBatch.add(cylinderAlongZ(0.119, 0.125, 28), chrome, [0, 0, 0.008]);
  crankBatch.add(cylinderAlongZ(0.083, 0.018, 24), brass, [0, 0, 0.08]);
  crankBatch.add(
    rodBetween([0, 0, 0.075], [0.244, -0.084, 0.092], 0.059),
    chrome,
  );
  crankBatch.add(
    new THREE.SphereGeometry(0.06, 12, 8),
    chrome,
    [0.244, -0.084, 0.092],
  );
  crankBatch.add(
    cylinderAlongZ(0.034, 0.18, 16),
    brass,
    [0.244, -0.084, 0.162],
  );
  crankBatch.add(
    new THREE.SphereGeometry(0.088, 20, 12),
    enamel,
    [0.244, -0.084, 0.247],
    [0, 0, 0],
    [0.84, 0.84, 1.62],
  );
  crankBatch.add(
    cylinderAlongZ(0.067, 0.017, 20),
    chrome,
    [0.244, -0.084, 0.152],
  );
  crankBatch.add(
    cylinderAlongZ(0.044, 0.012, 20),
    brass,
    [0.244, -0.084, 0.388],
  );
  crankBatch.finish('crank');

  const door = new THREE.Group();
  door.name = 'chute-door-x-pivot';
  door.position.set(0, 0.985, 1.233);
  door.userData = {
    axis: 'x',
    restRotation: 0,
    openRotation: -1.05,
    interaction: 'open',
  };
  root.add(door);
  const doorBatch = geometryBatch(door);
  doorBatch.add(
    plaque(0.583, 0.447, 0.023, 0.051),
    brushed,
    [0, -0.248, -0.02],
  );
  doorBatch.add(plaque(0.492, 0.345, 0.011, 0.04), chrome, [0, -0.248, 0.01]);
  doorBatch.add(
    plaque(0.274, 0.039, 0.015, 0.012),
    darkMetal,
    [0, -0.391, 0.024],
  );
  // A little debossed capsule emblem, made from geometry, on the flap.
  doorBatch.add(
    new THREE.TorusGeometry(0.069, 0.005, 5, 20),
    brass,
    [0, -0.237, 0.036],
  );
  doorBatch.add(
    new THREE.BoxGeometry(0.127, 0.007, 0.006),
    brass,
    [0, -0.237, 0.037],
    [0, 0, -0.43],
  );
  doorBatch.finish('door');

  const glass = new THREE.MeshPhysicalMaterial({
    color: 0xeaf9ff,
    metalness: 0,
    roughness: 0.1,
    transparent: true,
    opacity: 0.12,
    transmission: 0.3,
    thickness: 0.055,
    ior: 1.46,
    clearcoat: 1,
    clearcoatRoughness: 0.055,
    side: THREE.FrontSide,
    depthWrite: false,
  });
  glass.name = 'clear-globe';
  const chamber = new THREE.Mesh(new THREE.SphereGeometry(1.55, 48, 32), glass);
  chamber.name = 'clear-glass-chamber';
  chamber.position.set(0, 3.85, 0);
  chamber.renderOrder = 3;
  chamber.castShadow = false;
  chamber.receiveShadow = false;
  root.add(chamber);

  // Internal mechanism remains below the balls and rotates around the Y shaft.
  const agitator = new THREE.Group();
  agitator.name = 'agitator-y-pivot';
  agitator.position.set(0, 2.672, 0);
  agitator.userData = { axis: 'y' };
  root.add(agitator);
  const agitatorBatch = geometryBatch(agitator);
  agitatorBatch.add(new THREE.CylinderGeometry(0.145, 0.19, 0.095, 24), brass);
  agitatorBatch.add(
    new THREE.SphereGeometry(0.143, 20, 10),
    chrome,
    [0, 0.046, 0],
    [0, 0, 0],
    [1, 0.5, 1],
  );
  for (let i = 0; i < 3; i++) {
    const angle = (i * Math.PI * 2) / 3;
    agitatorBatch.add(
      new THREE.BoxGeometry(0.58, 0.052, 0.065),
      cream,
      [Math.cos(angle) * 0.31, -0.016, Math.sin(angle) * 0.31],
      [0, -angle, 0],
    );
  }
  agitatorBatch.finish('agitator');

  const palette: [number, number][] = [
    [0xff5b64, 0xeb2f56],
    [0xffd15d, 0xffa629],
    [0x6ad9cf, 0x22a8ad],
    [0x9f96f5, 0x7562d8],
    [0x91d679, 0x4cab69],
    [0x77bbf4, 0x388ade],
    [0xffa8ca, 0xee73ab],
    [0xffebbf, 0xf6c978],
  ];
  const capsuleMaterials = palette.map((colors, index) =>
    colors.map((color, side) => {
      const material = new THREE.MeshPhysicalMaterial({
        color,
        roughness: side ? 0.235 : 0.185,
        metalness: 0.025,
        clearcoat: 1,
        clearcoatRoughness: 0.1,
      });
      material.name = `capsule-${index}-${side ? 'lower' : 'upper'}`;
      return material;
    }),
  );
  // Radius describes the complete collision envelope, including the molded lip.
  // Sharing the lip's material with the upper shell keeps this at two draws/ball.
  const radius = 0.26;
  const shellRadius = radius - 0.007;
  const upperTemplate = new THREE.Group();
  const upperBatch = geometryBatch(upperTemplate);
  upperBatch.add(
    new THREE.SphereGeometry(
      shellRadius,
      16,
      8,
      0,
      Math.PI * 2,
      0,
      Math.PI / 2,
    ),
    capsuleMaterials[0][0],
  );
  upperBatch.add(ring(radius - 0.0075, 0.0075, 24), capsuleMaterials[0][0]);
  upperBatch.finish('capsule-upper-template');
  const topGeometry = (upperTemplate.children[0] as THREE.Mesh).geometry;
  const bottomGeometry = new THREE.SphereGeometry(
    shellRadius,
    16,
    8,
    0,
    Math.PI * 2,
    Math.PI / 2,
    Math.PI / 2,
  );

  // A rotated face-centered cubic packing gives 72 non-overlapping capsules.
  // Select the lowest sites first, leaving a natural headspace above the pool.
  // The 0.015 gap accommodates agitation without starting in interpenetration.
  const centerRadius = 1.26;
  const latticeStep = (radius * 2 + 0.015) / Math.SQRT2;
  const packing: XYZ[] = [];
  for (let ix = -4; ix <= 4; ix++) {
    for (let iy = -4; iy <= 4; iy++) {
      for (let iz = -4; iz <= 4; iz++) {
        if ((ix + iy + iz) % 2 !== 0) continue;
        const x = ix * latticeStep,
          y = iy * latticeStep,
          z = iz * latticeStep;
        if (x * x + y * y + z * z > centerRadius * centerRadius) continue;
        if (3.85 + y - radius < 2.4) continue;
        packing.push([x, 3.85 + y, z]);
      }
    }
  }
  packing.sort(
    (a, b) =>
      a[1] - b[1] ||
      a[0] * a[0] +
        a[2] * a[2] -
        a[2] * 0.08 -
        (b[0] * b[0] + b[2] * b[2] - b[2] * 0.08),
  );
  const cos = Math.cos(0.28),
    sin = Math.sin(0.28);
  const capsuleCenters: XYZ[] = packing
    .slice(0, 72)
    .map(([x, y, z]) => [x * cos - z * sin, y, x * sin + z * cos]);
  const capsules = capsuleCenters.map((center, index) => {
    const capsule = new THREE.Group();
    capsule.name = `capsule-${String(index + 1).padStart(2, '0')}`;
    capsule.position.set(...center);
    capsule.rotation.set(
      Math.sin(index * 2.7) * 0.56,
      index * 2.39996,
      Math.cos(index * 1.8) * 0.52,
    );
    const materials =
      capsuleMaterials[(index * 5 + Math.floor(index / 6)) % palette.length];
    const upper = new THREE.Mesh(topGeometry, materials[0]);
    const lower = new THREE.Mesh(bottomGeometry, materials[1]);
    upper.name = 'upper-shell-with-equator-lip';
    lower.name = 'lower-shell';
    upper.castShadow = lower.castShadow = true;
    upper.receiveShadow = lower.receiveShadow = true;
    capsule.add(upper, lower);
    capsule.userData = {
      radius,
      paletteIndex: (index * 5 + Math.floor(index / 6)) % palette.length,
      restPosition: center.slice(),
      restRotation: capsule.rotation.toArray().slice(0, 3),
    };
    root.add(capsule);
    return capsule;
  });

  root.userData = {
    asset: 'original-procedural-capsule-machine-v2',
    front: '+Z',
    units: 'arbitrary',
    floorY: 0,
    globeCenter: [0, 3.85, 0],
    globeRadius: 1.55,
    capsuleRadius: radius,
    capsuleCenterRadius: centerRadius,
    capsuleCount: capsules.length,
    mechanicalAxes: { crank: 'z', door: 'x', agitator: 'y' },
  };
  root.updateMatrixWorld(true);
  return { root, crank, door, capsules, chamber, agitator };
}
