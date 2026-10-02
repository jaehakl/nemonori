import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as THREE from "three";
import ts from "typescript";
import { loadGameSource } from "./game-test-helpers.mjs";

const { BOARD_TILES, getTilePosition } = loadGameSource(
  "app/games/_components/pokemon-marble/board.ts",
);

const source = readFileSync(
  new URL(
    "../app/games/_components/pokemon-marble/board-renderer.ts",
    import.meta.url,
  ),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;

// Use real Three scene objects; only browser/GPU boundaries are controlled here.
function rendererHarness(t, { failResize = false } = {}) {
  const pendingImages = [];
  const frames = new Map();
  const renderers = [];
  const observers = [];
  const host = {
    clientWidth: 850,
    clientHeight: 590,
    children: [],
    appendChild(canvas) {
      this.children.push(canvas);
      canvas.host = this;
    },
  };
  const context = {
    drawImage() {},
    fillRect() {},
    strokeRect() {},
    fillText() {},
    beginPath() {},
    arc() {},
    fill() {},
  };
  class Canvas extends EventTarget {
    setAttribute() {}
    getBoundingClientRect() {
      return { left: 0, top: 0, width: host.clientWidth, height: host.clientHeight };
    }
    getContext() {
      return context;
    }
    remove() {
      if (this.host)
        this.host.children = this.host.children.filter(
          (child) => child !== this,
        );
    }
  }
  class WebGLRenderer {
    constructor() {
      this.domElement = new Canvas();
      this.shadowMap = {};
      this.info = {
        autoReset: true,
        render: { calls: 0, triangles: 0 },
        reset() {},
      };
      this.disposals = 0;
      this.contextLosses = 0;
      this.renders = 0;
      renderers.push(this);
    }
    setPixelRatio(value) {
      this.pixelRatio = value;
    }
    setClearColor() {}
    setSize(width, height) {
      this.width = width;
      this.height = height;
    }
    render(scene, camera) {
      this.scene = scene;
      this.camera = camera;
      this.renders += 1;
    }
    dispose() {
      this.disposals += 1;
    }
    forceContextLoss() {
      this.contextLosses += 1;
    }
  }
  class TextureLoader {
    load(url, loaded, progress, failed) {
      const texture = new THREE.Texture();
      const request = {
        url,
        texture,
        disposals: 0,
        succeed: () => loaded(texture),
        fail: () => failed(new Error("Image failed")),
      };
      texture.addEventListener("dispose", () => {
        request.disposals += 1;
      });
      pendingImages.push(request);
      return texture;
    }
  }
  class ResizeObserver {
    constructor() {
      this.disconnected = false;
      observers.push(this);
    }
    observe() {
      if (failResize) throw new Error("Resize initialization failed");
    }
    disconnect() {
      this.disconnected = true;
    }
  }
  const document = new EventTarget();
  document.createElement = () => new Canvas();
  document.hidden = false;
  const globals = {
    document,
    window: { devicePixelRatio: 1, matchMedia: () => ({ matches: false }) },
    ResizeObserver,
    requestAnimationFrame: (callback) => {
      const id = Symbol("frame");
      frames.set(id, callback);
      return id;
    },
    cancelAnimationFrame: (id) => {
      frames.delete(id);
    },
  };
  const originals = new Map(
    Object.keys(globals).map((name) => [
      name,
      Object.getOwnPropertyDescriptor(globalThis, name),
    ]),
  );
  for (const [name, value] of Object.entries(globals))
    Object.defineProperty(globalThis, name, {
      value,
      writable: true,
      configurable: true,
    });
  t.after(() => {
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });
  const compiledModule = { exports: {} };
  const moduleCache = new Map();
  const requireModule = (name) => {
    if (name === "three") return { ...THREE, WebGLRenderer, TextureLoader };
    if (moduleCache.has(name)) return moduleCache.get(name).exports;
    const dependencyModule = { exports: {} };
    moduleCache.set(name, dependencyModule);
    const contents = readFileSync(
      new URL(
        `../app/games/_components/pokemon-marble/${name.slice(2)}.ts`,
        import.meta.url,
      ),
      "utf8",
    );
    const code = ts.transpileModule(contents, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
    }).outputText;
    new Function("require", "module", "exports", code)(
      requireModule,
      dependencyModule,
      dependencyModule.exports,
    );
    return dependencyModule.exports;
  };
  new Function("require", "module", "exports", compiled)(
    requireModule,
    compiledModule,
    compiledModule.exports,
  );
  let clock = 100;
  return {
    ...compiledModule.exports,
    host,
    pendingImages,
    frames,
    renderers,
    observers,
    document,
    context,
    renderFrame(delta = 34) {
      clock += delta;
      const active = [...frames.values()];
      frames.clear();
      for (const callback of active) callback(clock);
    },
  };
}

