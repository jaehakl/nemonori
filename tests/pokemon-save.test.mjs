import assert from "node:assert/strict";
import test from "node:test";
import { loadGameSource, pokemonBattleAction } from "./game-test-helpers.mjs";

const ROAD_TILE = 1;
const WILD_TILE = 2;

const path = "app/games/_components/pokemon-marble/";
const { createGame, transition, getStats, getActingPlayer } = loadGameSource(
  `${path}engine.ts`,
);
const { validateSave, parseGameSave } = loadGameSource(`${path}save.ts`);
const { BOARD_SIZE, BOARD_TILES } = loadGameSource(`${path}board.ts`);
const { getAvailableMoves } = loadGameSource(`${path}pokemon-data.ts`);

function pokemon(state, speciesId, level = 1, hp) {
  const entry = { id: `p${state.nextPokemonId++}`, speciesId, level, xp: 0, hp: 0,
    moveIds: getAvailableMoves(speciesId, level).map(move => move.id) };
  entry.hp = hp ?? getStats(entry).hp;
  return entry;
}
function enter(state, tile, remaining = 1) {
  state.players[state.activePlayer].position = (tile + BOARD_SIZE - 1) % BOARD_SIZE;
  state.phase = "moving";
  state.dice = [6, 6];
  state.dicePurpose = "movement";
  state.movement = { remaining, encounters: [] };
  return transition(state, { type: "STEP" });
}
function nextAction(state) {
  switch (state.phase) {
    case "roll":
    case "rest-roll":
      return { type: "ROLL" };
    case "moving":
      return { type: "STEP" };
    case "choose-defender":
    case "choose-attacker":
      return {
        type: "CHOOSE_POKEMON",
        pokemonId: state.players[getActingPlayer(state)].party.find(
          (entry) => entry.hp > 0,
        ).id,
      };
    case "attack":
      return getActingPlayer(state) === null
        ? { type: "WILD_ATTACK" }
        : pokemonBattleAction(state);
    case "evolution":
      return {
        type: "CHOOSE_EVOLUTION",
        speciesId: state.evolution.options[0],
      };
    case "capture":
      return {
        type: "CAPTURE",
        capture: state.players[state.activePlayer].party.length < 6,
      };
    default:
      return { type: "END_TURN" };
  }
}
function snapshot(state) {
  const saved = JSON.parse(JSON.stringify(state));
  assert.ok(
    validateSave(saved),
    `Rejected valid ${state.phase} save at revision ${state.revision}`,
  );
  const resumed = parseGameSave(saved);
  assert.deepEqual(resumed, state);
  assert.notEqual(resumed, saved);
  return resumed;
}

function assertAutomaticLearning(state) {
  assert.notEqual(state.phase, "learn-move", "Current saves must never pause for move selection");
  return state;
}

test("1-, 2- and 4-player games resume identically across movement, battles and rest", () => {
  for (const count of [1, 2, 4]) {
    for (const seed of [1, 35, 9182, 987654321]) {
      let state = createGame([1, 4, 7, 172].slice(0, count), [], seed);
      let actions = 0;
      while (actions++ < 500) {
        const restored = snapshot(state);
        const original = structuredClone(state);
        const action = nextAction(state);
        const next = transition(state, action);
        assert.notEqual(next, state, `No progress in ${state.phase}`);
        assert.equal(next.revision, state.revision + 1);
        assert.deepEqual(transition(restored, action), next);
        assert.deepEqual(state, original, "Transition mutated previous state");
        state = next;
      }
      snapshot(state);
      assert.equal(state.winner, null, "Battles alone never win land ownership");
    }
  }
});

test("paused encounters keep remaining movement, selected Pokemon, attack turn and RNG", () => {
  const initial = createGame([1, 4, 7, 172], [], 13);
  initial.players[1].position = ROAD_TILE;
  initial.players[2].position = ROAD_TILE;
  let state = enter(initial, ROAD_TILE);
  assert.equal(state.phase, "choose-defender");
  assert.deepEqual(state.movement, { remaining: 0, encounters: [2] });
  for (let index = 0; index < 3; index++) {
    const restored = snapshot(state);
    const action = nextAction(state);
    assert.deepEqual(transition(restored, action), transition(state, action));
    state = transition(state, action);
  }
  assert.equal(state.phase, "attack");
  assert.equal(state.battle.turn, "attacker");
  snapshot(state);
});

