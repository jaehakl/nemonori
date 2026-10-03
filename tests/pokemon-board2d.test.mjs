import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadGameSource } from "./game-test-helpers.mjs";

const { default: Board2D } = loadGameSource(
  "app/games/_components/pokemon-marble/Board2D.tsx",
);
const { default: DiceCradle } = loadGameSource(
  "app/games/_components/pokemon-marble/DiceCradle.tsx",
);

const player = (id = 0, additions = {}) => ({
  id,
  name: `트레이너 ${id + 1}`,
  color: ["#ef6559", "#3988e5", "#e8b840", "#9b6ad9"][id],
  position: 2,
  starterSpeciesId: [25, 4, 7, 1][id],
  leaderSpeciesId: [25, 4, 7, 1][id],
  restTurnsRemaining: 0,
  ...additions,
});
const props = (additions = {}) => ({
  tokens: [player()],
  guardians: [],
  activePlayerId: 0,
  ...additions,
});
const render = (additions = {}) => renderToStaticMarkup(React.createElement(Board2D, props(additions)));
const event = (kind, additions = {}) => ({ kind, revision: 1, sequence: 0, playerId: 0, tile: 2, message: "연출", snapshot: {}, ...additions });

function tokenFrames(html) {
  return [...html.matchAll(/<g transform="translate\(([-\d.]+) ([-\d.]+)\)" data-token="(\d+)" data-token-size="([-\d.]+)"/g)].map(
    ([, x, y, id, size]) => ({ x: Number(x), y: Number(y), id: Number(id), size: Number(size) }),
  );
}

function findElement(element, predicate) {
  if (!React.isValidElement(element)) return null;
  if (predicate(element)) return element;
  for (const child of React.Children.toArray(element.props.children)) {
    const found = findElement(child, predicate);
    if (found) return found;
  }
  return null;
}

test("the crisp SVG board contains all 40 selectable canonical cells with fixed corner orientation", () => {
  const html = render();
  assert.match(html, /viewBox="0 0 1100 1100"/);
  assert.match(html, /<image href="\/pokemon-marble\/sprites\/25.png"/);
  assert.doesNotMatch(html, /foreignObject|<img/);
  assert.equal([...html.matchAll(/data-tile="\d+"/g)].length, 40);
  assert.equal([...html.matchAll(/data-kind="road"/g)].length, 27);
  assert.equal([...html.matchAll(/data-kind="grass"/g)].length, 9);
  assert.equal([...html.matchAll(/data-kind="center"/g)].length, 4);
  for (const [tile, location] of [[0, "0 1000"], [10, "0 0"], [20, "1000 0"], [30, "1000 1000"]]) {
    assert.match(html, new RegExp(`transform="translate\\(${location}\\)" data-tile="${tile}"`));
  }
  assert.equal([...html.matchAll(/role="button"/g)].length, 40);
  assert.doesNotMatch(html, /<canvas|linearGradient|radialGradient|filter=/);
  assert.doesNotMatch(html, /data-die=/, "the board never duplicates the central dice");
});

test("the board portrait follows the party leader independently of the original starter", () => {
  const html = render({ tokens: [player(0, { leaderSpeciesId: 6 })] });
  assert.match(html, /data-starter="25" data-leader="6"/);
  assert.match(html, /href="\/pokemon-marble\/sprites\/6.png"/);
  assert.doesNotMatch(html, /href="\/pokemon-marble\/sprites\/25.png"/);
});

test("tile pointer and keyboard selection share the same action and pause disables both", () => {
  const selected = [];
  const tree = Board2D(props({ onTileSelect: (tile) => selected.push(tile) }));
  const tile = findElement(tree, (element) => element.props["data-tile"] === 39);
  tile.props.onClick();
  let prevented = false;
  tile.props.onKeyDown({ key: "Enter", preventDefault: () => { prevented = true; } });
  assert.deepEqual(selected, [39, 39]);
  assert.equal(prevented, true);
  const paused = Board2D(props({ paused: true, onTileSelect: (index) => selected.push(index) }));
  const disabled = findElement(paused, (element) => element.props["data-tile"] === 39);
  disabled.props.onClick();
  disabled.props.onKeyDown({ key: " ", preventDefault() {} });
  assert.deepEqual(selected, [39, 39]);
  assert.equal(disabled.props.tabIndex, -1);
});

test("a lone starter uses a large normalized portrait, player border and an unobscuring P label", () => {
  const html = render({ tokens: [player(0, { restTurnsRemaining: 3 })] });
  assert.deepEqual(tokenFrames(html), [{ x: 50, y: 845, id: 0, size: 76 }]);
  assert.match(html, /data-starter="25" data-leader="25" data-active="true"/);
  assert.match(html, /<circle r="38" fill="#fff" stroke="#ef6559"/);
  assert.match(html, /stroke-dasharray="5 3"/);
  assert.match(html, /\/pokemon-marble\/sprites\/25.png/);
  assert.match(html, /width="60.800000000000004"/);
  assert.match(html, /P1 · 3/);
  assert.match(html, /휴식 3턴/);
});

