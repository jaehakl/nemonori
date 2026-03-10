"use client";

import { useEffect, useRef, useState } from "react";
import { loadGameSave, saveGameSave } from "@/app/lib/save-protocol";
import styles from "./BabylonVillageWalkGame.module.css";

const GAME_SLUG = "babylon-village-walk";
const GAME_TITLE = "Babylon Village Walk";
const MOVE_SPEED = 10;
const WORLD_LIMIT = 52;
const CLEAR_RADIUS = 4.2;
const PLAYER_HEIGHT = 1.7;
const FIREBALL_SPEED = 24;
const FIREBALL_GRAVITY = 18;
const FIREBALL_LIFETIME = 3.2;
const FIREBALL_RADIUS = 0.21;
const EXPLOSION_RADIUS = 9;
const EXPLOSION_DAMAGE = 55;
const HOUSE_MAX_HEALTH = 100;

const LANDMARKS = [
  { id: "plaza", label: "Plaza Fountain", position: { x: -24, z: -12 }, color: [0.95, 0.76, 0.25] as const },
  { id: "market", label: "Market", position: { x: 18, z: -18 }, color: [0.98, 0.51, 0.3] as const },
  { id: "tower", label: "Watch Tower", position: { x: 30, z: 14 }, color: [0.5, 0.76, 0.98] as const },
  { id: "lake", label: "Lake", position: { x: -22, z: 22 }, color: [0.31, 0.85, 0.64] as const },
  { id: "gate", label: "Village Gate", position: { x: 0, z: 34 }, color: [0.75, 0.65, 0.99] as const },
];

const formatTime = (seconds: number) => {
  const m = String(Math.floor(seconds / 60)).padStart(2, "0");
  const s = String(seconds % 60).padStart(2, "0");
  return `${m}:${s}`;
};

