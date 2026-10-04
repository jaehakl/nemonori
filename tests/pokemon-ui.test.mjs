import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadGameSource } from "./game-test-helpers.mjs";

function* renderedElements(node) {
  if (!React.isValidElement(node)) return;
  if (typeof node.type === "function") {
    yield* renderedElements(node.type(node.props));
    return;
  }
  yield node;
  for (const child of React.Children.toArray(node.props.children))
    yield* renderedElements(child);
}

test("party cards sort by level without mutating storage and identify the highest-level leader", () => {
  const { PartySummary } = loadGameSource("app/games/_components/pokemon-marble/ActionPanel.tsx");
  const { createGame } = loadGameSource("app/games/_components/pokemon-marble/engine.ts");
  const game = createGame([1], ["혼자"], 1);
  const low = game.players[0].party[0];
  game.players[0].party.push(
    { ...low, id: "high", speciesId: 4, level: 30, xp: 600, hp: 0 },
    { ...low, id: "tied", speciesId: 7, level: 30, xp: 300 },
  );
  const before = structuredClone(game.players[0].party);
  const html = renderToStaticMarkup(React.createElement(PartySummary, { state: game }));
  assert.ok(html.indexOf("파이리,") < html.indexOf("꼬부기,"));
  assert.ok(html.indexOf("꼬부기,") < html.indexOf("이상해씨,"));
  assert.equal((html.match(/class="leaderBadge"/g) ?? []).length, 1);
  assert.match(html, /혼자 모험 · 도로 0\/27/);
  assert.match(html, /aria-valuetext="60%"/);
  assert.deepEqual(game.players[0].party, before);
});

test("maximum-level XP meter communicates completion", () => {
  const { ExperienceBar } = loadGameSource("app/games/_components/pokemon-marble/PokemonSprite.tsx");
  const html = renderToStaticMarkup(React.createElement(ExperienceBar, { level: 100, xp: 0 }));
  assert.match(html, /aria-valuetext="최고 레벨"/);
  assert.match(html, /width:100%/);
  assert.match(html, />MAX<\/small>/);
  const nearlyLeveled = renderToStaticMarkup(React.createElement(ExperienceBar, { level: 50, xp: 999 }));
  assert.match(nearlyLeveled, /aria-valuetext="99%"/);
  assert.doesNotMatch(nearlyLeveled, />100%<\/small>/);
});

test("idle turn panel puts the only dice pair inside the player's roll button without old counters or copy", () => {
  const { default: ActionPanel } = loadGameSource("app/games/_components/pokemon-marble/ActionPanel.tsx");
  const { createGame } = loadGameSource("app/games/_components/pokemon-marble/engine.ts");
  const state = createGame([1], ["민지"], 1);
  const html = renderToStaticMarkup(React.createElement(ActionPanel, { state, dispatch() {}, onRestart() {} }));
  assert.match(html, /aria-label="이번 차례"/);
  assert.match(html, /<h3>민지<\/h3>/);
  assert.match(html, /aria-label="민지 주사위 굴리기"/);
  assert.match(html, /role="img" aria-label="주사위 두 개"/);
  assert.equal((html.match(/data-die=/g) ?? []).length, 2);
  assert.equal((html.match(/<button/g) ?? []).length, 1);
  assert.doesNotMatch(html, /TURN \d+|도로 \d+\/27|두 개의 주사위, 새로운 만남|연출 건너뛰기|턴 마치기/);
});

