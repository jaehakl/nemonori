import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadGameSource } from "./game-test-helpers.mjs";

const path = "app/games/_components/pokemon-marble/";
const { default: Battle2D } = loadGameSource(`${path}Battle2D.tsx`);
const { default: GameBoard } = loadGameSource(`${path}GameBoard.tsx`);
const { getBattlePose, BATTLE_ANCHORS } = loadGameSource(`${path}battle-visuals.ts`);
const { createGame, transitionWithEvents, getActingPlayer, getStats, snapshotForPresentation } = loadGameSource(`${path}engine.ts`);
const { parseGameSave } = loadGameSource(`${path}save.ts`);
const battle = {
  kind: "trainer",
  attacker: { id: "a", speciesId: 1, level: 3, hp: 15, maxHp: 20 },
  defender: { id: "d", speciesId: 4, level: 3, hp: 0, maxHp: 20 },
  attackerName: "민지", defenderName: "준", turn: "attacker",
};
const presentation = (kind, progress, extra = {}) => ({
  progress, event: { kind, revision: 1, sequence: 0, ...extra },
});
const attack = (side = "attacker", moveType = 10) => ({
  side, moveType, moveId: 0, category: "physical", damage: 15, beforeHp: 15, afterHp: 0,
});
const render = (props) => renderToStaticMarkup(React.createElement(Battle2D, { battle, ...props }));

test("both attacking sides lunge toward their opponent and the finishing target stays visible", () => {
  for (const side of ["attacker", "defender"]) {
    const frame = presentation("attack", 0.225, { attack: attack(side) });
    const pose = getBattlePose(battle, side, frame, false);
    assert.equal(Math.sign(pose.x - BATTLE_ANCHORS[side].x), side === "attacker" ? 1 : -1);
    const target = side === "attacker" ? "defender" : "attacker";
    assert.equal(getBattlePose(battle, target, frame, false).visible, true);
    assert.equal(getBattlePose(battle, target, frame, false).hit, false);
    frame.progress = 0.45;
    assert.equal(getBattlePose(battle, target, frame, false).hit, true);
    frame.progress = 0.9;
    assert.equal(getBattlePose(battle, target, frame, false).hit, false);
  }
  assert.equal(getBattlePose(battle, "defender", null, false).visible, false);
});

test("faint, send-out, capture and evolution use event progress without independent clocks", () => {
  const faint = getBattlePose(battle, "defender", presentation("faint", 0.5, { side: "defender" }), false);
  assert.equal(faint.visible, true);
  assert.equal(faint.opacity, 0.5);
  assert.equal(getBattlePose(battle, "defender", presentation("faint", 1), false).opacity, 0);
  const start = getBattlePose(battle, "attacker", presentation("send-out", 0), false);
  assert.equal(start.opacity, 0);
  assert.equal(start.scale, 0.55);
  const capture = getBattlePose(battle, "defender", presentation("capture", 0.6), false);
  assert.equal(capture.visible, true);
  assert.equal(capture.scale, 0);
  assert.equal(capture.opacity, 0);
  assert.match(render({ presentation: presentation("capture", 0.6) }), /data-capture-ball="true"/);
  const evolved = { ...battle, attacker: { ...battle.attacker, speciesId: 2 } };
  for (const side of ["attacker", "defender"]) {
    const frame = presentation("evolution", 0.49, { side, previousSpeciesId: 133 });
    assert.equal(getBattlePose(evolved, side, frame, false).speciesId, 133);
    frame.progress = 0.5;
    assert.equal(getBattlePose(evolved, side, frame, false).speciesId, evolved[side].speciesId);
  }
});

test("all 18 types render vector effects; reduced motion removes travel and preserves impact", () => {
  const shapes = new Set();
  for (let type = 1; type <= 18; type++) {
    const frame = presentation("attack", 0.5, { attack: attack("attacker", type) });
    const html = render({ presentation: frame });
    assert.match(html, /data-source="attacker"/);
    shapes.add(html.match(/data-effect="([^"]+)"/)[1]);
    const reduced = render({ presentation: frame, reducedMotion: true });
    assert.match(reduced, /data-reduced-motion="true"/);
    assert.doesNotMatch(reduced, /data-source=/);
    const pose = getBattlePose(battle, "defender", frame, true);
    assert.equal(pose.x, BATTLE_ANCHORS.defender.x);
    assert.equal(pose.hit, true);
  }
  assert.ok(shapes.size >= 12, "types differ by geometry, not only color");
});

test("paused frames are stable and clearing the presentation clears every transient effect", () => {
  const frame = presentation("attack", 0.5, { attack: attack() });
  const html = render({ presentation: frame });
  assert.equal(render({ presentation: structuredClone(frame) }), html);
  const skipped = render({ presentation: null });
  assert.doesNotMatch(skipped, /data-effect=|data-capture-ball=|data-hit="true"/);
});

