import assert from "node:assert/strict";
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
const { BOARD_SIZE, BOARD_TILES } = loadGameSource(`${path}board.ts`);

function game(count = 3, seed = 9182) {
  return createGame([1, 4, 7, 172].slice(0, count), [], seed);
}

function pokemon(state, speciesId = 128, level = 40, hp) {
  const value = { id: `p${state.nextPokemonId++}`, speciesId, level, hp: 0 };
  value.hp = hp ?? getStats(value).hp;
  return value;
}

function beforeEntry(state, tile, remaining = 1) {
  state.players[0].position = (tile + BOARD_SIZE - 1) % BOARD_SIZE;
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
  assert.deepEqual(kinds(result), ["attack", "faint", "level-up", "rescue"]);
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
    "rescue",
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
    "rescue",
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
  assert.deepEqual(kinds(result), ["attack", "faint", "level-up", "heal"]);
  assert.equal(result.events[1].snapshot.guardians.length, 1);
  assert.equal(result.events[2].snapshot.guardians.length, 0);
  assert.equal(
    result.events[2].snapshot.battle.defender.id,
    initial.roads[2].pokemon.id,
  );
  assert.equal(result.events[1].pokemon.hp, 0);
  assert.equal(result.events[2].snapshot.battle.defender.hp, 0);
  const healed = result.events.at(-1);
  assert.equal(healed.playerId, 1);
  assert.equal(healed.pokemon.id, initial.roads[2].pokemon.id);
  assert.equal(healed.pokemon.hp, healed.pokemon.maxHp);
  assert.equal(result.state.players[1].box[0].hp, getStats(result.state.players[1].box[0]).hp);
  assert.equal(result.state.battle, null);
});

test("a defending guardian gains a level and evolves before the full healing cue", () => {
  const initial = game();
  initial.players[0].party[0].hp = 1;
  initial.players[0].party.push(pokemon(initial, 128, 3));
  initial.roads[2] = { ownerId: 1, pokemon: pokemon(initial, 1, 15, 7) };
  const previous = selectBoth(enter(initial, 2));
  const result = assertTransition(previous, { type: "ATTACK", moveId: 0 });
  assert.deepEqual(kinds(result), ["attack", "faint", "level-up", "evolution", "heal"]);
  assert.equal(result.events[0].snapshot.battle.defender.level, 15);
  assert.equal(result.events[2].pokemon.level, 16);
  assert.equal(result.events[2].pokemon.hp, 7);
  assert.equal(result.events[3].pokemon.speciesId, 2);
  assert.equal(result.events[3].pokemon.hp, 7);
  const heal = result.events.at(-1);
  assert.equal(heal.side, "defender");
  assert.equal(heal.playerId, 1);
  assert.equal(heal.pokemon.speciesId, 2);
  assert.equal(heal.pokemon.hp, heal.pokemon.maxHp);
  assert.equal(heal.snapshot.battle.defender.hp, heal.pokemon.maxHp);
  assert.equal(result.state.roads[2].pokemon.hp, heal.pokemon.maxHp);
  assert.equal(result.state.battle, null);
});

test("guardian healing waits for a branch choice and never rewrites its winning hit", () => {
  const initial = game();
  initial.players[0].party[0].hp = 1;
  initial.players[0].party.push(pokemon(initial, 128, 3));
  initial.roads[2] = { ownerId: 1, pokemon: pokemon(initial, 133, 19, 5) };
  const won = assertTransition(selectBoth(enter(initial, 2)), { type: "ATTACK", moveId: 0 });
  assert.deepEqual(kinds(won), ["attack", "faint", "level-up"]);
  assert.equal(won.state.phase, "evolution");
  assert.equal(won.state.roads[2].pokemon.hp, 5);
  assert.equal(won.events[0].snapshot.battle.attacker.hp, 0);
  const evolved = assertTransition(won.state, { type: "CHOOSE_EVOLUTION", speciesId: 134 });
  assert.deepEqual(kinds(evolved), ["evolution", "heal"]);
  assert.equal(evolved.events[0].pokemon.hp, 5);
  assert.equal(evolved.events[1].pokemon.hp, evolved.events[1].pokemon.maxHp);
  assert.equal(evolved.events[1].playerId, 1);
  assert.equal(won.events[0].snapshot.battle.defender.speciesId, 133);
  assert.equal(won.events[0].snapshot.battle.defender.hp, 5);
});