test("the dice image and next-player label share one button that dispatches exactly one roll action", () => {
  const { default: ActionPanel } = loadGameSource("app/games/_components/pokemon-marble/ActionPanel.tsx");
  const { createGame } = loadGameSource("app/games/_components/pokemon-marble/engine.ts");
  const { PLAYER_COLORS } = loadGameSource("app/games/_components/pokemon-marble/board.ts");
  for (const phase of ["roll", "center", "road", "turn-end"]) {
    const state = createGame([1, 4], ["민지", "준"], 1);
    state.phase = phase;
    state.dice = phase === "roll" ? null : [2, 3];
    const actions = [];
    const nodes = [...renderedElements(React.createElement(ActionPanel, {
      state, dispatch: (action) => actions.push(action), onRestart() {},
    }))];
    const buttons = nodes.filter((node) => node.type === "button");
    assert.equal(buttons.length, 1);
    const button = buttons[0];
    const playerId = phase === "roll" ? 0 : 1;
    assert.equal(button.props["aria-label"], `${state.players[playerId].name} 주사위 굴리기`);
    assert.equal(button.props.style["--player-color"], PLAYER_COLORS[playerId]);
    const content = [...renderedElements(button)];
    assert.equal(content.filter((node) => node.type === "svg").length, 1);
    assert.equal(content.filter((node) => node.props["data-die"] !== undefined).length, 2);
    assert.equal(content.filter((node) => typeof node.props.onClick === "function").length, 1);
    button.props.onClick();
    assert.deepEqual(actions, [{ type: phase === "roll" ? "ROLL" : "END_TURN_AND_ROLL" }]);
  }
});

test("the roll button identifies the actual next player and color after skipped rest turns", () => {
  const { default: ActionPanel } = loadGameSource("app/games/_components/pokemon-marble/ActionPanel.tsx");
  const { createGame } = loadGameSource("app/games/_components/pokemon-marble/engine.ts");
  const { PLAYER_COLORS } = loadGameSource("app/games/_components/pokemon-marble/board.ts");
  const state = createGame([1, 4, 7], ["민지", "준", "하늘"], 1);
  state.phase = "turn-end";
  state.dice = [1, 2];
  state.players[1].restTurnsRemaining = 1;
  state.players[1].party[0].hp = 0;
  const original = structuredClone(state);
  const nodes = [...renderedElements(React.createElement(ActionPanel, { state, dispatch() {}, onRestart() {} }))];
  const button = nodes.find((node) => node.type === "button");
  assert.equal(button.props["aria-label"], "하늘 주사위 굴리기");
  assert.equal(button.props.style["--player-color"], PLAYER_COLORS[2]);
  assert.deepEqual(state, original);
});

test("legacy pending captures retain a playable continuation choice", () => {
  const { default: ActionPanel } = loadGameSource("app/games/_components/pokemon-marble/ActionPanel.tsx");
  const { createGame } = loadGameSource("app/games/_components/pokemon-marble/engine.ts");
  const state = createGame([1], [], 1);
  state.phase = "capture";
  state.battle = {
    combat: loadGameSource("app/games/_components/pokemon-marble/combat-types.ts").createCombatState(),
    kind: "wild", defenderOwner: null, defenderPokemonId: "wild",
    attackerPokemonId: state.players[0].party[0].id,
    wild: { id: "wild", speciesId: 7, level: 2, xp: 0, hp: 0 },
    turn: "attacker", outcome: { kind: "knockout", winner: "attacker", legacyCapturePending: true }, lastAttack: null,
  };
  const html = renderToStaticMarkup(React.createElement(ActionPanel, { state, dispatch() {}, onRestart() {} }));
  assert.match(html, /이전 모험에서 남겨 둔 포획/);
  assert.match(html, />포획하기<\/button>/);
  assert.match(html, />놓아주기<\/button>/);
});
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

test("setup offers 1–4 local players, accessible search filters and blocks incomplete starts", () => {
  const html = renderSetup();
  assert.match(html, /aria-label="플레이어 수"/);
  for (const count of [1, 2, 3, 4])
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
  const { createGame, transitionWithEvents } = loadGameSource("app/games/_components/pokemon-marble/engine.ts");
  const { state: moving, events } = transitionWithEvents(createGame([1, 4], [], 4), { type: "ROLL" });
  const render = (presentation, reducedMotion = false) => renderToStaticMarkup(React.createElement(MovementPanel, {
    state: moving, presentation, reducedMotion,
  }));
  const rolling = render({ event: events[0], progress: 0.25 });
  assert.match(rolling, /주사위를 굴리고 있어요/);
  assert.match(rolling, /aria-label="주사위를 굴리는 중"/);
  for (const html of [rolling, render(null), render({ event: events[0], progress: 0.95 }), render({ event: events[0], progress: 0.25 }, true)]) {
    assert.match(html, /aria-label="주사위와 이동"/);
    assert.equal((html.match(/data-die=/g) ?? []).length, 2);
    assert.doesNotMatch(html, /<button|연출 건너뛰기|TURN \d+|도로 \d+\/27/);
  }
  for (const settled of [render(null), render({ event: events[0], progress: 0.95 }), render({ event: events[0], progress: 0.25 }, true)]) {
    assert.match(settled, new RegExp(`앞으로 ${moving.movement.remaining}칸`));
    assert.ok(settled.includes(`aria-label="주사위 ${moving.dice[0]} + ${moving.dice[1]}"`));
  }
});

