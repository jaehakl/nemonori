import assert from "node:assert/strict";
import test from "node:test";
import { loadGameSource } from "./game-test-helpers.mjs";

const path = "app/games/_components/pokemon-marble/";
const { createGame, transition, getStats, getActingPlayer } = loadGameSource(
  `${path}engine.ts`,
);
const { validateSave, parseGameSave } = loadGameSource(`${path}save.ts`);

function pokemon(state, speciesId, level = 1, hp) {
  const entry = { id: `p${state.nextPokemonId++}`, speciesId, level, hp: 0 };
  entry.hp = hp ?? getStats(entry).hp;
  return entry;
}
function enter(state, tile, remaining = 1) {
  state.players[state.activePlayer].position = (tile + 31) % 32;
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
      return { type: "CAPTURE", capture: true };
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

test("2- and 4-player complete games resume identically after every committed action", () => {
  for (const count of [2, 4]) {
    for (const seed of [1, 35, 9182, 987654321]) {
      let state = createGame([1, 4, 7, 172].slice(0, count), [], seed);
      let actions = 0;
      while (state.phase !== "finished" && actions++ < 5000) {
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
      assert.equal(
        state.phase,
        "finished",
        `Match never ended for ${count} players, seed ${seed}`,
      );
      snapshot(state);
      assert.equal(
        state.players.filter((player) => !player.eliminated).length,
        1,
      );
    }
  }
});

test("paused encounters keep remaining movement, selected Pokemon, attack turn and RNG", () => {
  const initial = createGame([1, 4, 7, 172], [], 13);
  initial.players[1].position = 2;
  initial.players[2].position = 2;
  let state = enter(initial, 2, 4);
  assert.equal(state.phase, "choose-defender");
  assert.deepEqual(state.movement, { remaining: 3, encounters: [2] });
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
    snapshot(state);
    state = transition(state, { type: "CHOOSE_EVOLUTION", speciesId: 134 });
    assert.equal(state.phase, kind === "road" ? "road" : "capture");
    snapshot(state);
  }
});

test("the last survivor completes its pending branch evolution before the winner screen", () => {
  const initial = createGame([1, 4], [], 9182);
  initial.players[1].position = 2;
  initial.players[1].party[0] = pokemon(initial, 133, 19);
  initial.players[0].party[0].hp = 1;
  let state = enter(initial, 2);
  while (state.phase.startsWith("choose-"))
    state = transition(state, nextAction(state));
  state = transition(state, { type: "ATTACK", moveId: 0 });
  assert.equal(state.phase, "evolution");
  assert.equal(state.winner, 1);
  snapshot(state);
  state = transition(state, { type: "CHOOSE_EVOLUTION", speciesId: 134 });
  assert.equal(state.phase, "finished");
  assert.equal(state.winner, 1);
  snapshot(state);
});

test("save validation rejects malformed scalar, roster, ownership and phase data", () => {
  const valid = createGame([1, 4, 7], [], 9182);
  const changes = [
    (state) => {
      state.version = 2;
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
      state.players[0].position = 32;
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
      state.players[0].eliminated = true;
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
  let state = enter(initial, 2, 2);
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
