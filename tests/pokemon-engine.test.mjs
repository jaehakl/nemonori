import assert from "node:assert/strict";
import test from "node:test";
import { loadGameSource, pokemonBattleAction } from "./game-test-helpers.mjs";

const path = "app/games/_components/pokemon-marble/";
const {
  createGame,
  transition,
  getStats,
  getDamagePreview,
  getBattlePokemon,
  getActingPlayer,
  getNearestCenter,
} = loadGameSource(`${path}engine.ts`);
const { BOARD_SIZE, BOARD_TILES, getTilePosition, getDefaultSeatSides } = loadGameSource(`${path}board.ts`);
const { speciesById, getAvailableMoves, movesById, typeEffectiveness } =
  loadGameSource(`${path}pokemon-data.ts`);
const { validateSave } = loadGameSource(`${path}save.ts`);
const { getVictoryExperience } = loadGameSource(`${path}progression.ts`);

function game(count = 3) {
  return createGame(
    [1, 4, 7, 172].slice(0, count),
    ["민지", "준", "하늘", "지우"],
    9182,
  );
}
function pokemon(state, speciesId = 1, level = 1, hp) {
  const result = { id: `p${state.nextPokemonId++}`, speciesId, level, xp: 0, hp: 0 };
  result.hp = hp ?? getStats(result).hp;
  return result;
}
function enter(state, tile, remaining = 1) {
  state.players[state.activePlayer].position = (tile + BOARD_SIZE - 1) % BOARD_SIZE;
  state.phase = "moving";
  state.dice = [6, 6];
  state.movement = { remaining, encounters: [] };
  return transition(state, { type: "STEP" });
}
function selectBoth(state) {
  if (state.phase === "choose-defender")
    state = transition(state, {
      type: "CHOOSE_POKEMON",
      pokemonId: state.players[state.battle.defenderOwner].party.find(
        (p) => p.hp > 0,
      ).id,
    });
  return transition(state, {
    type: "CHOOSE_POKEMON",
    pokemonId: state.players[state.activePlayer].party.find((p) => p.hp > 0).id,
  });
}
function winAsActive(state) {
  state = selectBoth(state);
  const defender = getBattlePokemon(state, "defender");
  defender.hp = 1;
  state = transition(
    state,
    state.battle.kind === "wild"
      ? { type: "WILD_ATTACK" }
      : pokemonBattleAction(state),
  );
  assert.equal(state.phase, "attack");
  return transition(state, pokemonBattleAction(state));
}

test("40 clockwise tiles contain four centers and a 3:1 road-to-grass ratio", () => {
  assert.equal(BOARD_TILES.length, 40);
  assert.equal(BOARD_TILES.filter((kind) => kind === "center").length, 4);
  assert.equal(BOARD_TILES.filter((kind) => kind === "road").length, 27);
  assert.deepEqual(BOARD_TILES.flatMap((kind, index) => kind === "grass" ? [index] : []), [1, 5, 9, 14, 18, 23, 27, 32, 36]);
  assert.deepEqual([0, 10, 20, 30].map(getTilePosition), [
    { x: -5, z: 5 }, { x: -5, z: -5 }, { x: 5, z: -5 }, { x: 5, z: 5 },
  ]);
  assert.equal(
    new Set(
      BOARD_TILES.map((_, index) => JSON.stringify(getTilePosition(index))),
    ).size,
    BOARD_SIZE,
  );
  for (let i = 0; i < BOARD_SIZE; i++) {
    const a = getTilePosition(i),
      b = getTilePosition((i + 1) % BOARD_SIZE);
    assert.equal(Math.abs(a.x - b.x) + Math.abs(a.z - b.z), 1);
  }
});

