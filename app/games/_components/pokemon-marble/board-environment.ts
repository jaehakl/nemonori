import * as THREE from "three";

/** Merge static scenery by shadow behavior; vertex colors retain the toy palette. */
export function batchStaticScenery(
  root: THREE.Group,
  excluded: Set<THREE.Object3D>,
) {
  root.updateMatrixWorld(true);
  const batches = new Map<
    string,
    THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>[]
  >();
  root.traverse((object) => {
    if (
      !(object instanceof THREE.Mesh) ||
      !(object.material instanceof THREE.MeshStandardMaterial) ||
      excluded.has(object) ||
      !object.visible
    )
      return;
    if (object.material.map || object.material.transparent) return;
    const key = `${object.castShadow}:${object.receiveShadow}`;
    const group = batches.get(key) ?? [];
    group.push(
      object as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>,
    );
    batches.set(key, group);
  });
  const resources: {
    geometry: THREE.BufferGeometry;
    material: THREE.MeshStandardMaterial;
  }[] = [];
  const position = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3();
  for (const meshes of batches.values()) {
    const positions: number[] = [],
      normals: number[] = [],
      colors: number[] = [];
    for (const mesh of meshes) {
      const source = mesh.geometry;
      const vertices = source.getAttribute("position");
      const sourceNormals = source.getAttribute("normal");
      const index = source.getIndex();
      normalMatrix.getNormalMatrix(mesh.matrixWorld);
      for (let i = 0; i < (index?.count ?? vertices.count); i += 1) {
        const vertex = index ? index.getX(i) : i;
        position
          .fromBufferAttribute(vertices, vertex)
          .applyMatrix4(mesh.matrixWorld);
        normal
          .fromBufferAttribute(sourceNormals, vertex)
          .applyNormalMatrix(normalMatrix);
        positions.push(position.x, position.y, position.z);
        normals.push(normal.x, normal.y, normal.z);
        colors.push(
          mesh.material.color.r,
          mesh.material.color.g,
          mesh.material.color.b,
        );
      }
      // Raycast targets retain their world matrices even after leaving the draw tree.
      mesh.removeFromParent();
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute(
      "normal",
      new THREE.Float32BufferAttribute(normals, 3),
    );
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.68,
    });
    const merged = new THREE.Mesh(geometry, material);
    merged.name = "batched-island-scenery";
    merged.castShadow = meshes[0].castShadow;
    merged.receiveShadow = meshes[0].receiveShadow;
    root.add(merged);
    resources.push({ geometry, material });
  }
  return () =>
    resources.forEach(({ geometry, material }) => {
      geometry.dispose();
      material.dispose();
    });
}

export function createBoardEnvironment() {
  const root = new THREE.Group();
  root.name = "island-atmosphere";
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const geometry = <T extends THREE.BufferGeometry>(value: T) => {
    geometries.add(value);
    return value;
  };
  const material = <T extends THREE.Material>(value: T) => {
    materials.add(value);
    return value;
  };
  const softWhite = material(
    new THREE.MeshStandardMaterial({ color: "#fffdf2", roughness: 0.9 }),
  );
  const cloudGeometry = geometry(new THREE.SphereGeometry(1, 12, 8));
  const clouds: THREE.Group[] = [];
  for (const [x, y, z, scale] of [
    [-5.5, 1.5, -3.5, 0.6],
    [4.4, 2, -5.3, 0.7],
    [6, 0.8, 2.9, 0.42],
  ]) {
    const cloud = new THREE.Group();
    cloud.position.set(x, y, z);
    cloud.scale.setScalar(scale);
    for (let i = 0; i < 3; i += 1) {
      const puff = new THREE.Mesh(cloudGeometry, softWhite);
      puff.position.x = (i - 1) * 0.7;
      puff.scale.set(i === 1 ? 0.9 : 0.7, i === 1 ? 0.58 : 0.4, 0.5);
      cloud.add(puff);
    }
    cloud.userData.baseY = y;
    root.add(cloud);
    clouds.push(cloud);
  }
  const rippleGeometry = geometry(new THREE.RingGeometry(0.95, 1, 48));
  const rippleMaterial = material(
    new THREE.MeshBasicMaterial({
      color: "#e4ffff",
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  const ripples = Array.from({ length: 3 }, (_, index) => {
    const ripple = new THREE.Mesh(rippleGeometry, rippleMaterial);
    ripple.rotation.x = -Math.PI / 2;
    ripple.position.set(1.63, 0.18 + index * 0.002, -1.87);
    root.add(ripple);
    return ripple;
  });
  const flowerGeometry = geometry(new THREE.IcosahedronGeometry(0.08, 0));
  const flowerMaterial = material(
    new THREE.MeshBasicMaterial({ color: "#ffffff" }),
  );
  const flowers = new THREE.InstancedMesh(flowerGeometry, flowerMaterial, 54);
  flowers.name = "wildflowers";
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  for (let i = 0; i < 54; i += 1) {
    const side = i % 4;
    const along = (((i * 7) % 25) / 25) * 5.6 - 2.8;
    dummy.position.set(
      side < 2 ? along : side === 2 ? -3.1 : 3.1,
      0.23 + (i % 3) * 0.03,
      side >= 2 ? along : side === 0 ? -3.1 : 3.1,
    );
    dummy.scale.set(1, 0.65, 1);
    dummy.updateMatrix();
    flowers.setMatrixAt(i, dummy.matrix);
    color.set(["#ffb6c4", "#fff2a3", "#ffffff", "#b7a7ff"][i % 4]);
    flowers.setColorAt(i, color);
  }
  root.add(flowers);
  const moteGeometry = geometry(new THREE.IcosahedronGeometry(0.035, 0));
  const moteMaterial = material(
    new THREE.MeshBasicMaterial({
      color: "#fffbd1",
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    }),
  );
  const motes = new THREE.InstancedMesh(moteGeometry, moteMaterial, 12);
  motes.frustumCulled = false;
  root.add(motes);
  function update(time: number, reducedMotion: boolean, lowQuality: boolean) {
    for (let i = 0; i < clouds.length; i += 1)
      clouds[i].position.y =
        clouds[i].userData.baseY +
        (reducedMotion ? 0 : Math.sin(time / 1800 + i) * 0.08);
    for (let i = 0; i < ripples.length; i += 1) {
      const size = reducedMotion
        ? 0.35 + i * 0.22
        : 0.18 + ((time / 5000 + i / 3) % 1) * 0.75;
      ripples[i].scale.set(size, size * 0.65, 1);
    }
    motes.visible = !reducedMotion && !lowQuality;
    if (motes.visible) {
      for (let i = 0; i < 12; i += 1) {
        dummy.position.set(
          Math.sin(i * 11 + time / 9000) * 3.2,
          0.6 + Math.sin(time / 1400 + i) * 0.22,
          Math.cos(i * 7 + time / 7000) * 3.2,
        );
        dummy.scale.setScalar(0.65 + Math.sin(time / 500 + i) * 0.25);
        dummy.updateMatrix();
        motes.setMatrixAt(i, dummy.matrix);
      }
      motes.instanceMatrix.needsUpdate = true;
    }
  }
  update(0, true, false);
  return {
    root,
    update,
    dispose() {
      for (const value of geometries) value.dispose();
      for (const value of materials) value.dispose();
      root.removeFromParent();
    },
  };
}
