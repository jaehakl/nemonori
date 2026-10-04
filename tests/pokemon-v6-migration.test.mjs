import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { loadGameSource } from "./game-test-helpers.mjs";

const path = "app/games/_components/pokemon-marble/";
const { parseGameSave, validateSave } = loadGameSource(`${path}save.ts`);
const { parseV5GameSave, validateV5Save } = loadGameSource(`${path}save-v5.ts`);
const { getLearnableMoves } = loadGameSource(`${path}pokemon-data.ts`);
const { getStats, transition } = loadGameSource(`${path}engine.ts`);
const { createCombatant } = loadGameSource(`${path}combat-types.ts`);
const { BOARD_TILES } = loadGameSource(`${path}board.ts`);
const fixtures = JSON.parse(readFileSync(new URL("./fixtures/pokemon-v2.json", import.meta.url), "utf8"));

function snapshot(state) {
  assert.ok(validateSave(state), `Invalid ${state?.phase} v6 state`);
  assert.deepEqual(parseGameSave(JSON.parse(JSON.stringify(state))), state);
  return state;
}

function pendingLearning(slotCount = 3, fixture = fixtures.wildEvolution) {
  const state = parseV5GameSave(fixture);
  const growth = state.growth.queue[0];
  const pokemon = state.players[growth.ownerId].party.find((entry) => entry.id === growth.pokemonId);
  pokemon.speciesId = 134;
  if (slotCount === 4) pokemon.moveIds.push(98);
  state.evolution = null;
  state.phase = "learn-move";
  const eligible = getLearnableMoves(pokemon.speciesId, pokemon.level).map((move) => move.id);
  growth.pendingMoveIds = eligible.filter((id) => !growth.consideredMoveIds.includes(id) && !pokemon.moveIds.includes(id));
  growth.consideredMoveIds = [...new Set([...growth.consideredMoveIds, ...eligible])];
  assert.ok(validateV5Save(state));
  return state;
}

function legacyExchange(kind, count = 7) {
  const state = parseV5GameSave(fixtures.roll);
  const player = state.players[state.activePlayer];
  player.position = BOARD_TILES.indexOf(kind);
  state.roads[player.position] = null;
  state.phase = kind;
  state.dice = [1, 2];
  state.dicePurpose = "movement";
  state.movement = { remaining: 0, encounters: [] };
  state.exchangeActive = true;
  while (player.party.length < count)
    player.party.push({ ...player.party[0], id: `p${state.nextPokemonId++}`, moveIds: [...player.party[0].moveIds] });
  for (const pokemon of [...player.party, ...player.box]) pokemon.hp = getStats(pokemon).hp;
  assert.ok(validateV5Save(state));
  return state;
}

test("v5 active battles retain chosen move order, HP, RNG and delayed attack snapshots", () => {
  const old = parseV5GameSave(fixtures.evolvedWild);
  old.phase = "attack";
  old.battle.attackerPokemonId = old.players[0].party[0].id;
  old.players[0].party[0].moveIds = [55, 33, 229, 44];
  old.battle.combat.delayed.push({
    side: "attacker", moveId: 248, dueRound: 2,
    pokemon: structuredClone(old.players[0].party[0]), combatant: createCombatant(),
  });
  assert.ok(validateV5Save(old));
  const original = structuredClone(old);
  const next = snapshot(parseGameSave(old));
  assert.deepEqual(next, { ...old, version: 6 });
  assert.deepEqual(old, original);
});

test("v5 pending three- and four-slot learning resolves FIFO once without replaying rewards", () => {
  for (const slots of [3, 4]) {
    const old = pendingLearning(slots);
    const original = structuredClone(old);
    const pokemon = old.players[0].party[0];
    const expectedMoves = [...pokemon.moveIds, ...old.growth.queue[0].pendingMoveIds].slice(-4);
    const next = snapshot(parseGameSave(old));
    assert.equal(next.phase, "capture");
    assert.equal(next.growth, null);
    assert.deepEqual(next.players[0].party[0], { ...pokemon, moveIds: expectedMoves });
    assert.deepEqual(next.battle, old.battle);
    for (const key of ["rng", "revision", "turn", "activePlayer", "nextPokemonId"])
      assert.equal(next[key], old[key], key);
    assert.deepEqual(old, original);
    assert.deepEqual(parseGameSave(old), next);
    const captured = snapshot(transition(next, { type: "CAPTURE", capture: true }));
    assert.equal(captured.players[0].party.filter((entry) => entry.id === old.battle.wild.id).length, 1);
    assert.equal(captured.players[0].party[0].xp, pokemon.xp);
    assert.equal(transition(captured, { type: "CAPTURE", capture: true }), captured);
  }
});