test("creation restricts player counts and starters, permits duplicates and normal single-stage species", () => {
  for (const count of [1, 2, 3, 4]) {
    const state = game(count);
    assert.equal(state.players.length, count);
    assert.ok(validateSave(state));
    assert.ok(
      state.players.every(
        (player) =>
          player.position === 0 &&
          player.party[0].level === 3 &&
          player.party[0].hp === getStats(player.party[0]).hp,
      ),
    );
  }
  assert.doesNotThrow(() => createGame([1, 1], [], 0));
  assert.doesNotThrow(() => createGame([131, 128], [], 1));
  assert.deepEqual(getDefaultSeatSides(1), ["bottom"]);
  assert.deepEqual(getDefaultSeatSides(2), ["bottom", "top"]);
  assert.deepEqual(getDefaultSeatSides(3), ["bottom", "left", "right"]);
  assert.deepEqual(getDefaultSeatSides(4), ["bottom", "left", "top", "right"]);
  const seated = createGame([1, 4], [], 1, ["right", "left"]);
  assert.deepEqual(seated.players.map((player) => player.seatSide), ["right", "left"]);
  assert.deepEqual(seated.players.map((player) => player.starterSpeciesId), [1, 4]);
  const sharedSide = createGame([1, 4], [], 1, ["top", "top"]);
  assert.deepEqual(sharedSide.players.map((player) => player.seatSide), ["top", "top"]);
  assert.ok(validateSave(sharedSide));
  assert.throws(() => createGame([1, 4], [], 1, ["top"]));
  assert.throws(() => createGame([1, 4], [], 1, ["front", "top"]));
  for (const starters of [
    [],
    [1, 4, 7, 25, 133],
    [2, 1],
    [150, 1],
    [151, 1],
    [9999, 1],
  ])
    assert.throws(() => createGame(starters, [], 1));
});

test("dice and wild encounter RNG replay exactly, double grants another roll", () => {
  const first = game();
  const rolled = transition(first, { type: "ROLL" });
  assert.deepEqual(
    rolled,
    transition(structuredClone(first), { type: "ROLL" }),
  );
  assert.equal(first.phase, "roll");
  assert.ok(rolled.dice.every((die) => die >= 1 && die <= 6));
  assert.equal(rolled.movement.remaining, rolled.dice[0] + rolled.dice[1]);
  const grass = enter(game(), 1);
  assert.deepEqual(grass, enter(game(), 1));
  const ended = game();
  ended.phase = "turn-end";
  ended.dice = [3, 3];
  assert.equal(transition(ended, { type: "END_TURN" }).activePlayer, 0);
});

test("passing trainers does not interrupt movement; only the destination starts battles", () => {
  const visiting = game(4);
  visiting.players[1].position = 2;
  visiting.players[2].position = 2;
  visiting.players[3].position = 4;
  let state = enter(visiting, 2, 3);
  assert.equal(state.phase, "moving");
  assert.equal(state.battle, null);
  assert.deepEqual(state.movement, { remaining: 2, encounters: [] });
  state = transition(state, { type: "STEP" });
  assert.equal(state.phase, "moving");
  state = transition(state, { type: "STEP" });
  assert.equal(state.battle.defenderOwner, 3);
  assert.equal(state.movement.remaining, 0);
});

test("multiple destination trainers battle in order before the tile effect", () => {
  const visiting = game(3);
  visiting.players[1].position = 2;
  visiting.players[2].position = 2;
  visiting.players[0].party.push(pokemon(visiting, 1, 30));
  let state = enter(visiting, 2);
  assert.equal(state.battle.defenderOwner, 1);
  assert.deepEqual(state.movement, { remaining: 0, encounters: [2] });
  state = winAsActive(state);
  assert.equal(state.battle.defenderOwner, 2);
  state.players[0].party[0].hp = getStats(state.players[0].party[0]).hp;
  state = winAsActive(state);
  assert.equal(state.phase, "road");
});

test("trainer selection and attacks are defender first, active player chooses after seeing defender", () => {
  const state = game();
  state.players[1].position = 2;
  let battle = enter(state, 2);
  assert.equal(getActingPlayer(battle), 1);
  assert.equal(
    transition(battle, {
      type: "CHOOSE_POKEMON",
      pokemonId: battle.players[0].party[0].id,
    }),
    battle,
  );
  battle = transition(battle, {
    type: "CHOOSE_POKEMON",
    pokemonId: battle.players[1].party[0].id,
  });
  assert.equal(battle.phase, "choose-attacker");
  assert.equal(getBattlePokemon(battle, "defender").speciesId, 4);
  assert.equal(getActingPlayer(battle), 0);
  battle = selectBoth(battle);
  assert.equal(getActingPlayer(battle), 1);
  const oldHP = battle.players[0].party[0].hp;
  battle = transition(battle, pokemonBattleAction(battle));
  assert.ok(battle.players[0].party[0].hp < oldHP);
  assert.equal(getActingPlayer(battle), 0);
  assert.equal(
    transition(battle, {
      type: "CHOOSE_POKEMON",
      pokemonId: battle.players[0].party[0].id,
    }),
    battle,
  );
});

