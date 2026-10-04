import assert from "node:assert/strict";
import test from "node:test";
import { loadGameSource } from "./game-test-helpers.mjs";

const path = "app/games/_components/pokemon-marble/";
const { createGame, transition, transitionWithEvents, getStats, getBattleCommands, hasExtraRoll, resumePendingGrowth } = loadGameSource(`${path}engine.ts`);
const { getAvailableMoves, getPokemonMoves, movesById } = loadGameSource(`${path}pokemon-data.ts`);
const { getMoveUnavailableReason } = loadGameSource(`${path}battle.ts`);
const { createCombatState } = loadGameSource(`${path}combat-types.ts`);
const { parseGameSave } = loadGameSource(`${path}save.ts`);

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

test("pending legacy learning resumes without extra experience, RNG or input mutation", () => {
  const state = createGame([7], [], 1);
  const learner = pokemon(state, 7, 14, [33, 55, 229, 57]);
  learner.xp = 375;
  state.players[0].party = [learner];
  state.players[0].position = 0;
  state.phase = "moving";
  state.dice = [1, 2];
  state.dicePurpose = "movement";
  state.movement = { remaining: 1, encounters: [] };
  state.growth = { resume: "movement", queue: [{ ownerId: 0, pokemonId: learner.id,
    pendingMoveIds: [44], consideredMoveIds: [33, 55, 229, 57, 44] }] };
  const original = structuredClone(state);
  const result = resumePendingGrowth(state);
  assert.deepEqual(state, original);
  assert.deepEqual(result.players[0].party[0].moveIds, [55, 229, 57, 44]);
  for (const key of ["hp", "xp", "level"]) assert.equal(result.players[0].party[0][key], learner[key]);
  assert.equal(result.rng, state.rng);
  assert.equal(result.revision, state.revision);
  assert.equal(result.phase, "moving");
  assert.equal(result.growth, null);
  assert.equal(resumePendingGrowth(result), result);
});

test("full slots automatically forget the oldest move and continue through evolution", () => {
  const state = createGame([7], [], 1);
  state.players[0].party = [pokemon(state, 7, 11, [33, 55, 229, 57])];
  state.players[0].party[0].xp = 900;
  const learned = lap(state).state;
  assert.deepEqual(learned.players[0].party[0].moveIds, [55, 229, 57, 44]);
  assert.equal(learned.phase, "moving");
  assert.equal(learned.growth, null);
  assert.match(learned.log.at(-1), /몸통박치기 대신 물기/);
  for (const type of ["CHOOSE_MOVE", "LEARN_MOVE"]) assert.equal(transition(learned, { type }), learned);
  const evolved = lap(learned).state;
  assert.equal(evolved.phase, "moving");
  assert.equal(evolved.players[0].party[0].speciesId, 8);
  assert.deepEqual(evolved.players[0].party[0].moveIds, [229, 57, 44, 352]);
});

test("successful capture learns automatically and waits only for branching evolution without duplicate rewards", () => {
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
  assert.equal(result.phase, "evolution");
  assert.deepEqual(result.players[0].party[0].moveIds, [343, 98, 34, 129]);
  assert.equal(result.players[0].party.length, 1);
  const { level, xp } = result.players[0].party[0];
  assert.equal(result.phase, "evolution");
  result = transition(result, { type: "CHOOSE_EVOLUTION", speciesId: 134 });
  assert.equal(result.phase, "turn-end");
  assert.equal(result.players[0].party.length, 2);
  assert.equal(result.players[0].party[1].id, wild.id);
  assert.equal(result.players[0].party[0].level, level);
  assert.equal(result.players[0].party[0].xp, xp);
  assert.deepEqual(result.players[0].party[0].moveIds, [55, 36, 38, 44]);
});

test("lap learning finishes for party and road recipients, including fainted Pokemon", () => {
  const state = createGame([7], [], 1);
  const first = pokemon(state, 7, 11, [33, 55, 229, 57]);
  const second = pokemon(state, 7, 11, [33, 55, 229, 57]);
  second.hp = 0;
  const guardian = pokemon(state, 7, 11, [33, 55, 229, 57]);
  state.players[0].party = [first, second];
  state.roads[1] = { ownerId: 0, pokemon: guardian };
  const result = lap(state).state;
  for (const learner of [...result.players[0].party, result.roads[1].pokemon])
    assert.deepEqual(learner.moveIds, [55, 229, 57, 44]);
  assert.equal(result.phase, "moving");
  assert.equal(result.growth, null);
  assert.equal(result.players[0].party[1].hp, 0);
  assert.equal(result.movement.remaining, 1);
});

test("a defending road owner learns automatically before the defeated party is rescued", () => {
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
  assert.equal(result.phase, "turn-end");
  assert.deepEqual(result.roads[1].pokemon.moveIds, [55, 229, 57, 44]);
  const finished = result;
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
  assert.equal(state.players[0].position, 0);
  assert.equal(state.phase, "evolution");
  state = transition(state, { type: "CHOOSE_EVOLUTION", speciesId: 134 });
  while (state.phase === "moving") state = transition(state, { type: "STEP" });
  assert.equal(state.phase, "choose-attacker");
  assert.equal(state.players[0].position, 2);
  state = transition(state, { type: "CHOOSE_POKEMON", pokemonId: state.players[0].party[0].id });
  state.battle.turn = "attacker";
  state.battle.wild.hp = 1;
  state.rng = 1;
  state = transition(state, { type: "THROW_BALL" });
  assert.equal(state.phase, "turn-end");
  assert.equal(state.dicePurpose, "rest");
  assert.equal(hasExtraRoll(state), false);
  assert.equal(transition(state, { type: "END_TURN" }).activePlayer, 1);
});