test("a defeated guardian stays fainted throughout the attacker's branch evolution before box healing", () => {
  const initial = game();
  initial.players[0].party[0] = pokemon(initial, 133, 19);
  initial.roads[2] = { ownerId: 1, pokemon: pokemon(initial, 4, 1) };
  const won = assertTransition(readyForFinishingHit(enter(initial, 2)), { type: "ATTACK", moveId: 0 });
  assert.equal(won.state.phase, "evolution");
  assert.deepEqual(kinds(won), ["attack", "faint", "level-up"]);
  for (const event of won.events) assert.equal(event.snapshot.battle.defender.hp, 0);
  const evolved = assertTransition(won.state, { type: "CHOOSE_EVOLUTION", speciesId: 134 });
  assert.deepEqual(kinds(evolved), ["evolution", "heal"]);
  assert.equal(evolved.events[0].snapshot.battle.defender.hp, 0);
  assert.equal(evolved.events[1].pokemon.id, initial.roads[2].pokemon.id);
  assert.equal(evolved.events[1].pokemon.hp, evolved.events[1].pokemon.maxHp);
  assert.equal(evolved.state.players[1].box[0].hp, evolved.events[1].pokemon.maxHp);
  assert.equal(evolved.state.battle, null);
  assert.equal(won.events.at(-1).snapshot.battle.defender.hp, 0);
});

test("a lap grows only the party once, queues all branch choices and resumes the remaining movement", () => {
  const initial = game();
  initial.players[1].position = 10;
  initial.players[2].position = 20;
  initial.players[0].party = [
    pokemon(initial, 1, 15),
    pokemon(initial, 133, 19),
    pokemon(initial, 128, 100),
    pokemon(initial, 133, 19),
    pokemon(initial, 25, 5, 0),
  ];
  initial.players[0].box = [pokemon(initial, 7, 12)];
  initial.roads[2] = { ownerId: 0, pokemon: pokemon(initial, 4, 12) };
  const partyIds = initial.players[0].party.map((entry) => entry.id);
  const crossed = assertTransition(beforeEntry(initial, 0, 3), { type: "STEP" });
  assert.deepEqual(kinds(crossed), ["move", "lap", "level-up", "level-up", "level-up", "level-up", "evolution"]);
  assert.equal(crossed.events[0].fromTile, 39);
  assert.equal(crossed.events[1].tile, 0);
  assert.deepEqual(crossed.events.filter((event) => event.kind === "level-up").map((event) => event.pokemon.id), [partyIds[0], partyIds[1], partyIds[3], partyIds[4]]);
  assert.ok(crossed.events.every((event) => event.snapshot.battle === null), "lap rewards never replace the 2D board with a battle");
  assert.deepEqual(crossed.state.players[0].party.map((entry) => entry.level), [16, 20, 100, 20, 6]);
  assert.equal(crossed.state.players[0].party[4].hp, 0);
  assert.equal(crossed.state.players[0].box[0].level, 12);
  assert.equal(crossed.state.roads[2].pokemon.level, 12);
  assert.equal(crossed.state.evolution.pokemonId, partyIds[1]);
  assert.equal(crossed.state.evolution.ownerId, 0);
  assert.equal(crossed.state.movement.remaining, 2);
  assert.ok(validateSave(crossed.state));

  const firstChoice = assertTransition(crossed.state, { type: "CHOOSE_EVOLUTION", speciesId: 134 });
  assert.deepEqual(kinds(firstChoice), ["evolution"]);
  assert.equal(firstChoice.state.evolution.pokemonId, partyIds[3]);
  assert.equal(firstChoice.state.phase, "evolution");
  assert.ok(validateSave(firstChoice.state));
  const lastChoice = assertTransition(firstChoice.state, { type: "CHOOSE_EVOLUTION", speciesId: 135 });
  assert.deepEqual(kinds(lastChoice), ["evolution"]);
  assert.equal(lastChoice.state.phase, "moving");
  assert.equal(lastChoice.state.lapGrowth, null);
  assert.equal(lastChoice.state.battle, null);
  assert.equal(lastChoice.state.movement.remaining, 2);
  assert.deepEqual(lastChoice.state.players[0].party.map((entry) => entry.level), [16, 20, 100, 20, 6]);
  const continued = assertTransition(lastChoice.state, { type: "STEP" });
  assert.deepEqual(kinds(continued), ["move"]);
  assert.equal(continued.state.players[0].position, 1);
  assert.equal(continued.state.movement.remaining, 1);
});