test("destination trainer battle precedes the road guardian and deployment", () => {
  const initial = game();
  initial.players[1].position = 2;
  initial.players[1].party.push(pokemon(initial, 7));
  initial.roads[2] = { ownerId: 1, pokemon: pokemon(initial, 4) };
  initial.players[0].party[0] = pokemon(initial, 1, 50);
  let state = enter(initial, 2);
  assert.equal(state.battle.kind, "trainer");
  state = winAsActive(state);
  assert.equal(state.battle.kind, "road");
  assert.equal(state.phase, "choose-attacker");
  assert.equal(getActingPlayer(selectBoth(state)), 1);
  const guardId = state.roads[2].pokemon.id;
  state = winAsActive(state);
  assert.equal(state.phase, "road");
  assert.equal(state.roads[2], null);
  const returned = state.players[1].box.find((entry) => entry.id === guardId);
  assert.equal(returned.hp, getStats(returned).hp);
});

test("a rescued trainer keeps owned roads and its destination guardian still fights", () => {
  const initial = game();
  initial.players[1].position = 2;
  initial.roads[2] = { ownerId: 1, pokemon: pokemon(initial, 4) };
  initial.roads[6] = { ownerId: 1, pokemon: pokemon(initial, 7) };
  const state = winAsActive(enter(initial, 2));
  assert.equal(state.players[1].restTurnsRemaining, 3);
  assert.equal(state.players[1].position, 0);
  assert.equal(state.roads[2].ownerId, 1);
  assert.equal(state.roads[6].ownerId, 1);
  assert.equal(state.phase, "choose-attacker");
  assert.equal(state.battle.kind, "road");
  assert.ok(validateSave(state));
});

test("fainting at a center starts rest without immediate healing or ending the game", () => {
  const initial = game(2);
  initial.players[1].position = 10;
  initial.players[1].party[0] = pokemon(initial, 4, 80);
  initial.players[0].box.push(pokemon(initial, 7, 50));
  let state = selectBoth(enter(initial, 10));
  state = transition(state, pokemonBattleAction(state));
  assert.equal(state.players[0].party[0].hp, 0);
  assert.equal(state.players[0].restTurnsRemaining, 3);
  assert.equal(state.players[0].position, 10);
  assert.equal(state.phase, "turn-end");
  assert.equal(state.movement, null);
  assert.equal(state.winner, null);
  assert.equal(transition(state, { type: "END_TURN" }).activePlayer, 1);
  assert.ok(validateSave(state));
});

test("a lost single battle permits continued movement when another party member is healthy", () => {
  const initial = game();
  initial.players[0].party.push(pokemon(initial, 7));
  initial.players[1].position = 2;
  initial.players[1].party[0] = pokemon(initial, 4, 80);
  const previous = selectBoth(enter(initial, 2));
  previous.movement.remaining = 1; // Resume a legacy encounter interrupted while passing.
  const state = transition(previous, pokemonBattleAction(previous));
  assert.equal(state.players[0].restTurnsRemaining, 0);
  assert.equal(state.phase, "moving");
  assert.equal(state.movement.remaining, 1);
});

test("throwing a ball needs an attacker turn and free party slot, and catches preserve HP", () => {
  for (const full of [false, true]) {
    const initial = game();
    initial.players[0].party[0] = pokemon(initial, 1, 40);
    while (full && initial.players[0].party.length < 6)
      initial.players[0].party.push(pokemon(initial, 7));
    let state = selectBoth(enter(initial, 1));
    assert.equal(transition(state, { type: "THROW_BALL" }), state);
    state = transition(state, { type: "WILD_ATTACK" });
    state.rng = 1;
    state.battle.wild.hp = 1;
    const wildId = state.battle.wild.id;
    const captured = transition(state, { type: "THROW_BALL" });
    if (full) {
      assert.equal(captured, state);
      assert.equal(captured.phase, "attack");
      assert.equal(captured.players[0].box.length, 0);
    } else {
      state = captured;
      assert.equal(state.players[0].party.find((entry) => entry.id === wildId).hp, 1);
      assert.equal(state.phase, "turn-end");
    }
    assert.ok(validateSave(state));
  }
});