test("capture snapshots preserve remaining HP and commit rewards and ownership once", () => {
  const initial = createGame([1, 4, 7], [], 9182);
  initial.players[0].party[0] = pokemon(initial, 128, 40);
  let state = enter(initial, WILD_TILE);
  state = transition(state, nextAction(state));
  state.battle.wild.hp = 1;
  state = transition(state, { type: "WILD_ATTACK" });
  state.rng = 1;
  const capturedId = state.battle.wild.id;
  const restored = snapshot(state);
  const captured = transition(restored, { type: "THROW_BALL" });
  assert.equal(captured.players[0].party.find((entry) => entry.id === capturedId).hp, 1);
  assert.ok(captured.players[0].party[0].xp > 0);
  assert.equal(transition(captured, { type: "THROW_BALL" }), captured);
  assert.deepEqual(captured, transition(state, { type: "THROW_BALL" }));
  snapshot(captured);
});

test("branch evolution snapshots resume rewards once, including a victorious road guardian", () => {
  for (const kind of ["trainer", "road"]) {
    const initial = createGame([1, 4, 7], [], 9182);
    initial.players[0].party.push(pokemon(initial, 7));
    initial.players[0].party[0].hp = 1;
    if (kind === "trainer") {
      initial.players[1].position = ROAD_TILE;
      initial.players[1].party[0] = pokemon(initial, 133, 19);
      initial.players[1].party[0].xp = 900;
    } else {
      initial.roads[1] = { ownerId: 1, pokemon: pokemon(initial, 133, 19) };
      initial.roads[1].pokemon.xp = 900;
    }
    let state = enter(initial, ROAD_TILE);
    while (state.phase.startsWith("choose-"))
      state = transition(state, nextAction(state));
    state = transition(state, pokemonBattleAction(state));
    state = assertAutomaticLearning(state);
    assert.equal(state.phase, "evolution");
    const restored = snapshot(state);
    const winnerId = state.evolution.pokemonId;
    const evolved = assertAutomaticLearning(transition(restored, {
      type: "CHOOSE_EVOLUTION",
      speciesId: 134,
    }));
    const winner =
      kind === "trainer"
        ? evolved.players[1].party[0]
        : evolved.roads[1].pokemon;
    assert.equal(winner.id, winnerId);
    assert.equal(winner.level, 20);
    assert.equal(winner.speciesId, 134);
    if (kind === "road") assert.equal(winner.hp, getStats(winner).hp);
    assert.equal(
      transition(evolved, { type: "CHOOSE_EVOLUTION", speciesId: 134 }),
      evolved,
    );
    snapshot(evolved);
  }
});

test("active winner evolution preserves a defeated guardian and ends a knocked-out wild encounter", () => {
  for (const kind of ["road", "wild"]) {
    const initial = createGame([1, 4, 7], [], 9182);
    initial.players[0].party[0] = pokemon(initial, 133, 19);
    initial.players[0].party[0].xp = 900;
    if (kind === "road")
      initial.roads[1] = { ownerId: 1, pokemon: pokemon(initial, 7, 1, 1) };
    let state = enter(initial, kind === "road" ? ROAD_TILE : WILD_TILE);
    state = transition(state, nextAction(state));
    if (kind === "wild") state.battle.wild.hp = 1;
    state = transition(state, nextAction(state));
    state = transition(state, pokemonBattleAction(state));
    state = assertAutomaticLearning(state);
    assert.equal(state.phase, "evolution");
    if (kind === "road") assert.equal(state.players[1].box[0].hp, 0);
    snapshot(state);
    state = assertAutomaticLearning(transition(state, { type: "CHOOSE_EVOLUTION", speciesId: 134 }));
    assert.equal(state.phase, "turn-end");
    if (kind === "road") {
      const returned = state.players[1].box[0];
      assert.equal(returned.hp, getStats(returned).hp);
    }
    snapshot(state);
  }
});

test("a full-party attack save resumes with capture blocked and attacks available", () => {
  const initial = createGame([1, 4], [], 9182);
  initial.players[0].party[0] = pokemon(initial, 128, 40);
  while (initial.players[0].party.length < 6)
    initial.players[0].party.push(pokemon(initial, 7, 3));
  let state = enter(initial, WILD_TILE);
  state = transition(state, nextAction(state));
  state.battle.wild.hp = 1;
  state = transition(state, { type: "WILD_ATTACK" });
  const restored = snapshot(state);
  assert.equal(transition(restored, { type: "THROW_BALL" }), restored);
  const won = transition(restored, pokemonBattleAction(restored));
  assert.equal(won.phase, "turn-end");
  assert.equal(won.players[0].party.length, 6);
  snapshot(won);
});

