import assert from "node:assert/strict";
import test from "node:test";
import { loadGameSource } from "./game-test-helpers.mjs";

const path = "app/games/_components/pokemon-marble/";
const { createGame, transition, transitionWithEvents, getNextRollPlayer, getStats, hasExtraRoll, canEndTurn } = loadGameSource(`${path}engine.ts`);
const { validateSave } = loadGameSource(`${path}save.ts`);

function game(count = 3, seed = 9182) {
  return createGame([1, 4, 7, 172].slice(0, count), ["민지", "준", "하늘", "지우"], seed);
}
function ready(state = game(), dice = [1, 2]) {
  state.phase = "turn-end";
  state.dice = dice;
  state.dicePurpose = "movement";
  state.movement = { remaining: 0, encounters: [] };
  return state;
}
function rest(player, remaining = 3) {
  player.restTurnsRemaining = remaining;
  player.party.forEach((pokemon) => { pokemon.hp = 0; });
}

test("automatic handoff opens the next player's actions without rolling or consuming RNG", () => {
  for (const count of [1, 2, 3, 4]) {
    const previous = ready(game(count));
    const original = structuredClone(previous);
    assert.ok(canEndTurn(previous));
    assert.equal(getNextRollPlayer(previous), null);
    const { state, events } = transitionWithEvents(previous, { type: "END_TURN" });
    assert.deepEqual(previous, original);
    assert.equal(state.activePlayer, count === 1 ? 0 : 1);
    assert.equal(state.turn, previous.turn + 1);
    assert.equal(state.phase, "roll");
    assert.equal(state.dice, null);
    assert.equal(state.movement, null);
    assert.equal(state.rng, previous.rng);
    assert.equal(state.revision, previous.revision + 1);
    assert.equal(getNextRollPlayer(state), state.players[state.activePlayer]);
    assert.deepEqual(events.map(event => event.kind), ["turn"]);
    assert.equal(events[0].snapshot.activePlayerId, state.activePlayer);
    assert.ok(validateSave(state));
    assert.equal(transition(state, { type: "END_TURN" }), state);
    assert.equal(transition(previous, { type: "END_TURN_AND_ROLL" }), previous);
  }
});

test("movement doubles reopen the same player's actions without changing the turn or rest counters", () => {
  for (const dice of [[1, 1], [2, 2], [6, 6]]) {
    const previous = ready(game(2), dice);
    rest(previous.players[1]);
    assert.ok(hasExtraRoll(previous));
    const result = transition(previous, { type: "END_TURN" });
    assert.equal(result.activePlayer, 0);
    assert.equal(result.turn, previous.turn);
    assert.equal(result.phase, "roll");
    assert.equal(result.rng, previous.rng);
    assert.equal(result.players[1].restTurnsRemaining, 3);
    assert.equal(result.dicePurpose, null);
  }
});

test("handoff shows a resting player their own roll before consuming one rest attempt", () => {
  for (const remaining of [2, 1]) {
    const previous = ready();
    previous.rng = 12345;
    rest(previous.players[1], remaining);
    let state = transition(previous, { type: "END_TURN" });
    assert.equal(state.phase, "rest-roll");
    assert.equal(state.activePlayer, 1);
    assert.equal(state.players[1].restTurnsRemaining, remaining);
    assert.equal(state.rng, previous.rng);
    state = transition(state, { type: "ROLL" });
    assert.equal(state.phase, "rest-end");
    assert.equal(state.players[1].restTurnsRemaining, remaining - 1);
    assert.equal(state.players[1].party[0].hp, remaining === 1 ? getStats(state.players[1].party[0]).hp : 0);
    assert.ok(canEndTurn(state));
    assert.equal(transition(state, { type: "END_TURN" }).activePlayer, 2);
  }
});

test("rest doubles never grant a second roll after movement finishes", () => {
  const previous = ready(game(2), [6, 6]);
  previous.dicePurpose = "rest";
  assert.equal(hasExtraRoll(previous), false);
  assert.equal(transition(previous, { type: "END_TURN" }).activePlayer, 1);
});

test("exchange and a temporary seventh party member block rolling and handoff", () => {
  for (const phase of ["roll", "turn-end"]) {
    for (const reason of ["exchange", "capacity"]) {
      const state = phase === "roll" ? game() : ready();
      if (reason === "exchange") state.exchangeActive = true;
      else while (state.players[0].party.length < 7)
        state.players[0].party.push({ ...state.players[0].party[0], id: `p${state.nextPokemonId++}` });
      assert.equal(getNextRollPlayer(state), null);
      assert.equal(canEndTurn(state), false);
      for (const type of ["ROLL", "END_TURN", "END_TURN_AND_ROLL"])
        assert.equal(transition(state, { type }), state);
    }
  }
});

test("rolling consumes one seeded result and cannot repeat through a stale click or save", () => {
  const initial = game();
  const { state, events } = transitionWithEvents(initial, { type: "ROLL" });
  assert.equal(state.phase, "moving");
  assert.equal(events[0].kind, "roll");
  assert.deepEqual(transitionWithEvents(structuredClone(initial), { type: "ROLL" }), { state, events });
  assert.equal(getNextRollPlayer(state), null);
  assert.equal(transition(state, { type: "ROLL" }), state);
  assert.equal(transition(state, { type: "END_TURN" }), state);
  const saved = JSON.parse(JSON.stringify(state));
  assert.ok(validateSave(saved));
  assert.deepEqual(transition(saved, { type: "STEP" }), transition(state, { type: "STEP" }));
});
