import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { loadGameSource, pokemonBattleAction } from "./game-test-helpers.mjs";

const path = "app/games/_components/pokemon-marble/";
const { createGame, transition, snapshotForPresentation } = loadGameSource(`${path}engine.ts`);
const Setup = () => null;
const ActionPanel = () => null;
const PartySummary = () => null;
const TabletopControls = () => null;
const Empty = () => null;

function findElement(element, type) {
  if (!React.isValidElement(element)) return null;
  if (element.type === type) return element;
  for (const child of React.Children.toArray(element.props.children)) {
    const found = findElement(child, type);
    if (found) return found;
  }
  return null;
}

// Exercise the component's callbacks and render-time orientation while keeping
// browser audio, storage and animation timing outside this integration boundary.
function controls(t, state, mode = "auto") {
  const hooks = [];
  let cursor = 0;
  let changed = false;
  t.mock.method(React, "useState", (initial) => {
    const index = cursor++;
    if (!(index in hooks)) hooks[index] = typeof initial === "function" ? initial() : initial;
    return [hooks[index], (update) => {
      const next = typeof update === "function" ? update(hooks[index]) : update;
      if (!Object.is(hooks[index], next)) changed = true;
      hooks[index] = next;
    }];
  });
  t.mock.method(React, "useRef", (initial) => {
    const index = cursor++;
    if (!(index in hooks)) hooks[index] = { current: initial };
    return hooks[index];
  });
  t.mock.method(React, "useMemo", (calculate) => calculate());
  t.mock.method(React, "useCallback", (callback) => callback);
  t.mock.method(React, "useEffect", () => {});

  const saves = [];
  const batches = [];
  const experience = {
    frame: { event: null, progress: 1, session: 0 },
    busy: false,
    paused: false,
    reset() {},
    setScene() {},
    unlockAudio() {},
    isBlocked: () => experience.busy || experience.paused,
    enqueue(events) {
      batches.push(events);
      experience.frame = { event: events[0] ?? null, progress: 0, session: 1 };
      experience.busy = events.length > 0;
    },
  };
  const { default: PokemonMarble } = loadGameSource(`${path}PokemonMarble.tsx`, {
    [`${path}use-experience.ts`]: { useExperience: () => experience },
    [`${path}use-automatic-action.ts`]: { useAutomaticAction() {} },
    [`${path}load-save.ts`]: { loadPokemonSave: () => ({ ok: true, value: { data: state } }) },
    [`${path}display-preferences.ts`]: {
      loadDisplayPreferences: () => ({ mode }), saveDisplayPreferences() {},
    },
    "app/lib/save-protocol.ts": {
      saveGameSave(_slug, _title, next) { saves.push(next); return { ok: true }; },
    },
    [`${path}Setup.tsx`]: { __esModule: true, default: Setup },
    [`${path}ActionPanel.tsx`]: {
      __esModule: true, default: ActionPanel, MovementPanel: Empty, PartySummary, ExchangeControls: Empty,
    },
    [`${path}TabletopControls.tsx`]: { __esModule: true, default: TabletopControls },
  });
  function render() {
    let tree;
    let attempts = 0;
    do {
      cursor = 0;
      changed = false;
      tree = PokemonMarble();
      assert.ok(++attempts < 10, "render-time state updates settle");
    } while (changed);
    return tree;
  }
  findElement(render(), Setup).props.onResume();
  return { render, experience, saves, batches };
}

function endedTurn() {
  const state = createGame([1, 4], ["민준", "지우"], 9182, ["bottom", "left"]);
  state.phase = "turn-end";
  state.dice = [1, 2];
  return state;
}

test("combined rolling faces the next player immediately and keeps that seat during the roll", (t) => {
  const ui = controls(t, endedTurn());
  const initial = ui.render();
  assert.equal(findElement(initial, TabletopControls).props.seatSide, "bottom");
  findElement(initial, ActionPanel).props.dispatch({ type: "END_TURN_AND_ROLL" });
  assert.equal(ui.saves.length, 1);
  assert.equal(ui.saves[0].activePlayer, 1);
  assert.equal(ui.experience.frame.event.kind, "roll");
  assert.equal(ui.experience.frame.event.snapshot.activePlayerId, 1);
  assert.equal(findElement(ui.render(), TabletopControls).props.seatSide, "left");
  ui.experience.frame.progress = 0.5;
  assert.equal(findElement(ui.render(), TabletopControls).props.seatSide, "left");
});

test("fixed mode keeps combined rolling at the bottom while doubles retain their roller", (t) => {
  const state = endedTurn();
  state.activePlayer = 1;
  state.dice = [2, 2];
  const ui = controls(t, state, "fixed");
  findElement(ui.render(), ActionPanel).props.dispatch({ type: "END_TURN_AND_ROLL" });
  assert.equal(ui.saves[0].activePlayer, 1);
  const panel = findElement(ui.render(), TabletopControls);
  assert.equal(panel.props.mode, "fixed");
  assert.equal(panel.props.seatSide, "bottom");
});

