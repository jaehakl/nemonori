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
  assert.match(html, /aria-label="1번 트레이너 자리"/);
  assert.match(html, /value="bottom" selected=""/);
  assert.match(html, /value="top" selected=""/);
  assert.match(html, /조작자 방향으로 자동 회전/);
  assert.match(html, /모두 Lv\. 3/);
  assert.doesNotMatch(html, /aria-label="3번 트레이너 이름"/);
  assert.match(html, /aria-label="포켓몬 이름 또는 도감 번호 검색"/);
  assert.match(html, /aria-label="세대 필터"/);
  assert.match(html, /aria-label="타입 필터"/);
  assert.match(html, /<button[^>]*disabled=""[^>]*>모험 시작하기/);
  assert.doesNotMatch(html, /이전 모험 이어하기/);
  assert.match(renderSetup({ onResume: () => {} }), /이전 모험 이어하기/);
});

test("party cards reveal only the active player's party, with large art and fainted HP", () => {
  const { PartySummary } = loadGameSource("app/games/_components/pokemon-marble/ActionPanel.tsx");
  const { createGame } = loadGameSource("app/games/_components/pokemon-marble/engine.ts");
  const game = createGame([1, 4], ["민지", "준"], 1);
  game.players[0].party[0].hp = 0;
  game.players[0].restTurnsRemaining = 3;
  const html = renderToStaticMarkup(React.createElement(PartySummary, { state: game }));
  assert.match(html, /민지의 파티/);
  assert.match(html, /이상해씨/);
  assert.match(html, /width="144"/);
  assert.match(html, /행동불능/);
  assert.match(html, /휴식 3턴/);
  assert.doesNotMatch(html, /준|파이리/);
  game.activePlayer = 1;
  const next = renderToStaticMarkup(React.createElement(PartySummary, { state: game }));
  assert.match(next, /준의 파티/);
  assert.match(next, /파이리/);
  assert.doesNotMatch(next, /민지|이상해씨/);
});

test("legacy saves are reported separately without altering stored data", () => {
  const { createGame } = loadGameSource("app/games/_components/pokemon-marble/engine.ts");
  const legacy = { version: 1, players: [{ name: "기존 플레이어" }] };
  const original = structuredClone(legacy);
  let stored = { ok: true, value: { data: legacy } };
  const { loadPokemonSave } = loadGameSource("app/games/_components/pokemon-marble/load-save.ts", {
    "app/lib/save-protocol.ts": { loadGameSave: () => stored },
  });
  const result = loadPokemonSave();
  assert.equal(result.ok, false);
  assert.match(result.error.message, /이전 32칸 버전/);
  assert.deepEqual(legacy, original);
  stored = { ok: true, value: { data: createGame([1, 4], [], 1) } };
  assert.equal(loadPokemonSave().ok, true);
  stored = { ok: true, value: { data: { version: 2 } } };
  assert.equal(loadPokemonSave().ok, false);
  stored = { ok: true, value: null };
  assert.deepEqual(loadPokemonSave(), stored);
  stored = { ok: false, error: { code: "storage-unavailable", message: "저장소 접근 불가" } };
  assert.deepEqual(loadPokemonSave(), stored);
});

test("movement feedback stays present between step animations and counts remaining spaces", () => {
  const { MovementPanel } = loadGameSource("app/games/_components/pokemon-marble/ActionPanel.tsx");
  const { createGame, transition } = loadGameSource("app/games/_components/pokemon-marble/engine.ts");
  const moving = transition(createGame([1, 4], [], 4), { type: "ROLL" });
  const render = (rolling, busy) => renderToStaticMarkup(React.createElement(MovementPanel, {
    state: moving, rolling, busy, onSkip: () => {},
  }));
  assert.match(render(true, true), /주사위를 굴리고 있어요/);
  const betweenSteps = render(false, false);
  assert.match(betweenSteps, /aria-label="주사위와 이동"/);
  assert.match(betweenSteps, new RegExp(`앞으로 ${moving.movement.remaining}칸`));
  assert.match(betweenSteps, /disabled=""/);
  assert.doesNotMatch(render(false, true), /disabled=""/);
});