test("landing on the start center shows lap growth before healing, while a rescue gives no lap reward", () => {
  const initial = game();
  initial.players[1].position = 10;
  initial.players[2].position = 20;
  initial.players[0].party[0].hp = 2;
  const landed = assertTransition(beforeEntry(initial, 0), { type: "STEP" });
  assert.deepEqual(kinds(landed), ["move", "lap", "level-up", "heal"]);
  assert.equal(landed.events[2].pokemon.level, 4);
  assert.equal(landed.events[2].pokemon.hp, 2);
  assert.equal(landed.state.players[0].party[0].hp, getStats(landed.state.players[0].party[0]).hp);
  assert.equal(landed.state.phase, "center");

  const rescue = game();
  rescue.players[0].party[0].hp = 1;
  rescue.players[1].position = 2;
  rescue.players[1].party[0] = pokemon(rescue);
  const rescued = assertTransition(selectBoth(enter(rescue, 2)), { type: "ATTACK", moveId: 0 });
  assert.ok(kinds(rescued).includes("rescue"));
  assert.ok(!kinds(rescued).includes("lap"));
  assert.equal(rescued.state.players[0].party[0].level, 3);
});

test("center box transfers and swaps fully heal without redundant cues or automatic full-party capture", () => {
  const initial = game();
  initial.players[0].party.push(pokemon(initial, 128, 3));
  initial.players[0].box.push(pokemon(initial, 7, 3));
  const centered = enter(initial, 10);
  centered.players[0].party[0].hp = 0;
  const transferred = assertTransition(centered, { type: "CENTER_TRANSFER", pokemonId: centered.players[0].party[0].id, to: "box" });
  assert.deepEqual(kinds(transferred), []);
  const stored = transferred.state.players[0].box.find((entry) => entry.id === centered.players[0].party[0].id);
  assert.equal(stored.hp, getStats(stored).hp);
  const outgoing = transferred.state.players[0].party[0];
  outgoing.hp = 1;
  const swapped = assertTransition(transferred.state, {
    type: "CENTER_SWAP",
    partyPokemonId: outgoing.id,
    boxPokemonId: transferred.state.players[0].box[0].id,
  });
  assert.deepEqual(kinds(swapped), []);
  const swappedToBox = swapped.state.players[0].box.find((entry) => entry.id === outgoing.id);
  assert.equal(swappedToBox.hp, getStats(swappedToBox).hp);

  const full = game();
  full.players[0].party = Array.from({ length: 6 }, () => pokemon(full));
  const ready = readyForFinishingHit(enter(full, 1));
  const defeated = assertTransition(ready, { type: "ATTACK", moveId: 0 });
  const blocked = assertTransition(defeated.state, { type: "CAPTURE", capture: true });
  assert.equal(blocked.state, defeated.state);
  assert.deepEqual(blocked.events, []);
  assert.equal(blocked.state.players[0].box.length, 0);
  const declined = assertTransition(blocked.state, { type: "CAPTURE", capture: false });
  assert.equal(declined.state.phase, "turn-end");
});

