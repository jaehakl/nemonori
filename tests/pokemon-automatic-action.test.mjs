import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { loadGameSource } from "./game-test-helpers.mjs";

const path = "app/games/_components/pokemon-marble/";
const { createGame, transition } = loadGameSource(`${path}engine.ts`);
const { useAutomaticAction } = loadGameSource(`${path}use-automatic-action.ts`);

function AutomaticActionHarness({ state, blocked, session, dispatch }) {
  useAutomaticAction(state, blocked, session, dispatch);
  return null;
}

function automation(t) {
  let now = 0;
  let nextTimer = 0;
  let cleanup;
  const pending = { current: { key: "", remaining: 0 } };
  const timers = new Map();
  const actions = [];
  const originalWindow = globalThis.window;
  globalThis.window = {
    setTimeout(callback, delay) {
      const id = ++nextTimer;
      timers.set(id, { callback, at: now + delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
  };
  t.after(() => { cleanup?.(); globalThis.window = originalWindow; });
  t.mock.method(performance, "now", () => now);
  t.mock.method(React, "useRef", () => pending);
  t.mock.method(React, "useEffect", callback => {
    cleanup?.();
    cleanup = callback();
  });
  return {
    actions,
    timers,
    render(state, blocked = false, session = 1) {
      AutomaticActionHarness({ state, blocked, session,
        dispatch: (action, revision) => actions.push({ action, revision }) });
    },
    advance(elapsed) {
      now += elapsed;
      for (const [id, timer] of [...timers]) {
        if (timer.at <= now) {
          timers.delete(id);
          timer.callback();
        }
      }
    },
  };
}

function endedTurn(phase = "turn-end") {
  const state = createGame([1, 4], [], 9182);
  state.phase = phase;
  state.dice = [1, 2];
  state.dicePurpose = phase === "rest-end" ? "rest" : "movement";
  return state;
}

test("turn handoff waits for presentation and retains its delay across pauses", t => {
  const ui = automation(t);
  const state = endedTurn();
  ui.render(state, true);
  ui.advance(1000);
  assert.deepEqual(ui.actions, []);
  ui.render(state);
  ui.advance(100);
  ui.render(state, true);
  ui.advance(2000);
  assert.deepEqual(ui.actions, []);
  ui.render(state);
  ui.advance(249);
  assert.deepEqual(ui.actions, []);
  ui.advance(1);
  assert.deepEqual(ui.actions, [{ action: { type: "END_TURN" }, revision: state.revision }]);
});

test("handoff is saved as a separate action and never rolls the next player's dice", t => {
  const ui = automation(t);
  const state = endedTurn();
  ui.render(state);
  ui.advance(350);
  const next = transition(state, ui.actions[0].action);
  assert.equal(next.activePlayer, 1);
  assert.equal(next.phase, "roll");
  assert.equal(next.dice, null);
  ui.render(next);
  ui.advance(10000);
  assert.equal(ui.actions.length, 1);
});

test("rest completion and resumed legacy terminal phases hand off exactly once", t => {
  const ui = automation(t);
  for (const phase of ["rest-end", "road", "center"]) {
    const state = endedTurn(phase);
    ui.render(state, false, ui.actions.length + 1);
    ui.advance(350);
    assert.equal(ui.actions.at(-1).action.type, "END_TURN");
    ui.render(transition(state, { type: "END_TURN" }));
    ui.advance(1000);
  }
  assert.equal(ui.actions.length, 3);
});

test("required choices and unfinished exchanges prevent automatic handoff", t => {
  const ui = automation(t);
  for (const phase of ["roll", "rest-roll", "evolution", "capture", "finished"]) {
    const state = endedTurn(phase);
    ui.render(state);
    ui.advance(1000);
  }
  const exchanging = endedTurn("center");
  exchanging.exchangeActive = true;
  ui.render(exchanging);
  ui.advance(1000);
  assert.deepEqual(ui.actions, []);
});

test("a cancelled handoff callback cannot act on a newer turn", t => {
  const ui = automation(t);
  const state = endedTurn();
  ui.render(state);
  const staleCallback = [...ui.timers.values()][0].callback;
  const next = transition(state, { type: "END_TURN" });
  ui.render(next);
  staleCallback();
  ui.advance(1000);
  assert.deepEqual(ui.actions, []);
});