const snapshot = (guardians = [], tokens = []) => ({
  tokens,
  guardians,
  activePlayerId: 0,
  dice: [3, 6],
  rolling: false,
});

const token = (id = 0, additions = {}) => ({
  id,
  name: `플레이어 ${id + 1}`,
  color: ["#ef6559", "#3988e5", "#e8b840", "#9b6ad9"][id],
  position: 2,
  starterSpeciesId: 25,
  restTurnsRemaining: 0,
  ...additions,
});

test("the overhead board uses all 40 canonical tiles, preserves orientation and selects every tile by pointer", (t) => {
  const harness = rendererHarness(t);
  const selections = [];
  const board = harness.createBoardRenderer(harness.host, (tile) => selections.push(tile), () => {});
  board.sync(snapshot());
  harness.renderFrame();
  const renderer = harness.renderers[0];
  const { camera, scene } = renderer;
  assert.deepEqual(camera.position.toArray(), [0, 20, 0]);
  assert.deepEqual(camera.up.toArray(), [0, 0, -1]);
  const direction = camera.getWorldDirection(new THREE.Vector3());
  assert.ok(direction.distanceTo(new THREE.Vector3(0, -1, 0)) < 1e-10);
  assert.equal(camera.top - camera.bottom, 12.5);
  assert.equal(harness.TILE_NAMES.length, 40);
  assert.equal(harness.TILE_NAMES.filter((name) => name === "도로").length, 27);
  assert.equal(harness.TILE_NAMES.filter((name) => name === "풀숲").length, 9);
  assert.equal(scene.getObjectByName("island-atmosphere"), undefined);
  for (let tile = 0; tile < 40; tile += 1) {
    assert.equal(scene.getObjectByName(`owner-plate-${tile}`).visible, BOARD_TILES[tile] === "road");
    const { x, z } = getTilePosition(tile);
    const projected = new THREE.Vector3(x * 1.08, 0.27, z * 1.08).project(camera);
    assert.ok(Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1, `tile ${tile} fits the camera`);
    const click = new Event("click");
    Object.assign(click, {
      clientX: (projected.x + 1) * harness.host.clientWidth / 2,
      clientY: (1 - projected.y) * harness.host.clientHeight / 2,
    });
    renderer.domElement.dispatchEvent(click);
  }
  assert.deepEqual(selections, Array.from({ length: 40 }, (_, index) => index));
  board.selectTile(39);
  const selection = scene.getObjectByName("tile-selection");
  const last = getTilePosition(39);
  assert.equal(selection.position.x, last.x * 1.08);
  assert.equal(selection.position.z, last.z * 1.08);
  board.dispose();
});

