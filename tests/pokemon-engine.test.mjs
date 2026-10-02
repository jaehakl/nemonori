import assert from "node:assert/strict";
import test from "node:test";
import { loadGameSource } from "./game-test-helpers.mjs";

const path = "app/games/_components/pokemon-marble/";
const {
  createGame,
  transition,
  getStats,
  getDamagePreview,
  getBattlePokemon,
  getActingPlayer,
} = loadGameSource(`${path}engine.ts`);
const { BOARD_TILES, getTilePosition } = loadGameSource(`${path}board.ts`);
const { speciesById, getAvailableMoves, movesById, typeEffectiveness } =
  loadGameSource(`${path}pokemon-data.ts`);
const { validateSave } = loadGameSource(`${path}save.ts`);

function game(count = 3) {
  return createGame(
    [1, 4, 7, 172].slice(0, count),
    ["민지", "준", "하늘", "지우"],
    9182,
  );
}
function pokemon(state, speciesId = 1, level = 1, hp) {
  const result = { id: `p${state.nextPokemonId++}`, speciesId, level, hp: 0 };
  result.hp = hp ?? getStats(result).hp;
  return result;
}
function enter(state, tile, remaining = 1) {
  state.players[state.activePlayer].position = (tile + 31) % 32;
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
      : { type: "ATTACK", moveId: 0 },
  );
  assert.equal(state.phase, "attack");
  return transition(state, { type: "ATTACK", moveId: 0 });
}

test("32 tiles form four center corners and a distinct clockwise ring", () => {
  assert.equal(BOARD_TILES.length, 32);
  assert.deepEqual(BOARD_TILES.slice(0, 8), [
    "center",
    "grass",
    "road",
    "grass",
    "road",
    "grass",
    "road",
    "road",
  ]);
  assert.equal(BOARD_TILES.filter((kind) => kind === "center").length, 4);
  assert.equal(
    new Set(
      BOARD_TILES.map((_, index) => JSON.stringify(getTilePosition(index))),
    ).size,
    32,
  );
  for (let i = 0; i < 32; i++) {
    const a = getTilePosition(i),
      b = getTilePosition((i + 1) % 32);
    assert.equal(Math.abs(a.x - b.x) + Math.abs(a.z - b.z), 1);
  }
});

test("creation restricts player counts and starters, permits duplicates and normal single-stage species", () => {
  for (const count of [2, 3, 4]) {
    const state = game(count);
    assert.equal(state.players.length, count);
    assert.ok(validateSave(state));
    assert.ok(
      state.players.every(
        (player) =>
          player.position === 0 &&
          player.party[0].level === 1 &&
          player.party[0].hp === getStats(player.party[0]).hp,
      ),
    );
  }
  assert.doesNotThrow(() => createGame([1, 1], [], 0));
  assert.doesNotThrow(() => createGame([131, 128], [], 1));
  for (const starters of [
    [1],
    [1, 4, 7, 25, 133],
    [2, 1],
    [150, 1],
    [151, 1],
    [9999, 1],
  ])
    assert.throws(() => createGame(starters, [], 1));
});

test("dice and wild encounter RNG replay exactly, double does not grant another turn", () => {
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
  assert.equal(transition(ended, { type: "END_TURN" }).activePlayer, 1);
});

test("departure encounters are skipped; each entered tile and destination are checked", () => {
  let state = transition(game(), { type: "ROLL" });
  state = transition(state, { type: "STEP" });
  assert.notEqual(state.phase, "choose-defender");
  const visiting = game(4);
  visiting.players[1].position = 2;
  visiting.players[2].position = 2;
  visiting.players[3].position = 3;
  state = enter(visiting, 2, 3);
  assert.equal(state.phase, "choose-defender");
  assert.equal(state.battle.defenderOwner, 1);
  assert.deepEqual(state.movement, { remaining: 2, encounters: [2] });
  state.players[0].party.push(pokemon(state, 1, 30));
  state = winAsActive(state);
  assert.equal(state.battle.defenderOwner, 2);
  assert.equal(state.players[1].eliminated, true);
  state.players[0].party[0].hp = getStats(state.players[0].party[0]).hp;
  state = winAsActive(state);
  assert.equal(state.phase, "moving");
  assert.equal(state.movement.remaining, 2);
  state = transition(state, { type: "STEP" });
  assert.equal(state.battle.defenderOwner, 3);
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
  battle = transition(battle, { type: "ATTACK", moveId: 0 });
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
  assert.equal(
    state.players[1].box.find((entry) => entry.id === guardId).hp,
    0,
  );
});

