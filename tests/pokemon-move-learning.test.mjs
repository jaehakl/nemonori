import assert from "node:assert/strict";
import test from "node:test";
import { loadGameSource } from "./game-test-helpers.mjs";

const path = "app/games/_components/pokemon-marble/";
const { createGame, transition, transitionWithEvents, getStats, getActingPlayer, getBattleCommands, hasExtraRoll } = loadGameSource(`${path}engine.ts`);
const { getAvailableMoves, getPokemonMoves, movesById } = loadGameSource(`${path}pokemon-data.ts`);
const { getMoveUnavailableReason } = loadGameSource(`${path}battle.ts`);
const { createCombatState } = loadGameSource(`${path}combat-types.ts`);
const { parseGameSave, validateSave } = loadGameSource(`${path}save.ts`);

function pokemon(state, speciesId, level, moveIds = getAvailableMoves(speciesId, level).map((move) => move.id)) {
  const value = { id: `p${state.nextPokemonId++}`, speciesId, level, xp: 0, hp: 0, moveIds };
  value.hp = getStats(value).hp;
  return value;
}

function lap(state) {
  state.players[0].position = 39;
  state.phase = "moving";
  state.dice = [1, 2];
  state.dicePurpose = "movement";
  state.movement = { remaining: 2, encounters: [] };
  return transitionWithEvents(state, { type: "STEP" });
}

function skipMoves(state) {
  while (state.phase === "learn-move") state = transition(state, { type: "CHOOSE_MOVE", replaceMoveId: null });
  return state;
}

test("empty move slots fill automatically when lap rewards cross a learning level", () => {
  const state = createGame([7], [], 1);
  state.players[0].party = [pokemon(state, 7, 7, [33, 55])];
  const result = lap(state);
  assert.deepEqual(result.state.players[0].party[0].moveIds, [33, 55, 229]);
  assert.equal(result.state.phase, "moving");
  assert.equal(result.state.growth, null);
  assert.deepEqual(result.events[1].growth[0].before.moveIds, [33, 55]);
});

test("the fourth slot fills automatically without replacing the three selected moves", () => {
  const state = createGame([7], [], 1);
  state.players[0].party = [pokemon(state, 7, 11, [33, 55, 229])];
  const result = lap(state).state;
  assert.deepEqual(result.players[0].party[0].moveIds, [33, 55, 229, 44]);
  assert.equal(result.phase, "moving");
  assert.equal(result.growth, null);
  assert.deepEqual(parseGameSave(result), result);
});

test("old v5 three-slot choices load unchanged and can add, replace or decline before resuming", () => {
  const state = createGame([7], [], 1);
  state.players[0].party = [pokemon(state, 7, 11, [33, 55, 229, 57])];
  const pending = lap(state).state;
  // Recreate an earlier v5 save paused at the old capacity.
  pending.players[0].party[0].moveIds.pop();
  pending.growth.queue[0].consideredMoveIds = pending.growth.queue[0].consideredMoveIds.filter(id => id !== 57);
  const original = structuredClone(pending);
  const restored = parseGameSave(JSON.parse(JSON.stringify(pending)));
  assert.deepEqual(restored, original);
  for (const [action, expected] of [
    [{ type: "LEARN_MOVE" }, [33, 55, 229, 44]],
    [{ type: "CHOOSE_MOVE", replaceMoveId: 33 }, [44, 55, 229]],
    [{ type: "CHOOSE_MOVE", replaceMoveId: null }, [33, 55, 229]],
  ]) {
    const { state: next, events } = transitionWithEvents(restored, action);
    assert.deepEqual(next.players[0].party[0].moveIds, expected);
    for (const key of ["hp", "xp", "level"])
      assert.equal(next.players[0].party[0][key], restored.players[0].party[0][key]);
    assert.equal(next.rng, restored.rng);
    assert.equal(next.phase, "moving");
    assert.equal(next.movement.remaining, restored.movement.remaining);
    assert.deepEqual(events, []);
    assert.deepEqual(parseGameSave(next), next);
    assert.equal(transition(next, action), next);
  }
  assert.deepEqual(pending, original);
  const corrupt = structuredClone(restored);
  corrupt.players[0].party[0].moveIds.pop();
  assert.equal(validateSave(corrupt), false);
});