test("four starter portrait tokens keep unique borders and clear the guardian's tile region", (t) => {
  const harness = rendererHarness(t);
  const board = harness.createBoardRenderer(harness.host, () => {}, () => {});
  const players = Array.from({ length: 4 }, (_, index) => token(index));
  board.sync(snapshot([{ tile: 2, ownerId: 0, speciesId: 25 }], players));
  assert.equal(harness.pendingImages.length, 1, "all five portraits share their species image");
  harness.pendingImages[0].succeed();
  harness.renderFrame();
  const scene = harness.renderers[0].scene;
  const guardian = scene.getObjectByName("road-guardian-2");
  const guardianSprite = guardian.getObjectByName("pokemon-portrait");
  assert.equal(guardianSprite.material.map, harness.pendingImages[0].texture);
  assert.equal(guardianSprite.visible, true);
  const occupied = [];
  for (const player of players) {
    const pawn = scene.getObjectByName(`player-token-${player.id}`);
    const border = pawn.getObjectByName("player-color-border");
    const portrait = pawn.getObjectByName("pokemon-portrait");
    assert.equal(`#${border.material.color.getHexString()}`, player.color);
    assert.equal(portrait.userData.speciesId, player.starterSpeciesId);
    assert.equal(portrait.visible, true);
    assert.ok(pawn.position.z - 0.13 > guardian.position.z + 0.17);
    for (const other of occupied) {
      assert.ok(Math.hypot(pawn.position.x - other.x, pawn.position.z - other.z) >= 0.26);
    }
    occupied.push(pawn.position.clone());
  }
  board.dispose();
  assert.equal(harness.pendingImages[0].disposals, 1);
});

test("rolling dice remain between the center panel and the perimeter tiles", (t) => {
  const harness = rendererHarness(t);
  const board = harness.createBoardRenderer(harness.host, () => {}, () => {});
  board.sync({ ...snapshot(), rolling: true });
  for (let frame = 0; frame < 40; frame += 1) {
    harness.renderFrame();
    for (let index = 0; index < 2; index += 1) {
      const die = harness.renderers[0].scene.getObjectByName(`board-die-${index}`);
      const bounds = new THREE.Box3().setFromObject(die);
      assert.ok(bounds.min.z > -4.9025, "a rolling die clears the top road tiles");
      assert.ok(bounds.max.z < -4, "a rolling die clears the 64% center panel");
    }
  }
  board.dispose();
});

test("stationary tokens enlarge when alone and reflow as players or guardians enter and leave", (t) => {
  const harness = rendererHarness(t);
  const board = harness.createBoardRenderer(harness.host, () => {}, () => {});
  const tile = getTilePosition(2);
  const center = { x: tile.x * 1.08, z: tile.z * 1.08 };
  board.sync(snapshot([], [token()]));
  harness.renderFrame();
  const pawn = harness.renderers[0].scene.getObjectByName("player-token-0");
  const badgeWidth = () => 0.26 * pawn.scale.x;
  const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9);
  close(badgeWidth(), 0.6);
  close(pawn.position.x, center.x);
  close(pawn.position.z, center.z);

  board.sync(snapshot([], [token(), token(1)]));
  harness.renderFrame();
  close(badgeWidth(), 0.26);
  close(pawn.position.x, center.x - 0.25);
  close(pawn.position.z, center.z + 0.1);

  board.sync(snapshot([{ tile: 2, ownerId: 0, speciesId: 25 }], [token()]));
  harness.renderFrame();
  close(badgeWidth(), 0.36);
  close(pawn.position.x, center.x);
  close(pawn.position.z, center.z + 0.27);
  const guardian = harness.renderers[0].scene.getObjectByName("road-guardian-2");
  assert.ok(pawn.position.z - 0.18 > guardian.position.z + 0.17);

  board.sync(snapshot([], [token()]));
  harness.renderFrame();
  close(badgeWidth(), 0.6);
  close(pawn.position.x, center.x);
  close(pawn.position.z, center.z);
  assert.equal(harness.renderers[0].scene.getObjectByName("player-token-0"), pawn);
  board.dispose();
});

