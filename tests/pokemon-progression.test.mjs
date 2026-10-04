import assert from "node:assert/strict";
import test from "node:test";
import { loadGameSource, pokemonBattleAction } from "./game-test-helpers.mjs";

const path = "app/games/_components/pokemon-marble/";
const { XP_PER_LEVEL, getVictoryExperience, getExperienceGrowth, getCaptureChance } = loadGameSource(`${path}progression.ts`);
const { sortPartyByLevel, getPartyLeader } = loadGameSource(`${path}party.ts`);
const { createGame, transition, transitionWithEvents, getStats } = loadGameSource(`${path}engine.ts`);
const catalog = loadGameSource(`${path}pokemon-data.ts`);
const { speciesById, getAvailableMoves } = catalog;
const { BOARD_TILES } = loadGameSource(`${path}board.ts`);

function encounter(seed = 9182) {
  const initial = createGame([1], [], seed);
  initial.players[0].party[0].level = 50;
  initial.players[0].party[0].moveIds = getAvailableMoves(1, 50).map((move) => move.id);
  initial.players[0].party[0].hp = getStats(initial.players[0].party[0]).hp;
  initial.players[0].position = 1;
  initial.phase = "moving";
  initial.dice = [1, 2];
  initial.dicePurpose = "movement";
  initial.movement = { remaining: 1, encounters: [] };
  let state = transition(initial, { type: "STEP" });
  state = transition(state, { type: "CHOOSE_POKEMON", pokemonId: state.players[0].party[0].id });
  // These scenarios start at the player's throw decision, independent of wild damage.
  state.battle.turn = "attacker";
  return state;
}

test("equal-level rewards meet the four requested progression anchors", () => {
  assert.equal(XP_PER_LEVEL, 1000);
  for (const [level, amount] of [[1, 5000], [15, 2000], [30, 1000], [50, 500]])
    assert.equal(getVictoryExperience(level, level), amount);
  for (let level = 2; level < 100; level++)
    assert.ok(getVictoryExperience(level, level) < getVictoryExperience(level - 1, level - 1));
  assert.equal(getVictoryExperience(100, 100), 0);
});

test("opponent level adjusts experience with bounded ratios", () => {
  assert.equal(getVictoryExperience(30, 15), 500);
  assert.equal(getVictoryExperience(30, 60), 2000);
  assert.equal(getVictoryExperience(30, 100), 2000);
  assert.equal(getVictoryExperience(50, 1), 50);
  assert.equal(getVictoryExperience(1, 100), 10000);
});

test("experience carries fractions across multiple levels and clears progress at the cap", () => {
  assert.deepEqual(getExperienceGrowth({ level: 1, xp: 0 }, 5000), { level: 6, xp: 0 });
  assert.deepEqual(getExperienceGrowth({ level: 15, xp: 900 }, 2200), { level: 18, xp: 100 });
  assert.deepEqual(getExperienceGrowth({ level: 50, xp: 500 }, 500), { level: 51, xp: 0 });
  assert.deepEqual(getExperienceGrowth({ level: 99, xp: 900 }, 2000), { level: 100, xp: 0 });
  assert.deepEqual(getExperienceGrowth({ level: 100, xp: 0 }, 5000), { level: 100, xp: 0 });
});

test("party sorting is stable and does not mutate the saved order", () => {
  const party = Object.freeze([
    Object.freeze({ id: "p1", level: 5, hp: 5 }),
    Object.freeze({ id: "p2", level: 20, hp: 0 }),
    Object.freeze({ id: "p3", level: 20, hp: 5 }),
  ]);
  assert.deepEqual(sortPartyByLevel(party).map((pokemon) => pokemon.id), ["p2", "p3", "p1"]);
  assert.deepEqual(party.map((pokemon) => pokemon.id), ["p1", "p2", "p3"]);
  assert.equal(getPartyLeader(party).id, "p2");
  assert.equal(getPartyLeader([]), undefined);
});

test("capture probability starts at 25% and increases continuously as HP falls", () => {
  const pokemon = { id: "p1", speciesId: 1, level: 30, xp: 0, hp: 0 };
  const maxHp = getStats(pokemon).hp;
  assert.equal(getCaptureChance({ ...pokemon, hp: maxHp }, 30), 0.25);
  assert.ok(Math.abs(getCaptureChance({ ...pokemon, hp: maxHp / 2 }, 30) - 0.575) < 1e-10);
  assert.equal(getCaptureChance(pokemon, 30), 0.9);
  assert.ok(getCaptureChance({ ...pokemon, hp: 1 }, 30) > getCaptureChance({ ...pokemon, hp: maxHp / 2 }, 30));
});

