import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadGameSource } from "./game-test-helpers.mjs";

const path = "app/games/_components/pokemon-marble/";
const { getGrowthFrame, getRewardGrid, getEvolutionFrame } = loadGameSource(`${path}growth-visuals.ts`);
const { getExperienceGrowth, getVictoryExperience } = loadGameSource(`${path}progression.ts`);
const { getOverlayLayout, SEAT_ROTATION } = loadGameSource(`${path}tabletop-layout.ts`);
const { createGame, transitionWithEvents, getStats } = loadGameSource(`${path}engine.ts`);
const { BOARD_TILES } = loadGameSource(`${path}board.ts`);
const { getAvailableMoves } = loadGameSource(`${path}pokemon-data.ts`);
const { default: GrowthPresentation, hasGrowthPresentation } = loadGameSource(`${path}GrowthPresentation.tsx`);

function reward(level = 15, xp = 800, amount = 2400) {
  const before = { id: "p1", speciesId: 1, level, xp, hp: 0, maxHp: 50 };
  return { before, after: { ...before, ...getExperienceGrowth(before, amount) }, amount, location: { kind: "party" } };
}

test("all reward bars share a clock, cross multiple levels and hold their final result for 200ms", () => {
  const growth = reward();
  const original = structuredClone(growth);
  for (const [progress, level, xp] of [[0, 15, 800], [0.25, 16, 520], [0.5, 17, 240], [5 / 6, 18, 200], [0.95, 18, 200], [1, 18, 200]]) {
    const frame = getGrowthFrame(growth, progress);
    assert.equal(frame.level, level);
    assert.equal(frame.xp, xp);
    assert.equal(frame.levelsGained, level - 15);
  }
  assert.ok(getGrowthFrame(growth, 0.08).glow > 0, "each threshold emits its own local burst");
  assert.equal(getGrowthFrame(growth, 0).glow, 0);
  assert.deepEqual(growth, original, "animation never mutates either snapshot");
  assert.equal(growth.after.hp, 0);
});

test("MAX and reduced-motion rewards reveal the recorded result without overflow or particles", () => {
  for (const growth of [reward(99, 990, 1000), reward(100, 0, 0)]) {
    const frame = getGrowthFrame(growth, 0, true);
    assert.equal(frame.level, 100);
    assert.equal(frame.xp, 0);
    assert.equal(frame.glow, 0);
    assert.deepEqual(frame, getGrowthFrame(growth, 1, true));
  }
  assert.equal(getGrowthFrame(reward(), 0, true).levelsGained, 3);
});

test("a full lap groups all 33 rewards in party then road order without changing rules or RNG", () => {
  const state = createGame([1], ["민지"], 9182);
  const make = (index) => {
    const value = { id: `p${state.nextPokemonId++}`, speciesId: 128, level: index === 5 ? 100 : index + 2, xp: index === 5 ? 0 : 950, hp: 0 };
    value.moveIds = getAvailableMoves(value.speciesId, value.level).map(move => move.id);
    value.hp = index === 0 ? 0 : getStats(value).hp;
    return value;
  };
  state.players[0].party = Array.from({ length: 6 }, (_, index) => make(index));
  state.players[0].box = [make(8)];
  // Assign in reverse order to ensure card order comes from road position.
  const roads = BOARD_TILES.flatMap((kind, tile) => kind === "road" ? [tile] : []);
  for (const tile of roads.toReversed()) state.roads[tile] = { ownerId: 0, pokemon: make(tile) };
  state.players[0].position = 39;
  state.phase = "moving";
  state.dice = [6, 6];
  state.dicePurpose = "movement";
  state.movement = { remaining: 2, encounters: [] };
  const result = transitionWithEvents(state, { type: "STEP" });
  assert.deepEqual(result.events.map((entry) => entry.kind), ["move", "lap"]);
  const event = result.events[1];
  assert.equal(event.growth.length, 33);
  const participants = [...state.players[0].party, ...roads.map((tile) => state.roads[tile].pokemon)];
  assert.deepEqual(event.growth.map((entry) => entry.before.id), participants.map((entry) => entry.id));
  assert.deepEqual(event.growth.slice(6).map((entry) => entry.location.tile), roads);
  event.growth.forEach((entry, index) => {
    const before = participants[index];
    const amount = getVictoryExperience(before.level, before.level);
    assert.equal(entry.amount, amount);
    assert.deepEqual({ level: entry.after.level, xp: entry.after.xp }, getExperienceGrowth(before, amount));
    assert.equal(entry.after.hp, before.hp);
  });
  assert.deepEqual(result.state.players[0].box, state.players[0].box);
  assert.equal(result.state.rng, state.rng);
  assert.equal(result.state.movement.remaining, 1);
  assert.equal(result.state.growth.resume, "movement");
  const html = renderToStaticMarkup(React.createElement(GrowthPresentation, {
    event, progress: 0.85, reducedMotion: false, width: 1024, height: 672,
  }));
  assert.equal((html.match(/data-pokemon=/g) ?? []).length, 33);
  assert.equal((html.match(/role="meter"/g) ?? []).length, 33);
  assert.match(html, /33마리에게 완주 보상/);
  assert.match(html, /LEVEL UP! \+/);
  assert.match(html, />MAX</);
  assert.match(html, /40번 도로 수비/);
  assert.doesNotMatch(html, /<button|페이지|연출 건너뛰기/);
});