test("movement interpolates from a crowded source slot to an enlarged empty destination", (t) => {
  const harness = rendererHarness(t);
  const board = harness.createBoardRenderer(harness.host, () => {}, () => {});
  board.sync(snapshot([], [token(), token(1)]));
  harness.renderFrame();
  const pawn = harness.renderers[0].scene.getObjectByName("player-token-0");
  const origin = pawn.position.clone();
  const moved = snapshot([], [token(0, { position: 3 }), token(1)]);
  const movement = event("move", { playerId: 0, fromTile: 2, tile: 3 });
  board.sync({ ...moved, presentation: { event: movement, progress: 0 } });
  harness.renderFrame();
  assert.ok(pawn.position.distanceTo(origin) < 1e-9);
  assert.equal(pawn.scale.x, 1);

  board.sync({ ...moved, presentation: { event: movement, progress: 1 } });
  harness.renderFrame();
  const destination = getTilePosition(3);
  assert.equal(pawn.position.x, destination.x * 1.08);
  assert.equal(pawn.position.z, destination.z * 1.08);
  assert.ok(Math.abs(0.26 * pawn.scale.x - 0.6) < 1e-9);
  board.sync(moved);
  harness.renderFrame();
  assert.equal(pawn.position.z, destination.z * 1.08);
  board.dispose();
});

test("cached portrait callbacks normalize transparent padding before the first render", (t) => {
  const harness = rendererHarness(t);
  const pixels = new Uint8ClampedArray(4 * 4 * 4);
  for (const pixel of [5, 6, 9, 10]) pixels[pixel * 4 + 3] = 255;
  harness.context.getImageData = () => ({ data: pixels });
  const board = harness.createBoardRenderer(harness.host, () => {}, () => {});
  board.sync(snapshot([], [token()]));
  const request = harness.pendingImages[0];
  request.texture.image = { width: 4, height: 4 };
  request.succeed();
  board.sync(snapshot([{ tile: 2, ownerId: 0, speciesId: 25 }], [token()]));
  harness.renderFrame();
  const scene = harness.renderers[0].scene;
  const pawn = scene.getObjectByName("player-token-0").getObjectByName("pokemon-portrait");
  const guardian = scene.getObjectByName("road-guardian-2");
  const sprite = guardian.getObjectByName("pokemon-portrait");
  assert.equal(harness.pendingImages.length, 1);
  assert.equal(sprite.visible, true);
  assert.equal(guardian.getObjectByName("portrait-fallback").visible, false);
  assert.equal(sprite.scale.y, 0.68, "the visible half-height is 0.34 world units");
  assert.equal(pawn.scale.y, 0.4, "the visible half-height is 0.2 world units");
  assert.deepEqual(sprite.center.toArray(), [0.5, 0.5]);
  board.dispose();
});

test("a starter portrait keeps a shared texture after guardians and battlers leave", (t) => {
  const harness = rendererHarness(t);
  const board = harness.createBoardRenderer(harness.host, () => {}, () => {});
  board.sync({ ...snapshot([{ tile: 2, ownerId: 0, speciesId: 25 }], [token()]), battle: battleView() });
  harness.renderFrame();
  assert.equal(harness.pendingImages.length, 2);
  harness.pendingImages.forEach((request) => request.succeed());
  const pikachu = harness.pendingImages.find((request) => request.url.endsWith("/25.png"));
  const charmander = harness.pendingImages.find((request) => request.url.endsWith("/4.png"));
  board.sync(snapshot([], [token()]));
  harness.renderFrame();
  assert.equal(pikachu.disposals, 0);
  assert.equal(charmander.disposals, 1);
  board.sync(snapshot());
  assert.equal(pikachu.disposals, 1);
  pikachu.fail();
  board.dispose();
  assert.equal(pikachu.disposals, 1);
});

test("failed starter images keep a visible player-colored fallback and release once", (t) => {
  const harness = rendererHarness(t);
  const board = harness.createBoardRenderer(harness.host, () => {}, () => assert.fail("render failed"));
  board.sync(snapshot([], [token()]));
  const request = harness.pendingImages[0];
  request.fail();
  harness.renderFrame();
  const pawn = harness.renderers[0].scene.getObjectByName("player-token-0");
  assert.equal(pawn.getObjectByName("pokemon-portrait").visible, false);
  assert.equal(pawn.getObjectByName("portrait-fallback").visible, true);
  assert.equal(pawn.getObjectByName("player-color-border").visible, true);
  board.dispose();
  assert.equal(request.disposals, 1);
});

