import * as THREE from "three";

export type EffectCue = {
  id: string;
  kind: string;
  typeId?: number | null;
  origin: THREE.Vector3;
  target: THREE.Vector3;
};

// PokeAPI type IDs. Shapes and travel patterns distinguish types beyond color.
const TYPE_STYLES = [
  ["#ffe4ad", "#fff9e8", "burst"],
  ["#ffc991", "#fff3d3", "burst"],
  ["#ed714d", "#ffe18a", "rush"],
  ["#b2e7ff", "#ffffff", "spiral"],
  ["#b874dd", "#dcff91", "bubble"],
  ["#caa16b", "#ffe0a2", "rocks"],
  ["#b99a69", "#fff3c8", "rocks"],
  ["#add452", "#fff49a", "swarm"],
  ["#8275d4", "#baf5f8", "spiral"],
  ["#a8cfdd", "#ffffff", "shards"],
  ["#ff803d", "#fff6a3", "flame"],
  ["#51c8ee", "#d1ffff", "wave"],
  ["#77cf6b", "#e2ff89", "leaves"],
  ["#ffce3e", "#ffffd7", "bolt"],
  ["#fb7bc2", "#e6b5ff", "spiral"],
  ["#9eeef0", "#ffffff", "shards"],
  ["#866dff", "#ffc26f", "helix"],
  ["#625773", "#e49de8", "slash"],
  ["#ffa7d8", "#fff5bc", "stars"],
] as const;

export function typeEffectColor(typeId: number | null | undefined) {
  return TYPE_STYLES[typeId ?? 0]?.[0] ?? TYPE_STYLES[0][0];
}

