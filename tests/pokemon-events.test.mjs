import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { loadGameSource } from "./game-test-helpers.mjs";

const path = "app/games/_components/pokemon-marble/";
const {
  createGame,
  transition,
  transitionWithEvents,
  snapshotForPresentation,
  getStats,
  getBattlePokemon,
  getActingPlayer,
} = loadGameSource(`${path}engine.ts`);
const { validateSave } = loadGameSource(`${path}save.ts`);

function game(count = 3, seed = 9182) {
  return createGame([1, 4, 7, 172].slice(0, count), [], seed);
}

function pokemon(state, speciesId = 128, level = 40, hp) {
  const value = { id: `p${state.nextPokemonId++}`, speciesId, level, hp: 0 };
  value.hp = hp ?? getStats(value).hp;
  return value;
}

function beforeEntry(state, tile, remaining = 1) {
  state.players[0].position = (tile + 31) % 32;
  state.phase = "moving";
  state.dice = [6, 6];
  state.movement = { remaining, encounters: [] };
  return state;
}

function enter(state, tile, remaining = 1) {
  return transition(beforeEntry(state, tile, remaining), { type: "STEP" });
}

function selectBoth(state) {
  while (["choose-defender", "choose-attacker"].includes(state.phase)) {
    state = transition(state, {
      type: "CHOOSE_POKEMON",
      pokemonId: state.players[getActingPlayer(state)].party.find(
        (entry) => entry.hp > 0,
      ).id,
    });
  }
  return state;
}

function readyForFinishingHit(state) {
  state = selectBoth(state);
  getBattlePokemon(state, "defender").hp = 1;
  state = transition(
    state,
    state.battle.kind === "wild"
      ? { type: "WILD_ATTACK" }
      : { type: "ATTACK", moveId: 0 },
  );
  assert.equal(state.phase, "attack");
  assert.equal(state.battle.turn, "attacker");
  return state;
}

function kinds(result) {
  return result.events.map((event) => event.kind);
}

function assertTransition(previous, action) {
  const original = structuredClone(previous);
  const expected = transition(previous, action);
  const result = transitionWithEvents(previous, action);
  assert.deepEqual(previous, original, "Presentation mutated the input state");
  assert.deepEqual(
    result.state,
    expected,
    "Presentation changed the game result",
  );
  assert.equal(result.state.rng, expected.rng);
  result.events.forEach((event, index) => {
    assert.equal(event.revision, result.state.revision);
    assert.equal(event.sequence, index);
  });
  return result;
}

test("roll and step events retain dice, positions and encounter order", () => {
  const rolled = assertTransition(game(), { type: "ROLL" });
  assert.deepEqual(kinds(rolled), ["roll"]);
  assert.deepEqual(rolled.events[0].snapshot.dice, rolled.state.dice);
  assert.notEqual(rolled.events[0].snapshot.dice, rolled.state.dice);

  const moved = assertTransition(beforeEntry(game(), 1), { type: "STEP" });
  assert.deepEqual(kinds(moved), ["move", "encounter"]);
  assert.equal(moved.events[0].fromTile, 0);
  assert.equal(moved.events[0].tile, 1);
  assert.equal(moved.events[0].snapshot.players[0].position, 1);
  assert.equal(moved.events[0].snapshot.battle, null);
  assert.equal(moved.events[1].snapshot.battle.kind, "wild");
  assert.equal(moved.events[1].playerId, null);
  assert.equal(moved.events[1].pokemon.id, moved.state.battle.wild.id);
});

