import assert from "node:assert/strict";
import test from "node:test";
import { loadGameSource, pokemonBattleAction } from "./game-test-helpers.mjs";

const path = "app/games/_components/pokemon-marble/";
const { resolveControlLayout } = loadGameSource(`${path}control-orientation.ts`);
const { createGame, transition, getStats } = loadGameSource(`${path}engine.ts`);
const { BOARD_SIZE } = loadGameSource(`${path}board.ts`);
const { getAvailableMoves } = loadGameSource(`${path}pokemon-data.ts`);
const previous = { mode: "fixed", seatSide: "bottom" };

function game() {
  return createGame([1, 4, 7, 172], [], 9182);
}

function enter(state, tile) {
  state.players[state.activePlayer].position = (tile + BOARD_SIZE - 1) % BOARD_SIZE;
  state.phase = "moving";
  state.dice = [1, 1];
  state.dicePurpose = "movement";
  state.movement = { remaining: 1, encounters: [] };
  return transition(state, { type: "STEP" });
}

function choose(state, owner) {
  return transition(state, {
    type: "CHOOSE_POKEMON",
    pokemonId: state.players[owner].party[0].id,
  });
}

function seat(state, mode = "auto") {
  return resolveControlLayout(state, mode, previous, false).seatSide;
}

test("automatic controls follow defender selection and each side's attack turn", () => {
  const initial = game();
  initial.players[1].position = 2;
  let state = enter(initial, 2);
  assert.equal(state.phase, "choose-defender");
  assert.equal(seat(state), "left");
  state = choose(state, 1);
  assert.equal(state.phase, "choose-attacker");
  assert.equal(seat(state), "bottom");
  state = choose(state, 0);
  assert.equal(state.phase, "attack");
  assert.equal(state.battle.turn, "defender");
  assert.equal(seat(state), "left");
  state = transition(state, pokemonBattleAction(state));
  assert.equal(state.battle.turn, "attacker");
  assert.equal(seat(state), "bottom");
});

test("branch evolution faces its owner, then recovery returns controls to the turn player", () => {
  const initial = game();
  initial.players[0].party[0].hp = 1;
  initial.players[1].position = 2;
  const defender = initial.players[1].party[0];
  defender.speciesId = 133;
  defender.level = 19;
  defender.moveIds = [...getAvailableMoves(133, 19).map(move => move.id), 34];
  defender.xp = 900;
  defender.hp = getStats(defender).hp;
  let state = choose(choose(enter(initial, 2), 1), 0);
  state = transition(state, pokemonBattleAction(state));
  assert.equal(state.phase, "evolution");
  assert.equal(state.evolution.ownerId, 1);
  assert.equal(seat(state), "left");
  state = transition(state, { type: "CHOOSE_EVOLUTION", speciesId: 134 });
  assert.equal(state.phase, "turn-end");
  assert.equal(seat(state), "bottom");
});

test("wild automation, normal phases and the winner retain the active player's seat", () => {
  const initial = game();
  initial.activePlayer = 2;
  assert.equal(seat(initial), "top");
  let state = choose(enter(initial, 2), 2);
  assert.equal(state.battle.kind, "wild");
  assert.equal(state.battle.turn, "defender");
  assert.equal(seat(state), "top");
  state = { ...game(), activePlayer: 3, winner: 3, phase: "finished" };
  assert.equal(seat(state), "right");
  assert.equal(seat(state, "fixed"), "bottom");
  assert.deepEqual(resolveControlLayout(null, "auto", previous, false), {
    mode: "auto", seatSide: "bottom",
  });
});

test("busy presentation freezes both mode and seat, and equal layouts keep identity", () => {
  const state = game();
  state.activePlayer = 2;
  const fixed = Object.freeze({ mode: "fixed", seatSide: "bottom" });
  const auto = Object.freeze({ mode: "auto", seatSide: "left" });
  assert.equal(resolveControlLayout(state, "auto", fixed, true), fixed);
  assert.equal(resolveControlLayout(state, "fixed", auto, true), auto);
  assert.equal(resolveControlLayout(null, "fixed", auto, true), auto);
  assert.deepEqual(resolveControlLayout(state, "auto", fixed, false), {
    mode: "auto", seatSide: "top",
  });
  assert.deepEqual(resolveControlLayout(state, "fixed", auto, false), fixed);
  const top = Object.freeze({ mode: "auto", seatSide: "top" });
  assert.equal(resolveControlLayout(state, "auto", top, false), top);
  assert.equal(resolveControlLayout(state, "fixed", fixed, false), fixed);
});

test("orientation is a pure display calculation and never changes the saved game", () => {
  const state = game();
  state.activePlayer = 1;
  const saved = structuredClone(state);
  const layout = { mode: "auto", seatSide: "right" };
  const originalLayout = { ...layout };
  function freeze(value) {
    if (value && typeof value === "object") {
      for (const child of Object.values(value)) freeze(child);
      Object.freeze(value);
    }
    return value;
  }
  freeze(state);
  freeze(layout);
  resolveControlLayout(state, "auto", layout, false);
  resolveControlLayout(state, "fixed", layout, false);
  resolveControlLayout(state, "fixed", layout, true);
  assert.deepEqual(state, saved);
  assert.deepEqual(layout, originalLayout);
});

test("lap evolution choices keep the moving player's seat through the queue and resumed movement", () => {
  const initial = game();
  initial.activePlayer = 2;
  for (const player of initial.players) player.position = (player.id + 1) * 10 % BOARD_SIZE;
  const first = initial.players[2].party[0];
  first.speciesId = 133;
  first.level = 19;
  first.moveIds = [...getAvailableMoves(133, 19).map(move => move.id), 34];
  first.hp = getStats(first).hp;
  initial.players[2].party.push({ ...first, id: `p${initial.nextPokemonId++}` });
  initial.players[2].position = 39;
  initial.phase = "moving";
  initial.dice = [1, 1];
  initial.dicePurpose = "movement";
  initial.movement = { remaining: 2, encounters: [] };
  // Keep the start center empty so the completed growth queue resumes movement.
  initial.players[3].position = 30;
  const facing = Object.freeze({ mode: "auto", seatSide: "top" });
  let state = transition(initial, { type: "STEP" });
  assert.equal(state.phase, "evolution");
  assert.equal(seat(state), "top");
  for (const selected of [134, 135]) {
    assert.equal(state.phase, "evolution");
    assert.equal(state.evolution.ownerId, 2);
    assert.equal(state.battle, null);
    assert.equal(resolveControlLayout(state, "auto", facing, true), facing);
    assert.equal(resolveControlLayout(state, "auto", facing, false), facing);
    state = transition(state, { type: "CHOOSE_EVOLUTION", speciesId: selected });
  }
  assert.equal(state.phase, "moving");
  assert.equal(state.movement.remaining, 1);
  assert.equal(resolveControlLayout(state, "auto", facing, false), facing);
});
