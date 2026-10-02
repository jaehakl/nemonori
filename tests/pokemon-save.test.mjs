import assert from "node:assert/strict";
import test from "node:test";
import { loadGameSource } from "./game-test-helpers.mjs";

const path = "app/games/_components/pokemon-marble/";
const { createGame, transition, getStats, getActingPlayer } = loadGameSource(
  `${path}engine.ts`,
);
const { validateSave, parseGameSave } = loadGameSource(`${path}save.ts`);
const { BOARD_SIZE, BOARD_TILES } = loadGameSource(`${path}board.ts`);

function pokemon(state, speciesId, level = 1, hp) {
  const entry = { id: `p${state.nextPokemonId++}`, speciesId, level, hp: 0 };
  entry.hp = hp ?? getStats(entry).hp;
  return entry;
}
function enter(state, tile, remaining = 1) {
  state.players[state.activePlayer].position = (tile + BOARD_SIZE - 1) % BOARD_SIZE;
  state.phase = "moving";
  state.dice = [6, 6];
  state.movement = { remaining, encounters: [] };
  return transition(state, { type: "STEP" });
}
function nextAction(state) {
  switch (state.phase) {
    case "roll":
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
        : { type: "ATTACK", moveId: 0 };
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

test("2- and 4-player games resume identically across movement, battles and rest", () => {
  for (const count of [2, 4]) {
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
  initial.players[1].position = 2;
  initial.players[2].position = 2;
  let state = enter(initial, 2);
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

test("capture snapshots grant the Pokemon once and preserve zero HP", () => {
  const initial = createGame([1, 4, 7], [], 9182);
  initial.players[0].party[0] = pokemon(initial, 1, 40);
  let state = enter(initial, 1);
  state = transition(state, nextAction(state));
  state.battle.wild.hp = 1;
  state = transition(state, { type: "WILD_ATTACK" });
  state = transition(state, { type: "ATTACK", moveId: 0 });
  assert.equal(state.phase, "capture");
  const capturedId = state.battle.wild.id;
  const restored = snapshot(state);
  const captured = transition(restored, { type: "CAPTURE", capture: true });
  assert.equal(
    captured.players[0].party.find((entry) => entry.id === capturedId).hp,
    0,
  );
  assert.equal(
    transition(captured, { type: "CAPTURE", capture: true }),
    captured,
  );
  snapshot(captured);
});

test("branch evolution snapshots resume rewards once, including a victorious road guardian", () => {
  for (const kind of ["trainer", "road"]) {
    const initial = createGame([1, 4, 7], [], 9182);
    initial.players[0].party.push(pokemon(initial, 7));
    initial.players[0].party[0].hp = 1;
    if (kind === "trainer") {
      initial.players[1].position = 2;
      initial.players[1].party[0] = pokemon(initial, 133, 19);
    } else
      initial.roads[2] = { ownerId: 1, pokemon: pokemon(initial, 133, 19) };
    let state = enter(initial, 2);
    while (state.phase.startsWith("choose-"))
      state = transition(state, nextAction(state));
    state = transition(state, { type: "ATTACK", moveId: 0 });
    assert.equal(state.phase, "evolution");
    const restored = snapshot(state);
    const winnerId = state.evolution.pokemonId;
    const evolved = transition(restored, {
      type: "CHOOSE_EVOLUTION",
      speciesId: 134,
    });
    const winner =
      kind === "trainer"
        ? evolved.players[1].party[0]
        : evolved.roads[2].pokemon;
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

test("active winner evolution preserves a defeated guardian in the box and pending capture", () => {
  for (const kind of ["road", "wild"]) {
    const initial = createGame([1, 4, 7], [], 9182);
    initial.players[0].party[0] = pokemon(initial, 133, 19);
    if (kind === "road")
      initial.roads[2] = { ownerId: 1, pokemon: pokemon(initial, 7, 1, 1) };
    let state = enter(initial, kind === "road" ? 2 : 1);
    state = transition(state, nextAction(state));
    if (kind === "wild") state.battle.wild.hp = 1;
    state = transition(state, nextAction(state));
    state = transition(state, { type: "ATTACK", moveId: 0 });
    assert.equal(state.phase, "evolution");
    if (kind === "road") assert.equal(state.players[1].box[0].hp, 0);
    snapshot(state);
    state = transition(state, { type: "CHOOSE_EVOLUTION", speciesId: 134 });
    assert.equal(state.phase, kind === "road" ? "road" : "capture");
    if (kind === "road") {
      const returned = state.players[1].box[0];
      assert.equal(returned.hp, getStats(returned).hp);
    }
    snapshot(state);
  }
});

test("a full-party capture save resumes with release available and capture still blocked", () => {
  const initial = createGame([1, 4], [], 9182);
  initial.players[0].party[0] = pokemon(initial, 1, 40);
  while (initial.players[0].party.length < 6)
    initial.players[0].party.push(pokemon(initial, 7, 3));
  let state = enter(initial, 1);
  state = transition(state, nextAction(state));
  state.battle.wild.hp = 1;
  state = transition(state, { type: "WILD_ATTACK" });
  state = transition(state, { type: "ATTACK", moveId: 0 });
  assert.equal(state.phase, "capture");
  const restored = snapshot(state);
  assert.equal(transition(restored, { type: "CAPTURE", capture: true }), restored);
  const released = transition(restored, { type: "CAPTURE", capture: false });
  assert.equal(released.phase, "turn-end");
  assert.equal(released.players[0].party.length, 6);
  assert.equal(released.players[0].box.length, 0);
  assert.equal(released.rng, state.rng);
  assert.equal(released.turn, state.turn);
  snapshot(released);
});

test("a defeated guardian returns fully healed before a completed battle can be resumed", () => {
  const initial = createGame([1, 4], [], 9182);
  initial.players[0].party[0] = pokemon(initial, 1, 40);
  initial.roads[2] = { ownerId: 1, pokemon: pokemon(initial, 7, 1, 1) };
  let state = enter(initial, 2);
  state = transition(state, nextAction(state));
  state = transition(state, { type: "ATTACK", moveId: 0 });
  state = transition(state, { type: "ATTACK", moveId: 0 });
  assert.equal(state.phase, "road");
  assert.equal(state.roads[2], null);
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
  state.roads[2] = { ownerId: 0, pokemon: pokemon(state, 133, 19) };
  return enter(state, 0, remaining);
}

test("multiple lap evolution saves resume each choice once without replaying growth or consuming RNG", () => {
  for (const remaining of [1, 4]) {
    const first = pendingLap(remaining);
    assert.equal(first.phase, "evolution");
    assert.equal(first.battle, null);
    assert.equal(first.players[0].position, 0);
    assert.deepEqual(first.players[0].party.map((entry) => entry.level), [20, 20, 16]);
    assert.equal(first.players[0].box[0].level, 19);
    assert.equal(first.roads[2].pokemon.level, 19);
    assert.deepEqual(first.lapGrowth.remainingPokemonIds, first.players[0].party.slice(1).map((entry) => entry.id));
    const firstChoice = { type: "CHOOSE_EVOLUTION", speciesId: 134 };
    const second = transition(snapshot(first), firstChoice);
    assert.deepEqual(second, transition(first, firstChoice));
    assert.equal(second.phase, "evolution");
    assert.equal(second.evolution.pokemonId, second.players[0].party[1].id);
    assert.equal(second.players[0].party[1].hp, 0);
    assert.deepEqual(second.lapGrowth.remainingPokemonIds, [second.players[0].party[2].id]);
    const secondChoice = { type: "CHOOSE_EVOLUTION", speciesId: 135 };
    const completed = transition(snapshot(second), secondChoice);
    assert.deepEqual(completed, transition(second, secondChoice));
    assert.deepEqual(completed.players[0].party.map((entry) => entry.speciesId), [134, 135, 2]);
    assert.deepEqual(completed.players[0].party.map((entry) => entry.level), [20, 20, 16]);
    assert.equal(completed.lapGrowth, null);
    assert.equal(completed.evolution, null);
    assert.equal(completed.phase, remaining === 1 ? "center" : "moving");
    assert.equal(completed.movement.remaining, remaining - 1);
    assert.equal(completed.rng, first.rng);
    assert.equal(completed.turn, first.turn);
    assert.equal(completed.activePlayer, first.activePlayer);
    assert.equal(completed.revision, first.revision + 2);
    assert.equal(transition(completed, secondChoice), completed);
    snapshot(completed);
  }
});

test("lap evolution saves preserve trainer encounters waiting at the start corner", () => {
  const initial = createGame([133, 4, 7], [], 9182);
  initial.players[0].party[0] = pokemon(initial, 133, 19);
  const pending = enter(initial, 0);
  assert.equal(pending.phase, "evolution");
  assert.deepEqual(pending.movement.encounters, [1, 2]);
  const resumed = transition(snapshot(pending), { type: "CHOOSE_EVOLUTION", speciesId: 134 });
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
    (state) => { state.lapGrowth = null; },
    (state) => { delete state.lapGrowth; },
    (state) => { state.lapGrowth = []; },
    (state) => { state.lapGrowth.remainingPokemonIds = null; },
    (state) => { state.lapGrowth.remainingPokemonIds.reverse(); },
    (state) => { state.lapGrowth.remainingPokemonIds.pop(); },
    (state) => { state.lapGrowth.remainingPokemonIds.push(state.players[0].party[1].id); },
    (state) => { state.lapGrowth.remainingPokemonIds[0] = state.players[0].box[0].id; },
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
  initial.players[1].position = 2;
  initial.players[1].party[0] = pokemon(initial, 133, 19);
  initial.players[0].party[0].hp = 1;
  let state = enter(initial, 2);
  while (state.phase.startsWith("choose-"))
    state = transition(state, nextAction(state));
  state = transition(state, { type: "ATTACK", moveId: 0 });
  assert.equal(state.phase, "evolution");
  assert.equal(state.winner, null);
  assert.equal(state.players[0].restTurnsRemaining, 0);
  snapshot(state);
  state = transition(state, { type: "CHOOSE_EVOLUTION", speciesId: 134 });
  assert.equal(state.phase, "turn-end");
  assert.equal(state.players[0].restTurnsRemaining, 3);
  assert.equal(state.players[0].position, 0);
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
      state.roads[2] = { ownerId: 9, pokemon: pokemon(state, 7) };
    },
    (state) => {
      state.roads[2] = { ownerId: 0, pokemon: pokemon(state, 7, 1, 0) };
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
  initial.players[1].position = 2;
  let state = enter(initial, 2);
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
      copy.battle.winner = "attacker";
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
  state.roads[2] = { ownerId: 1, pokemon: pokemon(state, 4, 20) };
  snapshot(state);
  for (const corrupt of [
    (copy) => { copy.players[1].position = 2; },
    (copy) => { copy.players[1].party[0].hp = 1; },
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
    if (kind === "road" && tile !== 2)
      initial.roads[tile] = { ownerId: 0, pokemon: pokemon(initial, 1) };
  }
  const ready = snapshot(enter(initial, 2));
  const state = snapshot(transition(ready, { type: "DEPLOY", pokemonId: ready.players[0].party[0].id }));
  assert.equal(state.winner, 0);
  assert.equal(state.phase, "finished");
  assert.equal(transition(state, { type: "ROLL" }), state);
  for (const corrupt of [
    (copy) => { copy.roads[2] = null; },
    (copy) => { copy.roads[2].ownerId = 1; },
    (copy) => { copy.winner = 1; },
    (copy) => { copy.winner = null; copy.phase = "turn-end"; },
  ]) {
    const copy = structuredClone(state);
    corrupt(copy);
    assert.equal(validateSave(copy), false, corrupt.toString());
  }
});
