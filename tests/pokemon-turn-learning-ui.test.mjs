import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadGameSource } from "./game-test-helpers.mjs";

const path = "app/games/_components/pokemon-marble/";
const { createGame, transitionWithEvents } = loadGameSource(`${path}engine.ts`);
const { default: MoveLearningPanel } = loadGameSource(`${path}MoveLearningPanel.tsx`);
const { default: ActionPanel, MovementPanel } = loadGameSource(`${path}ActionPanel.tsx`);
const { getMovePowerLabel, getMoveEffectSummary } = loadGameSource(`${path}move-description.ts`);
const { movesById } = loadGameSource(`${path}pokemon-data.ts`);

function* elements(node) {
  if (!React.isValidElement(node)) return;
  if (node.type.name === "PokemonSprite") return;
  if (typeof node.type === "function") {
    yield* elements(node.type(node.props));
    return;
  }
  yield node;
  for (const child of React.Children.toArray(node.props.children)) yield* elements(child);
}

test("learning shows the new move beside all four existing moves and dispatches replacement or skip", (t) => {
  t.mock.method(React, "useRef", () => ({ current: null }));
  t.mock.method(React, "useEffect", () => {});
  const state = createGame([4], ["민지"], 1);
  const pokemon = state.players[0].party[0];
  pokemon.moveIds = [52, 53, 877, 33];
  state.phase = "learn-move";
  state.growth = { resume: "movement", queue: [{ ownerId: 0, pokemonId: pokemon.id,
    pendingMoveIds: [894], consideredMoveIds: [] }] };
  const actions = [];
  const props = { state, dispatch: (action) => actions.push(action) };
  const original = structuredClone(state);
  const html = renderToStaticMarkup(React.createElement(MoveLearningPanel, props));
  for (const id of [52, 53, 877, 33, 894]) assert.ok(html.includes(movesById[id].name));
  for (const label of ["타입", "분류", "위력", "명중률", "효과", "새 기술", "현재 기술 4"])
    assert.ok(html.includes(label));
  assert.match(html, /고정 피해 · 상대 현재 HP의 절반/);
  assert.match(html, /고정 피해 · 직전에 받은 피해 × 1.5/);
  assert.match(html, /10% 확률로 상대에게 화상/);
  const buttons = [...elements(React.createElement(MoveLearningPanel, props))].filter((node) => node.type === "button");
  assert.equal(buttons.length, 5);
  for (const button of buttons) button.props.onClick();
  assert.deepEqual(actions, [52, 53, 877, 33, null].map((replaceMoveId) => ({ type: "CHOOSE_MOVE", replaceMoveId })));
  assert.deepEqual(state, original);
});

test("move descriptions expose variable power, guaranteed accuracy and material side effects", () => {
  assert.match(getMovePowerLabel(movesById[323]), /남은 HP 비례/);
  assert.match(getMovePowerLabel(movesById[205]), /연속 사용 시 증가/);
  assert.match(getMoveEffectSummary(movesById[63]).join(" "), /다음 행동에 휴식/);
  assert.match(getMoveEffectSummary(movesById[19]).join(" "), /충전 후 공격/);
  assert.match(getMoveEffectSummary(movesById[71]).join(" "), /50% 회복/);
  assert.match(getMoveEffectSummary(movesById[36]).join(" "), /반동/);
  assert.match(getMoveEffectSummary(movesById[206]).join(" "), /HP를 최소 1/);
  assert.deepEqual(getMoveEffectSummary(movesById[33]), ["추가 효과 없음"]);
});

test("an old three-slot choice offers adding into the empty slot alongside replacement and decline", (t) => {
  t.mock.method(React, "useRef", () => ({ current: null }));
  t.mock.method(React, "useEffect", () => {});
  const state = createGame([7], [], 1);
  const pokemon = state.players[0].party[0];
  pokemon.moveIds = [33, 55, 229];
  state.phase = "learn-move";
  state.growth = { resume: "movement", queue: [{ ownerId: 0, pokemonId: pokemon.id,
    pendingMoveIds: [44], consideredMoveIds: [33, 55, 229, 44] }] };
  const actions = [];
  const props = { state, dispatch: action => actions.push(action) };
  const html = renderToStaticMarkup(React.createElement(MoveLearningPanel, props));
  assert.match(html, /빈 네 번째 슬롯에 배우기/);
  assert.doesNotMatch(html, /모두 찼어요/);
  const buttons = [...elements(React.createElement(MoveLearningPanel, props))].filter(node => node.type === "button");
  for (const button of buttons) button.props.onClick();
  assert.deepEqual(actions, [{ type: "LEARN_MOVE" }, ...[33, 55, 229, null].map(replaceMoveId => ({ type: "CHOOSE_MOVE", replaceMoveId }))]);
});

test("rest rolls show escape feedback without movement progress, then retain a failed attempt result", () => {
  for (const seed of [1, 9182]) {
    const state = createGame([1, 4], ["민지", "준"], seed);
    state.phase = "rest-roll";
    state.players[0].restTurnsRemaining = 2;
    state.players[0].party[0].hp = 0;
    const result = transitionWithEvents(state, { type: "ROLL" });
    const event = result.events.find((entry) => entry.kind === "roll");
    assert.ok(event);
    const render = (progress) => renderToStaticMarkup(React.createElement(MovementPanel, {
      state: result.state, presentation: { event, progress },
    }));
    assert.match(render(0.25), /탈출 주사위를 굴리고 있어요/);
    assert.doesNotMatch(render(0.25), /이동 진행|앞으로/);
    assert.doesNotMatch(render(1), /이동 진행/);
    if (result.state.phase === "rest-end") {
      assert.match(render(1), /더블이 아니에요/);
      const settled = renderToStaticMarkup(React.createElement(ActionPanel, {
        state: result.state, dispatch() {}, onRestart() {},
      }));
      assert.match(settled, /더블이 아니에요/);
      assert.match(settled, /남은 휴식 1턴/);
      assert.match(settled, /턴만 마치기/);
      assert.doesNotMatch(settled, /다음 포켓몬센터로 이동/);
    } else {
      assert.match(render(1), /더블! 모두 회복하고/);
    }
  }
});

test("voluntary center and turn-only buttons preserve separate choices", () => {
  const state = createGame([1, 4], [], 1);
  state.phase = "turn-end";
  state.dice = [1, 2];
  state.dicePurpose = "movement";
  const actions = [];
  const buttons = [...elements(React.createElement(ActionPanel, {
    state, dispatch: (action) => actions.push(action), onRestart() {},
  }))].filter((node) => node.type === "button");
  const center = buttons.find((node) => React.Children.toArray(node.props.children).join("").includes("포켓몬센터"));
  const end = buttons.find((node) => node.props.children === "턴만 마치기");
  assert.ok(center);
  assert.ok(end);
  center.props.onClick();
  end.props.onClick();
  assert.deepEqual(actions, [{ type: "MOVE_TO_CENTER" }, { type: "END_TURN" }]);
});