test("a failed throw consumes a turn, preserves HP and XP, and replays deterministically", () => {
  const state = encounter();
  state.battle.wild.hp = getStats(state.battle.wild).hp;
  state.rng = 12345;
  const result = transitionWithEvents(state, { type: "THROW_BALL" });
  assert.equal(result.state.phase, "attack");
  assert.equal(result.state.battle.turn, "defender");
  assert.equal(result.state.battle.outcome, null);
  assert.deepEqual(result.state.players[0].party, state.players[0].party);
  assert.equal(result.state.battle.wild.hp, state.battle.wild.hp);
  assert.notEqual(result.state.rng, state.rng);
  assert.deepEqual(result.state, transition(structuredClone(state), { type: "THROW_BALL" }));
  assert.deepEqual(result.events.map((event) => event.kind), ["capture-throw", "capture-shake", "capture-shake", "capture-shake", "capture-result"]);
  assert.deepEqual(result.events.filter((event) => event.kind === "capture-shake").map((event) => event.capture.shake), [1, 2, 3]);
  assert.equal(result.events.at(-1).capture.success, false);
  assert.equal(transition(result.state, { type: "THROW_BALL" }), result.state);
});

test("successful capture awards experience once and transfers the living wild after branching evolution", () => {
  const state = encounter();
  const attacker = state.players[0].party[0];
  attacker.speciesId = 133;
  attacker.level = 19;
  attacker.moveIds = getAvailableMoves(133, 19).map((move) => move.id);
  attacker.xp = 900;
  attacker.hp = 10;
  state.battle.wild.level = 3;
  state.battle.wild.hp = 1;
  state.rng = 1;
  const wildId = state.battle.wild.id;
  const result = transitionWithEvents(state, { type: "THROW_BALL" });
  assert.equal(result.state.phase, "evolution");
  assert.deepEqual(result.state.battle.outcome, { kind: "capture" });
  assert.equal(result.state.players[0].party.length, 1);
  assert.equal(result.state.players[0].party[0].level, 20);
  const xp = result.state.players[0].party[0].xp;
  const resultEvent = result.events.find((event) => event.kind === "capture-result");
  assert.deepEqual(resultEvent.snapshot.battle.outcome, { kind: "capture" });
  assert.notEqual(resultEvent.snapshot.battle.outcome, result.state.battle.outcome);
  resultEvent.snapshot.battle.outcome.kind = "knockout";
  assert.deepEqual(result.state.battle.outcome, { kind: "capture" });
  assert.equal(resultEvent.snapshot.battle.defender.hp, 1);
  assert.equal(result.events.filter((event) => event.kind === "experience-gain").length, 1);
  const evolved = transition(JSON.parse(JSON.stringify(result.state)), { type: "CHOOSE_EVOLUTION", speciesId: 134 });
  assert.equal(evolved.phase, "turn-end");
  assert.equal(evolved.players[0].party[0].xp, xp);
  assert.equal(evolved.players[0].party[0].hp, 10);
  assert.equal(evolved.players[0].party.find((pokemon) => pokemon.id === wildId).hp, 1);
  assert.equal(evolved.players[0].party.length, 2);
  assert.equal(transition(evolved, { type: "THROW_BALL" }), evolved);
});

test("knocked-out wild Pokemon cannot be captured", () => {
  const state = encounter();
  state.battle.wild.hp = 1;
  const result = transition(state, pokemonBattleAction(state));
  assert.equal(result.phase, "turn-end");
  assert.equal(result.battle, null);
  assert.equal(result.players[0].party.length, 1);
  assert.equal(transition(result, { type: "THROW_BALL" }), result);
  assert.equal(transition(result, { type: "CAPTURE", capture: true }), result);
});

test("grass encounters retain base-family rarity and evolve fully at the generated level", () => {
  const categories = new Set();
  let evolvedCount = 0;
  for (let index = 1; index <= 500; index++) {
    const state = encounter(Math.imul(index, 2654435761) >>> 0);
    const wild = state.battle.wild;
    let species = speciesById[wild.speciesId];
    assert.ok(species.evolutions.every(entry => entry.level > wild.level));
    assert.deepEqual(wild.moveIds, getAvailableMoves(species.id, wild.level).map(move => move.id));
    if (species.evolvesFrom !== null) evolvedCount++;
    while (species.evolvesFrom !== null) species = speciesById[species.evolvesFrom];
    categories.add(species.legendary || species.mythical ? "rare" : Object.values(species.stats).reduce((a, b) => a + b, 0) >= 500 ? "strong" : "normal");
  }
  assert.deepEqual([...categories].sort(), ["normal", "rare", "strong"]);
  assert.ok(evolvedCount > 0);
});

