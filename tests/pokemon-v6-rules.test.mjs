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

function beforeWild(state) {
  state.players[0].position = 1;
  state.phase = "moving";
  state.dice = [1, 2];
  state.dicePurpose = "movement";
  state.movement = { remaining: 1, encounters: [] };
  return state;
}

test("new starters have level-five HP and moves, and encounter every level from one to five", () => {
  for (const speciesId of [1, 4, 7, 172, 128, 132, 209]) {
    const state = createGame([speciesId], [], 1);
    const starter = state.players[0].party[0];
    assert.equal(starter.level, 5);
    assert.equal(starter.hp, getStats(starter).hp);
    assert.equal(starter.xp, 0);
    assert.deepEqual(starter.moveIds, getAvailableMoves(speciesId, 5).map(move => move.id));
    if (speciesId === 209) assert.equal(starter.moveIds.length, 4);
    assert.ok(validateSave(state));
  }
  const levels = new Set();
  for (let seed = 1; seed <= 150; seed++) {
    const state = beforeWild(createGame([1], [], Math.imul(seed, 2654435761) >>> 0));
    const next = transition(state, { type: "STEP" });
    levels.add(next.battle.wild.level);
    assert.deepEqual(transition(parseGameSave(state), { type: "STEP" }), next);
  }
  assert.deepEqual([...levels].sort(), [1, 2, 3, 4, 5]);
});

test("lower-level party members never raise the minimum or reduce the maximum wild level", () => {
  const observed = new Set();
  for (let seed = 1; seed <= 150; seed++) {
    const state = beforeWild(createGame([1], [], Math.imul(seed, 2654435761) >>> 0));
    state.players[0].party = [pokemon(state, 5), pokemon(state, 12)];
    const capOnly = structuredClone(state);
    capOnly.players[0].party.shift();
    const capResult = transition(capOnly, { type: "STEP" });
    const mixed = transition(state, { type: "STEP" });
    observed.add(mixed.battle.wild.level);
    assert.equal(mixed.battle.wild.level, capResult.battle.wild.level);
    assert.equal(mixed.rng, capResult.rng);
  }
  assert.deepEqual([...observed].sort((a, b) => a - b), Array.from({ length: 12 }, (_, i) => i + 1));
});

test("low-level existing saves keep their roster and ongoing encounters unchanged", () => {
  for (const level of [1, 2, 3]) {
    for (const seed of [1, 13, 35, 9182, 987654321]) {
      const saved = beforeWild(createGame([1], [], seed));
      saved.players[0].party = [pokemon(saved, level)];
      const original = structuredClone(saved);
      const restored = parseGameSave(saved);
      assert.deepEqual(saved, original);
      assert.deepEqual(restored, original);
      const encounter = transition(restored, { type: "STEP" });
      assert.ok(encounter.battle.wild.level >= 1 && encounter.battle.wild.level <= level);
      assert.deepEqual(parseGameSave(encounter), encounter);
      // A previously generated opponent can exceed the newly calculated cap.
      encounter.battle.wild.level = 50;
      encounter.battle.wild.moveIds = getAvailableMoves(encounter.battle.wild.speciesId, 50).map(move => move.id);
      assert.deepEqual(parseGameSave(encounter), encounter);
    }
  }
});

test("capture adds exactly one percentage point per positive level and caps at 95%", () => {
  const wild = pokemon(createGame([1], [], 1), 30);
  for (const [level, chance] of [[1, 0.25], [30, 0.25], [35, 0.30], [40, 0.35], [50, 0.45], [100, 0.95]])
    assert.ok(Math.abs(getCaptureChance(wild, level) - chance) < 1e-12);
  assert.ok(Math.abs(getCaptureChance({ ...wild, hp: wild.hp / 2 }, 40) - 0.675) < 1e-12);
  assert.equal(getCaptureChance({ ...wild, hp: 1 }, 100), 0.95);
});

test("grass encounter bounds include fainted party members but exclude boxed and deployed Pokemon", () => {
  assert.deepEqual(BOARD_TILES.flatMap((kind, index) => kind === "grass" ? [index + 1] : []), [3, 8, 13, 19, 23, 29, 33, 36, 39]);
  const observed = new Set();
  for (let seed = 1; seed <= 150; seed++) {
    const state = createGame([1], [], Math.imul(seed, 2654435761) >>> 0);
    state.players[0].party = [pokemon(state, 1, 0), pokemon(state, 15, 0), pokemon(state, 5), pokemon(state, 12)];
    state.players[0].box = [pokemon(state, 100)];
    state.roads[4] = { ownerId: 0, pokemon: pokemon(state, 80) };
    state.players[0].position = 1;
    state.phase = "moving";
    state.dice = [1, 2];
    state.dicePurpose = "movement";
    state.movement = { remaining: 1, encounters: [] };
    const next = transition(state, { type: "STEP" });
    const level = next.battle.wild.level;
    assert.ok(level >= 1 && level <= 15);
    observed.add(level);
    assert.ok(validateSave(next));
    state.players[0].party[3].hp = 0;
    const soloLevel = transition(state, { type: "STEP" }).battle.wild.level;
    assert.equal(soloLevel, level, "fainting another party member does not change the cap");
  }
  assert.deepEqual([...observed].sort((a, b) => a - b), Array.from({ length: 15 }, (_, i) => i + 1));
});

test("voluntary rescue always goes forward, cancels doubles and never grants lap rewards", () => {
  for (let position = 0; position < 40; position++)
    assert.equal(getNextCenter(position), ((Math.floor(position / 10) + 1) * 10) % 40);
  for (const position of [0, 10, 30, 39]) {
    const state = createGame([1], [], 1);
    state.players[0].position = position;
    state.players[0].party[0].hp = 1;
    const before = structuredClone(state);
    const { state: rescued, events } = transitionWithEvents(state, { type: "MOVE_TO_CENTER" });
    assert.equal(rescued.players[0].position, getNextCenter(position));
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
  state = transition(state, { type: "END_TURN" });
  assert.equal(state.phase, "rest-roll");
  assert.equal(state.dice, null);
  state = transition(state, { type: "ROLL" });
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
  assert.equal(state.phase, "turn-end");
  assert.equal(state.players[0].position, 14);
  assert.equal(hasExtraRoll(state), false);
  assert.equal(transition(state, { type: "END_TURN" }).activePlayer, 1);
});

test("voluntary center travel is rejected during choices, exchange and rest without consuming RNG", () => {
  for (const phase of ["moving", "choose-defender", "choose-attacker", "attack", "evolution", "capture", "rest-roll", "rest-end", "road", "center", "turn-end", "finished"]) {
    const state = { ...createGame([1], [], 1), phase };
    assert.equal(transition(state, { type: "MOVE_TO_CENTER" }), state, phase);
  }
  const state = { ...createGame([1], [], 1), exchangeActive: true };
  assert.equal(transition(state, { type: "MOVE_TO_CENTER" }), state);
});