/** A fixed GPU pool: presentation progress is the only source of event timing. */
export function createBoardEffects() {
  const root = new THREE.Group();
  root.name = "presentation-effects";
  const particleGeometry = new THREE.IcosahedronGeometry(1, 0);
  const particleMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    depthWrite: false,
    opacity: 0.9,
    toneMapped: false,
  });
  const particles = new THREE.InstancedMesh(
    particleGeometry,
    particleMaterial,
    128,
  );
  particles.name = "effect-pool-128";
  particles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  particles.frustumCulled = false;
  root.add(particles);

  const ringGeometry = new THREE.RingGeometry(0.82, 1, 48);
  const rings = Array.from({ length: 3 }, () => {
    const material = new THREE.MeshBasicMaterial({
      color: "#fff0a0",
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const ring = new THREE.Mesh(ringGeometry, material);
    ring.rotation.x = -Math.PI / 2;
    root.add(ring);
    return ring;
  });
  const beamGeometry = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
  const beamMaterial = new THREE.MeshBasicMaterial({
    color: "#fff7b8",
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const beam = new THREE.Mesh(beamGeometry, beamMaterial);
  root.add(beam);
  const dummy = new THREE.Object3D();
  const point = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const primary = new THREE.Color();
  const accent = new THREE.Color();
  const color = new THREE.Color();
  let lastCue = "";
  root.visible = false;

  function update(
    cue: EffectCue | null,
    progress: number,
    reducedMotion: boolean,
    lowQuality: boolean,
  ) {
    root.visible = Boolean(cue);
    if (!cue) return;
    const p = THREE.MathUtils.clamp(progress, 0, 1);
    const attack = cue.kind === "attack";
    const celebration = [
      "capture",
      "level-up",
      "evolution",
      "victory",
    ].includes(cue.kind);
    const healing = ["heal", "send-out", "deploy"].includes(cue.kind);
    const style = TYPE_STYLES[cue.typeId ?? 0] ?? TYPE_STYLES[0];
    primary.set(healing ? "#65e3c5" : celebration ? "#ffcd56" : style[0]);
    accent.set(healing ? "#e5ffdf" : celebration ? "#ff92c4" : style[1]);
    const pattern = attack
      ? style[2]
      : celebration
        ? "stars"
        : healing
          ? "spiral"
          : "burst";
    const count = reducedMotion ? 0 : lowQuality ? 48 : 112;
    particles.count = count;
    particleMaterial.opacity =
      Math.min(1, p * 8) * (1 - Math.max(0, p - 0.7) / 0.3);
    if (lastCue !== cue.id) {
      lastCue = cue.id;
      for (let i = 0; i < 128; i += 1) {
        color.copy(primary).lerp(accent, (i % 7) / 6);
        particles.setColorAt(i, color);
      }
      if (particles.instanceColor) particles.instanceColor.needsUpdate = true;
    }

    const travel = THREE.MathUtils.smoothstep(p, 0.1, 0.45);
    point.copy(cue.origin).lerp(cue.target, attack ? travel : 1);
    direction.subVectors(cue.target, cue.origin);
    const distance = direction.length();
    const burst = Math.max(
      0,
      (p - (attack ? 0.45 : 0.05)) / (attack ? 0.55 : 0.95),
    );
    for (let i = 0; i < count; i += 1) {
      const angle = i * 2.399963 + p * (i % 2 ? 3 : -2);
      const seed = ((i * 37) % 101) / 101;
      const radius = (0.18 + seed * 1.9) * burst;
      const size = (0.035 + seed * 0.07) * (1 - p * 0.45);
      dummy.position.copy(point);
      dummy.position.x += Math.cos(angle) * radius;
      dummy.position.z += Math.sin(angle) * radius * 0.7;
      dummy.position.y += Math.sin(i * 7.1) * radius * 0.7;
      dummy.scale.setScalar(size);
      dummy.rotation.set(angle, angle * 0.7, angle * 0.3);
      if (pattern === "flame") {
        dummy.position.y += burst * (0.3 + seed * 1.8);
        dummy.scale.y *= 2.8;
      } else if (pattern === "wave" || pattern === "bubble") {
        dummy.position.y += Math.sin(p * Math.PI + seed * 5) * 0.45;
        dummy.scale.setScalar(size * (pattern === "bubble" ? 2 : 1.2));
      } else if (pattern === "bolt") {
        const along = seed * travel;
        dummy.position.copy(cue.origin).lerp(cue.target, along);
        dummy.position.y += (i % 2 ? 1 : -1) * 0.18 * Math.sin(p * 45 + i);
        dummy.position.z += Math.sin(i * 1.7) * 0.17;
        dummy.scale.set(size * 0.7, size * 3, size * 0.7);
      } else if (
        pattern === "spiral" ||
        pattern === "helix" ||
        pattern === "swarm"
      ) {
        dummy.position.y += Math.sin(angle + p * 12) * 0.45;
        dummy.position.x += Math.cos(angle + p * 12) * 0.3;
        if (pattern === "helix") dummy.scale.y *= 2;
      } else if (
        pattern === "shards" ||
        pattern === "leaves" ||
        pattern === "slash"
      ) {
        dummy.scale.set(size * 0.6, size * 3.5, size * 0.35);
        dummy.rotation.z += Math.PI / 4;
      } else if (pattern === "rocks") {
        dummy.position.y +=
          Math.sin(burst * Math.PI) * seed * 1.7 - burst * 0.3;
        dummy.scale.setScalar(size * 2.2);
      } else if (pattern === "stars") {
        dummy.position.y += Math.sin(burst * Math.PI) * (1 + seed);
        dummy.scale.set(size * 1.8, size * 1.8, size * 0.4);
      } else if (pattern === "rush") {
        dummy.scale.x *= 3.5;
      }
      dummy.updateMatrix();
      particles.setMatrixAt(i, dummy.matrix);
    }
    particles.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < rings.length; i += 1) {
      const ring = rings[i];
      const wave = Math.max(0, burst - i * 0.16);
      ring.visible = reducedMotion ? i === 0 : wave > 0;
      ring.position.copy(cue.target);
      ring.position.y = healing
        ? cue.target.y + wave * 1.6
        : cue.target.y - 0.25 + i * 0.04;
      ring.scale.setScalar(
        reducedMotion ? 0.65 : 0.25 + wave * (celebration ? 3.2 : 2),
      );
      ring.material.color.copy(i % 2 ? accent : primary);
      ring.material.opacity = reducedMotion
        ? 0.45
        : Math.max(0, 0.8 - wave) * Math.min(1, wave * 10);
    }
    beam.visible =
      attack &&
      !reducedMotion &&
      p > 0.16 &&
      p < 0.56 &&
      ["bolt", "helix", "slash", "wave"].includes(pattern);
    if (beam.visible) {
      beam.position.copy(cue.origin).lerp(cue.target, 0.5);
      beam.quaternion.setFromUnitVectors(up, direction.normalize());
      beam.scale.set(
        pattern === "slash" ? 0.08 : 0.045,
        distance * travel,
        0.045,
      );
      beamMaterial.color.copy(primary);
      beamMaterial.opacity = 0.4 * Math.sin(((p - 0.16) / 0.4) * Math.PI);
    }
  }

  return {
    root,
    update,
    dispose() {
      root.removeFromParent();
      particleGeometry.dispose();
      particleMaterial.dispose();
      ringGeometry.dispose();
      rings.forEach((ring) => ring.material.dispose());
      beamGeometry.dispose();
      beamMaterial.dispose();
    },
  };
}