test("failed art uses a readable name and color, also during faint and evolution", () => {
  const { default: FailedBattle } = loadGameSource(`${path}Battle2D.tsx`, {
    [`${path}sprite-artwork.ts`]: { useSpriteArtwork: () => ({ status: "failed", bounds: null }) },
  });
  const html = renderToStaticMarkup(React.createElement(FailedBattle, {
    battle, presentation: presentation("faint", 0.5, { side: "defender" }),
  }));
  assert.doesNotMatch(html, /<image\b/);
  assert.match(html, /이상해씨/);
  assert.match(html, /파이리/);
  assert.match(html, /opacity="0.5"/);
});

test("normalized PNG bounds are shared with the board and stay in the portrait clip", () => {
  const { default: Sprite } = loadGameSource(`${path}SvgPokemon.tsx`, {
    [`${path}sprite-artwork.ts`]: { useSpriteArtwork: () => ({
      status: "ready", bounds: { scale: 2, centerX: 0.4, centerY: 0.6 },
    }) },
  });
  const html = renderToStaticMarkup(React.createElement("svg", null,
    React.createElement(Sprite, { speciesId: 1, x: 0, y: 0, size: 320 })));
  assert.match(html, /<image[^>]*x="-256" y="-384" width="640" height="640"/);
  assert.match(html, /<rect x="-160" y="-160" width="320" height="320"/);
});

test("21 mixed battles render, return to the board and resume version-2 saves without GPU access", () => {
  const kinds = new Set();
  let savedBattles = 0;
  for (let round = 0; round < 21; round++) {
    const kind = ["wild", "trainer", "road"][round % 3];
    let state = createGame([1, 4], [], 123 + round);
    const tile = kind === "wild" ? 1 : 2;
    state.players[0].position = tile - 1;
    state.players[1].position = kind === "trainer" ? tile : 20;
    if (kind === "road") {
      const guardian = { id: `p${state.nextPokemonId++}`, speciesId: 7, level: 1, hp: 0 };
      guardian.hp = getStats(guardian).hp;
      state.roads[tile] = { ownerId: 1, pokemon: guardian };
    }
    state.phase = "moving";
    state.dice = [1, 1];
    state.movement = { remaining: 1, encounters: [] };
    let action = { type: "STEP" };
    let completed = false;
    for (let step = 0; step < 100; step++) {
      const result = transitionWithEvents(state, action);
      state = result.state;
      const before = JSON.stringify(state);
      for (const event of result.events) {
        if (!event.snapshot.battle) continue;
        kinds.add(event.snapshot.battle.kind);
        for (const progress of [0.2, 0.45, 0.8]) {
          const html = render({ battle: event.snapshot.battle, presentation: { event, progress } });
          assert.match(html, /포켓몬 2D 배틀 무대/);
          assert.doesNotMatch(html, /<canvas\b|그래픽 가속/);
        }
      }
      assert.equal(JSON.stringify(state), before, "display never changes rules or RNG");
      const resumed = parseGameSave(JSON.parse(before));
      assert.deepEqual(resumed, state);
      state = resumed;
      if (state.battle) {
        savedBattles++;
        assert.match(render({ battle: snapshotForPresentation(state).battle }), /data-battle-kind=/);
      }
      if (["choose-attacker", "choose-defender"].includes(state.phase)) {
        action = { type: "CHOOSE_POKEMON", pokemonId: state.players[getActingPlayer(state)].party.find(p => p.hp > 0).id };
      } else if (state.phase === "attack") {
        action = getActingPlayer(state) === null ? { type: "WILD_ATTACK" } : { type: "ATTACK", moveId: 0 };
      } else if (state.phase === "evolution") {
        action = { type: "CHOOSE_EVOLUTION", speciesId: state.evolution.options[0] };
      } else if (state.phase === "capture") {
        action = { type: "CAPTURE", capture: false };
      } else {
        assert.equal(state.battle, null);
        const html = renderToStaticMarkup(React.createElement(GameBoard, {
          tokens: [], guardians: [], activePlayerId: 0, dice: state.dice, rolling: false, tabletop: true, hideHud: true,
        }));
        assert.match(html, /포켓몬 마블 40칸 게임판/);
        assert.doesNotMatch(html, /data-battle-kind=|<canvas\b/);
        completed = true;
        break;
      }
    }
    assert.ok(completed, `${kind} battle completed`);
  }
  assert.deepEqual([...kinds].sort(), ["road", "trainer", "wild"]);
  assert.ok(savedBattles >= 21);
});

test("the game has no Three.js imports, WebGL creation or extra battle animation scheduler", () => {
  for (const file of readdirSync(path).filter(name => /\.tsx?$/.test(name))) {
    const source = readFileSync(path + file, "utf8");
    assert.doesNotMatch(source, /from ["']three|WebGLRenderer|getContext\(["'](?:webgl|experimental-webgl)/, file);
  }
  for (const file of ["Battle2D.tsx", "battle-visuals.ts"]) {
    assert.doesNotMatch(readFileSync(path + file, "utf8"), /requestAnimationFrame|setInterval|setTimeout|Math\.random/);
  }
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(pkg.dependencies.three, undefined);
  assert.equal(pkg.devDependencies["@types/three"], undefined);
});
