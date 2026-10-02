import * as THREE from "three";
import {
  batchStaticScenery,
  createBoardEnvironment,
} from "./board-environment";
import { createBattleStage, type LoadPokemonTexture } from "./battle-stage";
import { createBoardEffects, type EffectCue } from "./board-effects";
import type { BattleView, PresentationEvent } from "./presentation-events";

export type BoardToken = {
  id: number;
  name: string;
  color: string;
  position: number;
  eliminated: boolean;
};

export type BoardGuardian = {
  tile: number;
  ownerId: number;
  speciesId: number;
};

export type BoardSnapshot = {
  tokens: BoardToken[];
  guardians: BoardGuardian[];
  activePlayerId: number;
  dice: [number, number] | null;
  rolling: boolean;
  battle?: BattleView | null;
  presentation?: { event: PresentationEvent; progress: number } | null;
  paused?: boolean;
  reducedMotion?: boolean;
};

export const TILE_NAMES = Array.from(
  { length: 32 },
  (_, index) =>
    ["포켓몬센터", "풀숲", "도로", "풀숲", "도로", "풀숲", "도로", "도로"][
      index % 8
    ],
);

const TILE_SPACING = 1.08;

/** The perimeter starts at the near-left corner and runs clockwise. */
function tilePosition(
  index: number,
  target = new THREE.Vector3(),
): THREE.Vector3 {
  const step = ((index % 32) + 32) % 32;
  const offset = step % 8;
  const side = Math.floor(step / 8);
  const x =
    side === 0 ? -4 : side === 1 ? -4 + offset : side === 2 ? 4 : 4 - offset;
  const z =
    side === 0 ? 4 - offset : side === 1 ? -4 : side === 2 ? -4 + offset : 4;
  return target.set(x * TILE_SPACING, 0.27, z * TILE_SPACING);
}

type Pawn = {
  group: THREE.Group;
  body: THREE.MeshStandardMaterial;
  halo: THREE.Mesh;
  position: number;
  from: THREE.Vector3;
  to: THREE.Vector3;
  startedAt: number;
  duration: number;
  route: number[];
};

export type BoardRenderer = {
  sync: (snapshot: BoardSnapshot) => void;
  selectTile: (tile: number | null) => void;
  dispose: () => void;
};

/** Owns every GPU resource and listener; React only sends game snapshots. */
export function createBoardRenderer(
  host: HTMLDivElement,
  onSelect: (tile: number) => void,
  onFailure: () => void,
): BoardRenderer {
  let release: (() => void) | undefined;
  try {
    return initializeBoardRenderer(host, onSelect, onFailure, (dispose) => {
      release = dispose;
    });
  } catch (error) {
    // A failed initialization must also relinquish its partially built WebGL scene.
    release?.();
    throw error;
  }
}

