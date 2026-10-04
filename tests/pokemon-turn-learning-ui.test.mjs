import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadGameSource } from "./game-test-helpers.mjs";

const path = "app/games/_components/pokemon-marble/";
const { createGame, transitionWithEvents } = loadGameSource(`${path}engine.ts`);
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
      assert.doesNotMatch(settled, /턴만 마치기|주사위 굴리기/);
      assert.doesNotMatch(settled, /다음 포켓몬센터로 이동/);
    } else {
      assert.match(render(1), /더블! 모두 회복하고/);
    }
  }
});

test("completed turns expose no voluntary action buttons", () => {
  const state = createGame([1, 4], [], 1);
  state.phase = "turn-end";
  state.dice = [1, 2];
  state.dicePurpose = "movement";
  const buttons = [...elements(React.createElement(ActionPanel, {
    state, dispatch() {}, onRestart() {},
  }))].filter((node) => node.type === "button");
  assert.equal(buttons.length, 0);
});