test("a defeated guardian returns fully healed before a completed battle can be resumed", () => {
  const initial = createGame([1, 4], [], 9182);
  initial.players[0].party[0] = pokemon(initial, 1, 40);
  initial.roads[1] = { ownerId: 1, pokemon: pokemon(initial, 7, 1, 1) };
  let state = enter(initial, ROAD_TILE);
  state = transition(state, nextAction(state));
  state = transition(state, pokemonBattleAction(state));
  state = transition(state, pokemonBattleAction(state));
  state = assertAutomaticLearning(state);
  assert.equal(state.phase, "turn-end");
  assert.equal(state.roads[1], null);
  const returned = state.players[1].box[0];
  assert.equal(returned.hp, getStats(returned).hp);
  snapshot(state);
});

function pendingLap(remaining = 4) {
  const state = createGame([1, 4, 7], [], 9182);
  state.players[1].position = 10;
  state.players[2].position = 20;
  state.players[0].party = [
    pokemon(state, 133, 19, 10),
    pokemon(state, 133, 19, 0),
    pokemon(state, 1, 15, 10),
  ];
  state.players[0].box.push(pokemon(state, 133, 19));
  state.roads[1] = { ownerId: 0, pokemon: pokemon(state, 133, 19) };
  return assertAutomaticLearning(enter(state, 0, remaining));
}

test("multiple lap evolution saves resume each choice once without replaying growth or consuming RNG", () => {
  for (const remaining of [1, 4]) {
    const first = pendingLap(remaining);
    assert.equal(first.phase, "evolution");
    assert.equal(first.battle, null);
    assert.equal(first.players[0].position, 0);
    assert.deepEqual(first.players[0].party.map((entry) => entry.level), [20, 20, 17]);
    assert.equal(first.players[0].box[0].level, 19);
    assert.equal(first.roads[1].pokemon.level, 20);
    assert.deepEqual(first.growth.queue.slice(1).map((entry) => entry.pokemonId), [...first.players[0].party.slice(1).map((entry) => entry.id), first.roads[1].pokemon.id]);
    const firstChoice = { type: "CHOOSE_EVOLUTION", speciesId: 134 };
    const second = assertAutomaticLearning(transition(snapshot(first), firstChoice));
    assert.deepEqual(second, assertAutomaticLearning(transition(first, firstChoice)));
    assert.equal(second.phase, "evolution");
    assert.equal(second.evolution.pokemonId, second.players[0].party[1].id);
    assert.equal(second.players[0].party[1].hp, 0);
    assert.deepEqual(second.growth.queue.slice(1).map((entry) => entry.pokemonId), [second.players[0].party[2].id, second.roads[1].pokemon.id]);
    const secondChoice = { type: "CHOOSE_EVOLUTION", speciesId: 135 };
    const guardianChoice = assertAutomaticLearning(transition(snapshot(second), secondChoice));
    assert.deepEqual(guardianChoice, assertAutomaticLearning(transition(second, secondChoice)));
    assert.equal(guardianChoice.evolution.pokemonId, guardianChoice.roads[1].pokemon.id);
    const completed = assertAutomaticLearning(transition(snapshot(guardianChoice), { type: "CHOOSE_EVOLUTION", speciesId: 136 }));
    assert.equal(completed.roads[1].pokemon.speciesId, 136);
    assert.deepEqual(completed.players[0].party.map((entry) => entry.speciesId), [134, 135, 2]);
    assert.deepEqual(completed.players[0].party.map((entry) => entry.level), [20, 20, 17]);
    assert.equal(completed.growth, null);
    assert.equal(completed.evolution, null);
    assert.equal(completed.phase, remaining === 1 ? "turn-end" : "moving");
    assert.equal(completed.movement.remaining, remaining - 1);
    assert.equal(completed.rng, first.rng);
    assert.equal(completed.turn, first.turn);
    assert.equal(completed.activePlayer, first.activePlayer);
    assert.ok(completed.revision >= first.revision + 3);
    assert.equal(transition(completed, secondChoice), completed);
    snapshot(completed);
  }
});

test("lap evolution saves preserve trainer encounters waiting at the start corner", () => {
  const initial = createGame([133, 4, 7], [], 9182);
  initial.players[0].party[0] = pokemon(initial, 133, 19);
    initial.players[0].party[0].xp = 900;
  const pending = assertAutomaticLearning(enter(initial, 0));
  assert.equal(pending.phase, "evolution");
  assert.deepEqual(pending.movement.encounters, [1, 2]);
  const resumed = assertAutomaticLearning(transition(snapshot(pending), { type: "CHOOSE_EVOLUTION", speciesId: 134 }));
  assert.equal(resumed.phase, "choose-defender");
  assert.equal(resumed.battle.defenderOwner, 1);
  assert.deepEqual(resumed.movement, { remaining: 0, encounters: [2] });
  assert.equal(resumed.rng, pending.rng);
  assert.equal(resumed.turn, pending.turn);
  snapshot(resumed);
});

