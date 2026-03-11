import {
  CLEAR_RADIUS,
  DEFAULT_MESSAGE,
  ENEMY_MAX_ACTIVE,
  ENEMY_SPAWN_INTERVAL,
  FIREBALL_CHARGE_MAX_MS,
  JUMP_SPEED,
  LANDMARKS,
  MOVE_SPEED,
  PLAYER_MAX_HEALTH,
  PLAYER_GRAVITY,
  PLAYER_HEIGHT,
  WORLD_LIMIT,
  formatTime,
} from "./constants";
import { createGameAudioSystem } from "./audioSystem";
import { createEnemySystem } from "./enemySystem";
import { createHouseSystem } from "./houseSystem";
import { createSpellSystem } from "./spellSystem";
import type { CreateSceneOptions, LandmarkMesh } from "./types";

export async function createRobotsAndWizardScene({
  mountElement,
  canvasClassName,
  bestTimeRef,
  selectedSpellRef,
  callbacks,
}: CreateSceneOptions) {
  const [
    B,
    { default: HavokPhysics },
    { HavokPlugin },
    { PhysicsAggregate },
    { PhysicsShapeType },
    ,
  ] = await Promise.all([
    import("@babylonjs/core"),
    import("@babylonjs/havok"),
    import("@babylonjs/core/Physics/v2/Plugins/havokPlugin"),
    import("@babylonjs/core/Physics/v2/physicsAggregate"),
    import("@babylonjs/core/Physics/v2/IPhysicsEnginePlugin"),
    import("@babylonjs/core/Physics/joinedPhysicsEngineComponent"),
  ]);

  callbacks.setVisitedCount(0);
  callbacks.setElapsedSeconds(0);
  callbacks.setIsCleared(false);
  callbacks.setPlayerHealth(PLAYER_MAX_HEALTH);
  callbacks.setFireballChargeLevel(0);
  callbacks.setMessage(DEFAULT_MESSAGE);
  callbacks.setSelectedSpell(selectedSpellRef.current);

  const visitedMap = new Set<string>();
  const audioSystem = createGameAudioSystem();
  const pressedKeys = new Set<string>();
  const staticAggregates: Array<InstanceType<typeof PhysicsAggregate>> = [];
  let lastSecond = 0;
  let elapsed = 0;
  let cleared = false;
  let verticalVelocity = 0;
  let isGrounded = true;
  let jumpQueued = false;
  let enemySpawnCooldown = 0.4;
  let playerHealth = PLAYER_MAX_HEALTH;
  let hitShakeTime = 0;
  let hitFlashTime = 0;
  let fireballChargeStartedAt: number | null = null;

  const canvas = document.createElement("canvas");
  canvas.className = canvasClassName;
  mountElement.innerHTML = "";
  mountElement.appendChild(canvas);

  const engine = new B.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
  const scene = new B.Scene(engine);
  scene.clearColor = new B.Color4(0.8, 0.95, 1, 1);
  const baseClearColor = scene.clearColor.clone();
  const hitFlashColor = new B.Color4(1, 0.78, 0.78, 1);
  scene.collisionsEnabled = true;

  const havok = await HavokPhysics();
  scene.enablePhysics(new B.Vector3(0, -18, 0), new HavokPlugin(true, havok));

  const camera = new B.UniversalCamera("camera", new B.Vector3(0, PLAYER_HEIGHT, 0), scene);
  const collisionCamera = camera as typeof camera & {
    _collideWithWorld: (displacement: InstanceType<typeof B.Vector3>) => void;
  };
  camera.attachControl(canvas, true);
  camera.speed = MOVE_SPEED;
  camera.inertia = 0.08;
  camera.angularSensibility = 1200;
  camera.minZ = 0.1;
  camera.keysUp = [];
  camera.keysDown = [];
  camera.keysLeft = [];
  camera.keysRight = [];
  camera.checkCollisions = true;
  camera.applyGravity = false;
  camera.ellipsoid = new B.Vector3(0.65, PLAYER_HEIGHT, 0.65);
  camera.ellipsoidOffset = B.Vector3.Zero();

  const createStaticAggregate = (
    mesh: import("@babylonjs/core").Mesh,
    type: number,
    options?: { restitution?: number; friction?: number },
  ) => {
    mesh.checkCollisions = true;
    const aggregate = new PhysicsAggregate(
      mesh,
      type,
      {
        mass: 0,
        restitution: options?.restitution ?? 0.15,
        friction: options?.friction ?? 0.9,
      },
      scene,
    );
    staticAggregates.push(aggregate);
    return aggregate;
  };

  const releaseStaticAggregate = (aggregate: InstanceType<typeof PhysicsAggregate>) => {
    const index = staticAggregates.indexOf(aggregate);
    if (index >= 0) {
      staticAggregates.splice(index, 1);
    }
    aggregate.dispose();
  };

  new B.DirectionalLight("sun", new B.Vector3(-0.35, -1, -0.25), scene).intensity = 1.2;
  new B.HemisphericLight("sky", new B.Vector3(0, 1, 0), scene).intensity = 0.6;

  const ground = B.MeshBuilder.CreateGround("ground", { width: 130, height: 130 }, scene);
  const groundMat = new B.StandardMaterial("ground-mat", scene);
  groundMat.diffuseColor = new B.Color3(0.45, 0.74, 0.46);
  groundMat.specularColor = B.Color3.Black();
  ground.material = groundMat;

  const roadMat = new B.StandardMaterial("road-mat", scene);
  roadMat.diffuseColor = new B.Color3(0.35, 0.35, 0.38);
  roadMat.specularColor = B.Color3.Black();

  const roadX = B.MeshBuilder.CreateBox("road-x", { width: 104, height: 0.05, depth: 12 }, scene);
  roadX.position.y = 0.03;
  roadX.material = roadMat;

  const roadZ = B.MeshBuilder.CreateBox("road-z", { width: 12, height: 0.05, depth: 104 }, scene);
  roadZ.position.y = 0.03;
  roadZ.material = roadMat;

  createStaticAggregate(ground, PhysicsShapeType.BOX, { restitution: 0.05, friction: 1 });

  [
    { name: "north-wall", width: 130, height: 12, depth: 1.5, x: 0, y: 6, z: -WORLD_LIMIT - 2 },
    { name: "south-wall", width: 130, height: 12, depth: 1.5, x: 0, y: 6, z: WORLD_LIMIT + 2 },
    { name: "west-wall", width: 1.5, height: 12, depth: 130, x: -WORLD_LIMIT - 2, y: 6, z: 0 },
    { name: "east-wall", width: 1.5, height: 12, depth: 130, x: WORLD_LIMIT + 2, y: 6, z: 0 },
  ].forEach((wallDef) => {
    const wall = B.MeshBuilder.CreateBox(
      wallDef.name,
      { width: wallDef.width, height: wallDef.height, depth: wallDef.depth },
      scene,
    );
    wall.position.set(wallDef.x, wallDef.y, wallDef.z);
    wall.isVisible = false;
    createStaticAggregate(wall, PhysicsShapeType.BOX, { restitution: 0.35, friction: 0.9 });
  });

  const houseSystem = createHouseSystem({
    B,
    scene,
    createStaticAggregate,
    releaseStaticAggregate,
    PhysicsShapeType,
  });
  houseSystem.createVillageStructures();

  const enemySystem = createEnemySystem({
    B,
    scene,
    soundEffects: {
      enemyMissileLaunch: () => {
        void audioSystem.unlock();
        audioSystem.enemyMissileLaunch();
      },
      enemyHit: () => {
        void audioSystem.unlock();
        audioSystem.enemyHit();
      },
      enemyDefeat: () => {
        void audioSystem.unlock();
        audioSystem.enemyDefeat();
      },
    },
  });
  const spellSystem = createSpellSystem({
    B,
    scene,
    camera,
    PhysicsAggregate,
    PhysicsShapeType,
    activeEnemies: enemySystem.activeEnemies,
    findEnemyInRay: enemySystem.findEnemyInRay,
    getChainTargets: enemySystem.getChainTargets,
    damageEnemy: enemySystem.damageEnemy,
    damageHousesAt: houseSystem.damageHousesAt,
    setMessage: callbacks.setMessage,
    soundEffects: {
      fireballCast: () => {
        void audioSystem.unlock();
        audioSystem.fireballCast();
      },
      fireballExplode: () => {
        void audioSystem.unlock();
        audioSystem.fireballExplode();
      },
      chainLightning: () => {
        void audioSystem.unlock();
        audioSystem.chainLightning();
      },
    },
  });

  const landmarkMeshes: LandmarkMesh[] = LANDMARKS.map((landmark) => {
    const marker = B.MeshBuilder.CreateCylinder(`landmark-${landmark.id}`, { diameter: 3.8, height: 1.6 }, scene);
    marker.position.set(landmark.position.x, 0.8, landmark.position.z);
    const markerMat = new B.StandardMaterial(`landmark-mat-${landmark.id}`, scene);
    markerMat.diffuseColor = new B.Color3(landmark.color[0], landmark.color[1], landmark.color[2]);
    markerMat.emissiveColor = new B.Color3(landmark.color[0] * 0.3, landmark.color[1] * 0.3, landmark.color[2] * 0.3);
    marker.material = markerMat;
    return { ...landmark, mesh: marker, mat: markerMat };
  });

  const requestPointerLock = () => {
    void audioSystem.unlock();
    if (document.pointerLockElement !== canvas) {
      void canvas.requestPointerLock?.();
    }
  };

  const onMouseDown = (event: MouseEvent) => {
    if (event.button !== 0) {
      return;
    }

    requestPointerLock();
    if (selectedSpellRef.current === "chain-lightning") {
      spellSystem.castChainLightning();
      return;
    }

    fireballChargeStartedAt = performance.now();
    callbacks.setFireballChargeLevel(0);
    audioSystem.startFireballCharge();
  };

  const onMouseUp = (event: MouseEvent) => {
    if (event.button !== 0 || fireballChargeStartedAt === null) {
      return;
    }

    const chargeStartedAt = fireballChargeStartedAt;
    fireballChargeStartedAt = null;
    callbacks.setFireballChargeLevel(0);
    audioSystem.stopFireballCharge();
    spellSystem.spawnFireball(performance.now() - chargeStartedAt);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    void audioSystem.unlock();
    pressedKeys.add(event.code);

    if (event.code === "Digit1") {
      selectedSpellRef.current = "fireball";
      callbacks.setSelectedSpell("fireball");
      callbacks.setFireballChargeLevel(0);
      callbacks.setMessage("마법 전환: 파이어볼");
      return;
    }

    if (event.code === "Digit2") {
      selectedSpellRef.current = "chain-lightning";
      callbacks.setSelectedSpell("chain-lightning");
      fireballChargeStartedAt = null;
      callbacks.setFireballChargeLevel(0);
      audioSystem.stopFireballCharge();
      callbacks.setMessage("마법 전환: 체인 라이트닝");
      return;
    }

    if (event.code === "Space") {
      event.preventDefault();
      if (!event.repeat) {
        jumpQueued = true;
      }
    }
  };

  const onKeyUp = (event: KeyboardEvent) => {
    pressedKeys.delete(event.code);
  };

  const onResize = () => {
    engine.resize();
  };

  canvas.addEventListener("click", requestPointerLock);
  canvas.addEventListener("mousedown", onMouseDown);
  window.addEventListener("mouseup", onMouseUp);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("resize", onResize);

  engine.runRenderLoop(() => {
    const dt = engine.getDeltaTime() / 1000;

    if (!cleared) {
      if (jumpQueued && isGrounded) {
        verticalVelocity = JUMP_SPEED;
        isGrounded = false;
      }
      jumpQueued = false;

      const forward = camera.getForwardRay().direction.clone();
      forward.y = 0;
      if (forward.lengthSquared() > 0.0001) {
        forward.normalize();
      } else {
        forward.set(0, 0, 1);
      }

      const right = new B.Vector3(forward.z, 0, -forward.x);
      const moveDirection = B.Vector3.Zero();
      if (pressedKeys.has("KeyW")) {
        moveDirection.addInPlace(forward);
      }
      if (pressedKeys.has("KeyS")) {
        moveDirection.subtractInPlace(forward);
      }
      if (pressedKeys.has("KeyA")) {
        moveDirection.subtractInPlace(right);
      }
      if (pressedKeys.has("KeyD")) {
        moveDirection.addInPlace(right);
      }

      if (moveDirection.lengthSquared() > 0.0001) {
        moveDirection.normalize().scaleInPlace(MOVE_SPEED * dt);
      }

      verticalVelocity -= PLAYER_GRAVITY * dt;
      moveDirection.y = verticalVelocity * dt;

      const previousPosition = camera.position.clone();
      collisionCamera._collideWithWorld(moveDirection);
      camera.position.x = B.Scalar.Clamp(camera.position.x, -WORLD_LIMIT, WORLD_LIMIT);
      camera.position.z = B.Scalar.Clamp(camera.position.z, -WORLD_LIMIT, WORLD_LIMIT);

      const actualDeltaY = camera.position.y - previousPosition.y;
      const intendedDeltaY = moveDirection.y;
      const verticalBlocked = Math.abs(actualDeltaY - intendedDeltaY) > 0.001 && Math.abs(intendedDeltaY) > 0.001;

      if (camera.position.y <= PLAYER_HEIGHT + 0.001) {
        camera.position.y = PLAYER_HEIGHT;
        if (verticalVelocity < 0) {
          verticalVelocity = 0;
        }
        isGrounded = true;
      } else if (intendedDeltaY > 0 && verticalBlocked) {
        verticalVelocity = 0;
        isGrounded = false;
      } else if (intendedDeltaY < 0 && verticalBlocked) {
        verticalVelocity = 0;
        isGrounded = true;
      } else {
        isGrounded = false;
      }

      enemySpawnCooldown -= dt;
      if (enemySpawnCooldown <= 0 && enemySystem.activeEnemies.filter((enemy) => !enemy.isDead).length < ENEMY_MAX_ACTIVE) {
        enemySystem.spawnEnemy();
        enemySpawnCooldown = ENEMY_SPAWN_INTERVAL;
      }

      if (fireballChargeStartedAt !== null && selectedSpellRef.current === "fireball") {
        const chargeLevel = B.Scalar.Clamp((performance.now() - fireballChargeStartedAt) / FIREBALL_CHARGE_MAX_MS, 0, 1);
        callbacks.setFireballChargeLevel(chargeLevel);
        audioSystem.updateFireballCharge(chargeLevel);
      }

      spellSystem.update(dt);
      enemySystem.updateEnemies(dt, camera.position, callbacks.setMessage, (damage) => {
        playerHealth = Math.max(0, playerHealth - damage);
        hitShakeTime = 0.22;
        hitFlashTime = 0.18;
        audioSystem.playerHit();
        callbacks.setPlayerHealth(playerHealth);

        if (playerHealth <= 0) {
          cleared = true;
          callbacks.setIsCleared(false);
          callbacks.setMessage("플레이어가 쓰러졌습니다. 다시 시작하세요.");
          return;
        }

        callbacks.setMessage(`미사일에 맞았습니다. 체력 ${playerHealth}`);
      });
      houseSystem.update(dt);

      elapsed += dt;
      const whole = Math.floor(elapsed);
      if (whole !== lastSecond) {
        lastSecond = whole;
        callbacks.setElapsedSeconds(whole);
      }

      for (const landmark of landmarkMeshes) {
        if (visitedMap.has(landmark.id)) {
          continue;
        }
        if (B.Vector3.Distance(camera.position, landmark.mesh.position) <= CLEAR_RADIUS) {
          visitedMap.add(landmark.id);
          landmark.mat.diffuseColor = new B.Color3(0.24, 0.81, 0.52);
          landmark.mat.emissiveColor = new B.Color3(0.05, 0.2, 0.12);
          callbacks.setVisitedCount(visitedMap.size);
          callbacks.setMessage(`${landmark.label} 방문 완료 (${visitedMap.size}/${LANDMARKS.length})`);
        }
      }

      if (visitedMap.size === LANDMARKS.length) {
        cleared = true;
        const finalTime = Math.floor(elapsed);
        callbacks.setIsCleared(true);
        callbacks.setMessage(`탐험 완료! 기록 ${formatTime(finalTime)}`);
        if (bestTimeRef.current === null || finalTime < bestTimeRef.current) {
          callbacks.setBestTime(finalTime);
        }
      }
    }

    hitShakeTime = Math.max(0, hitShakeTime - dt);
    hitFlashTime = Math.max(0, hitFlashTime - dt);
    scene.clearColor = B.Color4.Lerp(baseClearColor, hitFlashColor, (hitFlashTime / 0.18) * 0.65);

    let shakeOffsetX = 0;
    let shakeOffsetY = 0;
    if (hitShakeTime > 0) {
      const shakeStrength = (hitShakeTime / 0.22) * 0.035;
      shakeOffsetX = B.Scalar.RandomRange(-shakeStrength, shakeStrength);
      shakeOffsetY = B.Scalar.RandomRange(-shakeStrength, shakeStrength);
      camera.rotation.x += shakeOffsetX;
      camera.rotation.y += shakeOffsetY;
    }

    scene.render();
    if (shakeOffsetX !== 0 || shakeOffsetY !== 0) {
      camera.rotation.x -= shakeOffsetX;
      camera.rotation.y -= shakeOffsetY;
    }
  });

  return () => {
    audioSystem.stopFireballCharge();
    spellSystem.dispose();
    enemySystem.dispose();
    for (const aggregate of staticAggregates) {
      aggregate.dispose();
    }
    canvas.removeEventListener("click", requestPointerLock);
    canvas.removeEventListener("mousedown", onMouseDown);
    window.removeEventListener("mouseup", onMouseUp);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("resize", onResize);
    engine.stopRenderLoop();
    scene.dispose();
    engine.dispose();
  };
}