test("unoccupied guardians are large and crowded guardian tiles keep all four portraits separated", () => {
  const guardian = { tile: 2, ownerId: 0, speciesId: 133 };
  const empty = render({ tokens: [player(0, { position: 7 })], guardians: [guardian] });
  assert.match(empty, /data-guardian="2" data-species="133" data-guardian-size="76"/);
  const lone = render({ guardians: [guardian] });
  assert.equal(tokenFrames(lone)[0].size, 44);
  const crowded = render({ tokens: Array.from({ length: 4 }, (_, index) => player(index)), guardians: [guardian] });
  assert.match(crowded, /data-guardian="2" data-species="133" data-guardian-size="30"/);
  assert.match(crowded, /\/pokemon-marble\/sprites\/133.png/);
  const frames = tokenFrames(crowded);
  assert.equal(frames.length, 4);
  for (const frame of frames) {
    assert.equal(frame.size, 30);
    assert.ok(frame.y - frame.size / 2 >= 835, "players stay below the guardian frame ending at 832");
    for (const other of frames.filter((entry) => entry.id > frame.id)) {
      assert.ok(Math.hypot(frame.x - other.x, frame.y - other.y) >= 33, "circles and player borders do not overlap");
    }
  }
  for (const color of ["#ef6559", "#3988e5", "#e8b840", "#9b6ad9"]) {
    assert.ok(crowded.includes(`stroke="${color}"`));
  }
});

test("movement uses presentation progress without mutating snapshots and respects reduced motion", () => {
  const tokens = [player(0, { position: 3 }), player(1, { position: 2 })];
  const presentation = { event: event("move", { fromTile: 2, tile: 3 }), progress: 0 };
  const original = JSON.stringify({ tokens, presentation });
  const start = tokenFrames(render({ tokens, presentation })).find((entry) => entry.id === 0);
  assert.deepEqual(start, { id: 0, x: 25, y: 851, size: 44 });
  const finish = tokenFrames(render({ tokens, presentation: { ...presentation, progress: 1 } })).find((entry) => entry.id === 0);
  assert.deepEqual(finish, { id: 0, x: 50, y: 745, size: 76 });
  const reduced = tokenFrames(render({ tokens, presentation, reducedMotion: true })).find((entry) => entry.id === 0);
  assert.deepEqual(reduced, finish);
  assert.equal(JSON.stringify({ tokens, presentation }), original);
});

test("dice have deterministic changing faces and decelerating tumble before showing the correct result", () => {
  const show = (progress, reducedMotion = false) => renderToStaticMarkup(React.createElement(DiceCradle, {
    dice: [3, 6],
    progress,
    reducedMotion,
  }));
  const mid = show(0.4);
  assert.equal(mid, show(0.4), "paused or repeated progress cannot advance a visual random generator");
  assert.notEqual(mid, show(0.45));
  assert.match(mid, /width="60" height="60"/);
  assert.match(mid, /rotate\((?!0\))/);
  assert.match(mid, /aria-label="주사위를 굴리는 중"/);
  assert.match(show(0.85), /aria-label="주사위를 굴리는 중"/);
  for (const html of [show(1), show(0.3, true)]) {
    assert.match(html, /aria-label="주사위 3 \+ 6"/);
    assert.match(html, /data-die="0" data-face="3" data-result="3"/);
    assert.match(html, /data-die="1" data-face="6" data-result="6"/);
    assert.equal([...html.matchAll(/rotate\(0\) scale\(1\)/g)].length, 2);
  }
  assert.match(show(0.78), /fill="none" stroke="#718e61"/);
});

test("the central dice remain fully inside their responsive viewport throughout the roll", () => {
  for (let step = 0; step <= 100; step += 1) {
    const tree = DiceCradle({ dice: [3, 6], progress: step / 100 });
    for (const index of [0, 1]) {
      const die = findElement(tree, (element) => element.props.index === index && typeof element.props.progress === "number");
      const rendered = die.type(die.props);
      const [, x, y] = rendered.props.transform.match(/translate\(([-\d.]+) ([-\d.]+)\)/).map(Number);
      const body = findElement(rendered, (element) => element.props.transform?.startsWith("rotate("));
      const [, degrees, scale] = body.props.transform.match(/rotate\(([-\d.]+)\) scale\(([-\d.]+)\)/).map(Number);
      const radians = degrees * Math.PI / 180;
      const halfHeight = 31.25 * scale * (Math.abs(Math.cos(radians)) + Math.abs(Math.sin(radians)));
      assert.ok(x - halfHeight >= 0 && x + halfHeight <= 220, `die ${index} stays within horizontal bounds at ${step}%`);
      assert.ok(y - halfHeight >= 0 && y + halfHeight <= 110, `die ${index} stays within vertical bounds at ${step}%`);
    }
  }
});

test("the central dice pair remains visible before the first roll without announcing a result", () => {
  const html = renderToStaticMarkup(React.createElement(DiceCradle, { dice: null }));
  assert.match(html, /aria-label="주사위 두 개"/);
  assert.match(html, /viewBox="0 0 220 110"/);
  assert.equal([...html.matchAll(/data-die=/g)].length, 2);
  assert.equal([...html.matchAll(/rotate\(0\) scale\(1\)/g)].length, 2);
});

