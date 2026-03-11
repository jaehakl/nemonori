import { EXPLOSION_DAMAGE, EXPLOSION_RADIUS, HOUSE_MAX_HEALTH } from "./constants";
import type {
  BabylonModule,
  CreateStaticAggregate,
  HouseState,
  MaterialRef,
  PhysicsShapeTypeModule,
} from "./types";

type CreateHouseSystemOptions = {
  B: BabylonModule;
  scene: import("@babylonjs/core").Scene;
  createStaticAggregate: CreateStaticAggregate;
  releaseStaticAggregate: (aggregate: HouseState["bodyAggregate"]) => void;
  PhysicsShapeType: PhysicsShapeTypeModule;
};

export function createHouseSystem({
  B,
  scene,
  createStaticAggregate,
  releaseStaticAggregate,
  PhysicsShapeType,
}: CreateHouseSystemOptions) {
  const houses: HouseState[] = [];
  const baseBodyColor = new B.Color3(0.96, 0.9, 0.78);
  const damagedBodyColor = new B.Color3(0.28, 0.24, 0.22);
  const baseRoofColor = new B.Color3(0.7, 0.2, 0.17);
  const damagedRoofColor = new B.Color3(0.16, 0.08, 0.08);

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

    houses.push({
      id: name,
      body,
      bodyAggregate: createStaticAggregate(body, PhysicsShapeType.BOX, { friction: 0.95 }),
      roof,
      roofAggregate: createStaticAggregate(roof, PhysicsShapeType.BOX, { restitution: 0.05, friction: 0.85 }),
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
    });
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

    createStaticAggregate(trunk, PhysicsShapeType.CYLINDER, { friction: 0.95 });
    createStaticAggregate(crown, PhysicsShapeType.SPHERE, { restitution: 0.1, friction: 0.8 });
  };

  const createVillageStructures = () => {
    createHouse("house-a", -34, -26);
    createHouse("house-b", 34, -26);
    createHouse("house-c", -34, 24);
    createHouse("house-d", 34, 24);
    createHouse("house-e", 8, 2);

    for (let i = -2; i <= 2; i += 1) {
      createTree(`tree-n-${i}`, -50 + i * 10, -40);
      createTree(`tree-s-${i}`, 50 - i * 10, 40);
    }
  };

  const damageHousesAt = (position: import("@babylonjs/core").Vector3, radiusScale = 1) => {
    let damagedHouseCount = 0;
    const explosionRadius = EXPLOSION_RADIUS * radiusScale;

    for (const house of houses) {
      if (house.destroyed) {
        continue;
      }

      const distance = B.Vector3.Distance(position, house.center);
      if (distance > explosionRadius) {
        continue;
      }

      const damageRatio = 1 - distance / explosionRadius;
      const damageAmount = Math.max(8, EXPLOSION_DAMAGE * damageRatio);
      house.health = Math.max(0, house.health - damageAmount);
      damagedHouseCount += 1;

      if (house.health <= 0) {
        house.destroyed = true;
        house.collapseProgress = 0;
        releaseStaticAggregate(house.bodyAggregate);
        releaseStaticAggregate(house.roofAggregate);
        house.body.checkCollisions = false;
        house.roof.checkCollisions = false;
      }
    }

    return damagedHouseCount;
  };

  const update = (dt: number) => {
    const now = performance.now();

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

      updateHouseVisuals(house, now);
    }
  };

  return {
    houses,
    createVillageStructures,
    damageHousesAt,
    update,
  };
}
