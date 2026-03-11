import {
  CHAIN_LIGHTNING_BOUNCE_RANGE,
  CHAIN_LIGHTNING_RANGE,
  CHAIN_LIGHTNING_WIDTH,
  ENEMY_ATTACK_DISTANCE,
  ENEMY_BODY_HEIGHT,
  ENEMY_BODY_RADIUS,
  ENEMY_DESPAWN_DISTANCE,
  ENEMY_MAX_HEALTH,
  ENEMY_MIN_HEALTH,
  ENEMY_MISSILE_COOLDOWN,
  ENEMY_MISSILE_ACCELERATION,
  ENEMY_MISSILE_DAMAGE,
  ENEMY_MISSILE_GRAVITY,
  ENEMY_MISSILE_HIT_RADIUS,
  ENEMY_MISSILE_LAUNCH_ANGLE_DEGREES,
  ENEMY_MISSILE_LIFETIME,
  ENEMY_MISSILE_MAX_SPEED,
  ENEMY_MISSILE_RADIUS,
  ENEMY_MISSILE_RANGE,
  ENEMY_MISSILE_SPEED,
  ENEMY_MOVE_SPEED,
  ENEMY_SPAWN_OFFSET,
  ENEMY_VISUAL_SCALE,
  WORLD_LIMIT,
} from "./constants";
import type { BabylonModule, EnemyState } from "./types";

type CreateEnemySystemOptions = {
  B: BabylonModule;
  scene: import("@babylonjs/core").Scene;
  soundEffects: {
    enemyMissileLaunch: () => void;
    enemyHit: () => void;
    enemyDefeat: () => void;
  };
};

type EnemyMissileState = {
  mesh: import("@babylonjs/core").Mesh;
  glow: import("@babylonjs/core").Mesh;
  burst: import("@babylonjs/core").Mesh | null;
  burstAge: number;
  velocity: import("@babylonjs/core").Vector3;
  age: number;
  exploded: boolean;
};