test("v5 learning after a successful throw transfers the captured Pokemon exactly once", () => {
  const old = pendingLearning(4);
  old.battle.outcome = { kind: "capture" };
  old.battle.wild.hp = 1;
  assert.ok(validateV5Save(old));
  const original = structuredClone(old);
  const next = snapshot(parseGameSave(old));
  assert.equal(next.phase, "turn-end");
  assert.equal(next.battle, null);
  assert.equal(next.players[0].party.length, old.players[0].party.length + 1);
  assert.deepEqual(next.players[0].party.at(-1), old.battle.wild);
  assert.equal(next.players[0].party[0].xp, old.players[0].party[0].xp);
  assert.equal(next.players[0].party[0].level, old.players[0].party[0].level);
  assert.equal(next.rng, old.rng);
  assert.deepEqual(parseGameSave(next), next);
  assert.deepEqual(old, original);
});

test("v5 lap learning preserves the remaining evolution queue and awarded experience", () => {
  const old = pendingLearning(3, fixtures.lapEvolution);
  const original = structuredClone(old);
  const expected = old.players[0].party.map(({ id, level, xp }) => ({ id, level, xp }));
  const next = snapshot(parseGameSave(old));
  assert.deepEqual(next.players[0].party.map(({ id, level, xp }) => ({ id, level, xp })), expected);
  assert.notEqual(next.phase, "learn-move");
  assert.equal(next.rng, old.rng);
  assert.equal(next.revision, old.revision);
  assert.deepEqual(old, original);
});

test("v5 exchanges keep seven Pokemon and their location until the user finishes", () => {
  for (const kind of ["center", "road"]) {
    const old = legacyExchange(kind);
    const original = structuredClone(old);
    let next = snapshot(parseGameSave(old));
    assert.deepEqual(next, { ...old, version: 6 });
    assert.equal(transition(next, { type: "END_EXCHANGE" }), next);
    const pokemonId = next.players[0].party.at(-1).id;
    next = snapshot(transition(next, kind === "center"
      ? { type: "CENTER_TRANSFER", pokemonId, to: "box" }
      : { type: "DEPLOY", pokemonId }));
    assert.equal(next.players[0].party.length, 6);
    next = snapshot(transition(next, { type: "END_EXCHANGE" }));
    assert.equal(next.phase, "turn-end");
    assert.equal(next.exchangeActive, false);
    assert.equal(next.rng, old.rng);
    assert.deepEqual(old, original);
  }
});

test("completed v5 landing menus become turn-end without changing battle or dice history", () => {
  for (const kind of ["center", "road"]) {
    const old = legacyExchange(kind, 1);
    old.exchangeActive = false;
    assert.ok(validateV5Save(old));
    const next = snapshot(parseGameSave(old));
    assert.deepEqual(next, { ...old, version: 6, phase: "turn-end" });
  }
});

test("v5 validation rejects forged learning and new-rule exchanges before conversion", () => {
  const invalidLearning = pendingLearning();
  invalidLearning.growth.queue[0].pendingMoveIds.push(165);
  assert.equal(parseGameSave(invalidLearning), null);
  const old = parseV5GameSave(fixtures.roll);
  old.exchangeActive = true;
  assert.equal(validateV5Save(old), false);
  assert.equal(parseGameSave(old), null);
  const current = { ...old, version: 6 };
  snapshot(current);
  current.phase = "learn-move";
  assert.equal(validateSave(current), false);
  assert.equal(parseGameSave(current), null);
});
