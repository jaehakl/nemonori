import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadGameSource } from "./game-test-helpers.mjs";

const { default: Setup, filterStarters } = loadGameSource(
  "app/games/_components/pokemon-marble/Setup.tsx",
);
const { speciesList, isStarter } = loadGameSource(
  "app/games/_components/pokemon-marble/pokemon-data.ts",
);
const { HealthBar, PokemonSprite, TypeBadge } = loadGameSource(
  "app/games/_components/pokemon-marble/PokemonSprite.tsx",
);
const renderSetup = (props = {}) =>
  renderToStaticMarkup(
    React.createElement(Setup, {
      loading: false,
      onStart: () => {},
      onResume: null,
      ...props,
    }),
  );

test("setup offers 2–4 local players, accessible search filters and blocks incomplete starts", () => {
  const html = renderSetup();
  assert.match(html, /aria-label="플레이어 수"/);
  for (const count of [2, 3, 4])
    assert.match(html, new RegExp(`>${count}인</button>`));
  assert.match(html, /aria-label="1번 트레이너 이름"/);
  assert.match(html, /aria-label="2번 트레이너 이름"/);
  assert.doesNotMatch(html, /aria-label="3번 트레이너 이름"/);
  assert.match(html, /aria-label="포켓몬 이름 또는 도감 번호 검색"/);
  assert.match(html, /aria-label="세대 필터"/);
  assert.match(html, /aria-label="타입 필터"/);
  assert.match(html, /<button[^>]*disabled=""[^>]*>모험 시작하기/);
  assert.doesNotMatch(html, /이전 모험 이어하기/);
  assert.match(renderSetup({ onResume: () => {} }), /이전 모험 이어하기/);
});

test("the initial setup page contains only the first 24 eligible starter cards", () => {
  const html = renderSetup();
  const cards = [
    ...html.matchAll(/<span class="dexNumber">#(\d+)<\/span>/g),
  ].map((match) => Number(match[1]));
  const eligible = speciesList.filter(isStarter);
  assert.deepEqual(
    cards,
    eligible.slice(0, 24).map((species) => species.id),
  );
  assert.match(html, new RegExp(`${eligible.length}종의 파트너`));
  assert.equal(cards.includes(2), false);
  assert.equal(cards.includes(25), false);
});

test("starter filters combine Korean or English names, dex number, generation and either type", () => {
  const ids = (query, generation = "all", type = "all") =>
    filterStarters(query, generation, type).map((species) => species.id);
  assert.deepEqual(ids(" 이상해씨 "), [1]);
  assert.deepEqual(ids("BULBASAUR"), [1]);
  assert.deepEqual(ids("0001"), [1]);
  assert.deepEqual(ids("0001", "1", "4"), [1]);
  assert.deepEqual(ids("0001", "1", "12"), [1]);
  assert.deepEqual(ids("0001", "2"), []);
  assert.deepEqual(ids("0001", "all", "10"), []);
  assert.deepEqual(ids("나오하", "9", "12"), [906]);
  assert.deepEqual(ids("뮤츠"), []);
  assert.deepEqual(ids("복숭악동"), []);
  assert.deepEqual(ids("이상해풀"), []);
  assert.deepEqual(ids("메타몽"), [132]);
  assert.deepEqual(ids("존재하지 않는 포켓몬"), []);
});

test("party visuals expose accessible HP values, fainting and local sprite assets", () => {
  const healthy = renderToStaticMarkup(
    React.createElement(HealthBar, { hp: 7, max: 12 }),
  );
  assert.match(healthy, /role="meter"/);
  assert.match(healthy, /aria-valuenow="7"/);
  assert.match(healthy, /aria-valuemax="12"/);
  assert.match(healthy, /7 \/ 12/);
  const fainted = renderToStaticMarkup(
    React.createElement(HealthBar, { hp: 0, max: 12 }),
  );
  assert.match(fainted, /행동불능/);
  assert.match(fainted, /width:0%/);
  const sprite = renderToStaticMarkup(
    React.createElement(PokemonSprite, { speciesId: 1025 }),
  );
  assert.match(sprite, /alt="복숭악동"/);
  assert.match(sprite, /src="\/pokemon-marble\/sprites\/1025.png"/);
  assert.match(
    renderToStaticMarkup(React.createElement(TypeBadge, { type: null })),
    /무상성/,
  );
});

test("the in-game guide explains capture HP, defeat and battle priority", () => {
  const { default: RulesDialog } = loadGameSource(
    "app/games/_components/pokemon-marble/RulesDialog.tsx",
  );
  const html = renderToStaticMarkup(
    React.createElement(RulesDialog, { onClose: () => {} }),
  );
  assert.match(html, /<dialog[^>]*aria-labelledby="dialog-title"/);
  assert.match(html, /HP 0으로 합류/);
  assert.match(html, /트레이너 배틀이 타일 효과보다 먼저/);
  assert.match(html, /즉시 탈락/);
  assert.match(html, /레벨업과 진화는 HP를 회복하지 않습니다/);
  assert.match(html, /aria-label="닫기"/);
});