test("Pokemon selection emits the selected side without inventing an opponent", () => {
  const initial = game();
  initial.players[1].position = 2;
  const encounter = enter(initial, 2);
  const defender = assertTransition(encounter, {
    type: "CHOOSE_POKEMON",
    pokemonId: initial.players[1].party[0].id,
  });
  assert.deepEqual(kinds(defender), ["send-out"]);
  assert.equal(defender.events[0].side, "defender");
  assert.equal(defender.events[0].playerId, 1);
  assert.equal(defender.events[0].snapshot.battle.attacker, null);
  assert.equal(
    defender.events[0].snapshot.battle.defender.id,
    initial.players[1].party[0].id,
  );
  const attacker = assertTransition(defender.state, {
    type: "CHOOSE_POKEMON",
    pokemonId: initial.players[0].party[0].id,
  });
  assert.equal(attacker.events[0].side, "attacker");
  assert.equal(attacker.events[0].snapshot.battle.turn, "defender");
});

test("the finishing attack survives battle cleanup with detached HP snapshots", () => {
  const initial = game();
  initial.players[0].party[0] = pokemon(initial);
  initial.players[1].position = 2;
  const previous = readyForFinishingHit(enter(initial, 2));
  const result = assertTransition(previous, { type: "ATTACK", moveId: 0 });
  assert.deepEqual(kinds(result), ["attack", "faint", "level-up", "eliminate"]);
  assert.equal(result.state.battle, null);
  assert.equal(result.state.phase, "road");
  const hit = result.events[0];
  assert.equal(hit.attack.beforeHp, 1);
  assert.equal(hit.attack.afterHp, 0);
  assert.equal(hit.attack.moveType, null);
  assert.equal(hit.attack.category, "physical");
  assert.equal(hit.snapshot.battle.defender.hp, 0);
  assert.equal(hit.snapshot.battle.attacker.level, 40);
  assert.equal(result.events[2].snapshot.battle.attacker.level, 41);
  assert.equal(result.events[1].side, "defender");
  assert.equal(
    result.events[1].pokemon.maxHp,
    getStats(previous.players[1].party[0]).hp,
  );

  result.state.players[1].party[0].hp = 8;
  result.state.players[0].position = 7;
  assert.equal(hit.snapshot.battle.defender.hp, 0);
  assert.equal(hit.snapshot.players[0].position, 2);
  hit.snapshot.battle.attacker.hp = 0;
  assert.notEqual(result.state.players[0].party[0].hp, 0);
  assert.notEqual(result.events[1].snapshot.battle.attacker.hp, 0);
});

test("one finishing attack can queue the next trainer without replacing its history", () => {
  const initial = game(4);
  initial.players[0].party[0] = pokemon(initial);
  initial.players[1].position = 2;
  initial.players[2].position = 2;
  const previous = readyForFinishingHit(enter(initial, 2, 2));
  const first = assertTransition(previous, { type: "ATTACK", moveId: 0 });
  assert.deepEqual(kinds(first), [
    "attack",
    "faint",
    "level-up",
    "eliminate",
    "encounter",
  ]);
  assert.equal(
    first.events[0].snapshot.battle.defender.id,
    initial.players[1].party[0].id,
  );
  assert.equal(first.events.at(-1).playerId, 2);
  assert.equal(
    first.events.at(-1).snapshot.battle.defenderName,
    initial.players[2].name,
  );
  assert.equal(first.events.at(-1).snapshot.battle.attacker, null);
  assert.equal(first.state.battle.defenderOwner, 2);
  assert.equal(first.state.movement.remaining, 1);

  const second = assertTransition(readyForFinishingHit(first.state), {
    type: "ATTACK",
    moveId: 0,
  });
  assert.equal(second.state.phase, "moving");
  assert.equal(second.state.movement.remaining, 1);
  assert.equal(
    second.events[0].snapshot.battle.defender.id,
    initial.players[2].party[0].id,
  );
});