test("full slots wait for a valid replacement or decline and retain the decision through evolution", () => {
  const state = createGame([7], [], 1);
  state.players[0].party = [pokemon(state, 7, 11, [33, 55, 229, 57])];
  state.players[0].party[0].xp = 900;
  const paused = lap(state).state;
  assert.equal(paused.phase, "learn-move");
  assert.equal(paused.growth.queue[0].pendingMoveIds[0], 44);
  assert.deepEqual(paused.players[0].party[0].moveIds, [33, 55, 229, 57]);
  assert.equal(transition(paused, { type: "CHOOSE_MOVE", replaceMoveId: 99999 }), paused);
  assert.equal(transition(paused, { type: "LEARN_MOVE" }), paused);
  assert.deepEqual(parseGameSave(paused), paused);
  const choice = { type: "CHOOSE_MOVE", replaceMoveId: 33 };
  const learned = transition(paused, choice);
  assert.deepEqual(learned, transition(JSON.parse(JSON.stringify(paused)), choice));
  assert.deepEqual(learned.players[0].party[0].moveIds, [44, 55, 229, 57]);
  assert.equal(learned.players[0].party[0].xp, paused.players[0].party[0].xp);
  assert.equal(learned.players[0].party[0].level, paused.players[0].party[0].level);
  assert.equal(learned.phase, "moving");
  const anotherLap = lap(learned).state;
  assert.equal(anotherLap.growth.queue[0].pendingMoveIds[0], 352);
  const declined = skipMoves(anotherLap);
  assert.equal(declined.players[0].party[0].speciesId, 8);
  assert.deepEqual(declined.players[0].party[0].moveIds, [44, 55, 229, 57]);
  assert.equal(transition(declined, choice), declined);
});

test("successful capture waits through learning and branching evolution without transferring or rewarding twice", () => {
  const state = createGame([133], [], 1);
  state.players[0].party = [pokemon(state, 133, 19, [33, 343, 98, 34])];
  state.players[0].party[0].xp = 900;
  state.players[0].position = 2;
  const wild = pokemon(state, 1, 3);
  wild.hp = 1;
  state.phase = "attack";
  state.dice = [1, 1];
  state.dicePurpose = "movement";
  state.movement = { remaining: 0, encounters: [] };
  state.battle = { kind: "wild", defenderOwner: null, defenderPokemonId: wild.id, attackerPokemonId: state.players[0].party[0].id,
    wild, turn: "attacker", outcome: null, lastAttack: null, combat: createCombatState() };
  let result = transition(state, { type: "THROW_BALL" });
  assert.equal(result.phase, "learn-move");
  assert.equal(result.players[0].party.length, 1);
  const { level, xp } = result.players[0].party[0];
  result = skipMoves(result);
  assert.equal(result.phase, "evolution");
  result = transition(result, { type: "CHOOSE_EVOLUTION", speciesId: 134 });
  assert.equal(result.phase, "learn-move");
  assert.deepEqual(result.growth.queue[0].pendingMoveIds, [55, 36, 38, 44]);
  assert.ok(!result.growth.queue[0].pendingMoveIds.includes(129), "a declined move is not offered again by evolution");
  result = skipMoves(result);
  assert.equal(result.phase, "turn-end");
  assert.equal(result.players[0].party.length, 2);
  assert.equal(result.players[0].party[1].id, wild.id);
  assert.equal(result.players[0].party[0].level, level);
  assert.equal(result.players[0].party[0].xp, xp);
  assert.deepEqual(result.players[0].party[0].moveIds, [33, 343, 98, 34]);
});

test("lap learning resumes in party then road order, including fainted recipients", () => {
  const state = createGame([7], [], 1);
  const first = pokemon(state, 7, 11, [33, 55, 229, 57]);
  const second = pokemon(state, 7, 11, [33, 55, 229, 57]);
  second.hp = 0;
  const guardian = pokemon(state, 7, 11, [33, 55, 229, 57]);
  state.players[0].party = [first, second];
  state.roads[1] = { ownerId: 0, pokemon: guardian };
  let result = lap(state).state;
  assert.deepEqual(result.growth.queue.map((entry) => entry.pokemonId), [first.id, second.id, guardian.id]);
  for (const id of [first.id, second.id, guardian.id]) {
    assert.equal(result.phase, "learn-move");
    assert.equal(result.growth.queue[0].pokemonId, id);
    result = transition(result, { type: "CHOOSE_MOVE", replaceMoveId: null });
  }
  assert.equal(result.phase, "moving");
  assert.equal(result.growth, null);
  assert.equal(result.players[0].party[1].hp, 0);
  assert.equal(result.movement.remaining, 1);
});