test("a full party cannot capture and is directed to the Pokemon Center", () => {
  const { default: ActionPanel } = loadGameSource("app/games/_components/pokemon-marble/ActionPanel.tsx");
  const { createGame } = loadGameSource("app/games/_components/pokemon-marble/engine.ts");
  const state = createGame([1, 4], [], 12);
  state.phase = "capture";
  state.battle = {
    kind: "wild", defenderOwner: null, defenderPokemonId: "wild",
    attackerPokemonId: state.players[0].party[0].id,
    wild: { id: "wild", speciesId: 7, level: 2, hp: 0 },
    turn: "attacker", winner: "attacker", lastAttack: null,
  };
  while (state.players[0].party.length < 6) {
    state.players[0].party.push({ ...state.players[0].party[0], id: `extra-${state.players[0].party.length}` });
  }
  const render = () => renderToStaticMarkup(React.createElement(ActionPanel, {
    state, dispatch: () => {}, onRestart: () => {},
  }));
  assert.match(render(), /파티 6칸이 모두 차서 포획할 수 없습니다/);
  assert.match(render(), /<button[^>]*disabled=""[^>]*>포획하기<\/button>/);
  assert.match(render(), /<button[^>]*>놓아주기<\/button>/);
  state.players[0].party.pop();
  assert.doesNotMatch(render(), /<button[^>]*disabled=""[^>]*>포획하기<\/button>/);
  assert.match(render(), /포획하면 파티에 합류/);
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
  assert.match(html, /파티가 6마리면 포획할 수 없습니다/);
  assert.match(html, /박스는 센터에서만 이용/);
  assert.match(html, /스타팅 포켓몬은 레벨 3/);
  assert.match(html, /1~3 중 무작위/);
  assert.match(html, /트레이너 배틀은 타일 효과보다 먼저/);
  assert.match(html, /정확히 같은 칸에 멈춰야 배틀/);
  assert.match(html, /연속 더블도 허용/);
  assert.match(html, /본인 차례 3번을 쉬고/);
  assert.match(html, /도로 27칸을 모두 소유하면 즉시 승리/);
  assert.match(html, /40칸 탑뷰/);
  assert.doesNotMatch(html, /즉시 탈락|마지막 생존자/);
  assert.match(html, /레벨업과 진화는 HP를 회복하지 않습니다/);
  assert.match(html, /aria-label="닫기"/);
});

test("battle stage HP changes on impact and retains the finishing attack snapshot", () => {
  const { BattleHud } = loadGameSource(
    "app/games/_components/pokemon-marble/GameBoard.tsx",
  );
  const { createGame, snapshotForPresentation, getStats } = loadGameSource(
    "app/games/_components/pokemon-marble/engine.ts",
  );
  const { getAvailableMoves } = loadGameSource(
    "app/games/_components/pokemon-marble/pokemon-data.ts",
  );
  const game = createGame([1, 4], ["민지", "준"], 15);
  const target = { id: "wild", speciesId: 7, level: 1, hp: 0 };
  game.battle = {
    kind: "wild",
    defenderOwner: null,
    defenderPokemonId: target.id,
    attackerPokemonId: game.players[0].party[0].id,
    wild: target,
    turn: "attacker",
    winner: "attacker",
    lastAttack: null,
  };
  const snapshot = snapshotForPresentation(game);
  const move = getAvailableMoves(1, 1)[0];
  const event = {
    kind: "attack",
    revision: 4,
    sequence: 0,
    playerId: 0,
    tile: 1,
    message: "마지막 공격",
    snapshot,
    attack: {
      side: "attacker",
      moveId: move.id,
      moveType: move.type,
      category: move.category,
      damage: 9,
      effectiveness: 1,
      beforeHp: 9,
      afterHp: 0,
    },
  };
  const render = (progress) =>
    renderToStaticMarkup(
      React.createElement(BattleHud, {
        battle: snapshot.battle,
        presentation: { event, progress },
      }),
    );
  assert.equal(snapshot.battle.defender.hp, 0);
  assert.equal(snapshot.battle.defender.maxHp, getStats(target).hp);
  assert.match(render(0.3), /aria-valuenow="9"/);
  assert.doesNotMatch(render(0.3), /행동불능|−9/);
  assert.match(render(0.45), /aria-valuenow="0"/);
  assert.match(render(0.45), /행동불능/);
  assert.match(render(0.45), /−9/);
  game.battle = null;
  assert.match(render(0.8), /꼬부기/);
});


test("double roll controls wait for tile actions and explain the extra opportunity", () => {
  const { default: ActionPanel } = loadGameSource("app/games/_components/pokemon-marble/ActionPanel.tsx");
  const { createGame } = loadGameSource("app/games/_components/pokemon-marble/engine.ts");
  const state = createGame([1, 4], [], 12);
  state.dice = [3, 3];
  const render = () => renderToStaticMarkup(React.createElement(ActionPanel, { state, dispatch: () => {}, onRestart: () => {} }));
  for (const phase of ["center", "road", "turn-end"]) {
    state.phase = phase;
    assert.match(render(), /한 번 더 굴리기/);
  }
  state.phase = "turn-end";
  assert.match(render(), /더블! 한 번 더 주사위를/);
  state.players[0].restTurnsRemaining = 3;
  assert.doesNotMatch(render(), /한 번 더 굴리기/);
  state.players[0].restTurnsRemaining = 0;
  state.dice = [3, 4];
  assert.match(render(), /턴 마치기/);
  assert.doesNotMatch(render(), /한 번 더 굴리기/);
});