test("automatic evolution follows level gain without rewriting the attack species", () => {
  const initial = game();
  initial.players[0].party[0] = pokemon(initial, 1, 15);
  initial.players[1].position = 2;
  const previous = readyForFinishingHit(enter(initial, 2));
  const result = assertTransition(previous, { type: "ATTACK", moveId: 0 });
  assert.deepEqual(kinds(result), [
    "attack",
    "faint",
    "level-up",
    "evolution",
    "eliminate",
  ]);
  const evolved = result.events.find((event) => event.kind === "evolution");
  assert.equal(result.events[0].snapshot.battle.attacker.speciesId, 1);
  assert.equal(result.events[2].pokemon.speciesId, 1);
  assert.equal(evolved.previousSpeciesId, 1);
  assert.equal(evolved.pokemon.speciesId, 2);
  assert.equal(evolved.playerId, 0);
  assert.equal(evolved.snapshot.battle.attacker.speciesId, 2);
  assert.equal(evolved.pokemon.hp, previous.players[0].party[0].hp);
});

test("branch evolution emits only on selection and preserves the defender owner", () => {
  const initial = game();
  initial.players[1].position = 2;
  initial.players[1].party[0] = pokemon(initial, 133, 19);
  initial.players[0].party.push(pokemon(initial, 128, 1));
  initial.players[0].party[0].hp = 1;
  const result = assertTransition(selectBoth(enter(initial, 2)), {
    type: "ATTACK",
    moveId: 0,
  });
  assert.equal(result.state.phase, "evolution");
  assert.deepEqual(kinds(result), ["attack", "faint", "level-up"]);
  const evolved = assertTransition(result.state, {
    type: "CHOOSE_EVOLUTION",
    speciesId: 134,
  });
  assert.deepEqual(kinds(evolved), ["evolution"]);
  assert.equal(evolved.events[0].playerId, 1);
  assert.equal(evolved.events[0].previousSpeciesId, 133);
  assert.equal(evolved.events[0].snapshot.battle.defender.speciesId, 134);
  assert.equal(evolved.state.battle, null);
});

test("road guardian snapshots survive removal from the board into its owner's box", () => {
  const initial = game();
  initial.players[0].party[0] = pokemon(initial);
  initial.roads[2] = { ownerId: 1, pokemon: pokemon(initial, 4, 1) };
  const previous = readyForFinishingHit(enter(initial, 2));
  const result = assertTransition(previous, { type: "ATTACK", moveId: 0 });
  assert.deepEqual(kinds(result), ["attack", "faint", "level-up"]);
  assert.equal(result.events[1].snapshot.guardians.length, 1);
  assert.equal(result.events[2].snapshot.guardians.length, 0);
  assert.equal(
    result.events[2].snapshot.battle.defender.id,
    initial.roads[2].pokemon.id,
  );
  assert.equal(result.state.players[1].box[0].hp, 0);
  assert.equal(result.state.battle, null);
});

test("center healing follows movement or a finished encounter, without healing guardians", () => {
  const initial = game();
  initial.players[0].party[0] = pokemon(initial, 128, 40, 3);
  initial.players[0].box.push(pokemon(initial, 7, 1, 0));
  initial.roads[2] = { ownerId: 0, pokemon: pokemon(initial, 4, 1, 1) };
  const arrival = assertTransition(beforeEntry(initial, 8), { type: "STEP" });
  assert.deepEqual(kinds(arrival), ["move", "heal"]);
  assert.equal(arrival.events[1].tile, 8);
  assert.equal(arrival.events[1].snapshot.battle, null);
  assert.equal(
    arrival.state.players[0].box[0].hp,
    getStats(initial.players[0].box[0]).hp,
  );
  assert.equal(arrival.state.roads[2].pokemon.hp, 1);

  const encounter = game();
  encounter.players[0].party[0] = pokemon(encounter);
  encounter.players[1].position = 8;
  const previous = readyForFinishingHit(enter(encounter, 8));
  const result = assertTransition(previous, { type: "ATTACK", moveId: 0 });
  assert.equal(result.events.at(-1).kind, "heal");
  assert.ok(
    result.events[0].snapshot.battle.attacker.hp <
      result.state.players[0].party[0].hp,
  );
  assert.equal(result.events.at(-1).snapshot.battle, null);
});

