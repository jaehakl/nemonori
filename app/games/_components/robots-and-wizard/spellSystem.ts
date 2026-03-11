import {
  CHAIN_LIGHTNING_DAMAGE,
  CHAIN_LIGHTNING_MAX_BOUNCES,
  CHAIN_LIGHTNING_RANGE,
  ENEMY_BODY_HEIGHT,
  ENEMY_BODY_RADIUS,
  FIREBALL_CHARGE_MAX_MS,
  FIREBALL_DAMAGE,
  FIREBALL_HIT_RADIUS,
  FIREBALL_LIFETIME,
  FIREBALL_MAX_EXPLOSION_SCALE,
  FIREBALL_MAX_SPEED,
  FIREBALL_RADIUS,
  FIREBALL_SPEED,
  WORLD_LIMIT,
} from "./constants";
import type {
  BabylonModule,
  EnemyState,
  FireballState,
  MeshRef,
  PhysicsAggregateCtor,
  PhysicsShapeTypeModule,
  TimedMeshState,
} from "./types";

type CreateSpellSystemOptions = {
  B: BabylonModule;
  scene: import("@babylonjs/core").Scene;
  camera: import("@babylonjs/core").UniversalCamera;
  PhysicsAggregate: PhysicsAggregateCtor;
  PhysicsShapeType: PhysicsShapeTypeModule;
  activeEnemies: EnemyState[];
  findEnemyInRay: (origin: import("@babylonjs/core").Vector3, direction: import("@babylonjs/core").Vector3) => EnemyState | null;
  getChainTargets: (firstEnemy: EnemyState, maxBounces: number) => EnemyState[];
  damageEnemy: (enemy: EnemyState, damage: number) => boolean;
  damageHousesAt: (position: import("@babylonjs/core").Vector3, radiusScale?: number) => number;
  setMessage: (message: string) => void;
  soundEffects: {
    fireballCast: () => void;
    fireballExplode: () => void;
    chainLightning: () => void;
  };
};

