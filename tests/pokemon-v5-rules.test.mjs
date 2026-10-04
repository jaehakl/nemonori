import assert from "node:assert/strict";
import test from "node:test";
import { loadGameSource } from "./game-test-helpers.mjs";

const path = "app/games/_components/pokemon-marble/";
const { createGame, transition, transitionWithEvents, getStats, getNextCenter, hasExtraRoll } = loadGameSource(`${path}engine.ts`);
const { getAvailableMoves } = loadGameSource(`${path}pokemon-data.ts`);
const { getCaptureChance } = loadGameSource(`${path}progression.ts`);
const { BOARD_TILES } = loadGameSource(`${path}board.ts`);
const { validateSave, parseGameSave } = loadGameSource(`${path}save.ts`);

function pokemon(state, level, hp) {
  const pokemon = { id: `p${state.nextPokemonId++}`, speciesId: 128, level, xp: 0, hp: 0,
    moveIds: getAvailableMoves(128, level).map(move => move.id) };
  pokemon.hp = hp ?? getStats(pokemon).hp;
  return pokemon;
}

test("capture adds exactly one percentage point per positive level and caps at 95%", () => {
  const wild = pokemon(createGame([1], [], 1), 30);
  for (const [level, chance] of [[1, 0.25], [30, 0.25], [35, 0.30], [40, 0.35], [50, 0.45], [100, 0.95]])
    assert.ok(Math.abs(getCaptureChance(wild, level) - chance) < 1e-12);
  assert.ok(Math.abs(getCaptureChance({ ...wild, hp: wild.hp / 2 }, 40) - 0.675) < 1e-12);
  assert.equal(getCaptureChance({ ...wild, hp: 1 }, 100), 0.95);
});

test("grass positions and uniform encounter bounds exclude fainted, boxed and deployed Pokemon", () => {
  assert.deepEqual(BOARD_TILES.flatMap((kind, index) => kind === "grass" ? [index + 1] : []), [3, 8, 13, 19, 23, 29, 33, 36, 39]);
  const observed = new Set();
  for (let seed = 1; seed <= 150; seed++) {
    const state = createGame([1], [], Math.imul(seed, 2654435761) >>> 0);
    state.players[0].party = [pokemon(state, 1, 0), pokemon(state, 99, 0), pokemon(state, 12), pokemon(state, 15)];
    state.players[0].box = [pokemon(state, 100)];
    state.roads[4] = { ownerId: 0, pokemon: pokemon(state, 80) };
    state.players[0].position = 1;
    state.phase = "moving";
    state.dice = [1, 2];
    state.dicePurpose = "movement";
    state.movement = { remaining: 1, encounters: [] };
    const next = transition(state, { type: "STEP" });
    const level = next.battle.wild.level;
    assert.ok(level >= 12 && level <= 15);
    observed.add(level);
    assert.ok(validateSave(next));
    state.players[0].party[3].hp = 0;
    assert.equal(transition(state, { type: "STEP" }).battle.wild.level, 12);
  }
  assert.deepEqual([...observed].sort((a, b) => a - b), [12, 13, 14, 15]);
});

test("voluntary rescue always goes forward, cancels doubles and never grants lap rewards", () => {
  for (let position = 0; position < 40; position++)
    assert.equal(getNextCenter(position), ((Math.floor(position / 10) + 1) * 10) % 40);
  for (const phase of ["roll", "road", "center", "turn-end"]) {
    const state = createGame([1], [], 1);
    state.phase = phase;
    state.players[0].position = phase === "center" ? 30 : 39;
    state.players[0].party[0].hp = 1;
    if (phase !== "roll") {
      state.dice = [2, 2];
      state.dicePurpose = "movement";
      state.movement = { remaining: 0, encounters: [] };
    }
    const before = structuredClone(state);
    const { state: rescued, events } = transitionWithEvents(state, { type: "MOVE_TO_CENTER" });
    assert.equal(rescued.players[0].position, 0);
    assert.equal(rescued.players[0].restTurnsRemaining, 3);
    assert.equal(rescued.phase, "turn-end");
    assert.equal(rescued.movement, null);
    assert.deepEqual(rescued.players[0].party, state.players[0].party);
    assert.equal(rescued.rng, state.rng);
    assert.equal(hasExtraRoll(rescued), false);
    assert.ok(events.every(event => !["lap", "experience-gain", "encounter"].includes(event.kind)));
    assert.ok(validateSave(rescued));
    assert.deepEqual(state, before);
    assert.equal(transition(rescued, { type: "MOVE_TO_CENTER" }), rescued);
  }
});