test("a defending road owner makes learning choices before the defeated party is rescued", () => {
  const state = createGame([1, 7], [], 1);
  const attacker = pokemon(state, 1, 1);
  attacker.hp = 1;
  const defender = pokemon(state, 7, 11, [33, 55, 229, 57]);
  defender.xp = 990;
  state.players[0].party = [attacker];
  state.players[0].position = 1;
  state.roads[1] = { ownerId: 1, pokemon: defender };
  state.phase = "attack";
  state.dice = [1, 2];
  state.dicePurpose = "movement";
  state.movement = { remaining: 0, encounters: [] };
  state.battle = { kind: "road", defenderOwner: 1, defenderPokemonId: defender.id, attackerPokemonId: attacker.id,
    wild: null, turn: "defender", outcome: null, lastAttack: null, combat: createCombatState() };
  const result = transition(state, { type: "ATTACK", moveId: 33 });
  assert.equal(result.phase, "learn-move");
  assert.equal(getActingPlayer(result), 1);
  assert.equal(result.players[0].restTurnsRemaining, 0);
  const finished = skipMoves(result);
  assert.equal(finished.players[0].position, 10);
  assert.equal(finished.players[0].restTurnsRemaining, 3);
  assert.equal(finished.roads[1].pokemon.hp, getStats(finished.roads[1].pokemon).hp);
});

test("battle commands and Last Resort prerequisites use the persistent selected slots", () => {
  const state = createGame([128, 128], [], 1);
  const attacker = state.players[0].party[0];
  const defender = state.players[1].party[0];
  attacker.level = 100;
  attacker.moveIds = [33, 387, 34, 36];
  state.phase = "attack";
  state.battle = { kind: "trainer", defenderOwner: 1, defenderPokemonId: defender.id, attackerPokemonId: attacker.id,
    wild: null, turn: "attacker", outcome: null, lastAttack: null, combat: createCombatState() };
  assert.deepEqual(getPokemonMoves(attacker).map((move) => move.id), [33, 387, 34, 36]);
  assert.deepEqual(getBattleCommands(state).map((move) => move.id), [33, 387, 34, 36]);
  assert.ok(getMoveUnavailableReason(attacker, defender, movesById[387], { combat: state.battle.combat }));
  state.battle.combat.attacker.usedMoves = [33];
  assert.ok(getMoveUnavailableReason(attacker, defender, movesById[387], { combat: state.battle.combat }));
  state.battle.combat.attacker.usedMoves = [33, 34, 36];
  assert.equal(getMoveUnavailableReason(attacker, defender, movesById[387], { combat: state.battle.combat }), null);
});

test("escape doubles stay consumed through a lap, learning, evolution and a later wild capture", () => {
  let state = createGame([133, 1], [], 3428989595);
  state.players[0].party = [pokemon(state, 133, 19, [33, 343, 98, 34])];
  state.players[0].party[0].xp = 900;
  state.players[0].party[0].hp = 0;
  state.players[0].position = 30;
  state.players[0].restTurnsRemaining = 1;
  state.phase = "rest-roll";
  state = transition(state, { type: "ROLL" });
  assert.deepEqual(state.dice, [6, 6]);
  while (state.phase === "moving") state = transition(state, { type: "STEP" });
  assert.equal(state.phase, "learn-move");
  assert.equal(state.players[0].position, 0);
  state = skipMoves(state);
  assert.equal(state.phase, "evolution");
  state = skipMoves(transition(state, { type: "CHOOSE_EVOLUTION", speciesId: 134 }));
  while (state.phase === "moving") state = transition(state, { type: "STEP" });
  assert.equal(state.phase, "choose-attacker");
  assert.equal(state.players[0].position, 2);
  state = transition(state, { type: "CHOOSE_POKEMON", pokemonId: state.players[0].party[0].id });
  state.battle.turn = "attacker";
  state.battle.wild.hp = 1;
  state.rng = 1;
  state = skipMoves(transition(state, { type: "THROW_BALL" }));
  assert.equal(state.phase, "turn-end");
  assert.equal(state.dicePurpose, "rest");
  assert.equal(hasExtraRoll(state), false);
  assert.equal(transition(state, { type: "END_TURN" }).activePlayer, 1);
});
