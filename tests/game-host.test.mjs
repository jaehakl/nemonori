import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { deferred, fixtureGame, flushPromises, loadGameSource } from "./game-test-helpers.mjs";

const { startGameLoad } = loadGameSource("app/games/_components/game-loader.ts");

test("a registered game renders deterministic loading HTML without importing on the server", () => {
  let calls = 0;
  const game = fixtureGame({ load: () => { calls += 1; throw new Error("window is unavailable"); } });
  const { GameHost } = loadGameSource("app/games/_components/GameHost.tsx", {
    "app/games/data.ts": { getGameBySlug: () => game },
  });
  const first = renderToStaticMarkup(React.createElement(GameHost, { slug: game.slug }));
  const second = renderToStaticMarkup(React.createElement(GameHost, { slug: game.slug }));
  assert.equal(first, second);
  assert.match(first, /게임을 불러오는 중입니다/);
  assert.match(first, /role="status"/);
  assert.equal(calls, 0);
});

test("missing client registrations show a way back to the catalog", () => {
  const { GameHost } = loadGameSource("app/games/_components/GameHost.tsx");
  const html = renderToStaticMarkup(React.createElement(GameHost, { slug: "missing-game" }));
  assert.match(html, /등록되지 않은 게임/);
  assert.match(html, /href="\/"/);
});

test("a resolved loader publishes the component", async () => {
  const View = () => null;
  const results = [];
  startGameLoad(async () => ({ default: View }), (result) => results.push(result));
  await flushPromises();
  assert.deepEqual(results, [{ status: "ready", View }]);
});

test("rejections and synchronous loader failures produce an error result", async () => {
  for (const load of [async () => { throw new Error("Import failed"); }, () => { throw new Error("Startup failed"); }]) {
    const results = [];
    startGameLoad(load, (result) => results.push(result));
    await flushPromises();
    assert.deepEqual(results, [{ status: "error" }]);
  }
});

test("cleanup suppresses both late success and late failure", async () => {
  for (const fails of [false, true]) {
    const pending = deferred();
    const results = [];
    const cancel = startGameLoad(() => pending.promise, (result) => results.push(result));
    cancel();
    cancel();
    if (fails) pending.reject(new Error("Late error"));
    else pending.resolve({ default: () => null });
    await flushPromises();
    assert.deepEqual(results, []);
  }
});

test("retry calls the loader again after a failed attempt", async () => {
  let calls = 0;
  const View = () => null;
  const load = async () => {
    calls += 1;
    if (calls === 1) throw new Error("Temporary failure");
    return { default: View };
  };
  const results = [];
  startGameLoad(load, (result) => results.push(result));
  await flushPromises();
  startGameLoad(load, (result) => results.push(result));
  await flushPromises();
  assert.equal(calls, 2);
  assert.deepEqual(results, [{ status: "error" }, { status: "ready", View }]);
});

test("a cancelled attempt cannot replace a newer loaded game", async () => {
  const old = deferred();
  const View = () => null;
  const results = [];
  const cancel = startGameLoad(() => old.promise, (result) => results.push(result));
  cancel();
  startGameLoad(async () => ({ default: View }), (result) => results.push(result));
  await flushPromises();
  old.resolve({ default: () => null });
  await flushPromises();
  assert.deepEqual(results, [{ status: "ready", View }]);
});

test("the error fallback exposes a retry action", () => {
  const { GameLoadError } = loadGameSource("app/games/_components/GameErrorBoundary.tsx");
  let retries = 0;
  const view = GameLoadError({ onRetry: () => { retries += 1; } });
  const html = renderToStaticMarkup(view);
  assert.match(html, /role="alert"/);
  assert.match(html, /다시 시도/);
  view.props.children[1].props.onClick();
  assert.equal(retries, 1);
});