test("three failed rest rolls heal only at the end and block any action until the next turn", () => {
  let state = createGame([1], [], 12345);
  state.players[0].party[0].hp = 1;
  state.players[0].box.push(pokemon(state, 12, 1));
  state.roads[4] = { ownerId: 0, pokemon: pokemon(state, 12, 1) };
  state = transition(state, { type: "MOVE_TO_CENTER" });
  for (const remaining of [2, 1, 0]) {
    state = transition(state, { type: "END_TURN" });
    assert.equal(state.phase, "rest-roll");
    state.rng = 12345;
    const restored = parseGameSave(JSON.parse(JSON.stringify(state)));
    assert.deepEqual(restored, state);
    const result = transitionWithEvents(state, { type: "ROLL" });
    assert.deepEqual(transitionWithEvents(restored, { type: "ROLL" }), result);
    state = result.state;
    assert.equal(state.phase, "rest-end");
    assert.equal(state.players[0].restTurnsRemaining, remaining);
    assert.equal(state.movement, null);
    assert.equal(state.players[0].position, 10);
    for (const member of [...state.players[0].party, ...state.players[0].box])
      assert.equal(member.hp, remaining === 0 ? getStats(member).hp : 1);
    assert.equal(state.roads[4].pokemon.hp, 1);
    for (const type of ["ROLL", "MOVE_TO_CENTER", "START_EXCHANGE"])
      assert.equal(transition(state, { type }), state);
    assert.ok(validateSave(state));
  }
  state = transition(state, { type: "END_TURN" });
  assert.equal(state.phase, "roll");
});

test("escaping doubles heal and move their sum, persist across reload and never grant another roll", () => {
  let state = createGame([1, 4], [], 2688);
  state.players[0].party[0].hp = 1;
  state = transition(state, { type: "MOVE_TO_CENTER" });
  // Start the resting player's next turn without inventing movement for the opponent.
  state.activePlayer = 1;
  state.phase = "turn-end";
  state.dice = [1, 2];
  state.dicePurpose = "movement";
  state.movement = { remaining: 0, encounters: [] };
  state = transition(state, { type: "END_TURN_AND_ROLL" });
  assert.deepEqual(state.dice, [2, 2]);
  assert.equal(state.dicePurpose, "rest");
  assert.equal(state.phase, "moving");
  assert.equal(state.movement.remaining, 4);
  assert.equal(state.players[0].restTurnsRemaining, 0);
  assert.equal(state.players[0].party[0].hp, getStats(state.players[0].party[0]).hp);
  assert.equal(hasExtraRoll(state), false);
  while (state.phase === "moving") {
    assert.ok(validateSave(state));
    state = transition(parseGameSave(state), { type: "STEP" });
  }
  assert.equal(state.phase, "road");
  assert.equal(state.players[0].position, 14);
  assert.equal(hasExtraRoll(state), false);
  assert.equal(transition(state, { type: "END_TURN" }).activePlayer, 1);
});

test("voluntary center travel is rejected during choices, exchange and rest without consuming RNG", () => {
  for (const phase of ["moving", "choose-defender", "choose-attacker", "attack", "evolution", "learn-move", "capture", "rest-roll", "rest-end", "finished"]) {
    const state = { ...createGame([1], [], 1), phase };
    assert.equal(transition(state, { type: "MOVE_TO_CENTER" }), state, phase);
  }
  const state = { ...createGame([1], [], 1), exchangeActive: true };
  assert.equal(transition(state, { type: "MOVE_TO_CENTER" }), state);
});