test("centers heal party and box only; exchanges preserve capacity and healthy party", () => {
  const initial = game();
  initial.players[0].party[0].hp = 1;
  initial.players[0].box.push(pokemon(initial, 7, 1, 0));
  initial.roads[2] = { ownerId: 0, pokemon: pokemon(initial, 4, 1, 1) };
  let state = transition(enter(initial, 10), { type: "START_EXCHANGE" });
  const player = state.players[0];
  assert.equal(state.phase, "center");
  assert.equal(player.party[0].hp, getStats(player.party[0]).hp);
  assert.equal(player.box[0].hp, getStats(player.box[0]).hp);
  assert.equal(state.roads[2].pokemon.hp, 1);
  assert.equal(
    transition(state, {
      type: "CENTER_TRANSFER",
      pokemonId: player.party[0].id,
      to: "box",
    }),
    state,
  );
  const oldBox = player.box[0].id;
  state = transition(state, { type: "CENTER_TRANSFER", pokemonId: oldBox, to: "party" });
  assert.equal(state.players[0].party.length, 2);
  state = transition(state, {
    type: "CENTER_TRANSFER",
    pokemonId: oldBox,
    to: "box",
  });
  assert.equal(state.players[0].party.length, 1);
  assert.ok(validateSave(state));
});

test("road deployment cannot remove the last healthy party member; retrieval and redeployment retain HP", () => {
  let state = transition(enter(game(), 2), { type: "START_EXCHANGE" });
  const starterId = state.players[0].party[0].id;
  assert.equal(
    transition(state, { type: "DEPLOY", pokemonId: starterId }),
    state,
  );
  state.players[0].party.push(pokemon(state, 7, 1, 0));
  assert.equal(
    transition(state, { type: "DEPLOY", pokemonId: starterId }),
    state,
  );
  state.players[0].party[1].hp = 2;
  state = transition(state, { type: "DEPLOY", pokemonId: starterId });
  assert.equal(state.roads[2].pokemon.id, starterId);
  assert.equal(state.players[0].party.length, 1);
  state.phase = "road";
  const nextId = state.players[0].party[0].id;
  state = transition(state, { type: "RETRIEVE" });
  state = transition(state, { type: "DEPLOY", pokemonId: nextId });
  assert.equal(state.players[0].party[0].id, starterId);
  assert.equal(state.roads[2].pokemon.hp, 2);
  state.phase = "road";
  while (state.players[0].party.length < 6)
    state.players[0].party.push(pokemon(state));
  assert.equal(state.players[0].box.length, 0);
  state = transition(state, { type: "RETRIEVE" });
  assert.equal(state.players[0].party.find((entry) => entry.id === nextId).hp, 2);
  assert.equal(state.players[0].box.length, 0);
  assert.equal(state.roads[2], null);
});

test("type multipliers include dual types and immunity; Struggle is neutral and the synthetic attack is absent", () => {
  const attacker = { id: "a", speciesId: 4, level: 50, hp: 100 };
  const grassSteel = { id: "d", speciesId: 598, level: 50, hp: 100 };
  assert.equal(
    getDamagePreview(attacker, grassSteel, movesById[52]).effectiveness,
    4,
  );
  assert.equal(getDamagePreview(attacker, grassSteel, movesById[52]).stab, 1.5);
  assert.equal(typeEffectiveness(1, [8]), 0);
  assert.equal(
    getDamagePreview(attacker, { ...grassSteel, speciesId: 92 }, movesById[33])
      .damage,
    0,
  );
  assert.equal(
    getDamagePreview(attacker, { ...grassSteel, speciesId: 92 }, 165)
      .effectiveness,
    1,
  );
  assert.equal(getDamagePreview(attacker, grassSteel, 165).stab, 1);
  assert.deepEqual(getAvailableMoves(129, 1), []);
  assert.equal(movesById[0], undefined);
});

test("illegal, immune and unavailable attacks preserve state and RNG", () => {
  const initial = game();
  initial.players[1].position = 2;
  initial.players[1].party[0] = pokemon(initial, 92);
  let state = selectBoth(enter(initial, 2));
  state = transition(state, pokemonBattleAction(state));
  assert.equal(transition(state, { type: "ATTACK", moveId: 33 }), state);
  assert.equal(transition(state, { type: "ATTACK", moveId: 999999 }), state);
  assert.equal(transition(state, { type: "WILD_ATTACK" }), state);
  assert.equal(transition(state, { type: "ROLL" }), state);
  assert.equal(transition(state, { type: "STEP" }), state);
});