test("shared artwork measurement requests each species once and notifies only mounted consumers", (t) => {
  const { subscribeSpriteArtwork, measureSpriteArtwork } = loadGameSource(
    "app/games/_components/pokemon-marble/sprite-artwork.ts",
  );
  const requests = [];
  const pixels = new Uint8ClampedArray(4 * 4 * 4);
  for (const pixel of [1, 2]) pixels[pixel * 4 + 3] = 255;
  let measurements = 0;
  const globals = {
    window: {
      Image: class {
        naturalWidth = 4;
        naturalHeight = 4;
        constructor() { requests.push(this); }
      },
    },
    document: {
      createElement: () => ({
        getContext: () => ({
          drawImage() {},
          getImageData() { measurements += 1; return { data: pixels }; },
        }),
      }),
    },
  };
  const original = new Map(Object.keys(globals).map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  for (const [name, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, name, { value, writable: true, configurable: true });
  }
  t.after(() => {
    for (const [name, descriptor] of original) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });
  let firstUpdates = 0;
  let secondUpdates = 0;
  const removeFirst = subscribeSpriteArtwork(25, () => { firstUpdates += 1; });
  const removeSecond = subscribeSpriteArtwork(25, () => { secondUpdates += 1; });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].src, "/pokemon-marble/sprites/25.png");
  removeFirst();
  requests[0].onload();
  assert.equal(firstUpdates, 0);
  assert.equal(secondUpdates, 1);
  assert.equal(measurements, 1);
  assert.equal(requests[0].onload, null);
  const removeThird = subscribeSpriteArtwork(25, () => {});
  assert.equal(requests.length, 1, "later consumers reuse the completed cache entry");
  assert.deepEqual(measureSpriteArtwork(requests[0]), { centerX: 0.5, centerY: 0.125, scale: 1.8 });
  removeSecond();
  removeThird();
});

test("native SVG portraits apply shared crop bounds and replace failed images with colored species names", () => {
  const loadPortraitBoard = (artwork) => loadGameSource(
    "app/games/_components/pokemon-marble/Board2D.tsx",
    { "app/games/_components/pokemon-marble/sprite-artwork.ts": { useSpriteArtwork: () => artwork } },
  ).default;
  const ReadyBoard = loadPortraitBoard({ status: "ready", bounds: { centerX: 0.6, centerY: 0.3, scale: 2 } });
  const ready = renderToStaticMarkup(React.createElement(ReadyBoard, props()));
  const image = ready.match(/<image href="[^"]+" x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)"/);
  assert.ok(image);
  assert.ok(Math.abs(Number(image[1]) + 72.96) < 1e-9);
  assert.ok(Math.abs(Number(image[2]) + 42.56) < 1e-9);
  assert.ok(Math.abs(Number(image[3]) - 121.6) < 1e-9);
  assert.match(ready, /clip-path="url\(#/);

  const FailedBoard = loadPortraitBoard({ status: "failed", bounds: null });
  const failed = renderToStaticMarkup(React.createElement(FailedBoard, props()));
  assert.doesNotMatch(failed, /<image/);
  assert.match(failed, /fill="#ef6559">피카츄<\/text>/);
});

test("HTML sprites show colored names on load failure and recover when the species changes", (t) => {
  let failedSpeciesId = null;
  t.mock.method(React, "useState", () => [failedSpeciesId, (next) => { failedSpeciesId = next; }]);
  const probes = [];
  let artworkStatus = "ready";
  const { PokemonSprite: Sprite } = loadGameSource(
    "app/games/_components/pokemon-marble/PokemonSprite.tsx",
    {
      "app/games/_components/pokemon-marble/sprite-artwork.ts": {
        useSpriteArtwork: (id, enabled) => {
          probes.push({ id, enabled });
          return { status: artworkStatus, bounds: null };
        },
      },
    },
  );
  const image = Sprite({ speciesId: 25, size: 80 });
  assert.equal(image.props.src, "/pokemon-marble/sprites/25.png");
  image.props.onError();
  const failed = renderToStaticMarkup(Sprite({ speciesId: 25, size: 80 }));
  assert.match(failed, /role="img" aria-label="피카츄"/);
  assert.match(failed, /color:#aa8508/);
  assert.doesNotMatch(failed, /<img/);
  const replacement = Sprite({ speciesId: 4, size: 80 });
  assert.equal(replacement.props.src, "/pokemon-marble/sprites/4.png");
  replacement.props.onLoad();
  assert.equal(failedSpeciesId, null);
  assert.ok(probes.every((entry) => entry.enabled === false), "ordinary setup images do not start artwork probes");

  artworkStatus = "failed";
  const fitted = renderToStaticMarkup(Sprite({ speciesId: 4, size: 144, fit: true }));
  assert.match(fitted, /aria-label="파이리"/);
  assert.match(fitted, /width:144px;height:144px/);
  assert.doesNotMatch(fitted, /<img/);
});