test("defeated trainer clears owned roads before the destination tile resolves", () => {
  const initial = game();
  initial.players[1].position = 2;
  initial.roads[2] = { ownerId: 1, pokemon: pokemon(initial, 4) };
  initial.roads[6] = { ownerId: 1, pokemon: pokemon(initial, 7) };
  const state = winAsActive(enter(initial, 2));
  assert.equal(state.players[1].eliminated, true);
  assert.equal(state.roads[2], null);
  assert.equal(state.roads[6], null);
  assert.equal(state.phase, "road");
  assert.equal(transition(state, { type: "END_TURN" }).activePlayer, 2);
});

test("elimination happens before center healing and the final survivor wins", () => {
  const initial = game(2);
  initial.players[1].position = 8;
  initial.players[1].party[0] = pokemon(initial, 4, 80);
  initial.players[0].box.push(pokemon(initial, 7, 50));
  let state = selectBoth(enter(initial, 8));
  state = transition(state, { type: "ATTACK", moveId: 0 });
  assert.equal(state.players[0].party[0].hp, 0);
  assert.equal(state.players[0].eliminated, true);
  assert.equal(state.phase, "finished");
  assert.equal(state.winner, 1);
  assert.equal(transition(state, { type: "END_TURN" }), state);
  assert.ok(validateSave(state));
});

test("a lost single battle permits continued movement when another party member is healthy", () => {
  const initial = game();
  initial.players[0].party.push(pokemon(initial, 7));
  initial.players[1].position = 2;
  initial.players[1].party[0] = pokemon(initial, 4, 80);
  const state = transition(selectBoth(enter(initial, 2, 2)), {
    type: "ATTACK",
    moveId: 0,
  });
  assert.equal(state.players[0].eliminated, false);
  assert.equal(state.phase, "moving");
  assert.equal(state.movement.remaining, 1);
});

test("wild capture is optional, has zero HP and overflows a full party to the box", () => {
  for (const full of [false, true]) {
    const initial = game();
    initial.players[0].party[0] = pokemon(initial, 1, 40);
    while (full && initial.players[0].party.length < 6)
      initial.players[0].party.push(pokemon(initial, 7));
    let state = winAsActive(enter(initial, 1));
    assert.equal(state.phase, "capture");
    const wildId = state.battle.wild.id;
    const declined = transition(state, { type: "CAPTURE", capture: false });
    assert.equal(
      [...declined.players[0].party, ...declined.players[0].box].some(
        (p) => p.id === wildId,
      ),
      false,
    );
    state = transition(state, { type: "CAPTURE", capture: true });
    const target = full ? state.players[0].box : state.players[0].party;
    assert.equal(target.find((entry) => entry.id === wildId).hp, 0);
    assert.equal(state.phase, "turn-end");
    assert.ok(validateSave(state));
  }
});

test("centers heal party and box only; exchanges preserve capacity and healthy party", () => {
  const initial = game();
  initial.players[0].party[0].hp = 1;
  initial.players[0].box.push(pokemon(initial, 7, 1, 0));
  initial.roads[2] = { ownerId: 0, pokemon: pokemon(initial, 4, 1, 1) };
  let state = enter(initial, 8);
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
  state = transition(state, {
    type: "CENTER_SWAP",
    partyPokemonId: player.party[0].id,
    boxPokemonId: oldBox,
  });
  assert.equal(state.players[0].party[0].id, oldBox);
  state = transition(state, {
    type: "CENTER_TRANSFER",
    pokemonId: state.players[0].box[0].id,
    to: "party",
  });
  assert.equal(state.players[0].party.length, 2);
  state = transition(state, {
    type: "CENTER_TRANSFER",
    pokemonId: oldBox,
    to: "box",
  });
  assert.equal(state.players[0].party.length, 1);
  assert.ok(validateSave(state));
});

