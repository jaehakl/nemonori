import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { fixtureGame, loadGameSource } from "./game-test-helpers.mjs";

const catalog = loadGameSource("app/games/data.ts");

test("the empty registry exposes no games, tags, or old routes", () => {
  assert.deepEqual(catalog.gameCatalog, []);
  assert.deepEqual(catalog.allTags, []);
  for (const slug of ["baseball-manager", "robots-and-wizard", "tetris", "roguelike-rpg", "phaser-meteor-dodge", "phaser-border-collie-roundup", "bakery-tycoon", "phaser-joseon-warfront", "missing-game"]) {
    assert.equal(catalog.getGameBySlug(slug), undefined);
  }
});

test("catalog construction does not load game modules", () => {
  let calls = 0;
  const game = fixtureGame({ load: () => { calls += 1; throw new Error("Browser-only module"); } });
  const result = catalog.defineGameCatalog([game]);
  assert.equal(result[0].load, game.load);
  assert.equal(calls, 0);
});

test("invalid or duplicate slugs are rejected before routes are generated", () => {
  for (const slug of ["", "Test", "../test", "test/game", "test game", "-test", "test-", "test--game", "테스트"]) {
    assert.throws(() => catalog.defineGameCatalog([fixtureGame({ slug })]), /Invalid game slug/);
  }
  assert.throws(() => catalog.defineGameCatalog([fixtureGame(), fixtureGame()]), /Duplicate game slug/);
  assert.equal(catalog.isValidGameSlug("game-2"), true);
  assert.equal(catalog.isValidGameSlug(null), false);
});

test("catalog snapshots remain stable when the caller changes its inputs", () => {
  const source = [fixtureGame()];
  const result = catalog.defineGameCatalog(source);
  source[0].title = "Changed";
  source[0].tags.push("extra");
  source.push(fixtureGame({ slug: "another-game" }));
  assert.equal(result.length, 1);
  assert.equal(result[0].title, "테스트 게임");
  assert.deepEqual(result[0].tags, ["puzzle", "test"]);
});

test("search and tags combine, and resetting both returns the full catalog", () => {
  const games = [fixtureGame(), fixtureGame({ slug: "action-game", title: "액션", summary: "A fast arcade", tags: ["action"] })];
  assert.deepEqual(catalog.filterGameCatalog(games, " PUZZLE ", "puzzle"), [games[0]]);
  assert.deepEqual(catalog.filterGameCatalog(games, "테스트", "all"), [games[0]]);
  assert.deepEqual(catalog.filterGameCatalog(games, "arcade", "puzzle"), []);
  assert.deepEqual(catalog.filterGameCatalog(games, "", "all"), games);
});

test("the empty home page hides search and shows a clear status", () => {
  const { default: HomePage } = loadGameSource("app/page.tsx");
  const html = renderToStaticMarkup(React.createElement(HomePage));
  assert.match(html, /등록된 게임이 없습니다/);
  assert.match(html, /href="\/saves"/);
  assert.doesNotMatch(html, /<input|게임 검색 및 필터|검색 결과가 없습니다/);
});

test("no search results provide an accessible reset action", () => {
  const { CatalogResults } = loadGameSource("app/page.tsx");
  let resets = 0;
  const view = CatalogResults({ games: [], onReset: () => { resets += 1; } });
  const html = renderToStaticMarkup(view);
  assert.match(html, /검색 결과가 없습니다/);
  assert.match(html, /검색 및 필터 초기화/);
  assert.match(html, /role="status"/);
  view.props.children[1].props.onClick();
  assert.equal(resets, 1);
});

test("the empty game route has no static params and rejects unregistered URLs", async () => {
  const route = loadGameSource("app/games/[slug]/page.tsx");
  assert.deepEqual(route.generateStaticParams(), []);
  await assert.rejects(() => route.default({ params: Promise.resolve({ slug: "tetris" }) }), /NEXT_HTTP_ERROR_FALLBACK;404/);
  const metadata = await route.generateMetadata({ params: Promise.resolve({ slug: "tetris" }) });
  assert.match(metadata.title, /게임을 찾을 수 없습니다/);
});