test("lap save validation rejects forged queues, locations, owners and evolution options", () => {
  const valid = pendingLap();
  snapshot(valid);
  const changes = [
    (state) => { state.growth = null; },
    (state) => { delete state.growth; },
    (state) => { state.growth = []; },
    (state) => { state.growth.queue = null; },
    (state) => { state.growth.queue.reverse(); },
    (state) => { state.growth.queue.pop(); },
    (state) => { state.growth.queue.push(state.growth.queue[0]); },
    (state) => { state.growth.queue[0].pokemonId = state.players[0].box[0].id; },
    (state) => { state.evolution.ownerId = 1; },
    (state) => { state.evolution.pokemonId = state.players[0].box[0].id; },
    (state) => { state.evolution.options.reverse(); },
    (state) => { state.players[0].position = 10; },
    (state) => { state.phase = "moving"; },
    (state) => { state.movement = null; },
    (state) => { state.battle = {}; },
  ];
  for (const corrupt of changes) {
    const copy = structuredClone(valid);
    corrupt(copy);
    assert.equal(validateSave(copy), false, corrupt.toString());
    assert.equal(parseGameSave(copy), null);
  }
  const earlierV2 = createGame([1, 4], [], 1);
  delete earlierV2.lapGrowth;
  snapshot(earlierV2);
  earlierV2.lapGrowth = { remainingPokemonIds: [] };
  assert.equal(validateSave(earlierV2), false);
});

test("pending branch evolution resumes before rescuing a defeated party", () => {
  const initial = createGame([1, 4], [], 9182);
  initial.players[1].position = ROAD_TILE;
  initial.players[1].party[0] = pokemon(initial, 133, 19);
      initial.players[1].party[0].xp = 900;
  initial.players[0].party[0].hp = 1;
  let state = enter(initial, ROAD_TILE);
  while (state.phase.startsWith("choose-"))
    state = transition(state, nextAction(state));
  state = transition(state, pokemonBattleAction(state));
  state = assertAutomaticLearning(state);
  assert.equal(state.phase, "evolution");
  assert.equal(state.winner, null);
  assert.equal(state.players[0].restTurnsRemaining, 0);
  snapshot(state);
  state = assertAutomaticLearning(transition(state, { type: "CHOOSE_EVOLUTION", speciesId: 134 }));
  assert.equal(state.phase, "turn-end");
  assert.equal(state.players[0].restTurnsRemaining, 3);
  assert.equal(state.players[0].position, 10);
  assert.equal(state.winner, null);
  snapshot(state);
});

test("save validation rejects malformed scalar, roster, ownership and phase data", () => {
  const valid = createGame([1, 4, 7], [], 9182);
  const changes = [
    (state) => {
      state.version = 1;
    },
    (state) => {
      state.rng = 0;
    },
    (state) => {
      state.rng = -1;
    },
    (state) => {
      state.revision = NaN;
    },
    (state) => {
      state.activePlayer = 8;
    },
    (state) => {
      state.players[1].id = 0;
    },
    (state) => {
      state.players[0].position = BOARD_SIZE;
    },
    (state) => {
      state.players[0].name = "";
    },
    (state) => {
      state.players[0].party[0].speciesId = 9000;
    },
    (state) => {
      state.players[0].party[0].hp = 100000;
    },
    (state) => {
      state.players[0].party[0].level = 0;
    },
    (state) => {
      state.players[0].party[0].hp = 0;
    },
    (state) => {
      state.players[0].party = [];
    },
    (state) => {
      state.players[0].box.push(structuredClone(state.players[0].party[0]));
    },
    (state) => {
      state.players[1].party[0].id = state.players[0].party[0].id;
    },
    (state) => {
      state.players[0].restTurnsRemaining = 3;
    },
    (state) => {
      delete state.players[0].starterSpeciesId;
    },
    (state) => {
      state.players[0].starterSpeciesId = 2;
    },
    (state) => {
      state.players[0].restTurnsRemaining = -1;
    },
    (state) => {
      state.players[0].restTurnsRemaining = 4;
    },
    (state) => {
      state.players[0].seatSide = "front";
    },
    (state) => {
      delete state.players[0].seatSide;
    },
    (state) => {
      state.roads.pop();
    },
    (state) => {
      state.roads[0] = { ownerId: 0, pokemon: pokemon(state, 7) };
    },
    (state) => {
      state.roads[1] = { ownerId: 9, pokemon: pokemon(state, 7) };
    },
    (state) => {
      state.roads[1] = { ownerId: 0, pokemon: pokemon(state, 7, 1, 0) };
    },
    (state) => {
      state.phase = "capture";
    },
    (state) => {
      state.phase = "finished";
      state.winner = 0;
    },
    (state) => {
      state.movement = { remaining: 2, encounters: [] };
    },
    (state) => {
      state.log.push({ unsafe: true });
    },
  ];
  for (const corrupt of changes) {
    const state = structuredClone(valid);
    corrupt(state);
    assert.equal(validateSave(state), false, corrupt.toString());
    assert.equal(parseGameSave(state), null);
  }
  for (const value of [null, undefined, {}, [], "save", 1, false])
    assert.equal(validateSave(value), false);
});