test("victory grants level-scaled XP and every available evolution without healing", () => {
  for (const level of [14, 15, 99, 100]) {
    const initial = game();
    initial.players[0].party[0] = pokemon(initial, 1, level);
    initial.players[1].position = 2;
    initial.players[1].party[0] = pokemon(initial, 128, level);
    initial.players[1].party.push(pokemon(initial, 7));
    let state = selectBoth(enter(initial, 2));
    state.players[1].party[0].hp = 1;
    state = transition(state, pokemonBattleAction(state));
    const hp = state.players[0].party[0].hp;
    state = transition(state, pokemonBattleAction(state));
    const reward = getVictoryExperience(level, level);
    assert.equal(state.players[0].party[0].level, Math.min(100, level + Math.floor(reward / 1000)));
    assert.equal(state.players[0].party[0].xp, level === 100 ? 0 : reward % 1000);
    assert.equal(state.players[0].party[0].speciesId, level >= 99 ? 3 : 2);
    assert.equal(state.players[0].party[0].hp, hp);
  }
});

test("special evolutions unlock at level 20 and branch ownership is explicit", () => {
  const initial = game();
  initial.players[1].position = 2;
  initial.players[1].party[0] = pokemon(initial, 133, 19);
  initial.players[1].party[0].xp = 900;
  initial.players[0].party.push(pokemon(initial, 7));
  initial.players[0].party[0].hp = 1;
  let state = selectBoth(enter(initial, 2));
  state = transition(state, pokemonBattleAction(state));
  assert.equal(state.phase, "evolution");
  assert.equal(getActingPlayer(state), 1);
  assert.equal(state.evolution.ownerId, 1);
  assert.ok(state.evolution.options.includes(134));
  assert.equal(
    transition(state, { type: "CHOOSE_EVOLUTION", speciesId: 1 }),
    state,
  );
  const hp = state.players[1].party[0].hp;
  state = transition(state, { type: "CHOOSE_EVOLUTION", speciesId: 134 });
  assert.equal(state.players[1].party[0].speciesId, 134);
  assert.equal(state.players[1].party[0].hp, hp);
  assert.equal(state.phase, "road");
  assert.ok(validateSave(state));
  assert.ok(speciesById[133].evolutions.every((edge) => edge.level === 20));
});

test("board wraps around and center arrival preserves wounds on deployed Pokemon", () => {
  const initial = game();
  initial.players[1].position = 5;
  initial.players[2].position = 6;
  initial.players[0].party[0].hp = 1;
  const state = enter(initial, 0);
  assert.equal(state.players[0].position, 0);
  assert.equal(state.phase, "center");
  assert.equal(
    state.players[0].party[0].hp,
    getStats(state.players[0].party[0]).hp,
  );
});

test("wild levels are 1 through 3 and independent of the player's party levels", () => {
  const encountered = new Set();
  for (const level of [1, 25, 100]) {
    for (const seed of [1, 13, 35, 9182, 987654321]) {
      const initial = createGame([1, 4], [], seed);
      initial.players[0].party[0] = pokemon(initial, 1, level);
      initial.players[0].party.push(pokemon(initial, 7, 100, 0));
      const state = enter(initial, 1);
      const baseline = enter(createGame([1, 4], [], seed), 1);
      assert.equal(state.battle.wild.level, baseline.battle.wild.level);
      assert.ok(state.battle.wild.level >= 1 && state.battle.wild.level <= 3);
      encountered.add(state.battle.wild.level);
    }
  }
  assert.deepEqual([...encountered].sort(), [1, 2, 3]);
});

test("the nearest center uses ring distance and resolves equal distances clockwise", () => {
  const cases = [[0, 0], [1, 0], [4, 0], [5, 10], [9, 10], [15, 20], [25, 30], [35, 0], [39, 0]];
  for (const [position, center] of cases)
    assert.equal(getNearestCenter(position), center, `Position ${position}`);
});

function finishCurrentTurn(state) {
  const ending = structuredClone(state);
  ending.phase = "turn-end";
  ending.dice = [1, 2];
  ending.movement = { remaining: 0, encounters: [] };
  assert.ok(validateSave(ending));
  const next = transition(ending, { type: "END_TURN" });
  assert.ok(validateSave(next));
  return next;
}