test("every reward card fits the full overlay at all four seats and tablet sizes", () => {
  for (const [width, height] of [[1366, 928], [1024, 672], [844, 560], [768, 560]]) {
    for (const seat of ["bottom", "left", "top", "right"]) {
      const layout = getOverlayLayout(width, height, seat);
      assert.equal(layout.rotation, SEAT_ROTATION[seat]);
      assert.equal(layout.width, seat === "left" || seat === "right" ? height : width);
      assert.equal(layout.height, seat === "left" || seat === "right" ? width : height);
      for (const count of [1, 6, 12, 33]) {
        const grid = getRewardGrid(count, layout.width, layout.height);
        assert.ok(grid.rows * grid.columns >= count);
        assert.ok((grid.columns * 168 - 8) * grid.scale <= layout.width - 48 + 0.001);
        assert.ok((grid.rows * 120 - 8) * grid.scale <= layout.height - 136 + 0.001);
        assert.ok(grid.scale > 0.54, "even 33 cards retain visible sprites and labels");
      }
    }
  }
});

test("evolution uses a 0.9s charge, 0.9s transformation and 1.2s celebration on the shared clock", () => {
  assert.equal(getEvolutionFrame(0.299).stage, "charge");
  assert.equal(getEvolutionFrame(0.3).stage, "transform");
  assert.equal(getEvolutionFrame(0.599).stage, "transform");
  assert.equal(getEvolutionFrame(0.6).stage, "reveal");
  assert.equal(getEvolutionFrame(1).scale, 1);
  assert.deepEqual(getEvolutionFrame(0, true), getEvolutionFrame(1, true));
  const event = {
    kind: "evolution", playerId: 1, previousSpeciesId: 1,
    pokemon: { ...reward().after, speciesId: 2 },
    snapshot: { players: [{ id: 1, name: "민지", seatSide: "left" }] },
  };
  const render = (progress, reducedMotion = false) => renderToStaticMarkup(React.createElement(GrowthPresentation, {
    event, progress, reducedMotion, width: 672, height: 1024,
  }));
  assert.match(render(0), /이상해씨, 새로운 모습으로!/);
  assert.doesNotMatch(render(0), /이상해풀, 진화 성공!/);
  assert.match(render(0.45), /data-evolution-stage="transform"/);
  assert.match(render(0.8), /이상해풀, 진화 성공!/);
  assert.match(render(0.8), /이상해씨 → 이상해풀/);
  assert.match(render(0.8), /민지의 포켓몬/);
  assert.match(render(0, true), /data-evolution-stage="reveal"/);
  assert.doesNotMatch(render(0, true), /<button|<path/);
  assert.equal(hasGrowthPresentation(event), true);
  assert.equal(hasGrowthPresentation({ kind: "lap", growth: [reward()] }), true);
  assert.equal(hasGrowthPresentation({ kind: "lap", growth: [] }), false);
  assert.equal(hasGrowthPresentation(null), false);
});