test("successful capture carries the fainted wild Pokemon while declining emits no success", () => {
  const initial = game();
  initial.players[0].party[0] = pokemon(initial);
  const previous = readyForFinishingHit(enter(initial, 1));
  const defeated = assertTransition(previous, { type: "ATTACK", moveId: 0 });
  assert.equal(defeated.state.phase, "capture");
  const wildId = defeated.state.battle.wild.id;
  const accepted = assertTransition(defeated.state, {
    type: "CAPTURE",
    capture: true,
  });
  assert.deepEqual(kinds(accepted), ["capture"]);
  assert.equal(accepted.events[0].pokemon.id, wildId);
  assert.equal(accepted.events[0].pokemon.hp, 0);
  assert.equal(accepted.events[0].snapshot.battle.defender.id, wildId);
  assert.equal(accepted.state.battle, null);
  const declined = assertTransition(defeated.state, {
    type: "CAPTURE",
    capture: false,
  });
  assert.deepEqual(declined.events, []);
  assert.equal(declined.state.phase, "turn-end");
  assert.equal(
    declined.state.players[0].party.some((entry) => entry.id === wildId),
    false,
  );
});

test("deployment, replacement, retrieval and next turn expose the resulting board", () => {
  const initial = game();
  initial.players[0].party.push(pokemon(initial, 7, 1));
  const road = enter(initial, 2);
  const deployed = assertTransition(road, {
    type: "DEPLOY",
    pokemonId: road.players[0].party[0].id,
  });
  assert.deepEqual(kinds(deployed), ["deploy"]);
  assert.deepEqual(deployed.events[0].snapshot.guardians, [
    { tile: 2, ownerId: 0, speciesId: 1 },
  ]);
  const replacement = structuredClone(deployed.state);
  replacement.phase = "road";
  const swapped = assertTransition(replacement, {
    type: "SWAP_GUARDIAN",
    pokemonId: replacement.players[0].party[0].id,
  });
  assert.deepEqual(kinds(swapped), ["deploy"]);
  assert.equal(swapped.events[0].snapshot.guardians[0].speciesId, 7);
  const retrieving = structuredClone(swapped.state);
  retrieving.phase = "road";
  const retrieved = assertTransition(retrieving, { type: "RETRIEVE" });
  assert.deepEqual(kinds(retrieved), ["retrieve"]);
  assert.deepEqual(retrieved.events[0].snapshot.guardians, []);
  const ended = assertTransition(retrieved.state, { type: "END_TURN" });
  assert.deepEqual(kinds(ended), ["turn"]);
  assert.equal(ended.events[0].playerId, 1);
  assert.equal(ended.events[0].snapshot.activePlayerId, 1);
  assert.equal(ended.events[0].snapshot.dice, null);
});

test("final victory follows fainting and elimination, and level 100 is not a level-up", () => {
  const initial = game(2);
  initial.players[0].party[0] = pokemon(initial, 128, 100);
  initial.players[1].position = 2;
  const previous = readyForFinishingHit(enter(initial, 2));
  const result = assertTransition(previous, { type: "ATTACK", moveId: 0 });
  assert.deepEqual(kinds(result), ["attack", "faint", "eliminate", "victory"]);
  assert.equal(result.events[0].snapshot.battle.defender.hp, 0);
  assert.equal(result.events.at(-1).snapshot.battle, null);
  assert.equal(result.events.at(-1).snapshot.players[1].eliminated, true);
  assert.equal(result.events.at(-1).playerId, 0);
  assert.equal(result.state.phase, "finished");
  assert.ok(validateSave(result.state));
  const noReplay = assertTransition(result.state, {
    type: "ATTACK",
    moveId: 0,
  });
  assert.equal(noReplay.state, result.state);
  assert.deepEqual(noReplay.events, []);
});