test("token movement wraps from tile 40 to 1 and resting players move directly to their center", (t) => {
  const harness = rendererHarness(t);
  const board = harness.createBoardRenderer(harness.host, () => {}, () => {});
  board.sync(snapshot([], [token(0, { position: 39 })]));
  harness.renderFrame();
  const pawn = harness.renderers[0].scene.getObjectByName("player-token-0");
  board.sync(snapshot([], [token(0, { position: 0 })]));
  for (let step = 0; step < 12; step += 1) harness.renderFrame();
  assert.equal(pawn.position.x, -5 * 1.08);
  assert.equal(pawn.position.z, 5 * 1.08);
  board.sync(snapshot([], [token(0, { position: 30, restTurnsRemaining: 3 })]));
  harness.renderFrame();
  assert.equal(pawn.position.x, 5 * 1.08);
  assert.equal(pawn.position.z, 5 * 1.08);
  assert.equal(pawn.visible, true);
  board.dispose();
});

test("removing a guardian releases its pending texture even when its request later fails", (t) => {
  const harness = rendererHarness(t);
  const board = harness.createBoardRenderer(
    harness.host,
    () => {},
    () => assert.fail("Unexpected render failure"),
  );
  board.sync(snapshot([{ tile: 2, ownerId: 0, speciesId: 25 }]));
  const image = harness.pendingImages[0];
  board.sync(snapshot());
  assert.equal(
    image.disposals,
    1,
    "pending image belongs to the guardian from creation",
  );
  image.fail();
  assert.equal(
    image.disposals,
    1,
    "late failure cannot release an already removed texture twice",
  );
  board.dispose();
});

test("a failed active guardian image is released immediately and the scene remains renderable", (t) => {
  const harness = rendererHarness(t);
  const board = harness.createBoardRenderer(
    harness.host,
    () => {},
    () => assert.fail("Unexpected render failure"),
  );
  board.sync(snapshot([{ tile: 2, ownerId: 0, speciesId: 25 }]));
  const image = harness.pendingImages[0];
  image.fail();
  assert.equal(image.disposals, 1);
  harness.renderFrame();
  assert.ok(harness.renderers[0].scene);
  board.dispose();
  assert.equal(image.disposals, 1);
});

test("scene disposal cancels animation and observers, releases resources once, and rejects late image callbacks", (t) => {
  const harness = rendererHarness(t);
  const board = harness.createBoardRenderer(
    harness.host,
    () => {},
    () => assert.fail("Unexpected render failure"),
  );
  board.sync(snapshot([{ tile: 2, ownerId: 0, speciesId: 25 }]));
  harness.renderFrame();
  const renderer = harness.renderers[0];
  const resources = new Map();
  const track = (resource) => {
    if (!resource || resources.has(resource)) return;
    resources.set(resource, 0);
    resource.addEventListener("dispose", () =>
      resources.set(resource, resources.get(resource) + 1),
    );
  };
  renderer.scene.traverse((object) => {
    if (object instanceof THREE.Mesh) track(object.geometry);
    const materials = object.material
      ? Array.isArray(object.material)
        ? object.material
        : [object.material]
      : [];
    for (const material of materials) {
      track(material);
      track(material.map);
    }
  });
  board.dispose();
  board.dispose();
  harness.pendingImages[0].succeed();
  board.sync(snapshot());
  board.selectTile(4);
  assert.equal(harness.host.children.length, 0);
  assert.equal(harness.frames.size, 0);
  assert.ok(harness.observers.every((observer) => observer.disconnected));
  assert.equal(renderer.disposals, 1);
  assert.equal(renderer.contextLosses, 1);
  assert.ok(
    resources.size > 100,
    "board, battle stage and effect pool resources are covered",
  );
  assert.ok(
    [...resources.values()].every((count) => count === 1),
    "scene geometry, materials, and textures are all released once",
  );
  assert.equal(harness.pendingImages[0].disposals, 1);
});