function spawnWild(engine, seed, maximum = 50) {
  const initial = engine.createGame([1], [], seed);
  const player = initial.players[0];
  player.party[0].level = 1;
  player.party.push({ ...player.party[0], id: `p${initial.nextPokemonId++}`, level: maximum, hp: 0 });
  player.box.push({ ...player.party[0], id: `p${initial.nextPokemonId++}`, level: 100 });
  initial.roads[3] = { ownerId: 0, pokemon: { ...player.box[0], id: `p${initial.nextPokemonId++}` } };
  player.position = 1;
  initial.phase = "moving";
  initial.dice = [1, 2];
  initial.dicePurpose = "movement";
  initial.movement = { remaining: 1, encounters: [] };
  return engine.transition(initial, { type: "STEP" });
}

test("wild levels span one through the fainted party maximum and ignore box and guardian levels", () => {
  const engine = { createGame, transition };
  const counts = Array(10).fill(0);
  for (let index = 1; index <= 2000; index++) {
    const seed = Math.imul(index, 2654435761) >>> 0;
    const state = spawnWild(engine, seed, 10);
    const level = state.battle.wild.level;
    assert.ok(level >= 1 && level <= 10);
    counts[level - 1]++;
    if (index <= 10) assert.deepEqual(state, spawnWild(engine, seed, 10));
  }
  assert.ok(counts.every(count => count >= 140 && count <= 260), String(counts));
  assert.equal(spawnWild(engine, 1, 1).battle.wild.level, 1);
});

test("wild evolution honors exact thresholds, chained stages and seeded branching", () => {
  for (const baseId of [1, 133]) {
    const engine = loadGameSource(`${path}engine.ts`, {
      [`${path}pokemon-data.ts`]: { ...catalog, speciesList: [baseId, 127, 150].map(id => speciesById[id]) },
    });
    const observed = new Map();
    for (let index = 1; index <= 800; index++) {
      const state = spawnWild(engine, Math.imul(index, 2654435761) >>> 0);
      const wild = state.battle.wild;
      if ([127, 150].includes(wild.speciesId)) continue;
      observed.set(wild.level, (observed.get(wild.level) ?? new Set()).add(wild.speciesId));
      if (baseId === 1) assert.equal(wild.speciesId, wild.level < 16 ? 1 : wild.level < 32 ? 2 : 3);
      else assert.ok(wild.level < 20 ? wild.speciesId === 133 : speciesById[133].evolutions.some(entry => entry.speciesId === wild.speciesId));
      assert.equal(wild.hp, getStats(wild).hp);
    }
    for (const level of baseId === 1 ? [15, 16, 31, 32] : [19, 20]) assert.ok(observed.has(level));
    if (baseId === 133) {
      const branches = new Set([...observed].filter(([level]) => level >= 20).flatMap(([, ids]) => [...ids]));
      assert.equal(branches.size, 8);
    }
  }
});

test("one player can complete recovery and doubles without an opponent", () => {
  const initial = createGame([1], [], 1);
  initial.phase = "turn-end";
  initial.dice = null;
  initial.dicePurpose = null;
  initial.players[0].party[0].hp = 0;
  initial.players[0].restTurnsRemaining = 3;
  const result = transitionWithEvents(initial, { type: "END_TURN" });
  assert.equal(result.state.activePlayer, 0);
  assert.equal(result.state.phase, "rest-roll");
  assert.equal(result.state.players[0].restTurnsRemaining, 3);
  assert.equal(result.events.filter((event) => event.kind === "rest").length, 0);
  let recovered = result.state;
  for (const remaining of [2, 1, 0]) {
    recovered.rng = 12345;
    recovered = transition(recovered, { type: "ROLL" });
    assert.equal(recovered.players[0].restTurnsRemaining, remaining);
    assert.equal(recovered.phase, "rest-end");
    recovered = transition(recovered, { type: "END_TURN" });
  }
  assert.equal(recovered.phase, "roll");
  assert.equal(recovered.players[0].party[0].hp, getStats(recovered.players[0].party[0]).hp);
  recovered.phase = "turn-end";
  recovered.dice = [2, 2];
  recovered.dicePurpose = "movement";
  recovered.movement = { remaining: 0, encounters: [] };
  assert.equal(transition(recovered, { type: "END_TURN" }).turn, recovered.turn);
});

test("a solo adventure wins when the player deploys the last road guardian", () => {
  const initial = createGame([1], [], 1);
  const nextPokemon = () => ({ ...initial.players[0].party[0], id: `p${initial.nextPokemonId++}` });
  for (const [tile, kind] of BOARD_TILES.entries())
    if (kind === "road" && tile !== 1) initial.roads[tile] = { ownerId: 0, pokemon: nextPokemon() };
  const lastGuardian = nextPokemon();
  initial.players[0].party.push(lastGuardian);
  initial.players[0].position = 1;
  let state = transition(initial, { type: "START_EXCHANGE" });
  state = transition(state, { type: "DEPLOY", pokemonId: lastGuardian.id });
  assert.equal(state.phase, "finished");
  assert.equal(state.winner, 0);
  assert.equal(state.roads[1].pokemon.id, lastGuardian.id);
});