test("recovery skips exactly three future own turns and heals party and box after the third", () => {
  const initial = game(2);
  initial.players[0].party[0].hp = 1;
  initial.players[0].box.push(pokemon(initial, 7, 20, 0));
  initial.roads[4] = { ownerId: 0, pokemon: pokemon(initial, 4, 10, 1) };
  initial.roads[2] = { ownerId: 1, pokemon: pokemon(initial, 128, 80) };
  let state = transition(selectBoth(enter(initial, 2)), pokemonBattleAction(selectBoth(enter(initial, 2))));
  assert.equal(state.players[0].restTurnsRemaining, 3);
  assert.equal(state.players[0].party[0].hp, 0);
  assert.equal(state.players[0].box[0].hp, 0);
  assert.equal(state.players[0].position, 0);
  assert.ok(validateSave(state));
  state = transition(state, { type: "END_TURN" });
  assert.equal(state.activePlayer, 1);
  assert.equal(state.players[0].restTurnsRemaining, 3, "The fainting turn is not a rest turn");
  for (const remaining of [2, 1, 0]) {
    state = finishCurrentTurn(state);
    assert.equal(state.activePlayer, 1, "The third resting turn must still be skipped");
    assert.equal(state.players[0].restTurnsRemaining, remaining);
    assert.equal(state.players[0].party[0].hp, remaining ? 0 : getStats(state.players[0].party[0]).hp);
    assert.equal(state.players[0].box[0].hp, remaining ? 0 : getStats(state.players[0].box[0]).hp);
    assert.equal(state.roads[4].pokemon.hp, 1);
  }
  state = finishCurrentTurn(state);
  assert.equal(state.activePlayer, 0);
  assert.equal(state.phase, "roll");
});

test("resting trainers do not trigger contact battles and their guardians do not restart rest", () => {
  const initial = game(2);
  initial.players[1].position = 10;
  initial.players[1].party[0].hp = 0;
  initial.players[1].restTurnsRemaining = 2;
  const passed = enter(structuredClone(initial), 10, 2);
  assert.equal(passed.phase, "moving");
  assert.equal(passed.battle, null);
  assert.ok(validateSave(passed));
  initial.roads[2] = { ownerId: 1, pokemon: pokemon(initial, 133, 19) };
  initial.roads[2].pokemon.xp = 900;
  initial.players[0].party[0].hp = 1;
  let state = transition(selectBoth(enter(initial, 2)), pokemonBattleAction(selectBoth(enter(initial, 2))));
  assert.equal(state.phase, "evolution");
  assert.equal(state.players[1].restTurnsRemaining, 2);
  assert.ok(validateSave(state));
  state = transition(state, { type: "CHOOSE_EVOLUTION", speciesId: 134 });
  assert.equal(state.players[0].restTurnsRemaining, 3);
  assert.equal(state.players[1].restTurnsRemaining, 2);
  assert.equal(state.roads[2].pokemon.speciesId, 134);
  assert.equal(state.roads[2].pokemon.level, 20);
  assert.equal(state.roads[2].pokemon.hp, getStats(state.roads[2].pokemon).hp);
  assert.ok(validateSave(state));
});

test("turn selection makes progress when every player is resting", () => {
  const initial = game(4);
  for (const player of initial.players) {
    player.position = player.id * 10;
    player.party[0].hp = 0;
    player.restTurnsRemaining = 3;
  }
  initial.phase = "turn-end";
  initial.dice = [1, 1];
  assert.ok(validateSave(initial));
  const state = transition(initial, { type: "END_TURN" });
  assert.equal(state.activePlayer, 1);
  assert.equal(state.phase, "roll");
  assert.ok(state.players.every((player) => player.restTurnsRemaining === 0 && player.party[0].hp > 0));
  assert.ok(validateSave(state));
});

test("only one player occupying every road wins immediately on the last deployment", () => {
  for (const otherRoad of ["owned", "empty", "opponent"]) {
    const initial = game();
    initial.players[0].party.push(pokemon(initial, 7));
    for (const [tile, kind] of BOARD_TILES.entries()) {
      if (kind === "road" && tile !== 2)
        initial.roads[tile] = { ownerId: 0, pokemon: pokemon(initial) };
    }
    if (otherRoad === "empty") initial.roads[4] = null;
    if (otherRoad === "opponent") initial.roads[4].ownerId = 1;
    const ready = transition(enter(initial, 2), { type: "START_EXCHANGE" });
    assert.ok(validateSave(ready));
    const state = transition(ready, { type: "DEPLOY", pokemonId: ready.players[0].party[0].id });
    assert.equal(state.phase, otherRoad === "owned" ? "finished" : "road");
    assert.equal(state.winner, otherRoad === "owned" ? 0 : null);
    assert.ok(validateSave(state));
    assert.equal(state.players[0].starterSpeciesId, 1, "The initial starter remains save metadata");
    if (state.winner !== null) assert.equal(transition(state, { type: "END_TURN" }), state);
  }
});