test("WebGL context loss tears down the scene and reports failure only once", (t) => {
  const harness = rendererHarness(t);
  let failures = 0;
  const board = harness.createBoardRenderer(
    harness.host,
    () => {},
    () => {
      failures += 1;
    },
  );
  const canvas = harness.renderers[0].domElement;
  const lost = new Event("webglcontextlost", { cancelable: true });
  canvas.dispatchEvent(lost);
  canvas.dispatchEvent(new Event("webglcontextlost"));
  assert.equal(lost.defaultPrevented, true);
  assert.equal(failures, 1);
  assert.equal(harness.host.children.length, 0);
  assert.equal(harness.frames.size, 0);
  board.dispose();
});

test("failed scene initialization also releases the partial renderer and permits a clean retry", (t) => {
  const harness = rendererHarness(t, { failResize: true });
  assert.throws(
    () =>
      harness.createBoardRenderer(
        harness.host,
        () => {},
        () => {},
      ),
    /Resize initialization failed/,
  );
  assert.equal(harness.host.children.length, 0);
  assert.equal(harness.frames.size, 0);
  assert.ok(harness.observers[0].disconnected);
  assert.equal(harness.renderers[0].disposals, 1);
  assert.equal(harness.renderers[0].contextLosses, 1);
});

const battleView = () => ({
  kind: "wild",
  attacker: { id: "partner", speciesId: 25, level: 10, hp: 30, maxHp: 35 },
  defender: { id: "wild", speciesId: 4, level: 8, hp: 20, maxHp: 30 },
  attackerName: "민지",
  defenderName: "야생 포켓몬",
  turn: "attacker",
});

function event(kind, additions = {}) {
  return {
    kind,
    revision: 1,
    sequence: 0,
    playerId: 0,
    tile: 2,
    message: "연출",
    snapshot: {
      players: [],
      guardians: [],
      activePlayerId: 0,
      dice: [3, 6],
      battle: battleView(),
    },
    ...additions,
  };
}

test("board and battle reuse one canvas and release battle-only sprite textures on exit", (t) => {
  const harness = rendererHarness(t);
  const board = harness.createBoardRenderer(
    harness.host,
    () => {},
    () => assert.fail("render failed"),
  );
  board.sync(snapshot([{ tile: 2, ownerId: 0, speciesId: 25 }]));
  board.sync({
    ...snapshot([{ tile: 2, ownerId: 0, speciesId: 25 }]),
    battle: battleView(),
  });
  harness.renderFrame();
  const scene = harness.renderers[0].scene;
  assert.equal(scene.getObjectByName("adventure-board").visible, false);
  assert.equal(scene.getObjectByName("battle-stage").visible, true);
  assert.equal(harness.host.children.length, 1);
  assert.equal(harness.renderers.length, 1);
  assert.equal(
    harness.pendingImages.length,
    2,
    "the guardian and battler share Pikachu's texture",
  );
  harness.pendingImages.forEach((request) => request.succeed());
  board.sync(snapshot([{ tile: 2, ownerId: 0, speciesId: 25 }]));
  harness.renderFrame();
  assert.equal(scene.getObjectByName("adventure-board").visible, true);
  assert.equal(scene.getObjectByName("battle-stage").visible, false);
  assert.equal(
    harness.pendingImages[0].disposals,
    0,
    "the guardian still retains its sprite",
  );
  assert.equal(
    harness.pendingImages[1].disposals,
    1,
    "battle-only sprite is released",
  );
  board.dispose();
  assert.equal(harness.pendingImages[0].disposals, 1);
});

test("large canvases obey the iPad pixel budget and high refresh callbacks do not exceed 30fps", (t) => {
  const harness = rendererHarness(t);
  harness.host.clientWidth = 1800;
  harness.host.clientHeight = 1200;
  const board = harness.createBoardRenderer(
    harness.host,
    () => {},
    () => {},
  );
  const renderer = harness.renderers[0];
  assert.ok(renderer.pixelRatio <= 1);
  assert.ok(
    renderer.width * renderer.height * renderer.pixelRatio ** 2 <= 800001,
  );
  harness.renderFrame();
  const count = renderer.renders;
  harness.renderFrame(8);
  harness.renderFrame(8);
  harness.renderFrame(8);
  assert.equal(renderer.renders, count);
  harness.renderFrame(10);
  assert.equal(renderer.renders, count + 1);
  board.dispose();
});