export function createEnemySystem({ B, scene, soundEffects }: CreateEnemySystemOptions) {
  const activeEnemies: EnemyState[] = [];
  const activeMissiles: EnemyMissileState[] = [];
  const enemyScale = ENEMY_VISUAL_SCALE;

  const getEnemyAimPoint = (enemy: EnemyState) => {
    return enemy.head.getAbsolutePosition().add(new B.Vector3(0, -0.35 * enemyScale, 0));
  };

  const enemyRedMat = new B.StandardMaterial("enemy-red-mat", scene);
  enemyRedMat.diffuseColor = new B.Color3(0.86, 0.14, 0.1);
  enemyRedMat.emissiveColor = new B.Color3(0.18, 0.02, 0.02);
  enemyRedMat.specularColor = new B.Color3(0.28, 0.28, 0.28);

  const enemyDarkMat = new B.StandardMaterial("enemy-dark-mat", scene);
  enemyDarkMat.diffuseColor = new B.Color3(0.12, 0.12, 0.14);
  enemyDarkMat.specularColor = B.Color3.Black();

  const enemySteelMat = new B.StandardMaterial("enemy-steel-mat", scene);
  enemySteelMat.diffuseColor = new B.Color3(0.78, 0.8, 0.84);
  enemySteelMat.specularColor = new B.Color3(0.2, 0.2, 0.2);

  const enemyBlueMat = new B.StandardMaterial("enemy-blue-mat", scene);
  enemyBlueMat.diffuseColor = new B.Color3(0.13, 0.32, 0.82);
  enemyBlueMat.specularColor = B.Color3.Black();

  const enemyGoldMat = new B.StandardMaterial("enemy-gold-mat", scene);
  enemyGoldMat.diffuseColor = new B.Color3(0.92, 0.72, 0.16);
  enemyGoldMat.specularColor = B.Color3.Black();

  const enemyGlassMat = new B.StandardMaterial("enemy-glass-mat", scene);
  enemyGlassMat.diffuseColor = new B.Color3(0.84, 0.9, 0.96);
  enemyGlassMat.emissiveColor = new B.Color3(0.16, 0.2, 0.24);
  enemyGlassMat.alpha = 0.92;
  enemyGlassMat.specularColor = B.Color3.Black();

  const enemyHeadMat = new B.StandardMaterial("enemy-head-mat", scene);
  enemyHeadMat.diffuseColor = new B.Color3(0.78, 0.8, 0.84);
  enemyHeadMat.specularColor = B.Color3.Black();

  const enemyVisorMat = new B.StandardMaterial("enemy-visor-mat", scene);
  enemyVisorMat.diffuseColor = new B.Color3(0.92, 0.18, 0.12);
  enemyVisorMat.emissiveColor = new B.Color3(0.28, 0.03, 0.02);
  enemyVisorMat.specularColor = B.Color3.Black();

  const enemyTireMat = new B.StandardMaterial("enemy-tire-mat", scene);
  enemyTireMat.diffuseColor = new B.Color3(0.08, 0.08, 0.08);
  enemyTireMat.specularColor = B.Color3.Black();

  const enemyRimMat = new B.StandardMaterial("enemy-rim-mat", scene);
  enemyRimMat.diffuseColor = new B.Color3(0.66, 0.68, 0.72);
  enemyRimMat.specularColor = new B.Color3(0.24, 0.24, 0.24);

  const missileMat = new B.StandardMaterial("enemy-missile-mat", scene);
  missileMat.diffuseColor = new B.Color3(0.46, 0.28, 0.16);
  missileMat.emissiveColor = new B.Color3(0.22, 0.1, 0.04);
  missileMat.specularColor = B.Color3.Black();

  const missileGlowMat = new B.StandardMaterial("enemy-missile-glow-mat", scene);
  missileGlowMat.diffuseColor = new B.Color3(0.72, 0.46, 0.22);
  missileGlowMat.emissiveColor = new B.Color3(0.4, 0.2, 0.08);
  missileGlowMat.specularColor = B.Color3.Black();

  const healthBackMat = new B.StandardMaterial("enemy-health-back-mat", scene);
  healthBackMat.diffuseColor = new B.Color3(0.16, 0.04, 0.04);
  healthBackMat.emissiveColor = new B.Color3(0.08, 0.02, 0.02);
  healthBackMat.specularColor = B.Color3.Black();

  const healthFillMat = new B.StandardMaterial("enemy-health-fill-mat", scene);
  healthFillMat.diffuseColor = new B.Color3(0.2, 0.86, 0.36);
  healthFillMat.emissiveColor = new B.Color3(0.08, 0.24, 0.12);
  healthFillMat.specularColor = B.Color3.Black();

  const createPanel = (
    name: string,
    size: { width: number; height: number; depth: number },
    position: import("@babylonjs/core").Vector3,
    rotation: import("@babylonjs/core").Vector3,
    parent: import("@babylonjs/core").TransformNode | import("@babylonjs/core").Mesh,
    material: import("@babylonjs/core").StandardMaterial,
  ) => {
    const mesh = B.MeshBuilder.CreateBox(name, size, scene);
    mesh.position.copyFrom(position);
    mesh.rotation.copyFrom(rotation);
    mesh.material = material;
    mesh.parent = parent;
    return mesh;
  };

  const createWheel = (
    name: string,
    position: import("@babylonjs/core").Vector3,
    rotation: import("@babylonjs/core").Vector3,
    parent: import("@babylonjs/core").TransformNode | import("@babylonjs/core").Mesh,
  ) => {
    const tire = B.MeshBuilder.CreateCylinder(name, { diameter: 0.72, height: 0.26, tessellation: 18 }, scene);
    tire.position.copyFrom(position);
    tire.rotation.copyFrom(rotation);
    tire.material = enemyTireMat;
    tire.parent = parent;

    const rim = B.MeshBuilder.CreateCylinder(`${name}-rim`, { diameter: 0.34, height: 0.28, tessellation: 12 }, scene);
    rim.position.set(0, 0, 0);
    rim.material = enemyRimMat;
    rim.parent = tire;
    return tire;
  };

  const createHealthBar = (parent: import("@babylonjs/core").Mesh) => {
    const anchor = new B.TransformNode(`enemy-health-anchor-${performance.now()}`, scene);
    anchor.parent = parent;
    anchor.position.set(0, 2.55 * enemyScale, 0);

    const back = B.MeshBuilder.CreatePlane(
      `enemy-health-back-${performance.now()}`,
      { width: 1.2 * enemyScale, height: 0.13 * enemyScale },
      scene,
    );
    back.billboardMode = B.Mesh.BILLBOARDMODE_ALL;
    back.material = healthBackMat;
    back.parent = anchor;

    const fill = B.MeshBuilder.CreatePlane(
      `enemy-health-fill-${performance.now()}`,
      { width: 1.12 * enemyScale, height: 0.08 * enemyScale },
      scene,
    );
    fill.billboardMode = B.Mesh.BILLBOARDMODE_ALL;
    fill.position.z = -0.01;
    fill.material = healthFillMat;
    fill.parent = anchor;

    return { back, fill };
  };

  const updateHealthBar = (enemy: EnemyState) => {
    const ratio = B.Scalar.Clamp(enemy.health / enemy.maxHealth, 0, 1);
    const fillWidth = 1.12 * enemyScale;
    enemy.healthBarBack.isVisible = !enemy.isDead;
    enemy.healthBarFill.isVisible = !enemy.isDead;
    enemy.healthBarFill.scaling.x = Math.max(0.01, ratio);
    enemy.healthBarFill.position.x = -((1 - ratio) * fillWidth) / 2;

    const fillMat = enemy.healthBarFill.material;
    if (fillMat && "diffuseColor" in fillMat) {
      fillMat.diffuseColor = B.Color3.Lerp(new B.Color3(0.88, 0.16, 0.12), new B.Color3(0.2, 0.86, 0.36), ratio);
    }
  };

  const buildEnemyVisual = (root: import("@babylonjs/core").Mesh) => {
    const torso = new B.TransformNode(`enemy-torso-${performance.now()}`, scene);
    torso.parent = root;
    torso.position.set(0, 0.45, 0);
    torso.scaling.setAll(enemyScale);

    const chest = B.MeshBuilder.CreateBox(`enemy-chest-${performance.now()}`, { width: 1.75, height: 1.05, depth: 0.9 }, scene);
    chest.position.set(0, 0.9, 0.08);
    chest.material = enemyRedMat;
    chest.parent = torso;

    const hood = B.MeshBuilder.CreateBox(`enemy-hood-${performance.now()}`, { width: 1.95, height: 0.28, depth: 1.05 }, scene);
    hood.position.set(0, 1.18, 0.22);
    hood.rotation.x = -0.18;
    hood.material = enemyRedMat;
    hood.parent = torso;

    const windshield = B.MeshBuilder.CreateBox(
      `enemy-windshield-${performance.now()}`,
      { width: 0.95, height: 0.36, depth: 0.16 },
      scene,
    );
    windshield.position.set(0, 1.18, -0.18);
    windshield.rotation.x = 0.42;
    windshield.material = enemyGlassMat;
    windshield.parent = torso;

    const grille = B.MeshBuilder.CreateBox(`enemy-grille-${performance.now()}`, { width: 0.84, height: 0.2, depth: 0.08 }, scene);
    grille.position.set(0, 0.76, 0.52);
    grille.material = enemyDarkMat;
    grille.parent = torso;

    const waist = B.MeshBuilder.CreateBox(`enemy-waist-${performance.now()}`, { width: 0.78, height: 0.72, depth: 0.56 }, scene);
    waist.position.set(0, 0.08, -0.02);
    waist.material = enemyBlueMat;
    waist.parent = torso;

    createPanel(`enemy-waist-guard-l-${performance.now()}`, { width: 0.18, height: 0.3, depth: 0.22 }, new B.Vector3(-0.22, -0.14, 0.24), new B.Vector3(0.18, 0, -0.08), waist, enemyGoldMat);
    createPanel(`enemy-waist-guard-r-${performance.now()}`, { width: 0.18, height: 0.3, depth: 0.22 }, new B.Vector3(0.22, -0.14, 0.24), new B.Vector3(0.18, 0, 0.08), waist, enemyGoldMat);

    const head = B.MeshBuilder.CreateBox(`enemy-head-${performance.now()}`, { width: 0.38, height: 0.44, depth: 0.3 }, scene);
    head.position.set(0, 1.5, 0.02);
    head.material = enemyHeadMat;
    head.parent = torso;

    const crest = B.MeshBuilder.CreateCylinder(
      `enemy-crest-${performance.now()}`,
      { diameterTop: 0.02, diameterBottom: 0.12, height: 0.24, tessellation: 3 },
      scene,
    );
    crest.position.set(0, 0.24, 0.06);
    crest.rotation.x = Math.PI / 2;
    crest.rotation.z = Math.PI;
    crest.material = enemyVisorMat;
    crest.parent = head;

    const visor = B.MeshBuilder.CreateBox(`enemy-visor-${performance.now()}`, { width: 0.22, height: 0.1, depth: 0.04 }, scene);
    visor.position.set(0, 0.05, 0.17);
    visor.material = enemyVisorMat;
    visor.parent = head;

    const faceplate = B.MeshBuilder.CreateBox(`enemy-face-${performance.now()}`, { width: 0.16, height: 0.1, depth: 0.06 }, scene);
    faceplate.position.set(0, -0.08, 0.17);
    faceplate.material = enemyDarkMat;
    faceplate.parent = head;

    const leftArm = new B.TransformNode(`enemy-arm-l-${performance.now()}`, scene);
    leftArm.parent = torso;
    leftArm.position.set(-1.02, 0.92, 0);

    const rightArm = new B.TransformNode(`enemy-arm-r-${performance.now()}`, scene);
    rightArm.parent = torso;
    rightArm.position.set(1.02, 0.92, 0);

    createWheel(`enemy-wheel-l-${performance.now()}`, new B.Vector3(-0.34, 0.26, -0.12), new B.Vector3(Math.PI / 2, 0.22, 0), leftArm);
    createWheel(`enemy-wheel-r-${performance.now()}`, new B.Vector3(0.34, 0.26, -0.12), new B.Vector3(Math.PI / 2, -0.22, 0), rightArm);

    createPanel(`enemy-shoulder-panel-l-${performance.now()}`, { width: 0.5, height: 0.16, depth: 0.98 }, new B.Vector3(-0.06, 0.34, 0.08), new B.Vector3(0.12, 0, -0.42), leftArm, enemyRedMat);
    createPanel(`enemy-shoulder-panel-r-${performance.now()}`, { width: 0.5, height: 0.16, depth: 0.98 }, new B.Vector3(0.06, 0.34, 0.08), new B.Vector3(0.12, 0, 0.42), rightArm, enemyRedMat);
    createPanel(`enemy-upper-arm-l-${performance.now()}`, { width: 0.28, height: 0.86, depth: 0.28 }, new B.Vector3(0, -0.32, 0), B.Vector3.Zero(), leftArm, enemyRedMat);
    createPanel(`enemy-upper-arm-r-${performance.now()}`, { width: 0.28, height: 0.86, depth: 0.28 }, new B.Vector3(0, -0.32, 0), B.Vector3.Zero(), rightArm, enemyRedMat);
    createPanel(`enemy-forearm-l-${performance.now()}`, { width: 0.24, height: 0.96, depth: 0.24 }, new B.Vector3(0, -1.08, 0.08), new B.Vector3(0.12, 0, 0.08), leftArm, enemyDarkMat);
    createPanel(`enemy-forearm-r-${performance.now()}`, { width: 0.24, height: 0.96, depth: 0.24 }, new B.Vector3(0, -1.08, 0.08), new B.Vector3(0.12, 0, -0.08), rightArm, enemyDarkMat);
    createPanel(`enemy-door-l-${performance.now()}`, { width: 0.5, height: 0.92, depth: 0.12 }, new B.Vector3(-0.18, -1.08, 0.2), new B.Vector3(0.08, 0, -0.28), leftArm, enemyRedMat);
    createPanel(`enemy-door-r-${performance.now()}`, { width: 0.5, height: 0.92, depth: 0.12 }, new B.Vector3(0.18, -1.08, 0.2), new B.Vector3(0.08, 0, 0.28), rightArm, enemyRedMat);
    createPanel(`enemy-hand-l-${performance.now()}`, { width: 0.2, height: 0.22, depth: 0.2 }, new B.Vector3(0, -1.62, 0.12), B.Vector3.Zero(), leftArm, enemyDarkMat);
    createPanel(`enemy-hand-r-${performance.now()}`, { width: 0.2, height: 0.22, depth: 0.2 }, new B.Vector3(0, -1.62, 0.12), B.Vector3.Zero(), rightArm, enemyDarkMat);

    const leftLeg = new B.TransformNode(`enemy-leg-l-${performance.now()}`, scene);
    leftLeg.parent = torso;
    leftLeg.position.set(-0.34, -0.46, 0);

    const rightLeg = new B.TransformNode(`enemy-leg-r-${performance.now()}`, scene);
    rightLeg.parent = torso;
    rightLeg.position.set(0.34, -0.46, 0);

    createPanel(`enemy-thigh-l-${performance.now()}`, { width: 0.34, height: 0.96, depth: 0.34 }, new B.Vector3(0, -0.38, 0), new B.Vector3(0.04, 0, 0.06), leftLeg, enemySteelMat);
    createPanel(`enemy-thigh-r-${performance.now()}`, { width: 0.34, height: 0.96, depth: 0.34 }, new B.Vector3(0, -0.38, 0), new B.Vector3(0.04, 0, -0.06), rightLeg, enemySteelMat);
    createPanel(`enemy-knee-l-${performance.now()}`, { width: 0.24, height: 0.22, depth: 0.32 }, new B.Vector3(0, -0.96, 0.12), B.Vector3.Zero(), leftLeg, enemyGoldMat);
    createPanel(`enemy-knee-r-${performance.now()}`, { width: 0.24, height: 0.22, depth: 0.32 }, new B.Vector3(0, -0.96, 0.12), B.Vector3.Zero(), rightLeg, enemyGoldMat);
    createPanel(`enemy-shin-l-${performance.now()}`, { width: 0.52, height: 1.52, depth: 0.58 }, new B.Vector3(0, -1.78, 0.06), new B.Vector3(0.08, 0, 0.08), leftLeg, enemyDarkMat);
    createPanel(`enemy-shin-r-${performance.now()}`, { width: 0.52, height: 1.52, depth: 0.58 }, new B.Vector3(0, -1.78, 0.06), new B.Vector3(0.08, 0, -0.08), rightLeg, enemyDarkMat);
    createPanel(`enemy-shin-plate-l-${performance.now()}`, { width: 0.26, height: 0.58, depth: 0.08 }, new B.Vector3(0, -1.58, 0.34), new B.Vector3(-0.12, 0, 0), leftLeg, enemyBlueMat);
    createPanel(`enemy-shin-plate-r-${performance.now()}`, { width: 0.26, height: 0.58, depth: 0.08 }, new B.Vector3(0, -1.58, 0.34), new B.Vector3(-0.12, 0, 0), rightLeg, enemyBlueMat);
    createPanel(`enemy-foot-l-${performance.now()}`, { width: 0.56, height: 0.24, depth: 0.92 }, new B.Vector3(0, -2.72, 0.18), new B.Vector3(-0.1, 0, 0), leftLeg, enemyRedMat);
    createPanel(`enemy-foot-r-${performance.now()}`, { width: 0.56, height: 0.24, depth: 0.92 }, new B.Vector3(0, -2.72, 0.18), new B.Vector3(-0.1, 0, 0), rightLeg, enemyRedMat);
    createPanel(`enemy-toe-l-${performance.now()}`, { width: 0.42, height: 0.14, depth: 0.28 }, new B.Vector3(0, -2.78, 0.56), B.Vector3.Zero(), leftLeg, enemyGoldMat);
    createPanel(`enemy-toe-r-${performance.now()}`, { width: 0.42, height: 0.14, depth: 0.28 }, new B.Vector3(0, -2.78, 0.56), B.Vector3.Zero(), rightLeg, enemyGoldMat);

    return {
      torso,
      head,
      leftArm,
      rightArm,
      leftLeg,
      rightLeg,
    };
  };

  const setWalkPose = (enemy: EnemyState, swing: number, sway: number) => {
    enemy.leftArm.rotation.x = -swing * 0.85;
    enemy.rightArm.rotation.x = swing * 0.85;
    enemy.leftArm.rotation.z = -0.08 - sway * 0.05;
    enemy.rightArm.rotation.z = 0.08 + sway * 0.05;
    enemy.leftLeg.rotation.x = swing;
    enemy.rightLeg.rotation.x = -swing;
    enemy.leftLeg.rotation.z = sway * 0.08;
    enemy.rightLeg.rotation.z = -sway * 0.08;
    enemy.head.rotation.x = sway * 0.04;
  };

  const applyHitShake = (enemy: EnemyState, dt: number) => {
    enemy.hitShakeTime = Math.max(0, enemy.hitShakeTime - dt);

    if (enemy.hitShakeTime <= 0 || enemy.isDead) {
      enemy.torso.position.x = B.Scalar.Lerp(enemy.torso.position.x, 0, Math.min(1, dt * 18));
      enemy.torso.position.z = B.Scalar.Lerp(enemy.torso.position.z, 0, Math.min(1, dt * 18));
      enemy.torso.rotation.z = B.Scalar.Lerp(enemy.torso.rotation.z, 0, Math.min(1, dt * 16));
      return;
    }

    const shakeRatio = enemy.hitShakeTime / 0.18;
    const offset = enemy.hitShakeStrength * shakeRatio;
    enemy.torso.position.x = B.Scalar.RandomRange(-offset, offset);
    enemy.torso.position.z = B.Scalar.RandomRange(-offset * 0.4, offset * 0.4);
    enemy.torso.rotation.z = B.Scalar.RandomRange(-offset * 1.2, offset * 1.2);
  };

  const disposeEnemy = (enemy: EnemyState) => {
    enemy.root.dispose();
  };

  const disposeMissile = (missile: EnemyMissileState) => {
    missile.mesh.dispose();
    missile.glow.dispose();
    missile.burst?.material?.dispose();
    missile.burst?.dispose();
  };

  const explodeMissile = (missile: EnemyMissileState) => {
    missile.exploded = true;
    missile.mesh.setEnabled(false);
    missile.glow.setEnabled(false);

    const burst = B.MeshBuilder.CreateSphere(`enemy-missile-burst-${performance.now()}`, { diameter: 0.45, segments: 12 }, scene);
    burst.position.copyFrom(missile.mesh.position);
    const burstMat = new B.StandardMaterial(`enemy-missile-burst-mat-${performance.now()}`, scene);
    burstMat.diffuseColor = new B.Color3(1, 0.64, 0.22);
    burstMat.emissiveColor = new B.Color3(1, 0.3, 0.1);
    burstMat.alpha = 0.8;
    burst.material = burstMat;
    missile.burst = burst;
    missile.burstAge = 0;
  };

  const spawnMissile = (enemy: EnemyState, playerPosition: import("@babylonjs/core").Vector3) => {
    soundEffects.enemyMissileLaunch();
    const origin = enemy.root.position.add(new B.Vector3(0, ENEMY_BODY_HEIGHT * 0.42, 0));
    const target = playerPosition.add(new B.Vector3(0, -0.7, 0));
    const horizontalDirection = target.subtract(origin);
    horizontalDirection.y = 0;
    if (horizontalDirection.lengthSquared() <= 0.0001) {
      return;
    }

    const launchAngleRadians = B.Angle.FromDegrees(ENEMY_MISSILE_LAUNCH_ANGLE_DEGREES).radians();
    const direction = horizontalDirection.normalize().scale(Math.cos(launchAngleRadians));
    direction.y = Math.sin(launchAngleRadians);
    direction.normalize();

    const missile = B.MeshBuilder.CreateCapsule(
      `enemy-missile-${performance.now()}`,
      { radius: ENEMY_MISSILE_RADIUS * 0.9, height: ENEMY_MISSILE_RADIUS * 5.5, tessellation: 10 },
      scene,
    );
    missile.position.copyFrom(origin);
    missile.rotation.z = Math.PI / 2;
    missile.material = missileMat;

    const glow = B.MeshBuilder.CreateCylinder(
      `enemy-missile-glow-${performance.now()}`,
      { diameter: ENEMY_MISSILE_RADIUS * 0.9, height: ENEMY_MISSILE_RADIUS * 2.1, tessellation: 10 },
      scene,
    );
    glow.position.copyFrom(origin);
    glow.rotation.z = Math.PI / 2;
    glow.material = missileGlowMat;

    activeMissiles.push({
      mesh: missile,
      glow,
      burst: null,
      burstAge: 0,
      velocity: direction.scale(ENEMY_MISSILE_SPEED),
      age: 0,
      exploded: false,
    });
  };

  const spawnEnemy = () => {
    const spawnSide = Math.floor(Math.random() * 4);
    const edge = WORLD_LIMIT - ENEMY_SPAWN_OFFSET;
    const alongEdge = B.Scalar.RandomRange(-WORLD_LIMIT, WORLD_LIMIT);
    let spawnX = 0;
    let spawnZ = 0;

    if (spawnSide === 0) {
      spawnX = alongEdge;
      spawnZ = -edge;
    } else if (spawnSide === 1) {
      spawnX = edge;
      spawnZ = alongEdge;
    } else if (spawnSide === 2) {
      spawnX = alongEdge;
      spawnZ = edge;
    } else {
      spawnX = -edge;
      spawnZ = alongEdge;
    }

    const body = B.MeshBuilder.CreateCapsule(
      `enemy-body-${performance.now()}`,
      { radius: ENEMY_BODY_RADIUS, height: ENEMY_BODY_HEIGHT },
      scene,
    );
    body.position.set(spawnX, ENEMY_BODY_HEIGHT / 2, spawnZ);
    body.isVisible = false;
    body.checkCollisions = true;
    body.ellipsoid = new B.Vector3(ENEMY_BODY_RADIUS, ENEMY_BODY_HEIGHT / 2, ENEMY_BODY_RADIUS);

    const visual = buildEnemyVisual(body);
    const healthBar = createHealthBar(body);
    const maxHealth = Math.round(B.Scalar.RandomRange(ENEMY_MIN_HEALTH, ENEMY_MAX_HEALTH));

    const enemy: EnemyState = {
      id: body.id,
      root: body,
      torso: visual.torso,
      head: visual.head,
      healthBarBack: healthBar.back,
      healthBarFill: healthBar.fill,
      leftArm: visual.leftArm,
      rightArm: visual.rightArm,
      leftLeg: visual.leftLeg,
      rightLeg: visual.rightLeg,
      health: maxHealth,
      maxHealth,
      isDead: false,
      deathProgress: 0,
      attackCooldown: B.Scalar.RandomRange(0.15, 0.95),
      walkPhase: Math.random() * Math.PI * 2,
      hitShakeTime: 0,
      hitShakeStrength: 0,
    };

    updateHealthBar(enemy);
    activeEnemies.push(enemy);
  };

  const killEnemy = (enemy: EnemyState) => {
    if (enemy.isDead) {
      return;
    }

    enemy.isDead = true;
    enemy.deathProgress = 0;
    enemy.root.checkCollisions = false;
    enemy.root.rotation.z = B.Scalar.RandomRange(-0.95, 0.95);
    enemy.root.rotation.x = B.Scalar.RandomRange(-0.35, 0.35);
    enemy.head.position.y = 1.15;
    enemy.healthBarBack.setEnabled(false);
    enemy.healthBarFill.setEnabled(false);
    setWalkPose(enemy, 0, 0);
    soundEffects.enemyDefeat();
  };

  const damageEnemy = (enemy: EnemyState, damage: number) => {
    if (enemy.isDead) {
      return false;
    }

    enemy.health = Math.max(0, enemy.health - damage);
    soundEffects.enemyHit();
    updateHealthBar(enemy);
    enemy.head.scaling.y = 1.08;
    enemy.head.scaling.x = 0.96;
    enemy.head.scaling.z = 0.96;
    enemy.hitShakeTime = 0.18;
    enemy.hitShakeStrength = 0.08 + Math.min(0.07, damage / 240);

    if (enemy.health <= 0) {
      killEnemy(enemy);
      return true;
    }

    return false;
  };

  const findEnemyInRay = (origin: import("@babylonjs/core").Vector3, direction: import("@babylonjs/core").Vector3) => {
    let bestEnemy: EnemyState | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const enemy of activeEnemies) {
      if (enemy.isDead) {
        continue;
      }

      const targetPoint = getEnemyAimPoint(enemy);
      const toEnemy = targetPoint.subtract(origin);
      const alongRay = B.Vector3.Dot(toEnemy, direction);
      if (alongRay <= 0 || alongRay > CHAIN_LIGHTNING_RANGE) {
        continue;
      }

      const closestPoint = origin.add(direction.scale(alongRay));
      const lateralDistance = B.Vector3.Distance(closestPoint, targetPoint);
      if (lateralDistance > CHAIN_LIGHTNING_WIDTH || alongRay >= bestDistance) {
        continue;
      }

      bestEnemy = enemy;
      bestDistance = alongRay;
    }

    return bestEnemy;
  };

  const getChainTargets = (firstEnemy: EnemyState, maxBounces: number) => {
    const hitEnemies: EnemyState[] = [firstEnemy];
    let currentSource = getEnemyAimPoint(firstEnemy);

    for (let bounce = 0; bounce < maxBounces; bounce += 1) {
      const nextEnemy = activeEnemies
        .filter((enemy) => !enemy.isDead && !hitEnemies.includes(enemy))
        .map((enemy) => ({
          enemy,
          distance: B.Vector3.Distance(currentSource, getEnemyAimPoint(enemy)),
        }))
        .filter((candidate) => candidate.distance <= CHAIN_LIGHTNING_BOUNCE_RANGE)
        .sort((a, b) => a.distance - b.distance)[0]?.enemy;

      if (!nextEnemy) {
        break;
      }

      hitEnemies.push(nextEnemy);
      currentSource = getEnemyAimPoint(nextEnemy);
    }

    return hitEnemies;
  };

  const updateEnemies = (
    dt: number,
    playerPosition: import("@babylonjs/core").Vector3,
    onThreatMessage: (message: string) => void,
    onPlayerHit: (damage: number) => void,
  ) => {
    for (let missileIndex = activeMissiles.length - 1; missileIndex >= 0; missileIndex -= 1) {
      const missile = activeMissiles[missileIndex];
      missile.age += dt;

      if (!missile.exploded) {
        missile.velocity.y -= ENEMY_MISSILE_GRAVITY * dt;
        const thrustDirection = missile.velocity.lengthSquared() > 0.0001 ? missile.velocity.normalizeToNew() : B.Vector3.Forward();
        missile.velocity.addInPlace(thrustDirection.scale(ENEMY_MISSILE_ACCELERATION * dt));
        const speed = missile.velocity.length();
        if (speed > ENEMY_MISSILE_MAX_SPEED) {
          missile.velocity.scaleInPlace(ENEMY_MISSILE_MAX_SPEED / speed);
        }

        missile.mesh.position.addInPlace(missile.velocity.scale(dt));
        missile.glow.position.copyFrom(missile.mesh.position);
        missile.glow.scaling.setAll(1 + Math.min(0.5, missile.age * 1.5));
        const forward = missile.velocity.lengthSquared() > 0.0001 ? missile.velocity.normalizeToNew() : B.Vector3.Forward();
        missile.mesh.rotation.y = Math.atan2(forward.x, forward.z);
        missile.mesh.rotation.x = -Math.atan2(forward.y, Math.sqrt(forward.x ** 2 + forward.z ** 2));
        missile.glow.rotation.y = missile.mesh.rotation.y;
        missile.glow.rotation.x = missile.mesh.rotation.x;

        if (B.Vector3.Distance(missile.mesh.position, playerPosition) <= ENEMY_MISSILE_HIT_RADIUS) {
          onPlayerHit(ENEMY_MISSILE_DAMAGE);
          explodeMissile(missile);
        } else if (
          missile.age >= ENEMY_MISSILE_LIFETIME ||
          missile.mesh.position.y <= ENEMY_MISSILE_RADIUS ||
          Math.abs(missile.mesh.position.x) > WORLD_LIMIT + 8 ||
          Math.abs(missile.mesh.position.z) > WORLD_LIMIT + 8
        ) {
          explodeMissile(missile);
        }
      } else if (missile.burst) {
        missile.burstAge += dt;
        const progress = missile.burstAge / 0.28;
        missile.burst.scaling.setAll(1 + progress * 3);
        const burstMat = missile.burst.material;
        if (burstMat && "alpha" in burstMat) {
          burstMat.alpha = Math.max(0, 0.8 - progress * 0.8);
        }
        if (missile.burstAge >= 0.28) {
          disposeMissile(missile);
          activeMissiles.splice(missileIndex, 1);
        }
      }
    }

    for (let index = activeEnemies.length - 1; index >= 0; index -= 1) {
      const enemy = activeEnemies[index];

      applyHitShake(enemy, dt);

      enemy.head.scaling.x = B.Scalar.Lerp(enemy.head.scaling.x, 1, Math.min(1, dt * 10));
      enemy.head.scaling.y = B.Scalar.Lerp(enemy.head.scaling.y, 1, Math.min(1, dt * 10));
      enemy.head.scaling.z = B.Scalar.Lerp(enemy.head.scaling.z, 1, Math.min(1, dt * 10));

      if (enemy.isDead) {
        enemy.deathProgress += dt;
        enemy.root.position.y = Math.max(-1.5, ENEMY_BODY_HEIGHT / 2 - enemy.deathProgress * 2.8);
        enemy.root.rotation.x += dt * 0.35;
        enemy.root.scaling.y = Math.max(0.2, 1 - enemy.deathProgress * 0.45);
        enemy.root.scaling.x = Math.max(0.4, 1 - enemy.deathProgress * 0.2);
        enemy.root.scaling.z = Math.max(0.4, 1 - enemy.deathProgress * 0.2);
        setWalkPose(enemy, 0, 0);
        if (enemy.deathProgress >= 1.5) {
          disposeEnemy(enemy);
          activeEnemies.splice(index, 1);
        }
        continue;
      }

      const toPlayer = playerPosition.subtract(enemy.root.position);
      toPlayer.y = 0;
      const distanceToPlayer = toPlayer.length();
      enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt);
      const isWalking = distanceToPlayer > ENEMY_ATTACK_DISTANCE;

      if (distanceToPlayer > 0.001) {
        const direction = toPlayer.scale(1 / distanceToPlayer);
        const moveStep = direction.scale(ENEMY_MOVE_SPEED * dt);
        enemy.root.lookAt(new B.Vector3(playerPosition.x, enemy.root.position.y, playerPosition.z));
        enemy.root.rotation.x = 0;
        enemy.root.rotation.z = 0;

        if (distanceToPlayer > ENEMY_ATTACK_DISTANCE) {
          enemy.root.moveWithCollisions(moveStep);
        }
      }

      if (distanceToPlayer <= ENEMY_MISSILE_RANGE && enemy.attackCooldown <= 0) {
        spawnMissile(enemy, playerPosition.clone());
        enemy.attackCooldown = ENEMY_MISSILE_COOLDOWN;
        onThreatMessage("적이 미사일을 발사했습니다.");
      }

      enemy.walkPhase += dt * (isWalking ? 9 : 4);
      const targetSwing = isWalking ? Math.sin(enemy.walkPhase) * 0.6 : 0;
      const targetSway = isWalking ? Math.cos(enemy.walkPhase * 0.5) : 0;
      const swing = B.Scalar.Lerp(enemy.leftLeg.rotation.x, targetSwing, Math.min(1, dt * 10));
      const sway = B.Scalar.Lerp(enemy.leftLeg.rotation.z / 0.08, targetSway, Math.min(1, dt * 8));
      setWalkPose(enemy, swing, sway);

      const distanceFromCenter = Math.max(Math.abs(enemy.root.position.x), Math.abs(enemy.root.position.z));
      if (distanceFromCenter > ENEMY_DESPAWN_DISTANCE) {
        disposeEnemy(enemy);
        activeEnemies.splice(index, 1);
      }
    }
  };

  const dispose = () => {
    for (const enemy of activeEnemies) {
      disposeEnemy(enemy);
    }
    for (const missile of activeMissiles) {
      disposeMissile(missile);
    }
    activeEnemies.length = 0;
    activeMissiles.length = 0;
  };

  return {
    activeEnemies,
    spawnEnemy,
    damageEnemy,
    killEnemy,
    findEnemyInRay,
    getChainTargets,
    updateEnemies,
    dispose,
  };
}
