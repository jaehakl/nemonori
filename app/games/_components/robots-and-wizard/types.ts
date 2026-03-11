import type { Mesh, Scene, StandardMaterial, TransformNode, UniversalCamera, Vector3 } from "@babylonjs/core";
import type { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";

export type BabylonModule = typeof import("@babylonjs/core");
export type PhysicsAggregateCtor = typeof import("@babylonjs/core/Physics/v2/physicsAggregate").PhysicsAggregate;
export type PhysicsShapeTypeModule = typeof import("@babylonjs/core/Physics/v2/IPhysicsEnginePlugin").PhysicsShapeType;
export type MeshRef = Mesh;
export type MaterialRef = StandardMaterial;
export type PhysicsAggregateRef = PhysicsAggregate;
export type SpellId = "fireball" | "chain-lightning";

export type CollisionCamera = UniversalCamera & {
  _collideWithWorld: (displacement: Vector3) => void;
};

export type MutableValueRef<T> = {
  current: T;
};

export type Landmark = {
  id: string;
  label: string;
  position: { x: number; z: number };
  color: readonly [number, number, number];
};

export type LandmarkMesh = Landmark & {
  mesh: MeshRef;
  mat: MaterialRef;
};

export type HouseState = {
  id: string;
  body: MeshRef;
  roof: MeshRef;
  bodyAggregate: PhysicsAggregateRef;
  roofAggregate: PhysicsAggregateRef;
  bodyMat: MaterialRef;
  roofMat: MaterialRef;
  fires: MeshRef[];
  health: number;
  destroyed: boolean;
  collapseProgress: number;
  center: Vector3;
  bodyBasePosition: Vector3;
  roofBasePosition: Vector3;
  fireBasePositions: Vector3[];
};

export type EnemyState = {
  id: string;
  root: MeshRef;
  torso: TransformNode;
  head: MeshRef;
  healthBarBack: MeshRef;
  healthBarFill: MeshRef;
  leftArm: TransformNode;
  rightArm: TransformNode;
  leftLeg: TransformNode;
  rightLeg: TransformNode;
  health: number;
  maxHealth: number;
  isDead: boolean;
  deathProgress: number;
  attackCooldown: number;
  walkPhase: number;
  hitShakeTime: number;
  hitShakeStrength: number;
};

export type FireballState = {
  mesh: MeshRef;
  glow: MeshRef;
  aggregate: PhysicsAggregateRef;
  age: number;
  exploded: boolean;
  explosionScale: number;
  projectileRadius: number;
  explosionRadius: number;
};

export type TimedMeshState = {
  mesh: MeshRef;
  age: number;
  lifetime: number;
  scaleMultiplier?: number;
};

export type CreateStaticAggregate = (
  mesh: MeshRef,
  type: number,
  options?: { restitution?: number; friction?: number },
) => PhysicsAggregateRef;

export type SceneCallbacks = {
  setVisitedCount: (count: number) => void;
  setElapsedSeconds: (seconds: number) => void;
  setIsCleared: (value: boolean) => void;
  setPlayerHealth: (health: number) => void;
  setFireballChargeLevel: (value: number) => void;
  setMessage: (message: string) => void;
  setBestTime: (time: number) => void;
  setSelectedSpell: (spell: SpellId) => void;
};

export type CreateSceneOptions = {
  mountElement: HTMLDivElement;
  canvasClassName: string;
  bestTimeRef: MutableValueRef<number | null>;
  selectedSpellRef: MutableValueRef<SpellId>;
  callbacks: SceneCallbacks;
};

export type SceneContext = {
  B: BabylonModule;
  scene: Scene;
  camera: UniversalCamera;
};