test("pause freezes the canvas and visibility stops and resumes the only frame loop", (t) => {
  const harness = rendererHarness(t);
  const board = harness.createBoardRenderer(
    harness.host,
    () => {},
    () => {},
  );
  board.sync({ ...snapshot(), paused: true });
  harness.renderFrame();
  const renderer = harness.renderers[0];
  const count = renderer.renders;
  harness.renderFrame();
  assert.equal(renderer.renders, count);
  harness.document.hidden = true;
  harness.document.dispatchEvent(new Event("visibilitychange"));
  harness.renderFrame();
  assert.equal(harness.frames.size, 0);
  harness.document.hidden = false;
  harness.document.dispatchEvent(new Event("visibilitychange"));
  assert.equal(harness.frames.size, 1);
  board.sync(snapshot());
  harness.renderFrame();
  assert.equal(renderer.renders, count + 1);
  board.dispose();
  harness.document.dispatchEvent(new Event("visibilitychange"));
  assert.equal(
    harness.frames.size,
    0,
    "unmount removes the visibility listener",
  );
});

test("all eighteen attack types reuse a bounded effect pool and reduced motion removes particle motion", (t) => {
  const harness = rendererHarness(t);
  const board = harness.createBoardRenderer(
    harness.host,
    () => {},
    () => assert.fail("render failed"),
  );
  const colors = new Set();
  let pool;
  for (let moveType = 1; moveType <= 18; moveType += 1) {
    const attack = {
      side: "attacker",
      moveId: moveType,
      moveType,
      category: "special",
      damage: 10,
      effectiveness: 1,
      beforeHp: 30,
      afterHp: 20,
    };
    board.sync({
      ...snapshot(),
      battle: battleView(),
      presentation: {
        event: event("attack", { revision: moveType, attack }),
        progress: 0.55,
      },
    });
    harness.renderFrame();
    const currentPool =
      harness.renderers[0].scene.getObjectByName("effect-pool-128");
    if (pool)
      assert.equal(
        currentPool,
        pool,
        "effects never allocate a replacement pool",
      );
    pool = currentPool;
    assert.ok(pool.count <= 128);
    colors.add(Array.from(pool.instanceColor.array.slice(0, 3)).join(","));
  }
  assert.equal(colors.size, 18, "every type has a distinct palette");
  board.sync({
    ...snapshot(),
    battle: battleView(),
    reducedMotion: true,
    presentation: { event: event("heal"), progress: 0.5 },
  });
  harness.renderFrame();
  assert.equal(pool.count, 0);
  assert.equal(
    harness.renderers[0].scene.getObjectByName("presentation-effects").visible,
    true,
    "a static status ring still communicates the event",
  );
  board.dispose();
});

test("repeated slow frames lower resolution without changing the game snapshot", (t) => {
  const harness = rendererHarness(t);
  const board = harness.createBoardRenderer(
    harness.host,
    () => {},
    () => {},
  );
  const state = snapshot();
  board.sync(state);
  const serialized = JSON.stringify(state);
  const initialRatio = harness.renderers[0].pixelRatio;
  for (let i = 0; i < 95; i += 1) harness.renderFrame(51);
  assert.ok(harness.renderers[0].pixelRatio < initialRatio);
  assert.equal(JSON.stringify(state), serialized);
  board.dispose();
});

