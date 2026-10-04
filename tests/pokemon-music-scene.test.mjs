import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { loadGameSource } from "./game-test-helpers.mjs";

const source = "app/games/_components/pokemon-marble/";
const { getAudioScene } = loadGameSource(`${source}music-scene.ts`);
const { createGame, snapshotForPresentation, transitionWithEvents } = loadGameSource(`${source}engine.ts`);
const { BOARD_TILES } = loadGameSource(`${source}board.ts`);
const { getAvailableMoves } = loadGameSource(`${source}pokemon-data.ts`);

test("setup, center, movement and all battle kinds select their music", () => {
  assert.equal(getAudioScene(null), "opening");
  const state = createGame([1, 4], [], 9182);
  for (const phase of ["roll", "moving", "road", "turn-end", "finished"]) {
    state.phase = phase;
    assert.equal(getAudioScene(snapshotForPresentation(state)), "adventure");
  }
  state.phase = "center";
  assert.equal(getAudioScene(snapshotForPresentation(state)), "center");
  for (const kind of ["wild", "road", "trainer"]) {
    for (const phase of ["choose-defender", "choose-attacker", "attack"]) {
      assert.equal(getAudioScene({ phase, battle: { kind, outcome: null } }), kind);
    }
  }
});

test("visible outcomes distinguish capture, player victories and wild defeats", () => {
  for (const kind of ["road", "trainer", "wild"]) {
    for (const winner of ["attacker", "defender"]) {
      const view = { phase: "evolution", battle: { kind, outcome: { kind: "knockout", winner } } };
      const expected = kind !== "wild" ? "trainer-victory" : winner === "attacker" ? "wild-victory" : "wild";
      assert.equal(getAudioScene(view, { kind: "faint" }), expected);
      assert.equal(getAudioScene(view, { kind: "experience-gain" }), expected);
      assert.equal(getAudioScene(view, { kind: "evolution" }), expected);
      assert.equal(getAudioScene(view), expected, "Pending evolution choice retains its result music");
      assert.equal(getAudioScene(view, null, true), "adventure", "Skipping also ends the fanfare while an evolution choice remains");
    }
  }
  assert.equal(getAudioScene({ battle: { kind: "wild", outcome: { kind: "capture" } } }), "wild-victory");
  assert.equal(getAudioScene({ phase: "finished", battle: null }, { kind: "victory" }), "trainer-victory");
  assert.equal(getAudioScene({ phase: "finished", battle: null }), "adventure");
  assert.equal(getAudioScene({ phase: "road", battle: null }), "adventure", "Finished or skipped results release victory music");
});

test("capture music waits for the real result snapshot, then returns after the queue", () => {
  const state = createGame([1, 4], [], 9182);
  const wildTile = BOARD_TILES.indexOf("grass");
  assert.ok(wildTile >= 0);
  state.players[0].position = wildTile;
  state.phase = "attack";
  state.battle = {
    combat: loadGameSource("app/games/_components/pokemon-marble/combat-types.ts").createCombatState(),
    kind: "wild", defenderOwner: null, defenderPokemonId: null,
    attackerPokemonId: state.players[0].party[0].id,
    wild: { id: "wild-test", speciesId: 10, level: 1, xp: 0, hp: 1, moveIds: getAvailableMoves(10, 1).map(move => move.id) },
    turn: "attacker", outcome: null, lastAttack: null,
  };
  // Search deterministic seeds to cover both branches through the real engine.
  const outcomes = new Set();
  for (let seed = 1; seed <= 200 && outcomes.size < 2; seed++) {
    state.rng = Math.imul(seed, 0x9e3779b1) >>> 0;
    const result = transitionWithEvents(state, { type: "THROW_BALL" });
    const capture = result.events.find((event) => event.kind === "capture-result");
    assert.ok(capture);
    outcomes.add(capture.capture.success);
    for (const event of result.events.filter((event) => ["capture-throw", "capture-shake"].includes(event.kind))) {
      assert.equal(getAudioScene(event.snapshot, event), "wild");
    }
    assert.equal(getAudioScene(capture.snapshot, capture), capture.capture.success ? "wild-victory" : "wild");
    if (capture.capture.success && !["evolution", "learn-move"].includes(result.state.phase)) {
      assert.equal(getAudioScene(snapshotForPresentation(result.state)), "adventure");
    }
  }
  assert.equal(outcomes.size, 2);
});

test("all ten deployed music assets exist", () => {
  for (const track of ["opening", "gym", "route-2", "route-6", "pokemon-center", "wild-battle", "rival-battle", "last-pokemon", "wild-victory", "trainer-victory"]) {
    assert.ok(existsSync(`public/pokemon-marble/bgm/${track}.m4a`), track);
  }
});