test("center healing follows movement or a finished encounter, without healing guardians", () => {
  const initial = game();
  initial.players[0].party[0] = pokemon(initial, 128, 40, 3);
  initial.players[0].box.push(pokemon(initial, 7, 1, 0));
  initial.roads[2] = { ownerId: 0, pokemon: pokemon(initial, 4, 1, 1) };
  const arrival = assertTransition(beforeEntry(initial, 10), { type: "STEP" });
  assert.deepEqual(kinds(arrival), ["move", "heal"]);
  assert.equal(arrival.events[1].tile, 10);
  assert.equal(arrival.events[1].snapshot.battle, null);
  assert.equal(
    arrival.state.players[0].box[0].hp,
    getStats(initial.players[0].box[0]).hp,
  );
  assert.equal(arrival.state.roads[2].pokemon.hp, 1);

  const encounter = game();
  encounter.players[0].party[0] = pokemon(encounter);
  encounter.players[1].position = 10;
  const previous = readyForFinishingHit(enter(encounter, 10));
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

test("a level-100 finishing hit rescues the opponent without winning the game", () => {
  const initial = game(2);
  initial.players[0].party[0] = pokemon(initial, 128, 100);
  initial.players[1].position = 2;
  const previous = readyForFinishingHit(enter(initial, 2));
  const result = assertTransition(previous, { type: "ATTACK", moveId: 0 });
  assert.deepEqual(kinds(result), ["attack", "faint", "rescue"]);
  assert.equal(result.events[0].snapshot.battle.defender.hp, 0);
  assert.equal(result.events.at(-1).snapshot.battle, null);
  assert.equal(result.events.at(-1).snapshot.players[1].restTurnsRemaining, 3);
  assert.equal(result.events.at(-1).playerId, 1);
  assert.equal(result.events.at(-1).fromTile, 2);
  assert.equal(result.events.at(-1).tile, 0);
  assert.equal(result.state.phase, "road");
  assert.equal(result.state.winner, null);
  assert.ok(validateSave(result.state));
  const noReplay = assertTransition(result.state, {
    type: "ATTACK",
    moveId: 0,
  });
  assert.equal(noReplay.state, result.state);
  assert.deepEqual(noReplay.events, []);
});

test("rescue waits for the defender's chosen evolution and keeps the original attack snapshot", () => {
  const initial = game(2);
  initial.players[0].party[0].hp = 1;
  initial.players[1].position = 2;
  initial.players[1].party[0] = pokemon(initial, 133, 19);
  const previous = selectBoth(enter(initial, 2));
  const won = assertTransition(previous, { type: "ATTACK", moveId: 0 });
  assert.equal(won.state.phase, "evolution");
  assert.equal(won.state.winner, null);
  assert.deepEqual(kinds(won), ["attack", "faint", "level-up"]);
  assert.equal(won.events[0].attack.side, "defender");
  assert.equal(won.events[1].side, "attacker");
  assert.ok(validateSave(won.state));

  const evolved = assertTransition(won.state, {
    type: "CHOOSE_EVOLUTION",
    speciesId: 134,
  });
  assert.deepEqual(kinds(evolved), ["evolution", "rescue"]);
  assert.equal(evolved.events[0].snapshot.battle.defender.speciesId, 134);
  assert.equal(evolved.events[1].playerId, 0);
  assert.equal(evolved.events[1].snapshot.activePlayerId, 0);
  assert.equal(evolved.events[1].snapshot.battle, null);
  assert.equal(evolved.state.phase, "turn-end");
  assert.ok(validateSave(evolved.state));
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
      return { type: "CAPTURE", capture: state.players[state.activePlayer].party.length < 6 };
    default:
      return { type: "END_TURN" };
  }
}

test("eventful games preserve rules, saved replay and RNG across repeated recoveries", () => {
  const baselines = [{ count: 2, seed: 1 }, { count: 4, seed: 9182 }];
  for (const baseline of baselines) {
    let state = game(baseline.count, baseline.seed);
    while (state.revision < 500) {
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
    assert.equal(state.winner, null);
    assert.ok(validateSave(state));
  }
});

test("rest countdown announces each skipped turn and heals only when the third completes", () => {
  for (const remaining of [2, 1]) {
    const initial = game();
    initial.players[1].party[0].hp = 0;
    initial.players[1].position = 10;
    initial.players[1].restTurnsRemaining = remaining;
    const ready = enter(initial, 2);
    const result = assertTransition(ready, { type: "END_TURN" });
    assert.deepEqual(kinds(result), remaining === 1 ? ["rest", "heal", "turn"] : ["rest", "turn"]);
    assert.equal(result.events[0].playerId, 1);
    assert.equal(result.events[0].snapshot.players[1].restTurnsRemaining, remaining - 1);
    assert.equal(result.events.at(-1).playerId, 2);
    assert.equal(result.state.players[1].party[0].hp, remaining === 1 ? getStats(initial.players[1].party[0]).hp : 0);
    assert.ok(validateSave(result.state));
  }
});

test("the final road emits deployment followed by monopoly victory with detached board snapshots", () => {
  const initial = game();
  initial.players[0].party.push(pokemon(initial, 7));
  for (const [tile, kind] of BOARD_TILES.entries()) {
    if (kind === "road" && tile !== 2)
      initial.roads[tile] = { ownerId: 0, pokemon: pokemon(initial) };
  }
  const ready = enter(initial, 2);
  const result = assertTransition(ready, { type: "DEPLOY", pokemonId: ready.players[0].party[0].id });
  assert.deepEqual(kinds(result), ["deploy", "victory"]);
  assert.equal(result.events[1].snapshot.guardians.length, 27);
  assert.equal(result.events[1].snapshot.activePlayerId, 0);
  assert.equal(result.state.phase, "finished");
  assert.ok(validateSave(result.state));
  assert.equal(assertTransition(result.state, { type: "END_TURN" }).events.length, 0);
});