export function BabylonVillageWalkGame() {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const bestTimeRef = useRef<number | null>(null);

  const [runId, setRunId] = useState(0);
  const [visitedCount, setVisitedCount] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isCleared, setIsCleared] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [message, setMessage] = useState("캔버스를 클릭해 시점을 고정하고, 마우스와 WASD로 모든 장소를 방문하세요.");
  const [bestTime, setBestTime] = useState<number | null>(null);

  useEffect(() => {
    bestTimeRef.current = bestTime;
  }, [bestTime]);

  useEffect(() => {
    const saved = loadGameSave<{ bestTime?: number }>(GAME_SLUG);
    if (saved?.data && typeof saved.data.bestTime === "number" && Number.isFinite(saved.data.bestTime)) {
      setBestTime(Math.max(0, Math.floor(saved.data.bestTime)));
    }
  }, []);

  useEffect(() => {
    if (bestTime === null) {
      return;
    }
    saveGameSave(GAME_SLUG, GAME_TITLE, { bestTime });
  }, [bestTime]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === panelRef.current);
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, []);

  useEffect(() => {
    if (!mountRef.current) {
      return;
    }

    let disposed = false;
    let cleanup: (() => void) | null = null;

    const start = async () => {
      const B = await import("@babylonjs/core");
      if (disposed || !mountRef.current) {
        return;
      }

      setVisitedCount(0);
      setElapsedSeconds(0);
      setIsCleared(false);
      setMessage("캔버스를 클릭해 시점을 고정하고, 마우스와 WASD로 모든 장소를 방문하세요.");

      const visitedMap = new Set<string>();
      let lastSecond = 0;
      let elapsed = 0;
      let cleared = false;

      const canvas = document.createElement("canvas");
      canvas.className = styles.canvas;
      mountRef.current.innerHTML = "";
      mountRef.current.appendChild(canvas);

      const engine = new B.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
      const scene = new B.Scene(engine);
      scene.clearColor = new B.Color4(0.8, 0.95, 1, 1);

      const camera = new B.UniversalCamera("camera", new B.Vector3(0, PLAYER_HEIGHT, 0), scene);
      camera.attachControl(canvas, true);
      camera.speed = MOVE_SPEED;
      camera.inertia = 0.08;
      camera.angularSensibility = 1200;
      camera.minZ = 0.1;
      camera.keysUp = [87];
      camera.keysDown = [83];
      camera.keysLeft = [65];
      camera.keysRight = [68];

      const sun = new B.DirectionalLight("sun", new B.Vector3(-0.35, -1, -0.25), scene);
      sun.intensity = 1.2;
      const skyLight = new B.HemisphericLight("sky", new B.Vector3(0, 1, 0), scene);
      skyLight.intensity = 0.6;

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

      type MeshRef = InstanceType<typeof B.Mesh>;
      type MaterialRef = InstanceType<typeof B.StandardMaterial>;
      type HouseState = {
        id: string;
        body: MeshRef;
        roof: MeshRef;
        bodyMat: MaterialRef;
        roofMat: MaterialRef;
        fires: MeshRef[];
        health: number;
        destroyed: boolean;
        collapseProgress: number;
        center: InstanceType<typeof B.Vector3>;
        bodyBasePosition: InstanceType<typeof B.Vector3>;
        roofBasePosition: InstanceType<typeof B.Vector3>;
        fireBasePositions: Array<InstanceType<typeof B.Vector3>>;
      };

      const collidableMeshes: MeshRef[] = [];
      const houses: HouseState[] = [];
      const baseBodyColor = new B.Color3(0.96, 0.9, 0.78);
      const damagedBodyColor = new B.Color3(0.28, 0.24, 0.22);
      const baseRoofColor = new B.Color3(0.7, 0.2, 0.17);
      const damagedRoofColor = new B.Color3(0.16, 0.08, 0.08);

      const removeCollidableMesh = (mesh: MeshRef) => {
        const index = collidableMeshes.indexOf(mesh);
        if (index >= 0) {
          collidableMeshes.splice(index, 1);
        }
      };

      const updateHouseVisuals = (house: HouseState, timeMs: number) => {
        const integrity = B.Scalar.Clamp(house.health / HOUSE_MAX_HEALTH, 0, 1);
        const damage = 1 - integrity;

        house.bodyMat.diffuseColor = B.Color3.Lerp(baseBodyColor, damagedBodyColor, damage);
        house.roofMat.diffuseColor = B.Color3.Lerp(baseRoofColor, damagedRoofColor, damage);
        house.roofMat.emissiveColor = B.Color3.Lerp(B.Color3.Black(), new B.Color3(0.75, 0.18, 0.05), damage * 0.85);

        if (!house.destroyed) {
          house.body.position.copyFrom(house.bodyBasePosition);
          house.roof.position.copyFrom(house.roofBasePosition);
          house.body.rotation.z = Math.sin(timeMs / 120 + house.center.x) * damage * 0.04;
          house.roof.rotation.x = Math.sin(timeMs / 200 + house.center.z) * damage * 0.07;
          house.roof.rotation.z = damage * 0.14;
        }

        const fireVisible = damage > 0.3 || house.destroyed;
        house.fires.forEach((fire, index) => {
          fire.isVisible = fireVisible;
          fire.setEnabled(fireVisible);
          if (!fireVisible) {
            return;
          }

          const basePosition = house.fireBasePositions[index];
          fire.position.copyFrom(basePosition);
          fire.position.y += Math.sin(timeMs / 90 + index * 0.9) * 0.16;
          const pulse = 0.85 + damage * 0.9 + Math.sin(timeMs / 75 + index) * 0.12;
          fire.scaling.setAll(Math.max(0.45, pulse));

          const fireMat = fire.material as MaterialRef;
          fireMat.alpha = house.destroyed ? Math.max(0, 0.95 - house.collapseProgress * 0.7) : 0.75 + damage * 0.2;
          fireMat.emissiveColor = B.Color3.Lerp(
            new B.Color3(0.8, 0.24, 0.05),
            new B.Color3(1, 0.86, 0.26),
            0.3 + Math.max(0, Math.sin(timeMs / 110 + index)) * 0.35,
          );
        });
      };

      const createHouse = (name: string, x: number, z: number) => {
        const body = B.MeshBuilder.CreateBox(`${name}-body`, { width: 8, depth: 8, height: 5.2 }, scene);
        body.position.set(x, 2.6, z);
        const bodyMat = new B.StandardMaterial(`${name}-body-mat`, scene);
        bodyMat.diffuseColor = baseBodyColor.clone();
        body.material = bodyMat;

        const roof = B.MeshBuilder.CreateCylinder(
          `${name}-roof`,
          { diameterTop: 0.2, diameterBottom: 8.8, height: 3.2, tessellation: 4 },
          scene,
        );
        roof.position.set(x, 6.7, z);
        roof.rotation.y = Math.PI / 4;
        const roofMat = new B.StandardMaterial(`${name}-roof-mat`, scene);
        roofMat.diffuseColor = baseRoofColor.clone();
        roof.material = roofMat;

        const fireBasePositions = [new B.Vector3(x - 1.3, 6.8, z - 0.6), new B.Vector3(x + 1.1, 7.15, z + 0.7)];
        const fires = fireBasePositions.map((position, index) => {
          const fire = B.MeshBuilder.CreateSphere(`${name}-fire-${index}`, { diameter: 1.05, segments: 8 }, scene);
          fire.position.copyFrom(position);
          const fireMat = new B.StandardMaterial(`${name}-fire-mat-${index}`, scene);
          fireMat.diffuseColor = new B.Color3(1, 0.52, 0.14);
          fireMat.emissiveColor = new B.Color3(1, 0.74, 0.2);
          fireMat.alpha = 0.82;
          fireMat.specularColor = B.Color3.Black();
          fire.material = fireMat;
          fire.isVisible = false;
          fire.setEnabled(false);
          return fire;
        });

        const house: HouseState = {
          id: name,
          body,
          roof,
          bodyMat,
          roofMat,
          fires,
          health: HOUSE_MAX_HEALTH,
          destroyed: false,
          collapseProgress: 0,
          center: new B.Vector3(x, 3.8, z),
          bodyBasePosition: body.position.clone(),
          roofBasePosition: roof.position.clone(),
          fireBasePositions,
        };

        collidableMeshes.push(body, roof);
        houses.push(house);
      };

      const createTree = (name: string, x: number, z: number) => {
        const trunk = B.MeshBuilder.CreateCylinder(`${name}-trunk`, { diameter: 1.2, height: 3.5 }, scene);
        trunk.position.set(x, 1.75, z);
        const trunkMat = new B.StandardMaterial(`${name}-trunk-mat`, scene);
        trunkMat.diffuseColor = new B.Color3(0.45, 0.26, 0.12);
        trunk.material = trunkMat;

        const crown = B.MeshBuilder.CreateSphere(`${name}-crown`, { diameter: 4.4 }, scene);
        crown.position.set(x, 4.8, z);
        const crownMat = new B.StandardMaterial(`${name}-crown-mat`, scene);
        crownMat.diffuseColor = new B.Color3(0.18, 0.58, 0.24);
        crown.material = crownMat;

        collidableMeshes.push(trunk, crown);
      };

      createHouse("house-a", -34, -26);
      createHouse("house-b", 34, -26);
      createHouse("house-c", -34, 24);
      createHouse("house-d", 34, 24);
      createHouse("house-e", 8, 2);

      for (let i = -2; i <= 2; i += 1) {
        createTree(`tree-n-${i}`, -50 + i * 10, -40);
        createTree(`tree-s-${i}`, 50 - i * 10, 40);
      }

      const player = B.MeshBuilder.CreateCapsule("player", { radius: 1.1, height: 3.4 }, scene);
      player.position.set(0, PLAYER_HEIGHT, 0);
      player.isVisible = false;

      const landmarkMeshes = LANDMARKS.map((landmark) => {
        const marker = B.MeshBuilder.CreateCylinder(`landmark-${landmark.id}`, { diameter: 3.8, height: 1.6 }, scene);
        marker.position.set(landmark.position.x, 0.8, landmark.position.z);
        const markerMat = new B.StandardMaterial(`landmark-mat-${landmark.id}`, scene);
        markerMat.diffuseColor = new B.Color3(landmark.color[0], landmark.color[1], landmark.color[2]);
        markerMat.emissiveColor = new B.Color3(landmark.color[0] * 0.3, landmark.color[1] * 0.3, landmark.color[2] * 0.3);
        marker.material = markerMat;
        return { ...landmark, mesh: marker, mat: markerMat };
      });

      const fireballMat = new B.StandardMaterial("fireball-mat", scene);
      fireballMat.diffuseColor = new B.Color3(1, 0.45, 0.12);
      fireballMat.emissiveColor = new B.Color3(1, 0.3, 0.08);
      fireballMat.specularColor = B.Color3.Black();

      const fireballCoreMat = new B.StandardMaterial("fireball-core-mat", scene);
      fireballCoreMat.diffuseColor = new B.Color3(1, 0.88, 0.48);
      fireballCoreMat.emissiveColor = new B.Color3(1, 0.78, 0.36);
      fireballCoreMat.specularColor = B.Color3.Black();

      const activeFireballs: Array<{
        mesh: typeof player;
        glow: typeof player;
        velocity: InstanceType<typeof B.Vector3>;
        age: number;
      }> = [];
      const activeExplosions: Array<{
        mesh: typeof player;
        age: number;
        lifetime: number;
      }> = [];

      const disposeFireball = (fireball: (typeof activeFireballs)[number]) => {
        fireball.mesh.dispose();
        fireball.glow.dispose();
      };

      const explodeFireball = (position: InstanceType<typeof B.Vector3>) => {
        const explosion = B.MeshBuilder.CreateSphere("fireball-explosion", { diameter: 0.6, segments: 16 }, scene);
        explosion.position.copyFrom(position);

        const explosionMat = new B.StandardMaterial(`fireball-explosion-mat-${performance.now()}`, scene);
        explosionMat.diffuseColor = new B.Color3(1, 0.55, 0.18);
        explosionMat.emissiveColor = new B.Color3(1, 0.42, 0.12);
        explosionMat.alpha = 0.85;
        explosion.material = explosionMat;

        activeExplosions.push({
          mesh: explosion,
          age: 0,
          lifetime: 0.45,
        });

        let damagedHouseCount = 0;
        for (const house of houses) {
          if (house.destroyed) {
            continue;
          }

          const distance = B.Vector3.Distance(position, house.center);
          if (distance > EXPLOSION_RADIUS) {
            continue;
          }

          const damageRatio = 1 - distance / EXPLOSION_RADIUS;
          const damageAmount = Math.max(8, EXPLOSION_DAMAGE * damageRatio);
          house.health = Math.max(0, house.health - damageAmount);
          damagedHouseCount += 1;

          if (house.health <= 0 && !house.destroyed) {
            house.destroyed = true;
            house.collapseProgress = 0;
            removeCollidableMesh(house.body);
            removeCollidableMesh(house.roof);
          }
        }

        if (damagedHouseCount > 0) {
          setMessage(`폭발로 건물 ${damagedHouseCount}채가 피해를 입었습니다.`);
        }
      };

      const spawnFireball = () => {
        const forward = camera.getForwardRay().direction.normalize();
        const launchDirection = new B.Vector3(forward.x, Math.max(-0.15, forward.y) + 0.2, forward.z).normalize();
        const spawnPosition = camera.position
          .add(forward.scale(1.2))
          .add(new B.Vector3(0, -0.15, 0));

        const fireball = B.MeshBuilder.CreateSphere("fireball", { diameter: 0.42, segments: 12 }, scene);
        fireball.position.copyFrom(spawnPosition);
        fireball.material = fireballMat;

        const fireballCore = B.MeshBuilder.CreateSphere("fireball-core", { diameter: 0.18, segments: 10 }, scene);
        fireballCore.position.copyFrom(spawnPosition);
        fireballCore.material = fireballCoreMat;

        activeFireballs.push({
          mesh: fireball,
          glow: fireballCore,
          velocity: launchDirection.scale(FIREBALL_SPEED),
          age: 0,
        });
      };

      const getBounceNormal = (position: InstanceType<typeof B.Vector3>, mesh: InstanceType<typeof B.Mesh>) => {
        const bounds = mesh.getBoundingInfo().boundingBox;
        const min = bounds.minimumWorld;
        const max = bounds.maximumWorld;
        const center = bounds.centerWorld;
        const distanceToFaces = [
          { distance: Math.abs(position.x - min.x), normal: new B.Vector3(-1, 0, 0) },
          { distance: Math.abs(max.x - position.x), normal: new B.Vector3(1, 0, 0) },
          { distance: Math.abs(position.y - min.y), normal: new B.Vector3(0, -1, 0) },
          { distance: Math.abs(max.y - position.y), normal: new B.Vector3(0, 1, 0) },
          { distance: Math.abs(position.z - min.z), normal: new B.Vector3(0, 0, -1) },
          { distance: Math.abs(max.z - position.z), normal: new B.Vector3(0, 0, 1) },
        ];

        distanceToFaces.sort((a, b) => a.distance - b.distance);
        const normal = distanceToFaces[0]?.normal ?? position.subtract(center).normalize();
        return normal.normalize();
      };

      const intersectsExpandedBounds = (position: InstanceType<typeof B.Vector3>, mesh: InstanceType<typeof B.Mesh>) => {
        const bounds = mesh.getBoundingInfo().boundingBox;
        return (
          position.x >= bounds.minimumWorld.x - FIREBALL_RADIUS &&
          position.x <= bounds.maximumWorld.x + FIREBALL_RADIUS &&
          position.y >= bounds.minimumWorld.y - FIREBALL_RADIUS &&
          position.y <= bounds.maximumWorld.y + FIREBALL_RADIUS &&
          position.z >= bounds.minimumWorld.z - FIREBALL_RADIUS &&
          position.z <= bounds.maximumWorld.z + FIREBALL_RADIUS
        );
      };

      const requestPointerLock = () => {
        if (document.pointerLockElement !== canvas) {
          void canvas.requestPointerLock?.();
        }
      };

      const onMouseDown = (event: MouseEvent) => {
        if (event.button !== 0) {
          return;
        }
        requestPointerLock();
        spawnFireball();
      };

      canvas.addEventListener("click", requestPointerLock);
      canvas.addEventListener("mousedown", onMouseDown);

      const onResize = () => {
        engine.resize();
      };
      window.addEventListener("resize", onResize);

      engine.runRenderLoop(() => {
        const dt = engine.getDeltaTime() / 1000;
        if (!cleared) {
          player.position.copyFrom(camera.position);
          player.position.y = PLAYER_HEIGHT;
          player.position.x = B.Scalar.Clamp(player.position.x, -WORLD_LIMIT, WORLD_LIMIT);
          player.position.z = B.Scalar.Clamp(player.position.z, -WORLD_LIMIT, WORLD_LIMIT);
          camera.position.copyFrom(player.position);

          for (let index = activeFireballs.length - 1; index >= 0; index -= 1) {
            const fireball = activeFireballs[index];
            fireball.age += dt;
            fireball.velocity.y -= FIREBALL_GRAVITY * dt;
            const nextPosition = fireball.mesh.position.add(fireball.velocity.scale(dt));

            let bounced = false;
            for (const mesh of collidableMeshes) {
              if (!intersectsExpandedBounds(nextPosition, mesh)) {
                continue;
              }

              const normal = getBounceNormal(nextPosition, mesh);
              fireball.velocity = B.Vector3.Reflect(fireball.velocity, normal).scale(0.72);
              nextPosition.addInPlace(normal.scale(FIREBALL_RADIUS * 1.8));
              bounced = true;
              break;
            }

            fireball.mesh.position.copyFrom(nextPosition);
            fireball.glow.position.copyFrom(fireball.mesh.position);
            if (bounced) {
              fireball.glow.scaling.setAll(1.3);
            } else {
              fireball.glow.scaling.setAll(1);
            }

            if (
              fireball.age >= FIREBALL_LIFETIME ||
              fireball.mesh.position.y <= 0.3 ||
              Math.abs(fireball.mesh.position.x) > WORLD_LIMIT + 8 ||
              Math.abs(fireball.mesh.position.z) > WORLD_LIMIT + 8
            ) {
              explodeFireball(fireball.mesh.position.clone());
              disposeFireball(fireball);
              activeFireballs.splice(index, 1);
            }
          }

          for (let index = activeExplosions.length - 1; index >= 0; index -= 1) {
            const explosion = activeExplosions[index];
            explosion.age += dt;
            const progress = explosion.age / explosion.lifetime;
            explosion.mesh.scaling.setAll(1 + progress * 5);

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

          for (const house of houses) {
            if (house.destroyed) {
              house.collapseProgress += dt;

              house.body.position.y = Math.max(-4, house.bodyBasePosition.y - house.collapseProgress * 4.2);
              house.body.rotation.z = Math.min(Math.PI / 2.8, house.collapseProgress * 1.55);
              house.body.rotation.x = Math.sin(house.collapseProgress * 9 + house.center.x) * 0.08;

              house.roof.position.y = Math.max(-5, house.roofBasePosition.y - house.collapseProgress * 5.4);
              house.roof.position.x = house.roofBasePosition.x + house.collapseProgress * 1.2;
              house.roof.rotation.z = Math.min(Math.PI / 1.9, house.collapseProgress * 2.4);
              house.roof.rotation.x = house.collapseProgress * 0.8;

              if (house.collapseProgress >= 1.8) {
                house.body.setEnabled(false);
                house.roof.setEnabled(false);
              }
            }

            updateHouseVisuals(house, performance.now());
          }

          elapsed += dt;
          const whole = Math.floor(elapsed);
          if (whole !== lastSecond) {
            lastSecond = whole;
            setElapsedSeconds(whole);
          }

          for (const landmark of landmarkMeshes) {
            if (visitedMap.has(landmark.id)) {
              continue;
            }
            if (B.Vector3.Distance(player.position, landmark.mesh.position) <= CLEAR_RADIUS) {
              visitedMap.add(landmark.id);
              landmark.mat.diffuseColor = new B.Color3(0.24, 0.81, 0.52);
              landmark.mat.emissiveColor = new B.Color3(0.05, 0.2, 0.12);
              setVisitedCount(visitedMap.size);
              setMessage(`${landmark.label} 방문 완료 (${visitedMap.size}/${LANDMARKS.length})`);
            }
          }

          if (visitedMap.size === LANDMARKS.length) {
            cleared = true;
            const finalTime = Math.floor(elapsed);
            setIsCleared(true);
            setMessage(`탐험 완료! 기록 ${formatTime(finalTime)}`);
            const previous = bestTimeRef.current;
            if (previous === null || finalTime < previous) {
              setBestTime(finalTime);
            }
          }
        }

        scene.render();
      });

      cleanup = () => {
        for (const fireball of activeFireballs) {
          disposeFireball(fireball);
        }
        for (const explosion of activeExplosions) {
          explosion.mesh.material?.dispose();
          explosion.mesh.dispose();
        }
        canvas.removeEventListener("click", requestPointerLock);
        canvas.removeEventListener("mousedown", onMouseDown);
        window.removeEventListener("resize", onResize);
        engine.stopRenderLoop();
        scene.dispose();
        engine.dispose();
      };
    };

    void start();

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [runId]);

  const toggleFullscreen = async () => {
    const panel = panelRef.current;
    if (!panel) {
      return;
    }

    if (document.fullscreenElement === panel) {
      await document.exitFullscreen();
      return;
    }

    await panel.requestFullscreen();
  };

  return (
    <div ref={panelRef} className={`${styles.panel} ${isFullscreen ? styles.panelFullscreen : ""}`}>
      <header className={styles.stats}>
        <span>진행: {visitedCount}/{LANDMARKS.length}</span>
        <span>시간: {formatTime(elapsedSeconds)}</span>
        <span>상태: {isCleared ? "완료" : "진행 중"}</span>
        <span>최고기록: {bestTime === null ? "-" : formatTime(bestTime)}</span>
      </header>

      <div className={styles.canvasShell}>
        <div ref={mountRef} className={styles.canvasMount} />
        <div className={styles.crosshair} aria-hidden="true">
          <span />
          <span />
        </div>
      </div>

      <footer className={styles.footer}>
        <div className={styles.controls}>
          <button
            type="button"
            className={styles.control}
            onClick={() => {
              setRunId((prev) => prev + 1);
            }}
          >
            다시 시작
          </button>
          <button type="button" className={styles.controlSecondary} onClick={() => void toggleFullscreen()}>
            {isFullscreen ? "전체화면 종료" : "전체화면"}
          </button>
        </div>
        <p className={styles.help}>{message} 좌클릭으로 파이어볼을 발사할 수 있습니다.</p>
      </footer>
    </div>
  );
}
