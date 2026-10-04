import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { loadGameSource } from "./game-test-helpers.mjs";

const path = "app/games/_components/pokemon-marble/";
const { parseGameSave, validateSave, getLegacyTileMapping } = loadGameSource(`${path}save.ts`);
const { parseLegacyGameSave, validateLegacySave } = loadGameSource(`${path}save-legacy.ts`);
const { BOARD_TILES: oldBoard } = loadGameSource(`${path}save-legacy-board.ts`);
const { BOARD_TILES: board } = loadGameSource(`${path}board.ts`);
const { getAvailableMoves } = loadGameSource(`${path}pokemon-data.ts`);
const { createGame, transition, getStats, hasExtraRoll } = loadGameSource(`${path}engine.ts`);
const { createCombatant } = loadGameSource(`${path}combat-types.ts`);
const fixtures = JSON.parse(readFileSync(new URL("./fixtures/pokemon-v2.json", import.meta.url), "utf8"));

function snapshot(state) {
  assert.ok(validateSave(state), `Invalid ${state.phase} state`);
  assert.deepEqual(parseGameSave(JSON.parse(JSON.stringify(state))), state);
  return state;
}

function makeVersion(fixture, version) {
  if (version === 2) return structuredClone(fixture);
  const state = parseLegacyGameSave(fixture);
  if (version === 3) {
    state.version = 3;
    delete state.lastBattleAction;
    if (state.battle) delete state.battle.combat;
  }
  return state;
}

test("v2/v3/v4 migrate cells by kind and order while preserving every interrupted state", () => {
  const mapping = getLegacyTileMapping();
  assert.equal(new Set(mapping).size, 40);
  for (let tile = 0; tile < 40; tile++) assert.equal(board[mapping[tile]], oldBoard[tile]);
  assert.deepEqual([0, 10, 20, 30].map((tile) => mapping[tile]), [0, 10, 20, 30]);
  for (const version of [2, 3, 4]) {
    for (const fixture of Object.values(fixtures)) {
      const old = makeVersion(fixture, version);
      const original = structuredClone(old);
      const next = snapshot(parseGameSave(old));
      assert.equal(next.version, 5);
      assert.deepEqual(old, original);
      assert.deepEqual(next.log.slice(0, -1), old.log.slice(-23));
      assert.match(next.log.at(-1), /새 보드 배치/);
      assert.deepEqual(next.movement, old.movement);
      assert.deepEqual(next.players.map((player) => player.position), old.players.map((player) => mapping[player.position]));
      for (const key of ["rng", "revision", "turn", "nextPokemonId", "activePlayer", "phase"]) assert.equal(next[key], old[key]);
      for (const [tile, guardian] of old.roads.entries()) {
        if (!guardian) continue;
        assert.equal(next.roads[mapping[tile]].pokemon.id, guardian.pokemon.id);
        assert.equal(next.roads[mapping[tile]].ownerId, guardian.ownerId);
      }
      if (old.evolution) {
        assert.deepEqual(next.growth.queue.map((entry) => entry.pokemonId), [old.evolution.pokemonId, ...(old.lapGrowth?.remainingPokemonIds ?? [])]);
        assert.ok(next.growth.queue.every((entry) => entry.pendingMoveIds.length === 0));
      }
    }
  }
});

test("v4 migration adds learned slots to delayed attack snapshots without changing their state", () => {
  const old = makeVersion(fixtures.evolvedWild, 4);
  old.phase = "attack";
  old.battle.attackerPokemonId = old.players[0].party[0].id;
  old.battle.combat.delayed.push({
    side: "attacker", moveId: 248, dueRound: 2,
    pokemon: structuredClone(old.players[0].party[0]), combatant: createCombatant(),
  });
  const original = structuredClone(old);
  assert.ok(validateLegacySave(old));
  const next = snapshot(parseGameSave(old));
  const delayed = next.battle.combat.delayed[0];
  const { moveIds, ...pokemon } = delayed.pokemon;
  assert.deepEqual(pokemon, original.battle.combat.delayed[0].pokemon);
  assert.deepEqual(moveIds, getAvailableMoves(pokemon.speciesId, pokemon.level).map((move) => move.id));
  assert.deepEqual(old, original);
  for (const invalid of [undefined, [165], [999999], [1, 1]]) {
    const corrupt = structuredClone(next);
    corrupt.battle.combat.delayed[0].pokemon.moveIds = invalid;
    assert.equal(validateSave(corrupt), false);
  }
});

test("a v4 monopoly migrates all 27 guardian slots and remains terminal", () => {
  const old = makeVersion(fixtures.roll, 4);
  old.phase = "finished";
  old.winner = 0;
  old.dice = [1, 2];
  for (const [tile, kind] of oldBoard.entries()) {
    if (kind === "road") old.roads[tile] = { ownerId: 0, pokemon: { ...old.players[0].party[0], id: `p${old.nextPokemonId++}` } };
  }
  assert.ok(validateLegacySave(old));
  const next = snapshot(parseGameSave(old));
  assert.equal(next.winner, 0);
  assert.equal(next.roads.filter(Boolean).length, 27);
  assert.equal(transition(next, { type: "ROLL" }), next);
});