test("wild battle offers HP-based capture odds only on the player's turn with party space", () => {
  const { default: ActionPanel } = loadGameSource("app/games/_components/pokemon-marble/ActionPanel.tsx");
  const { createGame } = loadGameSource("app/games/_components/pokemon-marble/engine.ts");
  const state = createGame([1, 4], [], 12);
  state.phase = "attack";
  state.battle = {
    combat: loadGameSource("app/games/_components/pokemon-marble/combat-types.ts").createCombatState(),
    kind: "wild", defenderOwner: null, defenderPokemonId: "wild",
    attackerPokemonId: state.players[0].party[0].id,
    wild: { id: "wild", speciesId: 7, level: 2, xp: 0, hp: 1 },
    turn: "attacker", outcome: null, lastAttack: null,
  };
  while (state.players[0].party.length < 6) {
    state.players[0].party.push({ ...state.players[0].party[0], id: `extra-${state.players[0].party.length}` });
  }
  const render = () => renderToStaticMarkup(React.createElement(ActionPanel, {
    state, dispatch: () => {}, onRestart: () => {},
  }));
  assert.match(render(), /파티가 가득 차 포획할 수 없습니다/);
  assert.match(render(), /<button class="captureButton" disabled=""/);
  assert.match(render(), /파티 가득 참/);
  state.players[0].party.pop();
  assert.doesNotMatch(render(), /<button class="captureButton" disabled=""/);
  assert.match(render(), /포켓볼 던지기, 성공률 \d+%/);
  state.battle.turn = "defender";
  assert.match(render(), /<button class="captureButton" disabled=""/);
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
  assert.match(html, /남은 HP 그대로/);
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
  assert.match(html, /미진화형 야생 포켓몬/);
  assert.match(html, /AI 상대가 없습니다/);
  assert.match(html, /파티와 도로 수비 포켓몬 모두/);
  assert.match(html, /교환/);
  assert.doesNotMatch(html, /교환 시작하기/);
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
  const target = { id: "wild", speciesId: 7, level: 1, xp: 0, hp: 0 };
  game.battle = {
    combat: loadGameSource("app/games/_components/pokemon-marble/combat-types.ts").createCombatState(),
    kind: "wild",
    defenderOwner: null,
    defenderPokemonId: target.id,
    attackerPokemonId: game.players[0].party[0].id,
    wild: target,
    turn: "attacker",
    outcome: { kind: "knockout", winner: "attacker" },
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
  const state = createGame([1, 4], ["민지", "준"], 12);
  state.dice = [3, 3];
  const render = () => renderToStaticMarkup(React.createElement(ActionPanel, { state, dispatch: () => {}, onRestart: () => {} }));
  for (const phase of ["center", "road", "turn-end"]) {
    state.phase = phase;
    assert.match(render(), /aria-label="민지 한 번 더 주사위 굴리기"/);
  }
  state.phase = "turn-end";
  assert.match(render(), /민지 한 번 더 주사위 굴리기/);
  state.players[0].restTurnsRemaining = 3;
  assert.doesNotMatch(render(), /한 번 더 주사위 굴리기/);
  assert.match(render(), /aria-label="준 주사위 굴리기"/);
  state.players[0].restTurnsRemaining = 0;
  state.dice = [3, 4];
  assert.match(render(), /aria-label="준 주사위 굴리기"/);
  assert.doesNotMatch(render(), /턴 마치기|한 번 더 주사위 굴리기/);
});