test("a final defender victory waits for its chosen evolution before celebrating", () => {
  const initial = game(2);
  initial.players[0].party[0].hp = 1;
  initial.players[1].position = 2;
  initial.players[1].party[0] = pokemon(initial, 133, 19);
  const previous = selectBoth(enter(initial, 2));
  const won = assertTransition(previous, { type: "ATTACK", moveId: 0 });
  assert.equal(won.state.phase, "evolution");
  assert.equal(won.state.winner, 1);
  assert.deepEqual(kinds(won), ["attack", "faint", "level-up", "eliminate"]);
  assert.equal(won.events[0].attack.side, "defender");
  assert.equal(won.events[1].side, "attacker");
  assert.ok(validateSave(won.state));

  const evolved = assertTransition(won.state, {
    type: "CHOOSE_EVOLUTION",
    speciesId: 134,
  });
  assert.deepEqual(kinds(evolved), ["evolution", "victory"]);
  assert.equal(evolved.events[0].snapshot.battle.defender.speciesId, 134);
  assert.equal(evolved.events[1].playerId, 1);
  assert.equal(evolved.events[1].snapshot.activePlayerId, 1);
  assert.equal(evolved.events[1].snapshot.battle, null);
  assert.equal(evolved.state.phase, "finished");
});

test("wild attack selection consumes only game RNG and retains its null owner", () => {
  const initial = game();
  initial.players[0].party[0] = pokemon(initial);
  const previous = selectBoth(enter(initial, 1));
  const result = assertTransition(previous, { type: "WILD_ATTACK" });
  assert.equal(result.events[0].kind, "attack");
  assert.equal(result.events[0].playerId, null);
  assert.equal(result.events[0].attack.side, "defender");
  assert.equal(result.events[0].pokemon.id, previous.battle.wild.id);
  assert.equal(
    result.events[0].attack.moveId,
    result.state.battle.lastAttack.moveId,
  );
  assert.notEqual(result.state.rng, previous.rng);
});

test("invalid and immune actions preserve identity, RNG and an empty event queue", () => {
  const initial = game();
  const invalid = assertTransition(initial, { type: "STEP" });
  assert.equal(invalid.state, initial);
  assert.deepEqual(invalid.events, []);
  initial.players[1].position = 2;
  initial.players[1].party[0] = pokemon(initial, 92, 1);
  let state = selectBoth(enter(initial, 2));
  state = transition(state, { type: "ATTACK", moveId: 0 });
  for (const action of [
    { type: "ATTACK", moveId: 33 },
    { type: "ATTACK", moveId: 999999 },
    { type: "WILD_ATTACK" },
    { type: "ROLL" },
  ]) {
    const result = assertTransition(state, action);
    assert.equal(result.state, state);
    assert.deepEqual(result.events, []);
  }
});

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

test("complete eventful games preserve original engine saves and RNG exactly", () => {
  // Captured from the engine before presentation events were added.
  const baselines = [
    {
      count: 2,
      seed: 1,
      revision: 16,
      rng: 307599695,
      digest:
        "86c88dd38e0f839bb3e095f8641ac2dc09e0026a89dd3f4690d20848d842cd4c",
    },
    {
      count: 4,
      seed: 9182,
      revision: 69,
      rng: 4050221341,
      digest:
        "574578900482a6cadb365a471b07cab15e019042f8ef8e355c87d67c41f49349",
    },
  ];
  for (const baseline of baselines) {
    let state = game(baseline.count, baseline.seed);
    while (state.phase !== "finished" && state.revision < 5000) {
      const saved = JSON.parse(JSON.stringify(state));
      assert.ok(validateSave(saved));
      const action = nextAction(state);
      const result = assertTransition(state, action);
      assert.deepEqual(transitionWithEvents(saved, action), result);
      const beforeSnapshot = structuredClone(saved);
      snapshotForPresentation(saved);
      assert.deepEqual(
        saved,
        beforeSnapshot,
        "Resuming presentation mutated the save",
      );
      assert.equal("events" in result.state, false);
      state = result.state;
    }
    assert.equal(state.phase, "finished");
    assert.equal(state.revision, baseline.revision);
    assert.equal(state.rng, baseline.rng);
    assert.equal(
      createHash("sha256").update(JSON.stringify(state)).digest("hex"),
      baseline.digest,
    );
  }
});
