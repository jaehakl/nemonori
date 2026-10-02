import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as THREE from "three";
import ts from "typescript";

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
    fillRect() {},
    strokeRect() {},
    fillText() {},
    beginPath() {},
    arc() {},
    fill() {},
  };
  class Canvas extends EventTarget {
    setAttribute() {}
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
      this.disposals = 0;
      this.contextLosses = 0;
      renderers.push(this);
    }
    setPixelRatio() {}
    setClearColor() {}
    setSize() {}
    render(scene) {
      this.scene = scene;
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
  const globals = {
    document: { createElement: () => new Canvas() },
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
  new Function("require", "module", "exports", compiled)(
    () => ({ ...THREE, WebGLRenderer, TextureLoader }),
    compiledModule,
    compiledModule.exports,
  );
  return {
    ...compiledModule.exports,
    host,
    pendingImages,
    frames,
    renderers,
    observers,
    renderFrame() {
      const active = [...frames.values()];
      frames.clear();
      for (const callback of active) callback(performance.now());
    },
  };
}

const snapshot = (guardians = []) => ({
  tokens: [
    { id: 0, name: "민지", color: "#ef7060", position: 0, eliminated: false },
  ],
  guardians,
  activePlayerId: 0,
  dice: [3, 6],
  rolling: false,
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
  assert.ok(resources.size > 200);
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