function initializeBoardRenderer(
  host: HTMLDivElement,
  onSelect: (tile: number) => void,
  onFailure: () => void,
  registerCleanup: (dispose: () => void) => void,
): BoardRenderer {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "low-power",
  });
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#c7e9e8");
  const boardRoot = new THREE.Group();
  boardRoot.name = "adventure-board";
  scene.add(boardRoot);
  const camera = new THREE.OrthographicCamera(-8, 8, 8, -8, 0.1, 80);
  camera.position.set(12, 16, 16);
  camera.lookAt(0, 0.2, 0);
  camera.updateMatrixWorld();
  const battleCamera = new THREE.OrthographicCamera(-6, 6, 5, -5, 0.1, 80);
  battleCamera.position.set(0, 7, 13);
  battleCamera.lookAt(0, 0.6, 0);
  battleCamera.updateMatrixWorld();

  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const pawns = new Map<number, Pawn>();
  const guardians = new Map<number, { key: string; group: THREE.Group }>();
  const tileMeshes: THREE.Mesh[] = [];
  const ownerPlates: THREE.Mesh<
    THREE.BoxGeometry,
    THREE.MeshStandardMaterial
  >[] = [];
  const dice: THREE.Mesh[] = [];
  const diceTargets = [new THREE.Quaternion(), new THREE.Quaternion()];
  let snapshot: BoardSnapshot = {
    tokens: [],
    guardians: [],
    activePlayerId: 0,
    dice: null,
    rolling: false,
  };
  let resizeObserver: ResizeObserver | null = null;
  let sunlight: THREE.DirectionalLight | null = null;
  let disposed = false;
  let frame = 0;
  let lastTime = 0;
  let selectedTile: number | null = null;
  // Ownership is recorded as construction progresses, including partial failures.
  const resources: {
    environment?: ReturnType<typeof createBoardEnvironment>;
    effects?: ReturnType<typeof createBoardEffects>;
    battleStage?: ReturnType<typeof createBattleStage>;
    disposeBatches?: () => void;
  } = {};
  let activeCamera = camera;
  let animationTime = 0;
  let dirty = true;
  let lowQuality = false;
  let slowFrames = 0;
  let qualitySamples = 0;
  let lastMetricsUpdate = 0;
  let renderCount = 0;
  let effectCue: EffectCue | null = null;
  const effectOrigin = new THREE.Vector3();
  const effectTarget = new THREE.Vector3();
  const moveFrom = new THREE.Vector3();
  const moveTo = new THREE.Vector3();
  const moveOffset = new THREE.Vector3();
  const textureCache = new Map<
    number,
    {
      texture: THREE.Texture;
      state: "loading" | "ready" | "failed";
      listeners: Set<{ ready: () => void; failed: () => void }>;
    }
  >();

  registerCleanup(dispose);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  renderer.toneMapping = THREE.NeutralToneMapping;
  if (process.env.NODE_ENV !== "production") renderer.info.autoReset = false;
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.setAttribute("aria-hidden", "true");
  host.appendChild(renderer.domElement);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const motionReduced = () => snapshot.reducedMotion ?? reducedMotion.matches;

  function releaseTexture(texture: THREE.Texture) {
    if (textures.delete(texture)) texture.dispose();
  }

  // Only active users retain a sprite: at most 32 guardians and two battlers.
  const loadPokemonTexture: LoadPokemonTexture = (speciesId, ready, failed) => {
    let entry = textureCache.get(speciesId);
    if (!entry) {
      const listeners = new Set<{ ready: () => void; failed: () => void }>();
      const texture = new THREE.TextureLoader().load(
        `/pokemon-marble/sprites/${speciesId}.png`,
        (loaded) => {
          const current = textureCache.get(speciesId);
          if (disposed || !current || current.texture !== loaded) {
            releaseTexture(loaded);
            return;
          }
          measureSpriteBounds(loaded);
          current.state = "ready";
          current.listeners.forEach((listener) => listener.ready());
          dirty = true;
          if (!frame && !document.hidden)
            frame = requestAnimationFrame(animate);
        },
        undefined,
        () => {
          releaseTexture(texture);
          const current = textureCache.get(speciesId);
          if (!disposed && current?.texture === texture) {
            current.state = "failed";
            current.listeners.forEach((listener) => listener.failed());
            dirty = true;
            if (!frame && !document.hidden)
              frame = requestAnimationFrame(animate);
          }
        },
      );
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.magFilter = THREE.NearestFilter;
      texture.generateMipmaps = false;
      texture.minFilter = THREE.LinearFilter;
      textures.add(texture);
      entry = { texture, state: "loading", listeners };
      textureCache.set(speciesId, entry);
    }
    const listener = { ready, failed };
    entry.listeners.add(listener);
    if (entry.state === "ready") ready();
    if (entry.state === "failed") failed();
    const retained = entry;
    return {
      texture: retained.state === "failed" ? null : retained.texture,
      release() {
        if (!retained.listeners.delete(listener)) return;
        if (!retained.listeners.size) {
          releaseTexture(retained.texture);
          if (textureCache.get(speciesId) === retained)
            textureCache.delete(speciesId);
        }
      },
    };
  };

  function measureSpriteBounds(texture: THREE.Texture) {
    const image = texture.image as HTMLImageElement | undefined;
    if (!image?.width || !image.height) return;
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;
    try {
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, image.width, image.height).data;
      let left = image.width,
        top = image.height,
        right = -1,
        bottom = -1;
      for (let y = 0; y < image.height; y += 1) {
        for (let x = 0; x < image.width; x += 1) {
          if (pixels[(y * image.width + x) * 4 + 3] < 24) continue;
          left = Math.min(left, x);
          right = Math.max(right, x);
          top = Math.min(top, y);
          bottom = Math.max(bottom, y);
        }
      }
      if (bottom >= top)
        texture.userData.spriteBounds = {
          centerX: (left + right + 1) / (2 * image.width),
          bottom: (image.height - bottom - 1) / image.height,
          height: (bottom - top + 1) / image.height,
          width: (right - left + 1) / image.width,
        };
    } catch {
      // A missing pixel buffer should never prevent a successfully loaded sprite.
    }
  }

  function geometry<T extends THREE.BufferGeometry>(value: T): T {
    geometries.add(value);
    return value;
  }

  function material<T extends THREE.Material>(value: T): T {
    materials.add(value);
    return value;
  }

  function paint(
    color: THREE.ColorRepresentation,
    options: THREE.MeshStandardMaterialParameters = {},
  ) {
    return material(
      new THREE.MeshStandardMaterial({ color, roughness: 0.65, ...options }),
    );
  }

  function box(
    parent: THREE.Object3D,
    dimensions: [number, number, number],
    position: [number, number, number],
    color: THREE.ColorRepresentation,
  ) {
    const mesh = new THREE.Mesh(
      geometry(new THREE.BoxGeometry(...dimensions)),
      paint(color),
    );
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  function canvasTexture(
    width: number,
    height: number,
    draw: (context: CanvasRenderingContext2D) => void,
  ) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (context) draw(context);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    textures.add(texture);
    return texture;
  }

  function label(
    parent: THREE.Object3D,
    text: string,
    color: string,
    width: number,
    height: number,
    position: [number, number, number],
  ) {
    const textureWidth = Math.max(128, Math.round((width / height) * 128));
    const texture = canvasTexture(textureWidth, 128, (context) => {
      context.fillStyle = color;
      context.font = "800 112px system-ui, sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(text, textureWidth / 2, 68, textureWidth - 12);
    });
    const sprite = new THREE.Sprite(
      material(new THREE.SpriteMaterial({ map: texture, depthWrite: false })),
    );
    sprite.scale.set(width, height, 1);
    sprite.center.set(0.5, 0);
    sprite.position.set(...position);
    parent.add(sprite);
    return sprite;
  }

  function tree(parent: THREE.Object3D, x: number, z: number, scale = 1) {
    const group = new THREE.Group();
    group.position.set(x, 0.2, z);
    group.scale.setScalar(scale);
    box(group, [0.13, 0.5, 0.13], [0, 0.25, 0], "#ac8061");
    const crown = new THREE.Mesh(
      geometry(new THREE.IcosahedronGeometry(0.46, 1)),
      paint("#4b9a77"),
    );
    crown.position.y = 0.68;
    crown.scale.set(1, 1.12, 1);
    crown.castShadow = true;
    group.add(crown);
    parent.add(group);
  }

  scene.add(new THREE.HemisphereLight("#fff9e8", "#698b77", 2.5));
  sunlight = new THREE.DirectionalLight("#fff4da", 3.1);
  sunlight.position.set(-6, 15, 8);
  sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(512, 512);
  sunlight.shadow.camera.left = -9;
  sunlight.shadow.camera.right = 9;
  sunlight.shadow.camera.top = 9;
  sunlight.shadow.camera.bottom = -9;
  sunlight.shadow.normalBias = 0.035;
  sunlight.shadow.bias = -0.0002;
  scene.add(sunlight);

  // Layered edges make the board read as a small, tangible island.
  box(boardRoot, [10.25, 0.48, 10.25], [0, -0.47, 0], "#478b7a");
  box(boardRoot, [10.45, 0.14, 10.45], [0, -0.19, 0], "#ffe7a4");
  box(boardRoot, [10.15, 0.18, 10.15], [0, -0.04, 0], "#97ca91");
  box(boardRoot, [7.25, 0.08, 7.25], [0, 0.09, 0], "#b4da98");

  const water = new THREE.Mesh(
    geometry(new THREE.CylinderGeometry(1.12, 1.12, 0.025, 48)),
    paint("#83c8cd", { roughness: 0.25 }),
  );
  water.position.set(1.63, 0.16, -1.87);
  water.scale.z = 0.65;
  boardRoot.add(water);
  const pondBorder = new THREE.Mesh(
    geometry(new THREE.TorusGeometry(1.17, 0.065, 6, 48)),
    paint("#dbdfb5"),
  );
  pondBorder.rotation.x = -Math.PI / 2;
  pondBorder.position.copy(water.position);
  pondBorder.scale.y = 0.65;
  boardRoot.add(pondBorder);
  tree(boardRoot, -2.55, -2.3, 1.25);
  tree(boardRoot, -1.63, -2.67, 0.9);
  tree(boardRoot, 2.57, 2.37, 1.15);
  tree(boardRoot, 1.63, 2.65, 0.8);
  tree(boardRoot, -2.58, 1.8, 0.72);
  box(boardRoot, [0.82, 0.13, 0.28], [-2.32, 0.29, -0.58], "#b69365");
  box(boardRoot, [0.12, 0.22, 0.26], [-2.59, 0.18, -0.58], "#64786a");
  box(boardRoot, [0.12, 0.22, 0.26], [-2.05, 0.18, -0.58], "#64786a");

  const emblem = new THREE.Mesh(
    geometry(new THREE.CylinderGeometry(1.75, 1.75, 0.035, 64)),
    paint("#d9e7be"),
  );
  emblem.position.set(0, 0.17, 0.1);
  boardRoot.add(emblem);
  const innerRing = new THREE.Mesh(
    geometry(new THREE.TorusGeometry(1.55, 0.016, 4, 64)),
    paint("#92b591"),
  );
  innerRing.rotation.x = -Math.PI / 2;
  innerRing.position.set(0, 0.2, 0.1);
  boardRoot.add(innerRing);
  label(boardRoot, "POKÉMON", "#356e59", 2.25, 0.37, [0, 0.24, -1.32]);
  label(boardRoot, "MARBLE", "#6d8c63", 1.54, 0.24, [0, 0.24, 1.4]);

  for (let index = 0; index < 32; index += 1) {
    const type = TILE_NAMES[index];
    const position = tilePosition(index);
    const tile = box(
      boardRoot,
      [0.995, 0.2, 0.995],
      [position.x, 0.15, position.z],
      type === "포켓몬센터"
        ? "#fff1e1"
        : type === "풀숲"
          ? "#79b484"
          : "#e5dfce",
    );
    tile.userData.tile = index;
    tileMeshes.push(tile);

    const plate = box(
      boardRoot,
      [0.76, 0.035, 0.1],
      [position.x, 0.267, position.z + 0.38],
      "#a99c84",
    );
    plate.visible = type === "도로";
    ownerPlates.push(plate);
    label(
      boardRoot,
      String(index + 1).padStart(2, "0"),
      type === "풀숲" ? "#244f3f" : "#657163",
      0.4,
      0.23,
      [position.x + 0.28, 0.34, position.z + 0.33],
    );

    if (type === "포켓몬센터") {
      const center = new THREE.Group();
      center.position.set(position.x - 0.09, 0.255, position.z - 0.09);
      box(center, [0.57, 0.41, 0.48], [0, 0.205, 0], "#fffcf2");
      box(center, [0.67, 0.13, 0.58], [0, 0.455, 0], "#e86e67");
      box(center, [0.49, 0.08, 0.42], [0, 0.55, 0], "#ef8c80");
      box(center, [0.15, 0.24, 0.025], [0, 0.13, 0.249], "#85c9d0");
      box(center, [0.21, 0.055, 0.014], [0, 0.354, 0.251], "#e66a61");
      box(center, [0.06, 0.18, 0.016], [0, 0.354, 0.253], "#e66a61");
      boardRoot.add(center);
    } else if (type === "풀숲") {
      const grass = new THREE.Group();
      grass.position.set(position.x, 0.25, position.z);
      for (let blade = 0; blade < 5; blade += 1) {
        const stalk = new THREE.Mesh(
          geometry(new THREE.ConeGeometry(0.065, 0.24 + (blade % 2) * 0.08, 4)),
          paint(blade % 2 ? "#d2e9a1" : "#b6d98d"),
        );
        stalk.position.set(
          -0.29 + (blade % 3) * 0.23,
          0.1,
          -0.18 + Math.floor(blade / 3) * 0.26,
        );
        stalk.rotation.z = (blade % 2 ? -1 : 1) * 0.12;
        grass.add(stalk);
      }
      boardRoot.add(grass);
    } else {
      box(
        boardRoot,
        [0.12, 0.015, 0.3],
        [position.x, 0.257, position.z - 0.08],
        "#fffaf0",
      );
    }
  }

  const selection = new THREE.Mesh(
    geometry(new THREE.RingGeometry(0.44, 0.5, 4)),
    material(
      new THREE.MeshBasicMaterial({
        color: "#fff1a3",
        side: THREE.DoubleSide,
        depthWrite: false,
        transparent: true,
      }),
    ),
  );
  selection.rotation.x = -Math.PI / 2;
  selection.rotation.z = Math.PI / 4;
  selection.visible = false;
  boardRoot.add(selection);
  resources.disposeBatches = batchStaticScenery(
    boardRoot,
    new Set([...ownerPlates, selection]),
  );
  resources.environment = createBoardEnvironment();
  boardRoot.add(resources.environment.root);
  resources.battleStage = createBattleStage(loadPokemonTexture);
  scene.add(resources.battleStage.root);
  resources.effects = createBoardEffects();
  scene.add(resources.effects.root);

  function diceFace(value: number) {
    const texture = canvasTexture(128, 128, (context) => {
      context.fillStyle = "#fff9ec";
      context.fillRect(0, 0, 128, 128);
      context.strokeStyle = "#e9dec8";
      context.lineWidth = 6;
      context.strokeRect(0, 0, 128, 128);
      const locations: [number, number][] = [];
      if (value % 2) locations.push([64, 64]);
      if (value >= 2) locations.push([34, 34], [94, 94]);
      if (value >= 4) locations.push([94, 34], [34, 94]);
      if (value === 6) locations.push([34, 64], [94, 64]);
      context.fillStyle = value === 1 ? "#e16a5c" : "#335e52";
      for (const [x, y] of locations) {
        context.beginPath();
        context.arc(x, y, 9, 0, Math.PI * 2);
        context.fill();
      }
    });
    return material(
      new THREE.MeshStandardMaterial({ map: texture, roughness: 0.65 }),
    );
  }

  for (let index = 0; index < 2; index += 1) {
    const die = new THREE.Mesh(
      geometry(new THREE.BoxGeometry(0.65, 0.65, 0.65)),
      [3, 4, 1, 6, 2, 5].map(diceFace),
    );
    die.position.set(index ? 0.56 : -0.56, 0.57, 0.05);
    die.castShadow = true;
    boardRoot.add(die);
    dice.push(die);
  }

  function setDiceTarget(index: number, value: number) {
    const angles: Record<number, [number, number, number]> = {
      1: [0, 0, 0],
      2: [-Math.PI / 2, 0, 0],
      3: [0, 0, Math.PI / 2],
      4: [0, 0, -Math.PI / 2],
      5: [Math.PI / 2, 0, 0],
      6: [Math.PI, 0, 0],
    };
    diceTargets[index].setFromEuler(
      new THREE.Euler(...(angles[value] ?? angles[1])),
    );
  }

  function pawnOffset(tokenId: number, target = new THREE.Vector3()) {
    const index = Math.max(
      0,
      snapshot.tokens.findIndex((token) => token.id === tokenId),
    );
    return target.set(
      (index % 2 ? 1 : -1) * 0.19,
      0,
      (index < 2 ? -1 : 1) * 0.18,
    );
  }

  function makePawn(token: BoardToken) {
    const group = new THREE.Group();
    const body = paint(token.color);
    const base = new THREE.Mesh(
      geometry(new THREE.CylinderGeometry(0.16, 0.2, 0.15, 20)),
      body,
    );
    base.position.y = 0.08;
    base.castShadow = true;
    group.add(base);
    const torso = new THREE.Mesh(
      geometry(new THREE.ConeGeometry(0.15, 0.31, 20)),
      body,
    );
    torso.position.y = 0.25;
    torso.castShadow = true;
    group.add(torso);
    const head = new THREE.Mesh(
      geometry(new THREE.SphereGeometry(0.13, 16, 12)),
      body,
    );
    head.position.y = 0.46;
    head.castShadow = true;
    group.add(head);
    const halo = new THREE.Mesh(
      geometry(new THREE.TorusGeometry(0.22, 0.03, 8, 32)),
      material(new THREE.MeshBasicMaterial({ color: "#fff7cb" })),
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.04;
    group.add(halo);
    const playerIndex = snapshot.tokens.findIndex(
      (player) => player.id === token.id,
    );
    label(group, `P${playerIndex + 1}`, "#284b42", 0.42, 0.24, [0, 0.62, 0]);
    group.position.copy(tilePosition(token.position)).add(pawnOffset(token.id));
    boardRoot.add(group);
    const pawn: Pawn = {
      group,
      body,
      halo,
      position: token.position,
      from: group.position.clone(),
      to: group.position.clone(),
      startedAt: 0,
      duration: 0,
      route: [],
    };
    pawns.set(token.id, pawn);
    return pawn;
  }

  function disposeObject(root: THREE.Object3D) {
    root.traverse((object) => {
      const releaseSprite = object.userData.releaseSprite as
        (() => void) | undefined;
      releaseSprite?.();
      if (!(object instanceof THREE.Mesh || object instanceof THREE.Sprite))
        return;
      if (object instanceof THREE.Mesh && geometries.delete(object.geometry)) {
        object.geometry.dispose();
      }
      const list = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const item of list) {
        if (
          !releaseSprite &&
          "map" in item &&
          item.map instanceof THREE.Texture
        ) {
          releaseTexture(item.map);
        }
        if (materials.delete(item)) item.dispose();
      }
    });
    root.removeFromParent();
  }

  function makeGuardian(guardian: BoardGuardian) {
    const group = new THREE.Group();
    const owner = snapshot.tokens.find(
      (token) => token.id === guardian.ownerId,
    );
    const position = tilePosition(guardian.tile);
    group.position.set(position.x + 0.12, position.y, position.z - 0.15);
    const stand = new THREE.Mesh(
      geometry(new THREE.CylinderGeometry(0.22, 0.25, 0.06, 24)),
      paint(owner?.color ?? "#698773"),
    );
    stand.position.y = 0.02;
    group.add(stand);
    boardRoot.add(group);
    const spriteMaterial = material(
      new THREE.SpriteMaterial({ transparent: true, depthWrite: false }),
    );
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(0.83, 0.83, 1);
    sprite.position.y = 0.46;
    sprite.visible = false;
    group.add(sprite);
    const lease = loadPokemonTexture(
      guardian.speciesId,
      () => {
        if (disposed || !group.parent) return;
        spriteMaterial.needsUpdate = true;
        sprite.visible = true;
      },
      () => {
        if (!disposed && group.parent) {
          spriteMaterial.map = null;
          label(
            group,
            `#${guardian.speciesId}`,
            "#294b41",
            0.6,
            0.2,
            [0, 0.35, 0],
          );
        }
      },
    );
    // Assign ownership immediately, including while loading, so removal can release it.
    spriteMaterial.map = lease.texture;
    sprite.userData.releaseSprite = lease.release;
    return group;
  }

  function sync(next: BoardSnapshot) {
    if (disposed) return;
    snapshot = next;
    dirty = true;
    if (!frame && !document.hidden) frame = requestAnimationFrame(animate);
    renderer.shadowMap.needsUpdate = true;
    const now = animationTime;
    for (const token of next.tokens) {
      const pawn = pawns.get(token.id) ?? makePawn(token);
      pawn.group.visible = !token.eliminated;
      pawn.body.color.set(token.color);
      pawn.halo.visible = token.id === next.activePlayerId && !token.eliminated;
      if (token.position !== pawn.position) {
        const distance = (token.position - pawn.position + 32) % 32;
        pawn.route = Array.from(
          { length: distance },
          (_, step) => (pawn.position + step + 1) % 32,
        );
        pawn.position = token.position;
        pawn.from.copy(pawn.group.position);
        pawn.duration = motionReduced()
          ? 0
          : Math.min(230, 1100 / Math.max(1, distance));
        pawn.startedAt = now;
        const first = pawn.route.shift();
        if (first !== undefined)
          pawn.to.copy(tilePosition(first)).add(pawnOffset(token.id));
        if (motionReduced()) {
          pawn.group.position
            .copy(tilePosition(token.position))
            .add(pawnOffset(token.id));
          pawn.route = [];
          pawn.to.copy(pawn.group.position);
        }
      }
      if (motionReduced()) {
        pawn.group.position
          .copy(tilePosition(token.position))
          .add(pawnOffset(token.id));
        pawn.to.copy(pawn.group.position);
        pawn.route.length = 0;
        pawn.duration = 0;
        pawn.halo.scale.setScalar(1);
      }
    }
    for (const [id, pawn] of pawns) {
      if (!next.tokens.some((token) => token.id === id)) {
        disposeObject(pawn.group);
        pawns.delete(id);
      }
    }
    for (const [tile, guardian] of guardians) {
      if (
        !next.guardians.some(
          (nextGuardian) =>
            nextGuardian.tile === tile &&
            `${nextGuardian.ownerId}:${nextGuardian.speciesId}` ===
              guardian.key,
        )
      ) {
        disposeObject(guardian.group);
        guardians.delete(tile);
      }
    }
    for (let tile = 0; tile < ownerPlates.length; tile += 1)
      ownerPlates[tile].material.color.set("#a99c84");
    for (const guardian of next.guardians) {
      if (!guardians.has(guardian.tile))
        guardians.set(guardian.tile, {
          key: `${guardian.ownerId}:${guardian.speciesId}`,
          group: makeGuardian(guardian),
        });
      const owner = next.tokens.find((token) => token.id === guardian.ownerId);
      ownerPlates[guardian.tile]?.material.color.set(owner?.color ?? "#a99c84");
    }
    for (let index = 0; index < 2; index += 1)
      setDiceTarget(index, next.dice?.[index] ?? 1);
    const event = next.presentation?.event;
    effectCue = event
      ? {
          id: `${event.revision}:${event.sequence}`,
          kind: event.kind,
          typeId: event.attack?.moveType,
          origin: effectOrigin,
          target: effectTarget,
        }
      : null;
  }

  function selectTile(tile: number | null) {
    if (disposed) return;
    selectedTile = tile;
    dirty = true;
    selection.visible = tile !== null;
    if (tile !== null) {
      selection.position.copy(tilePosition(tile));
      selection.position.y = 0.285;
    }
  }

  function resize() {
    if (disposed) return;
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);
    const aspect = width / height;
    const halfHeight = Math.max(6.7, 7.7 / aspect);
    camera.left = -halfHeight * aspect;
    camera.right = halfHeight * aspect;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.updateProjectionMatrix();
    const battleHalfHeight = Math.max(4.3, 5.8 / aspect);
    battleCamera.left = -battleHalfHeight * aspect;
    battleCamera.right = battleHalfHeight * aspect;
    battleCamera.top = battleHalfHeight;
    battleCamera.bottom = -battleHalfHeight;
    battleCamera.updateProjectionMatrix();
    renderer.setPixelRatio(
      Math.min(
        lowQuality ? 0.8 : 1,
        Math.sqrt((lowQuality ? 500_000 : 800_000) / (width * height)),
      ),
    );
    renderer.setSize(width, height);
    dirty = true;
  }
  resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  resize();

  const raycaster = new THREE.Raycaster();
  function handleClick(event: MouseEvent) {
    if (snapshot.paused || !boardRoot.visible) return;
    const bounds = renderer.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, activeCamera);
    const hit = raycaster.intersectObjects(tileMeshes, false)[0];
    if (hit) onSelect(hit.object.userData.tile as number);
  }
  function handleContextLost(event: Event) {
    event.preventDefault();
    dispose();
    onFailure();
  }
  renderer.domElement.addEventListener("click", handleClick);
  renderer.domElement.addEventListener("webglcontextlost", handleContextLost);

  function handleVisibility() {
    lastTime = 0;
    dirty = true;
    if (!document.hidden && !frame && !disposed)
      frame = requestAnimationFrame(animate);
  }
  document.addEventListener("visibilitychange", handleVisibility);

  function animate(now: number) {
    if (disposed) return;
    frame = 0;
    if (document.hidden) return;
    frame = requestAnimationFrame(animate);
    if (lastTime && now - lastTime < 1000 / 30 - 0.7) return;
    const interval = lastTime ? now - lastTime : 1000 / 30;
    const elapsed = Math.min(0.07, interval / 1000);
    lastTime = now;
    const reduced = motionReduced();
    if (snapshot.paused && !dirty) return;
    if (!snapshot.paused) animationTime += elapsed * 1000;
    const time = animationTime;
    const presentation = snapshot.presentation;
    const event = presentation?.event ?? null;
    const eventProgress = presentation?.progress ?? 0;
    const battleStage = resources.battleStage;
    battleStage?.update(
      snapshot.battle ?? null,
      event,
      eventProgress,
      reduced,
      time,
    );
    const battleVisible = Boolean(battleStage?.root.visible);
    if (boardRoot.visible === battleVisible)
      renderer.shadowMap.needsUpdate = true;
    boardRoot.visible = !battleVisible;
    activeCamera = battleVisible ? battleCamera : camera;
    battleCamera.position.set(0, 7, 13);
    if (
      battleVisible &&
      event?.kind === "attack" &&
      !reduced &&
      eventProgress >= 0.45 &&
      eventProgress <= 0.65
    ) {
      const kick = Math.sin(((eventProgress - 0.45) / 0.2) * Math.PI) * 0.055;
      battleCamera.position.x =
        kick * (event.attack?.side === "defender" ? -1 : 1);
      battleCamera.position.y -= kick * 0.4;
    }
    if (!snapshot.paused && !battleVisible)
      resources.environment?.update(time, reduced, lowQuality);
    for (const [id, pawn] of pawns) {
      if (snapshot.paused || battleVisible) continue;
      if (
        event?.kind === "move" &&
        event.playerId === id &&
        event.fromTile !== undefined
      ) {
        pawnOffset(id, moveOffset);
        tilePosition(event.fromTile, moveFrom).add(moveOffset);
        tilePosition(event.tile, moveTo).add(moveOffset);
        const progress = reduced ? 1 : eventProgress;
        const eased = progress * progress * (3 - 2 * progress);
        pawn.group.position.lerpVectors(moveFrom, moveTo, eased);
        pawn.group.position.y += reduced
          ? 0
          : Math.sin(progress * Math.PI) * 0.35;
        pawn.to.copy(moveTo);
        pawn.route.length = 0;
        pawn.duration = 0;
        renderer.shadowMap.needsUpdate = true;
        continue;
      }
      const progress = pawn.duration
        ? Math.min(1, (time - pawn.startedAt) / pawn.duration)
        : 1;
      if (progress < 1) {
        const eased = progress * progress * (3 - 2 * progress);
        pawn.group.position.lerpVectors(pawn.from, pawn.to, eased);
        pawn.group.position.y += Math.sin(progress * Math.PI) * 0.22;
        renderer.shadowMap.needsUpdate = true;
      } else {
        pawn.group.position.copy(pawn.to);
        const next = pawn.route.shift();
        if (next !== undefined) {
          pawn.from.copy(pawn.to);
          pawn.to.copy(tilePosition(next)).add(pawnOffset(id));
          pawn.startedAt = time;
        }
      }
      if (!reduced && pawn.halo.visible)
        pawn.halo.scale.setScalar(1 + Math.sin(time / 350) * 0.09);
    }
    for (let index = 0; index < 2; index += 1) {
      const die = dice[index];
      if (snapshot.paused || battleVisible) continue;
      if (snapshot.rolling && !reduced) {
        die.rotation.x += elapsed * (7 + index);
        die.rotation.z += elapsed * (9 - index);
        die.position.y = 0.88 + Math.abs(Math.sin(time / 160 + index)) * 0.35;
        renderer.shadowMap.needsUpdate = true;
      } else {
        die.quaternion.slerp(
          diceTargets[index],
          reduced ? 1 : Math.min(1, elapsed * 15),
        );
        die.position.y +=
          (0.57 - die.position.y) * (reduced ? 1 : Math.min(1, elapsed * 14));
      }
    }
    if (selectedTile !== null && !reduced && !snapshot.paused)
      selection.material.opacity = 0.8 + Math.sin(time / 250) * 0.2;
    if (effectCue && event) {
      if (battleVisible && battleStage) {
        const side =
          event.attack?.side ??
          event.side ??
          (snapshot.battle?.defender?.id === event.pokemon?.id
            ? "defender"
            : "attacker");
        effectOrigin.copy(battleStage.anchors[side]);
        effectTarget.copy(
          battleStage.anchors[
            event.kind === "attack"
              ? side === "attacker"
                ? "defender"
                : "attacker"
              : side
          ],
        );
        if (!snapshot.battle) {
          effectOrigin.set(0, 1.4, 0);
          effectTarget.set(0, 1.4, 0);
        }
      } else {
        tilePosition(event.fromTile ?? event.tile, effectOrigin);
        tilePosition(event.tile, effectTarget);
        effectOrigin.y = effectTarget.y = 0.7;
        if (event.kind === "roll" || event.kind === "victory") {
          effectOrigin.set(0, 0.7, 0);
          effectTarget.set(0, 0.7, 0);
        }
      }
    }
    resources.effects?.update(effectCue, eventProgress, reduced, lowQuality);
    // Downgrade once after sustained slow frames; no quality oscillation mid-turn.
    if (!lowQuality && !snapshot.paused && interval < 250) {
      qualitySamples += 1;
      if (interval > 45) slowFrames += 1;
      if (qualitySamples >= 90) {
        if (slowFrames > 18) {
          lowQuality = true;
          resize();
        }
        qualitySamples = 0;
        slowFrames = 0;
      }
    }
    try {
      const renderStartedAt =
        process.env.NODE_ENV !== "production" ? performance.now() : 0;
      renderer.render(scene, activeCamera);
      if (process.env.NODE_ENV !== "production") {
        renderCount += 1;
        if (now - lastMetricsUpdate >= 1000 || renderCount === 1) {
          lastMetricsUpdate = now;
          renderer.domElement.setAttribute(
            "data-quality",
            lowQuality ? "low" : "standard",
          );
          renderer.domElement.setAttribute(
            "data-draw-calls",
            String(renderer.info.render.calls),
          );
          renderer.domElement.setAttribute(
            "data-triangles",
            String(renderer.info.render.triangles),
          );
          renderer.domElement.setAttribute(
            "data-frame-ms",
            interval.toFixed(1),
          );
          renderer.domElement.setAttribute(
            "data-render-ms",
            (performance.now() - renderStartedAt).toFixed(1),
          );
          renderer.domElement.setAttribute(
            "data-render-count",
            String(renderCount),
          );
        }
        renderer.info.reset();
      }
      dirty = false;
      if (snapshot.paused) {
        cancelAnimationFrame(frame);
        frame = 0;
        lastTime = 0;
      }
    } catch {
      dispose();
      onFailure();
    }
  }
  frame = requestAnimationFrame(animate);

  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame);
    resizeObserver?.disconnect();
    document.removeEventListener("visibilitychange", handleVisibility);
    renderer.domElement.removeEventListener("click", handleClick);
    renderer.domElement.removeEventListener(
      "webglcontextlost",
      handleContextLost,
    );
    resources.battleStage?.dispose();
    resources.effects?.dispose();
    resources.environment?.dispose();
    resources.disposeBatches?.();
    for (const texture of textures) texture.dispose();
    for (const item of geometries) item.dispose();
    for (const item of materials) item.dispose();
    textures.clear();
    geometries.clear();
    materials.clear();
    pawns.clear();
    guardians.clear();
    textureCache.clear();
    sunlight?.shadow.dispose();
    scene.clear();
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
  }

  return { sync, selectTile, dispose };
}