test("road deployment cannot remove the last healthy party member; swaps and recovery retain HP", () => {
  let state = enter(game(), 2);
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
  state = transition(state, { type: "SWAP_GUARDIAN", pokemonId: nextId });
  assert.equal(state.players[0].party[0].id, starterId);
  assert.equal(state.roads[2].pokemon.hp, 2);
  state.phase = "road";
  while (state.players[0].party.length < 6)
    state.players[0].party.push(pokemon(state));
  state = transition(state, { type: "RETRIEVE" });
  assert.equal(state.players[0].box[0].id, nextId);
  assert.equal(state.players[0].box[0].hp, 2);
  assert.equal(state.roads[2], null);
});

test("type multipliers include dual types and immunity; the basic attack is always neutral", () => {
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
    getDamagePreview(attacker, { ...grassSteel, speciesId: 92 }, 0)
      .effectiveness,
    1,
  );
  assert.equal(getDamagePreview(attacker, grassSteel, 0).stab, 1);
  assert.ok(getAvailableMoves(129, 1).some((move) => move.id === 0));
});

test("illegal, immune and unavailable attacks preserve state and RNG", () => {
  const initial = game();
  initial.players[1].position = 2;
  initial.players[1].party[0] = pokemon(initial, 92);
  let state = selectBoth(enter(initial, 2));
  state = transition(state, { type: "ATTACK", moveId: 0 });
  assert.equal(transition(state, { type: "ATTACK", moveId: 33 }), state);
  assert.equal(transition(state, { type: "ATTACK", moveId: 999999 }), state);
  assert.equal(transition(state, { type: "WILD_ATTACK" }), state);
  assert.equal(transition(state, { type: "ROLL" }), state);
  assert.equal(transition(state, { type: "STEP" }), state);
});

test("victory grants one level and one evolution without healing; max level remains 100", () => {
  for (const level of [14, 15, 99, 100]) {
    const initial = game();
    initial.players[0].party[0] = pokemon(initial, 1, level);
    initial.players[1].position = 2;
    initial.players[1].party.push(pokemon(initial, 7));
    let state = selectBoth(enter(initial, 2));
    state.players[1].party[0].hp = 1;
    state = transition(state, { type: "ATTACK", moveId: 0 });
    const hp = state.players[0].party[0].hp;
    state = transition(state, { type: "ATTACK", moveId: 0 });
    assert.equal(state.players[0].party[0].level, Math.min(100, level + 1));
    assert.equal(state.players[0].party[0].speciesId, level >= 15 ? 2 : 1);
    assert.equal(state.players[0].party[0].hp, hp);
  }
});

test("special evolutions unlock at level 20 and branch ownership is explicit", () => {
  const initial = game();
  initial.players[1].position = 2;
  initial.players[1].party[0] = pokemon(initial, 133, 19);
  initial.players[0].party.push(pokemon(initial, 7));
  initial.players[0].party[0].hp = 1;
  let state = selectBoth(enter(initial, 2));
  state = transition(state, { type: "ATTACK", moveId: 0 });
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

test("wild level is highest living party level plus or minus one, bounded to 1..100", () => {
  for (const level of [1, 25, 100]) {
    const initial = game();
    initial.players[0].party[0] = pokemon(initial, 1, level);
    initial.players[0].party.push(pokemon(initial, 7, 100, 0));
    const state = enter(initial, 1);
    assert.ok(state.battle.wild.level >= Math.max(1, level - 1));
    assert.ok(state.battle.wild.level <= Math.min(100, level + 1));
  }
});