test("battle sprite feet use measured alpha bounds instead of transparent image padding", (t) => {
  const harness = rendererHarness(t);
  const pixels = new Uint8ClampedArray(4 * 4 * 4);
  for (const pixel of [5, 6, 9, 10]) pixels[pixel * 4 + 3] = 255;
  let measurements = 0;
  harness.context.getImageData = () => {
    measurements += 1;
    return { data: pixels };
  };
  const board = harness.createBoardRenderer(
    harness.host,
    () => {},
    () => {},
  );
  board.sync({ ...snapshot(), battle: battleView() });
  harness.renderFrame();
  const image = harness.pendingImages[0];
  image.texture.image = { width: 4, height: 4 };
  image.succeed();
  harness.renderFrame();
  const actor = harness.renderers[0].scene.getObjectByName("battle-attacker");
  const sprite = actor.children.find((child) => child instanceof THREE.Sprite);
  assert.equal(
    sprite.center.y,
    0.25,
    "transparent bottom quarter is below the ground anchor",
  );
  assert.equal(sprite.center.x, 0.5);
  assert.equal(
    sprite.scale.y,
    5.2,
    "visible alpha silhouette is 2.6 world units tall",
  );
  for (let i = 0; i < 10; i += 1) harness.renderFrame();
  assert.equal(
    measurements,
    1,
    "alpha sampling only happens when the texture loads",
  );
  board.dispose();
});

test("a fainted battler stays hidden during rewards and only returns as a subdued capture silhouette", (t) => {
  const harness = rendererHarness(t);
  const board = harness.createBoardRenderer(
    harness.host,
    () => {},
    () => {},
  );
  const battle = battleView();
  battle.defender.hp = 0;
  const attack = {
    side: "attacker",
    moveId: 1,
    moveType: 1,
    category: "physical",
    damage: 20,
    effectiveness: 1,
    beforeHp: 20,
    afterHp: 0,
  };
  const show = (presentation) => {
    board.sync({ ...snapshot(), battle, presentation });
    harness.renderFrame();
    return harness.renderers[0].scene.getObjectByName("battle-defender");
  };
  let actor = show({ event: event("attack", { attack }), progress: 0.55 });
  assert.equal(
    actor.visible,
    true,
    "the final hit is visible before the faint cue",
  );
  const sprite = actor.children.find((child) => child instanceof THREE.Sprite);
  assert.equal(sprite.material.opacity, 1);
  actor = show({ event: event("faint", { side: "defender" }), progress: 1 });
  assert.equal(sprite.material.opacity, 0);
  actor = show({
    event: event("level-up", { pokemon: battle.attacker }),
    progress: 0.5,
  });
  assert.equal(
    actor.visible,
    false,
    "reward cues cannot revive the defeated opponent",
  );
  actor = show({
    event: event("evolution", {
      pokemon: battle.attacker,
      previousSpeciesId: 25,
    }),
    progress: 0.7,
  });
  assert.equal(actor.visible, false);
  actor = show(null);
  assert.equal(
    actor.visible,
    false,
    "the canonical capture waiting state keeps it fainted",
  );
  actor = show({
    event: event("capture", { pokemon: battle.defender }),
    progress: 0.1,
  });
  assert.equal(actor.visible, true);
  assert.ok(sprite.material.opacity > 0 && sprite.material.opacity <= 0.35);
  actor = show({
    event: event("capture", { pokemon: battle.defender }),
    progress: 0.8,
  });
  assert.equal(sprite.material.opacity, 0);
  board.dispose();
});

test("impact camera reaction is bounded, resets after impact, and respects reduced motion", (t) => {
  const harness = rendererHarness(t);
  const board = harness.createBoardRenderer(
    harness.host,
    () => {},
    () => {},
  );
  const attack = {
    side: "attacker",
    moveId: 1,
    moveType: 1,
    category: "physical",
    damage: 10,
    effectiveness: 1,
    beforeHp: 30,
    afterHp: 20,
  };
  const render = (progress, reducedMotion = false) => {
    board.sync({
      ...snapshot(),
      battle: battleView(),
      reducedMotion,
      presentation: { event: event("attack", { attack }), progress },
    });
    harness.renderFrame();
    return harness.renderers[0].camera.position;
  };
  assert.equal(render(0.3).x, 0);
  assert.ok(render(0.55).x > 0 && render(0.55).x <= 0.055);
  assert.equal(render(0.8).x, 0);
  assert.equal(render(0.55, true).x, 0);
  assert.equal(render(0.55, true).y, 7);
  board.dispose();
});
