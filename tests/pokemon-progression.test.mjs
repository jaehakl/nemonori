import assert from "node:assert/strict";
import test from "node:test";
import { loadGameSource, pokemonBattleAction } from "./game-test-helpers.mjs";

const path = "app/games/_components/pokemon-marble/";
const { XP_PER_LEVEL, getVictoryExperience, getExperienceGrowth, getCaptureChance } = loadGameSource(`${path}progression.ts`);
const { sortPartyByLevel, getPartyLeader } = loadGameSource(`${path}party.ts`);
const { createGame, transition, transitionWithEvents, getStats } = loadGameSource(`${path}engine.ts`);
const { speciesById } = loadGameSource(`${path}pokemon-data.ts`);
const { BOARD_TILES } = loadGameSource(`${path}board.ts`);

function encounter(seed = 9182) {
  const initial = createGame([1], [], seed);
  initial.players[0].party[0].level = 50;
  initial.players[0].party[0].hp = getStats(initial.players[0].party[0]).hp;
  initial.phase = "moving";
  initial.dice = [1, 2];
  initial.movement = { remaining: 1, encounters: [] };
  let state = transition(initial, { type: "STEP" });
  state = transition(state, { type: "CHOOSE_POKEMON", pokemonId: state.players[0].party[0].id });
  state = transition(state, { type: "WILD_ATTACK" });
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
  assert.equal(getCaptureChance({ ...pokemon, hp: maxHp }), 0.25);
  assert.ok(Math.abs(getCaptureChance({ ...pokemon, hp: maxHp / 2 }) - 0.575) < 1e-10);
  assert.equal(getCaptureChance(pokemon), 0.9);
  assert.ok(getCaptureChance({ ...pokemon, hp: 1 }) > getCaptureChance({ ...pokemon, hp: maxHp / 2 }));
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

test("grass encounters retain rarity categories while excluding evolved species", () => {
  const categories = new Set();
  for (let index = 1; index <= 500; index++) {
    const state = encounter(Math.imul(index, 2654435761) >>> 0);
    const species = speciesById[state.battle.wild.speciesId];
    assert.equal(species.evolvesFrom, null);
    categories.add(species.legendary || species.mythical ? "rare" : Object.values(species.stats).reduce((a, b) => a + b, 0) >= 500 ? "strong" : "normal");
  }
  assert.deepEqual([...categories].sort(), ["normal", "rare", "strong"]);
});

test("one player can complete recovery and doubles without an opponent", () => {
  const initial = createGame([1], [], 1);
  initial.phase = "turn-end";
  initial.dice = [1, 2];
  initial.players[0].party[0].hp = 0;
  initial.players[0].restTurnsRemaining = 3;
  const result = transitionWithEvents(initial, { type: "END_TURN" });
  assert.equal(result.state.activePlayer, 0);
  assert.equal(result.state.phase, "roll");
  assert.equal(result.state.players[0].restTurnsRemaining, 0);
  assert.equal(result.state.players[0].party[0].hp, getStats(result.state.players[0].party[0]).hp);
  assert.equal(result.events.filter((event) => event.kind === "rest").length, 3);
  result.state.phase = "turn-end";
  result.state.dice = [2, 2];
  result.state.movement = { remaining: 0, encounters: [] };
  assert.equal(transition(result.state, { type: "END_TURN" }).turn, result.state.turn);
});

test("a solo adventure wins when the player deploys the last road guardian", () => {
  const initial = createGame([1], [], 1);
  const nextPokemon = () => ({ ...initial.players[0].party[0], id: `p${initial.nextPokemonId++}` });
  for (const [tile, kind] of BOARD_TILES.entries())
    if (kind === "road" && tile !== 2) initial.roads[tile] = { ownerId: 0, pokemon: nextPokemon() };
  const lastGuardian = nextPokemon();
  initial.players[0].party.push(lastGuardian);
  initial.players[0].position = 2;
  initial.phase = "road";
  initial.dice = [1, 2];
  initial.movement = { remaining: 0, encounters: [] };
  let state = transition(initial, { type: "START_EXCHANGE" });
  state = transition(state, { type: "DEPLOY", pokemonId: lastGuardian.id });
  assert.equal(state.phase, "finished");
  assert.equal(state.winner, 0);
  assert.equal(state.roads[2].pokemon.id, lastGuardian.id);
});