test("save validation rejects forged battle references, progression and rewards", () => {
  const initial = createGame([1, 4, 7], [], 9182);
  initial.players[1].position = ROAD_TILE;
  let state = enter(initial, ROAD_TILE);
  state = transition(state, nextAction(state));
  state = transition(state, nextAction(state));
  assert.ok(validateSave(state));
  const changes = [
    (copy) => {
      copy.battle.attackerPokemonId = copy.players[2].party[0].id;
    },
    (copy) => {
      copy.battle.defenderPokemonId = copy.players[2].party[0].id;
    },
    (copy) => {
      copy.battle.defenderOwner = 0;
    },
    (copy) => {
      copy.battle.outcome = { kind: "knockout", winner: "attacker" };
    },
    (copy) => {
      copy.battle.turn = "unknown";
    },
    (copy) => {
      copy.battle.wild = pokemon(copy, 7);
    },
    (copy) => {
      copy.movement.encounters = [2];
    },
    (copy) => {
      copy.movement.encounters = [1, 1];
    },
    (copy) => {
      copy.movement.remaining = 13;
    },
    (copy) => {
      copy.movement = null;
    },
    (copy) => {
      copy.battle = null;
    },
    (copy) => {
      copy.evolution = {
        ownerId: 0,
        pokemonId: copy.players[0].party[0].id,
        options: [2],
      };
    },
  ];
  for (const corrupt of changes) {
    const copy = structuredClone(state);
    corrupt(copy);
    assert.equal(validateSave(copy), false, corrupt.toString());
  }
});

test("resting saves preserve counters, seats, starter identity and deployed guardians", () => {
  const state = createGame([1, 4, 7], [], 9182, ["right", "bottom", "left"]);
  state.players[1].party[0].hp = 0;
  state.players[1].position = 10;
  state.players[1].restTurnsRemaining = 2;
  state.roads[1] = { ownerId: 1, pokemon: pokemon(state, 4, 20) };
  snapshot(state);
  for (const corrupt of [
    (copy) => { copy.players[1].position = 2; },

    (copy) => { copy.players[1].restTurnsRemaining = 0; },
    (copy) => { copy.activePlayer = 1; },
    (copy) => { copy.players[2].party[0].hp = 0; },
  ]) {
    const copy = structuredClone(state);
    corrupt(copy);
    assert.equal(validateSave(copy), false, corrupt.toString());
  }
});

test("monopoly saves resume the terminal state and reject incomplete or unrecorded ownership", () => {
  const initial = createGame([1, 4], [], 9182);
  initial.players[0].party.push(pokemon(initial, 7));
  for (const [tile, kind] of BOARD_TILES.entries()) {
    if (kind === "road" && tile !== ROAD_TILE)
      initial.roads[tile] = { ownerId: 0, pokemon: pokemon(initial, 1) };
  }
  initial.players[0].position = ROAD_TILE;
  const ready = snapshot(initial);
  const state = snapshot(transition(transition(ready, { type: "START_EXCHANGE" }), { type: "DEPLOY", pokemonId: ready.players[0].party[0].id }));
  assert.equal(state.winner, 0);
  assert.equal(state.phase, "finished");
  assert.equal(transition(state, { type: "ROLL" }), state);
  for (const corrupt of [
    (copy) => { copy.roads[1] = null; },
    (copy) => { copy.roads[1].ownerId = 1; },
    (copy) => { copy.winner = 1; },
    (copy) => { copy.winner = null; copy.phase = "turn-end"; },
  ]) {
    const copy = structuredClone(state);
    corrupt(copy);
    assert.equal(validateSave(copy), false, corrupt.toString());
  }
});
