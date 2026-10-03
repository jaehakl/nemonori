import assert from "node:assert/strict";
import test from "node:test";
import { loadGameSource } from "./game-test-helpers.mjs";

const path = "app/games/_components/pokemon-marble/";
const {
  createGame,
  transition,
  transitionWithEvents,
  getNextRollPlayer,
  getStats,
  hasExtraRoll,
} = loadGameSource(`${path}engine.ts`);
const { validateSave } = loadGameSource(`${path}save.ts`);

function game(count = 3, seed = 9182) {
  return createGame([1, 4, 7, 172].slice(0, count), ["민지", "준", "하늘", "지우"], seed);
}

function ready(state = game(), phase = "turn-end", dice = [1, 2]) {
  state.phase = phase;
  state.dice = dice;
  state.movement = { remaining: 0, encounters: [] };
  if (phase === "road") state.players[state.activePlayer].position = 2;
  return state;
}

function rest(player, remaining = 3) {
  player.restTurnsRemaining = remaining;
  player.party.forEach((pokemon) => { pokemon.hp = 0; });
}

function assertAtomicRoll(previous) {
  const original = structuredClone(previous);
  assert.ok(validateSave(previous));
  const preview = getNextRollPlayer(previous);
  const ended = transition(previous, { type: "END_TURN" });
  assert.deepEqual(preview, ended.players[ended.activePlayer]);
  const sequential = transition(ended, { type: "ROLL" });
  const result = transitionWithEvents(previous, { type: "END_TURN_AND_ROLL" });
  const { state, events } = result;

  assert.deepEqual(previous, original, "Neither preview nor transition may mutate the input");
  assert.deepEqual(state, { ...sequential, revision: previous.revision + 1 });
  assert.equal(state.activePlayer, preview.id);
  assert.equal(state.phase, "moving");
  assert.equal(state.movement.remaining, state.dice[0] + state.dice[1]);
  assert.equal(state.revision, previous.revision + 1);
  assert.deepEqual(events.map((event) => event.kind), ["roll"]);
  assert.equal(events[0].revision, state.revision);
  assert.equal(events[0].sequence, 0);
  assert.equal(events[0].playerId, preview.id);
  assert.equal(events[0].snapshot.activePlayerId, preview.id);
  assert.deepEqual(events[0].snapshot.dice, state.dice);
  assert.notEqual(events[0].snapshot.dice, state.dice);
  assert.ok(validateSave(state));
  assert.deepEqual(transition(previous, { type: "END_TURN_AND_ROLL" }), state);
  assert.deepEqual(
    transitionWithEvents(JSON.parse(JSON.stringify(previous)), { type: "END_TURN_AND_ROLL" }),
    result,
    "The saved input must replay the exact same dice and events",
  );
  return result;
}

test("ending and rolling is one revision with the same seeded dice, state and logs as two actions", () => {
  for (const count of [1, 2, 3, 4]) {
    for (const seed of [1, 9182, 15000]) {
      for (const phase of ["center", "road", "turn-end"]) {
        const initial = ready(game(count, seed), phase);
        const result = assertAtomicRoll(initial);
        const nextPlayer = count === 1 ? 0 : 1;
        assert.equal(result.state.activePlayer, nextPlayer);
        assert.equal(result.state.turn, initial.turn + 1);
        assert.match(result.state.log.at(-1), new RegExp(`^${initial.players[nextPlayer].name}: 주사위`));
      }
    }
  }
});

test("consecutive doubles keep the same player and preserve opponents' remaining rest", () => {
  let state = game(2);
  rest(state.players[1]);
  for (const dice of [[2, 2], [6, 6], [1, 1]]) {
    ready(state, "turn-end", dice);
    assert.equal(hasExtraRoll(state), true);
    const result = assertAtomicRoll(state);
    assert.equal(result.state.activePlayer, 0);
    assert.equal(result.state.turn, 1);
    assert.equal(result.state.players[1].restTurnsRemaining, 3);
    assert.match(result.state.log.at(-2), /더블! 한 번 더/);
    state = result.state;
  }
});