test("new learned slots and growth references reject forged data", () => {
  const base = parseGameSave(fixtures.wildEvolution);
  const learning = transition(base, { type: "CHOOSE_EVOLUTION", speciesId: 134 });
  assert.equal(learning.phase, "learn-move");
  snapshot(learning);
  assert.ok(learning.growth.queue[0].pendingMoveIds.length > 1);
  for (const change of [
    (state) => { delete state.players[0].party[0].moveIds; },
    (state) => { state.players[0].party[0].moveIds = [165]; },
    (state) => { state.players[0].party[0].moveIds.push(state.players[0].party[0].moveIds[0]); },
    (state) => { state.growth.queue[0].ownerId = 1; },
    (state) => { state.growth.queue[0].pokemonId = state.players[1].party[0].id; },
    (state) => { state.growth.queue[0].pendingMoveIds = []; },
    (state) => { state.growth.queue[0].consideredMoveIds = []; },
    (state) => { state.growth.queue[0].consideredMoveIds.push(248); },
    (state) => { state.growth.queue[0].consideredMoveIds = state.growth.queue[0].consideredMoveIds.filter((id) => id !== state.players[0].party[0].moveIds[0]); },
    (state) => { state.growth.queue[0].pendingMoveIds.reverse(); },
    (state) => { state.growth.queue.push(structuredClone(state.growth.queue[0])); },
    (state) => {
      const other = { ...state.players[0].party[0], id: `p${state.nextPokemonId++}` };
      state.players[0].party.push(other);
      state.growth.queue[0].pokemonId = other.id;
    },
    (state) => { state.growth.resume = "movement"; },
    (state) => { state.growth = null; },
  ]) {
    const corrupt = structuredClone(learning);
    change(corrupt);
    assert.equal(validateSave(corrupt), false, change.toString());
  }
});

test("voluntary recovery and all rest attempts survive saves without granting a fourth attempt", () => {
  let state = createGame([1], [], 1);
  state.players[0].party[0].hp = 1;
  state = snapshot(transition(state, { type: "MOVE_TO_CENTER" }));
  assert.equal(state.players[0].position, 10);
  assert.equal(state.players[0].restTurnsRemaining, 3);
  assert.equal(state.dice, null);
  for (const remaining of [2, 1, 0]) {
    state = snapshot(transition(state, { type: "END_TURN" }));
    assert.equal(state.phase, "rest-roll");
    state.rng = 35;
    state = snapshot(transition(state, { type: "ROLL" }));
    assert.equal(state.phase, "rest-end");
    assert.equal(state.players[0].restTurnsRemaining, remaining);
    assert.equal(transition(state, { type: "ROLL" }), state);
  }
  assert.equal(state.players[0].party[0].hp, getStats(state.players[0].party[0]).hp);
  state = snapshot(transition(state, { type: "END_TURN" }));
  assert.equal(state.phase, "roll");
});

test("rest doubles preserve their purpose through movement and cannot grant another roll", () => {
  let state = transition(transition(createGame([1], [], 1), { type: "MOVE_TO_CENTER" }), { type: "END_TURN" });
  let released;
  for (let seed = 1; seed < 200; seed++) {
    state.rng = seed;
    const candidate = transition(state, { type: "ROLL" });
    if (candidate.phase === "moving") { released = candidate; break; }
  }
  assert.ok(released);
  snapshot(released);
  assert.equal(released.dicePurpose, "rest");
  assert.equal(released.players[0].restTurnsRemaining, 0);
  assert.equal(released.movement.remaining, released.dice[0] + released.dice[1]);
  assert.equal(hasExtraRoll(released), false);
  const corrupt = structuredClone(released);
  corrupt.dice[1] = corrupt.dice[0] === 6 ? 5 : 6;
  assert.equal(validateSave(corrupt), false);
});


test("migration adds one capped relocation notice only to the returned v5 log", () => {
  const old = makeVersion(fixtures.roll, 4);
  old.log = Array.from({ length: 24 }, (_, index) => `이전 기록 ${index}`);
  const original = structuredClone(old);
  const next = snapshot(parseGameSave(old));
  assert.equal(next.log.length, 24);
  assert.deepEqual(next.log.slice(0, -1), old.log.slice(1));
  assert.match(next.log.at(-1), /새 보드 배치/);
  assert.deepEqual(old, original);
  assert.deepEqual(parseGameSave(next).log, next.log);
  assert.deepEqual(parseGameSave(old).log, next.log);
});

test("rest phases reject impossible dice purposes, counters and incomplete final healing", () => {
  let waiting = transition(transition(createGame([1], [], 35), { type: "MOVE_TO_CENTER" }), { type: "END_TURN" });
  snapshot(waiting);
  for (const change of [
    (state) => { state.dicePurpose = "rest"; },
    (state) => { state.players[0].restTurnsRemaining = 0; },
    (state) => { state.phase = "roll"; },
  ]) {
    const corrupt = structuredClone(waiting);
    change(corrupt);
    assert.equal(validateSave(corrupt), false);
  }
  let failed = transition(waiting, { type: "ROLL" });
  snapshot(failed);
  for (const change of [
    (state) => { state.dicePurpose = "movement"; },
    (state) => { state.players[0].restTurnsRemaining = 3; },
    (state) => { state.dice = [1, 1]; },
    (state) => { state.movement = { remaining: 1, encounters: [] }; },
  ]) {
    const corrupt = structuredClone(failed);
    change(corrupt);
    assert.equal(validateSave(corrupt), false);
  }
  while (failed.players[0].restTurnsRemaining > 0) {
    waiting = transition(failed, { type: "END_TURN" });
    waiting.rng = 35;
    failed = transition(waiting, { type: "ROLL" });
  }
  snapshot(failed);
  failed.players[0].party[0].hp = 1;
  assert.equal(validateSave(failed), false);
});