test("a completed lap grows the moving player's party and guardians, queuing every branch once", () => {
  const initial = game();
  initial.players[1].position = 5;
  initial.players[2].position = 6;
  const player = initial.players[0];
  player.party = [
    pokemon(initial, 1, 15, 3),
    pokemon(initial, 133, 19, 4),
    pokemon(initial, 133, 19, 5),
    pokemon(initial, 7, 5, 0),
    pokemon(initial, 128, 100, 6),
  ];
  player.box.push(pokemon(initial, 7, 19, 1));
  initial.roads[2] = { ownerId: 0, pokemon: pokemon(initial, 133, 19, 2) };
  const firstBranchId = player.party[1].id;
  const secondBranchId = player.party[2].id;
  let state = enter(initial, 0, 2);
  assert.equal(state.phase, "evolution");
  assert.equal(state.evolution.pokemonId, firstBranchId);
  assert.equal(state.battle, null);
  assert.deepEqual(state.players[0].party.map((entry) => entry.level), [17, 20, 20, 9, 100]);
  assert.equal(state.players[0].party[0].speciesId, 2);
  assert.deepEqual(state.players[0].party.map((entry) => entry.hp), [3, 4, 5, 0, 6]);
  assert.equal(state.players[0].box[0].level, 19);
  assert.equal(state.roads[2].pokemon.level, 20);
  assert.equal(state.players[1].party[0].level, 3);
  assert.equal(state.players[2].party[0].level, 3);
  assert.deepEqual(state.lapGrowth.remainingPokemonIds, [...player.party.slice(2).map((entry) => entry.id), initial.roads[2].pokemon.id]);
  state = transition(state, { type: "CHOOSE_EVOLUTION", speciesId: 134 });
  assert.equal(state.phase, "evolution");
  assert.equal(state.evolution.pokemonId, secondBranchId);
  state = transition(state, { type: "CHOOSE_EVOLUTION", speciesId: 135 });
  assert.equal(state.phase, "evolution");
  assert.equal(state.evolution.pokemonId, initial.roads[2].pokemon.id);
  assert.ok(validateSave(state));
  state = transition(state, { type: "CHOOSE_EVOLUTION", speciesId: 136 });
  assert.equal(state.roads[2].pokemon.speciesId, 136);
  assert.equal(state.phase, "moving");
  assert.equal(state.lapGrowth, null);
  assert.equal(state.evolution, null);
  assert.deepEqual(state.movement, { remaining: 1, encounters: [] });
  assert.deepEqual(state.players[0].party.map((entry) => entry.level), [17, 20, 20, 9, 100]);
  assert.equal(transition(state, { type: "CHOOSE_EVOLUTION", speciesId: 136 }), state);
});

test("lap growth completes before contact battles and a center stop heals after the last choice", () => {
  for (const contact of [false, true]) {
    const initial = game(2);
    initial.players[0].party[0] = pokemon(initial, 133, 19, 1);
    initial.players[1].position = contact ? 0 : 5;
    let state = enter(initial, 0);
    assert.equal(state.phase, "evolution");
    assert.equal(state.players[0].party[0].hp, 1);
    assert.deepEqual(state.movement.encounters, contact ? [1] : []);
    state = transition(state, { type: "CHOOSE_EVOLUTION", speciesId: 134 });
    assert.equal(state.phase, contact ? "choose-defender" : "center");
    assert.equal(state.players[0].party[0].hp, contact ? 1 : getStats(state.players[0].party[0]).hp);
    assert.equal(state.players[0].party[0].level, 20);
    assert.equal(state.lapGrowth, null);
  }
});

test("rescue teleports and starting at the center do not award lap levels", () => {
  const initial = game(2);
  initial.players[0].party[0].hp = 1;
  initial.roads[39] = { ownerId: 1, pokemon: pokemon(initial, 128, 80) };
  const state = transition(selectBoth(enter(initial, 39)), pokemonBattleAction(selectBoth(enter(initial, 39))));
  assert.equal(state.players[0].position, 0);
  assert.equal(state.players[0].restTurnsRemaining, 3);
  assert.equal(state.players[0].party[0].level, 3);
  assert.equal(state.lapGrowth, null);
  assert.equal(game(2).players[0].party[0].level, 3);
});