export function createSpellSystem({
  B,
  scene,
  camera,
  PhysicsAggregate,
  PhysicsShapeType,
  activeEnemies,
  findEnemyInRay,
  getChainTargets,
  damageEnemy,
  damageHousesAt,
  setMessage,
  soundEffects,
}: CreateSpellSystemOptions) {
  let lightningCastSerial = 0;

  const getEnemyHitPoint = (enemy: EnemyState) => enemy.head.getAbsolutePosition().add(new B.Vector3(0, -0.35, 0));
  const isDirectFireballHit = (fireball: FireballState, enemy: EnemyState) => {
    const enemyCenter = enemy.root.position;
    const halfBodyHeight = ENEMY_BODY_HEIGHT / 2;
    const capsuleStartY = enemyCenter.y - halfBodyHeight + ENEMY_BODY_RADIUS;
    const capsuleEndY = enemyCenter.y + halfBodyHeight - ENEMY_BODY_RADIUS;
    const closestPoint = new B.Vector3(
      enemyCenter.x,
      B.Scalar.Clamp(fireball.mesh.position.y, capsuleStartY, capsuleEndY),
      enemyCenter.z,
    );

    return B.Vector3.Distance(fireball.mesh.position, closestPoint) <= ENEMY_BODY_RADIUS + fireball.projectileRadius;
  };

  const fireballMat = new B.StandardMaterial("fireball-mat", scene);
  fireballMat.diffuseColor = new B.Color3(1, 0.45, 0.12);
  fireballMat.emissiveColor = new B.Color3(1, 0.3, 0.08);
  fireballMat.specularColor = B.Color3.Black();

  const fireballCoreMat = new B.StandardMaterial("fireball-core-mat", scene);
  fireballCoreMat.diffuseColor = new B.Color3(1, 0.88, 0.48);
  fireballCoreMat.emissiveColor = new B.Color3(1, 0.78, 0.36);
  fireballCoreMat.specularColor = B.Color3.Black();

  const activeFireballs: FireballState[] = [];
  const activeExplosions: TimedMeshState[] = [];
  const activeLightningBolts: TimedMeshState[] = [];

  const disposeFireball = (fireball: FireballState) => {
    fireball.aggregate.dispose();
    fireball.mesh.dispose();
    fireball.glow.dispose();
  };

  const explodeFireball = (
    position: import("@babylonjs/core").Vector3,
    explosionScale: number,
    explosionRadius: number,
  ) => {
    soundEffects.fireballExplode();

    const explosion = B.MeshBuilder.CreateSphere("fireball-explosion", { diameter: 0.6, segments: 16 }, scene);
    explosion.position.copyFrom(position);

    const explosionMat = new B.StandardMaterial(`fireball-explosion-mat-${performance.now()}`, scene);
    explosionMat.diffuseColor = new B.Color3(1, 0.55, 0.18);
    explosionMat.emissiveColor = new B.Color3(1, 0.42, 0.12);
    explosionMat.alpha = 0.85;
    explosion.material = explosionMat;

    const explosionGrowthMultiplier = 6;
    const explosionVisualScale = Math.max(explosionScale, (explosionRadius * 2) / (0.6 * explosionGrowthMultiplier));

    activeExplosions.push({
      mesh: explosion,
      age: 0,
      lifetime: 0.45,
      scaleMultiplier: explosionVisualScale,
    });

    let damagedEnemyCount = 0;
    let defeatedEnemyCount = 0;

    for (const enemy of activeEnemies) {
      if (enemy.isDead) {
        continue;
      }
      if (B.Vector3.Distance(position, getEnemyHitPoint(enemy)) > explosionRadius) {
        continue;
      }

      damagedEnemyCount += 1;
      if (damageEnemy(enemy, FIREBALL_DAMAGE)) {
        defeatedEnemyCount += 1;
      }
    }

    const damagedHouseCount = damageHousesAt(position, explosionScale);

    if (damagedEnemyCount > 0) {
      setMessage(
        defeatedEnemyCount > 0
          ? `파이어볼 폭발로 적 ${damagedEnemyCount}명에게 피해를 주고 ${defeatedEnemyCount}명을 처치했습니다.`
          : `파이어볼 폭발이 적 ${damagedEnemyCount}명에게 ${FIREBALL_DAMAGE} 피해를 입혔습니다.`,
      );
      return;
    }

    if (damagedHouseCount > 0) {
      setMessage(`폭발로 건물 ${damagedHouseCount}채가 피해를 입었습니다.`);
    }
  };

  const spawnFireball = (chargeMs = 0) => {
    soundEffects.fireballCast();

    const chargeRatio = B.Scalar.Clamp(chargeMs / FIREBALL_CHARGE_MAX_MS, 0, 1);
    const projectileScale = B.Scalar.Lerp(1, 1.8, chargeRatio);
    const explosionScale = B.Scalar.Lerp(1, FIREBALL_MAX_EXPLOSION_SCALE, chargeRatio);
    const projectileRadius = FIREBALL_RADIUS * projectileScale;
    const explosionRadius = B.Scalar.Lerp(FIREBALL_HIT_RADIUS, FIREBALL_HIT_RADIUS * 2.2, chargeRatio);
    const fireballSpeed = B.Scalar.Lerp(FIREBALL_SPEED, FIREBALL_MAX_SPEED, chargeRatio);

    const forward = camera.getForwardRay().direction.normalize();
    const launchDirection = forward.clone();
    const spawnPosition = camera.position.add(forward.scale(1.2)).add(new B.Vector3(0, -0.15, 0));

    const fireball = B.MeshBuilder.CreateSphere("fireball", { diameter: 0.42, segments: 12 }, scene);
    fireball.position.copyFrom(spawnPosition);
    fireball.scaling.setAll(projectileScale);
    fireball.material = fireballMat;

    const fireballCore = B.MeshBuilder.CreateSphere("fireball-core", { diameter: 0.18, segments: 10 }, scene);
    fireballCore.position.copyFrom(spawnPosition);
    fireballCore.scaling.setAll(projectileScale);
    fireballCore.material = fireballCoreMat;

    const aggregate = new PhysicsAggregate(
      fireball,
      PhysicsShapeType.SPHERE,
      {
        mass: 1,
        restitution: 0.72,
        friction: 0.2,
        radius: projectileRadius,
      },
      scene,
    );
    aggregate.body.setLinearVelocity(launchDirection.scale(fireballSpeed));
    aggregate.body.setLinearDamping(0.02);
    aggregate.body.setAngularDamping(0.08);
    aggregate.body.setCollisionCallbackEnabled(true);

    const fireballState: FireballState = {
      mesh: fireball,
      glow: fireballCore,
      aggregate,
      age: 0,
      exploded: false,
      explosionScale,
      projectileRadius,
      explosionRadius,
    };

    aggregate.body.getCollisionObservable().add(() => {
      if (fireballState.exploded || fireballState.age < 0.06) {
        return;
      }

      fireballState.exploded = true;
      explodeFireball(fireballState.mesh.position.clone(), fireballState.explosionScale, fireballState.explosionRadius);
      disposeFireball(fireballState);
      const index = activeFireballs.indexOf(fireballState);
      if (index >= 0) {
        activeFireballs.splice(index, 1);
      }
    });

    activeFireballs.push(fireballState);
  };

  const createLightningSegment = (
    from: import("@babylonjs/core").Vector3,
    to: import("@babylonjs/core").Vector3,
    chainIndex: number,
  ) => {
    const midpoint = B.Vector3.Lerp(from, to, 0.5);
    const offset = new B.Vector3(
      B.Scalar.RandomRange(-0.5, 0.5),
      B.Scalar.RandomRange(0.2, 1.2),
      B.Scalar.RandomRange(-0.5, 0.5),
    );
    const points = [from, midpoint.add(offset), to];
    const bolt = B.MeshBuilder.CreateLines(`chain-lightning-${lightningCastSerial}-${chainIndex}`, { points }, scene);
    bolt.color = new B.Color3(0.72, 0.92, 1);
    activeLightningBolts.push({
      mesh: bolt as MeshRef,
      age: 0,
      lifetime: 0.18 + chainIndex * 0.03,
    });
  };

  const castChainLightning = () => {
    soundEffects.chainLightning();

    const origin = camera.position.add(new B.Vector3(0, 0.2, 0));
    const direction = camera.getForwardRay().direction.normalize();
    lightningCastSerial += 1;

    const firstEnemy = findEnemyInRay(origin, direction);
    const beamEnd = firstEnemy ? getEnemyHitPoint(firstEnemy) : origin.add(direction.scale(CHAIN_LIGHTNING_RANGE));
    createLightningSegment(origin, beamEnd, 0);

    if (!firstEnemy) {
      setMessage("체인 라이트닝이 허공으로 흩어졌습니다.");
      return;
    }

    const hitEnemies = getChainTargets(firstEnemy, CHAIN_LIGHTNING_MAX_BOUNCES);
    let currentSource = getEnemyHitPoint(firstEnemy);
    let defeatedCount = 0;

    for (let index = 1; index < hitEnemies.length; index += 1) {
      const targetPoint = getEnemyHitPoint(hitEnemies[index]);
      createLightningSegment(currentSource, targetPoint, index);
      currentSource = targetPoint;
    }

    hitEnemies.forEach((enemy) => {
      if (damageEnemy(enemy, CHAIN_LIGHTNING_DAMAGE)) {
        defeatedCount += 1;
      }
    });

    setMessage(
      `체인 라이트닝이 ${hitEnemies.length}명에게 ${CHAIN_LIGHTNING_DAMAGE} 피해를 입혔습니다.${defeatedCount > 0 ? ` ${defeatedCount}명 처치.` : ""}`,
    );
  };

  const update = (dt: number) => {
    for (let index = activeFireballs.length - 1; index >= 0; index -= 1) {
      const fireball = activeFireballs[index];
      fireball.age += dt;
      fireball.glow.position.copyFrom(fireball.mesh.position);
      const velocity = fireball.aggregate.body.getLinearVelocity();
      const speed = velocity.length();
      fireball.glow.scaling.setAll(fireball.mesh.scaling.x * (1 + Math.min(0.45, speed / 60)));

      let hitEnemy = false;
      for (const enemy of activeEnemies) {
        if (enemy.isDead) {
          continue;
        }
        if (!isDirectFireballHit(fireball, enemy)) {
          continue;
        }

        fireball.exploded = true;
        explodeFireball(fireball.mesh.position.clone(), fireball.explosionScale, fireball.explosionRadius);
        disposeFireball(fireball);
        activeFireballs.splice(index, 1);
        hitEnemy = true;
        break;
      }

      if (hitEnemy) {
        continue;
      }

      if (
        fireball.exploded ||
        fireball.age >= FIREBALL_LIFETIME ||
        fireball.mesh.position.y <= FIREBALL_RADIUS ||
        Math.abs(fireball.mesh.position.x) > WORLD_LIMIT + 8 ||
        Math.abs(fireball.mesh.position.z) > WORLD_LIMIT + 8
      ) {
        if (!fireball.exploded) {
          explodeFireball(fireball.mesh.position.clone(), fireball.explosionScale, fireball.explosionRadius);
        }
        disposeFireball(fireball);
        activeFireballs.splice(index, 1);
      }
    }

    for (let index = activeExplosions.length - 1; index >= 0; index -= 1) {
      const explosion = activeExplosions[index];
      explosion.age += dt;
      const progress = explosion.age / explosion.lifetime;
      const scaleMultiplier = explosion.scaleMultiplier ?? 1;
      explosion.mesh.scaling.setAll(scaleMultiplier * (1 + progress * 5));

      const material = explosion.mesh.material;
      if (material && "alpha" in material) {
        material.alpha = Math.max(0, 0.85 - progress * 0.85);
      }

      if (explosion.age >= explosion.lifetime) {
        explosion.mesh.material?.dispose();
        explosion.mesh.dispose();
        activeExplosions.splice(index, 1);
      }
    }

    for (let index = activeLightningBolts.length - 1; index >= 0; index -= 1) {
      const bolt = activeLightningBolts[index];
      bolt.age += dt;
      const progress = bolt.age / bolt.lifetime;
      bolt.mesh.visibility = Math.max(0, 1 - progress);
      if (bolt.age >= bolt.lifetime) {
        bolt.mesh.dispose();
        activeLightningBolts.splice(index, 1);
      }
    }
  };

  const dispose = () => {
    for (const fireball of activeFireballs) {
      disposeFireball(fireball);
    }
    for (const bolt of activeLightningBolts) {
      bolt.mesh.dispose();
    }
    for (const explosion of activeExplosions) {
      explosion.mesh.material?.dispose();
      explosion.mesh.dispose();
    }
    activeFireballs.length = 0;
    activeLightningBolts.length = 0;
    activeExplosions.length = 0;
  };

  return {
    spawnFireball,
    castChainLightning,
    update,
    dispose,
  };
}