test("a repeated click cannot roll again during presentation or through a stale callback", (t) => {
  const ui = controls(t, endedTurn());
  const dispatch = findElement(ui.render(), ActionPanel).props.dispatch;
  dispatch({ type: "END_TURN_AND_ROLL" });
  dispatch({ type: "END_TURN_AND_ROLL" });
  // A fresh callback has the committed revision, but presentation still blocks it.
  findElement(ui.render(), PartySummary).props.dispatch({ type: "STEP" });
  assert.equal(ui.saves.length, 1);
  assert.equal(ui.batches.length, 1);
  ui.experience.busy = false;
  ui.experience.frame.event = null;
  // STEP is valid in the new phase, so this specifically verifies the stale guard.
  dispatch({ type: "STEP" });
  assert.equal(ui.saves.length, 1);
  assert.equal(ui.batches.length, 1);
});

test("attack presentation keeps its initiating seat, then faces the next attacker", (t) => {
  let state = createGame([1, 4], [], 9182, ["bottom", "left"]);
  state.players[0].position = 1;
  state.players[1].position = 2;
  state.phase = "moving";
  state.dice = [1, 1];
  state.movement = { remaining: 1, encounters: [] };
  state = transition(state, { type: "STEP" });
  for (const owner of [1, 0]) {
    state = transition(state, { type: "CHOOSE_POKEMON", pokemonId: state.players[owner].party[0].id });
  }
  assert.equal(state.battle.turn, "defender");
  const ui = controls(t, state);
  const initial = ui.render();
  assert.equal(findElement(initial, TabletopControls).props.seatSide, "left");
  findElement(initial, ActionPanel).props.dispatch(pokemonBattleAction(state));
  assert.equal(ui.saves[0].battle.turn, "attacker");
  assert.equal(findElement(ui.render(), TabletopControls).props.seatSide, "left");
  ui.experience.busy = false;
  ui.experience.frame.event = null;
  assert.equal(findElement(ui.render(), TabletopControls).props.seatSide, "bottom");
});

test("reward and evolution overlays follow their owner and block input until the queue finishes", (t) => {
  const state = endedTurn();
  const ui = controls(t, state);
  const dispatch = findElement(ui.render(), ActionPanel).props.dispatch;
  const pokemon = { ...state.players[1].party[0], maxHp: 30 };
  for (const kind of ["lap", "evolution"]) {
    const event = {
      kind, playerId: 1, revision: state.revision, sequence: 0,
      snapshot: snapshotForPresentation(state), pokemon,
      previousSpeciesId: 4,
      growth: [{ before: pokemon, after: pokemon, amount: 0, location: { kind: "party" } }],
    };
    ui.experience.busy = true;
    ui.experience.frame = { event, progress: 0.5, session: 1 };
    const tabletop = findElement(ui.render(), TabletopControls);
    assert.equal(tabletop.props.seatSide, "bottom", "the initiating actor is still frozen");
    assert.equal(tabletop.props.overlay.seatSide, "left", "the celebration belongs to the other player");
    const presentation = tabletop.props.overlay.render({ width: 672, height: 1024 });
    assert.equal(presentation.props.event, event);
    assert.equal(presentation.props.progress, 0.5);
    assert.equal(presentation.props.width, 672);
    dispatch({ type: "END_TURN_AND_ROLL" });
    findElement(ui.render(), PartySummary).props.dispatch({ type: "END_TURN_AND_ROLL" });
    assert.equal(ui.saves.length, 0);
  }
  ui.experience.busy = false;
  ui.experience.frame.event = null;
  assert.equal(findElement(ui.render(), TabletopControls).props.overlay, undefined);
  dispatch({ type: "END_TURN_AND_ROLL" });
  assert.equal(ui.saves.length, 1);
});

test("resuming a saved evolution choice does not enqueue old rewards or animations", (t) => {
  const state = createGame([133], [], 9182);
  state.players[0].party[0].level = 19;
  state.players[0].position = 39;
  state.phase = "moving";
  state.dice = [1, 2];
  state.movement = { remaining: 2, encounters: [] };
  const saved = JSON.parse(JSON.stringify(transition(state, { type: "STEP" })));
  assert.equal(saved.phase, "evolution");
  const ui = controls(t, saved);
  assert.equal(ui.batches.length, 0);
  assert.equal(ui.saves.length, 0);
  const choice = findElement(ui.render(), ActionPanel);
  assert.deepEqual(choice.props.state.evolution, saved.evolution);
  choice.props.dispatch({ type: "CHOOSE_EVOLUTION", speciesId: 134 });
  assert.deepEqual(ui.batches[0].map((entry) => entry.kind), ["evolution"]);
  assert.equal(ui.saves[0].players[0].party[0].xp, saved.players[0].party[0].xp);
});