test("a victorious guardian gains XP and heals to its evolved maximum", () => {
  for (const [speciesId, level, evolvedSpecies] of [[1, 15, 2], [128, 100, 128]]) {
    const initial = game(2);
    initial.players[0].party[0] = pokemon(initial, 128, level, 1);
    initial.roads[2] = { ownerId: 1, pokemon: pokemon(initial, speciesId, level, 1) };
    const state = transition(selectBoth(enter(initial, 2)), pokemonBattleAction(selectBoth(enter(initial, 2))));
    const guard = state.roads[2].pokemon;
    assert.equal(guard.level, Math.min(100, level + Math.floor(getVictoryExperience(level, level) / 1000)));
    assert.equal(guard.speciesId, evolvedSpecies);
    assert.equal(guard.hp, getStats(guard).hp);
  }
});

test("box controls cannot be used outside a center or while recovering", () => {
  const initial = game();
  initial.players[0].party.push(pokemon(initial, 7));
  initial.players[0].box.push(pokemon(initial, 4));
  const actions = [
    { type: "CENTER_TRANSFER", pokemonId: initial.players[0].party[0].id, to: "box" },
    { type: "CENTER_TRANSFER", pokemonId: initial.players[0].box[0].id, to: "party" },
    { type: "CENTER_SWAP", partyPokemonId: initial.players[0].party[0].id, boxPokemonId: initial.players[0].box[0].id },
  ];
  for (const action of actions) assert.equal(transition(initial, action), initial);
  const resting = structuredClone(initial);
  resting.phase = "turn-end";
  resting.players[0].party.forEach((entry) => { entry.hp = 0; });
  resting.players[0].restTurnsRemaining = 3;
  for (const action of actions) assert.equal(transition(resting, action), resting);
});


test("consecutive doubles keep the turn and do not consume opponents' rest", () => {
  let state = game(2);
  state.players[1].party[0].hp = 0;
  state.players[1].restTurnsRemaining = 3;
  const turn = state.turn;
  for (const dice of [[2, 2], [6, 6], [1, 1]]) {
    state.phase = "turn-end";
    state.dice = dice;
    state.movement = { remaining: 0, encounters: [] };
    const restored = JSON.parse(JSON.stringify(state));
    assert.ok(validateSave(restored));
    state = transition(restored, { type: "END_TURN" });
    assert.equal(state.activePlayer, 0);
    assert.equal(state.turn, turn);
    assert.equal(state.phase, "roll");
    assert.equal(state.dice, null);
    assert.equal(state.movement, null);
    assert.equal(state.players[1].restTurnsRemaining, 3);
    assert.ok(validateSave(state));
    const rolled = transition(state, { type: "ROLL" });
    assert.equal(rolled.phase, "moving");
    assert.deepEqual(rolled, transition(structuredClone(state), { type: "ROLL" }));
  }
  state = finishCurrentTurn(state);
  assert.equal(state.players[1].restTurnsRemaining, 2);
});

test("a saved passing battle completes then discards old queued contacts", () => {
  const initial = game(3);
  initial.players[1].position = 2;
  initial.players[2].position = 2;
  initial.players[0].party.push(pokemon(initial, 1, 30));
  const legacy = enter(initial, 2);
  legacy.movement.remaining = 3;
  assert.ok(validateSave(legacy));
  const restored = JSON.parse(JSON.stringify(legacy));
  const resumed = winAsActive(restored);
  assert.equal(resumed.phase, "moving");
  assert.equal(resumed.battle, null);
  assert.deepEqual(resumed.movement, { remaining: 3, encounters: [] });
  assert.equal(resumed.players[2].restTurnsRemaining, 0);
  assert.ok(validateSave(resumed));
});

test("passing the start corner resumes movement after evolution without contact", () => {
  const initial = game(3);
  initial.players[0].party[0] = pokemon(initial, 133, 19);
  let state = enter(initial, 0, 4);
  assert.equal(state.phase, "evolution");
  assert.deepEqual(state.movement.encounters, []);
  state = transition(JSON.parse(JSON.stringify(state)), { type: "CHOOSE_EVOLUTION", speciesId: 134 });
  assert.equal(state.phase, "moving");
  assert.equal(state.movement.remaining, 3);
  assert.equal(state.battle, null);
  assert.ok(validateSave(state));
});