test("the roll skips resting players and logs recovery without delaying dice with presentation cues", () => {
  for (const remaining of [2, 1]) {
    const initial = ready();
    const player = initial.players[1];
    rest(player, remaining);
    player.box.push({ ...player.party[0], id: `p${initial.nextPokemonId++}` });
    const guardian = { ...player.party[0], id: `p${initial.nextPokemonId++}`, hp: 1 };
    initial.roads[4] = { ownerId: player.id, pokemon: guardian };
    const result = assertAtomicRoll(initial);
    assert.equal(result.state.activePlayer, 2);
    assert.equal(result.state.turn, initial.turn + 2);
    assert.equal(result.state.players[1].restTurnsRemaining, remaining - 1);
    for (const pokemon of [...result.state.players[1].party, ...result.state.players[1].box])
      assert.equal(pokemon.hp, remaining === 1 ? getStats(pokemon).hp : 0);
    assert.equal(result.state.roads[4].pokemon.hp, 1);
    assert.ok(result.state.log.some((message) => message.includes("준의 휴식 차례")));
    assert.equal(result.state.log.some((message) => message.includes("모두 회복")), remaining === 1);
  }
});

test("all resting players recover and the next eligible player immediately rolls, including solo play", () => {
  for (const count of [1, 4]) {
    const initial = ready(game(count), "turn-end", [6, 6]);
    initial.players.forEach((player) => rest(player));
    initial.movement = null;
    assert.equal(hasExtraRoll(initial), false);
    const result = assertAtomicRoll(initial);
    assert.equal(result.state.activePlayer, count === 1 ? 0 : 1);
    assert.ok(result.state.players.every((player) => player.restTurnsRemaining === 0));
    assert.ok(result.state.players.every((player) => player.party[0].hp === getStats(player.party[0]).hp));
    assert.ok(result.state.log.some((message) => message.includes("모두 회복")));
  }
});

test("exchange and party capacity block the combined action with the same end-turn guard", () => {
  for (const phase of ["center", "road", "turn-end"]) {
    for (const blockedBy of ["exchange", "capacity"]) {
      const initial = ready(game(), phase);
      if (blockedBy === "exchange") initial.exchangeActive = true;
      else {
        const party = initial.players[0].party;
        while (party.length < 7)
          party.push({ ...party[0], id: `p${initial.nextPokemonId++}` });
      }
      assert.equal(getNextRollPlayer(initial), null);
      for (const type of ["END_TURN", "END_TURN_AND_ROLL"]) {
        const result = transitionWithEvents(initial, { type });
        assert.equal(result.state, initial);
        assert.deepEqual(result.events, []);
      }
    }
  }
});

test("invalid phases and repeated clicks cannot roll again or consume more RNG", () => {
  for (const phase of ["roll", "moving", "choose-defender", "choose-attacker", "attack", "evolution", "capture", "finished"]) {
    const initial = { ...game(), phase };
    const before = structuredClone(initial);
    const result = transitionWithEvents(initial, { type: "END_TURN_AND_ROLL" });
    assert.equal(result.state, initial);
    assert.deepEqual(result.events, []);
    assert.deepEqual(initial, before);
    if (phase !== "roll") assert.equal(getNextRollPlayer(initial), null);
  }
  const { state } = assertAtomicRoll(ready());
  for (const type of ["END_TURN_AND_ROLL", "ROLL"]) {
    const repeated = transitionWithEvents(state, { type });
    assert.equal(repeated.state, state);
    assert.deepEqual(repeated.events, []);
  }
});

test("ordinary roll preview and a saved combined roll resume without another random draw", () => {
  const initial = game();
  assert.equal(getNextRollPlayer(initial), initial.players[0]);
  const { state } = assertAtomicRoll(ready(initial));
  const resumed = JSON.parse(JSON.stringify(state));
  assert.ok(validateSave(resumed));
  assert.deepEqual(transitionWithEvents(resumed, { type: "STEP" }), transitionWithEvents(state, { type: "STEP" }));
  assert.equal(getNextRollPlayer(resumed), null);
});
