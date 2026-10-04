import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadGameSource, pokemonBattleAction } from "./game-test-helpers.mjs";

const root = "app/games/_components/pokemon-marble/";
const { movesById, speciesList, getAvailableMoves } = loadGameSource(
  `${root}pokemon-data.ts`,
);
const { getStats, getDamagePreview, getBattleMoves, getMoveUnavailableReason } =
  loadGameSource(`${root}battle.ts`);
const { createCombatState } = loadGameSource(`${root}combat-types.ts`);
const { resolveBattleMove, finishCombatRound, changeStages, inflictStatus } =
  loadGameSource(`${root}battle-actions.ts`);
const { validateBattleAction, validateCombat } = loadGameSource(
  `${root}combat-save.ts`,
);
const {
  createGame,
  transition,
  transitionWithEvents,
  getBattlePokemon,
  getBattleCommands,
  getBattleMovePreview,
} = loadGameSource(`${root}engine.ts`);
const { parseGameSave, validateSave } = loadGameSource(`${root}save.ts`);
const safeRandom = (limit) => (limit === 10000 ? 5000 : limit - 1);
const pokemon = (speciesId = 1, level = 30, hp) => {
  const p = { id: `p${speciesId}`, speciesId, level, hp: 0, xp: 0 };
  p.hp = hp ?? getStats(p).hp;
  return p;
};
function moveResult(
  id,
  attacker = pokemon(),
  defender = pokemon(113),
  combat = createCombatState(),
  random = safeRandom,
  side = "attacker",
) {
  const result = resolveBattleMove(
    attacker,
    defender,
    movesById[id],
    combat,
    side,
    random,
  );
  assert.ok(
    validateBattleAction(result),
    `valid result for ${id}: ${JSON.stringify(result)}`,
  );
  assert.ok(validateCombat(combat), `valid combat after ${id}`);
  return { result, attacker, defender, combat };
}
function trainerBattle(species = [1, 4], level = 30) {
  let state = createGame([1, 4], [], 9182);
  for (const [i, id] of species.entries())
    state.players[i].party[0] = { ...pokemon(id, level), id: `p${i + 1}` };
  state.players[0].position = 1;
  state.players[1].position = 2;
  state.phase = "moving";
  state.dice = [1, 2];
  state.movement = { remaining: 1, encounters: [] };
  state = transition(state, { type: "STEP" });
  for (const i of [1, 0])
    state = transition(state, {
      type: "CHOOSE_POKEMON",
      pokemonId: state.players[i].party[0].id,
    });
  return state;
}

test("power 55 yields 12 final damage after defense and half effectiveness, with no preview RNG", () => {
  const attacker = pokemon(1, 15),
    defender = pokemon(824, 15, 12);
  const combat = createCombatState(),
    before = JSON.stringify({ attacker, defender, combat });
  const preview = getDamagePreview(attacker, defender, 75, { combat });
  assert.equal(preview.power, 55);
  assert.equal(preview.offense, 19);
  assert.equal(preview.defense, 11);
  assert.equal(preview.baseDamage, 17);
  assert.equal(preview.stab, 1.5);
  assert.equal(preview.effectiveness, 0.5);
  assert.equal(preview.damage, 12);
  assert.equal(JSON.stringify({ attacker, defender, combat }), before);
  const { result } = moveResult(75, attacker, defender, combat);
  assert.equal(result.calculatedDamage, 12);
  assert.equal(result.damage, 12);
  assert.equal(defender.hp, 0);
});

test("physical/special stat selection includes Body Press, Psyshock and Foul Play", () => {
  const a = pokemon(113),
    d = pokemon(91),
    combat = createCombatState();
  assert.equal(getDamagePreview(a, d, 33).defense, getStats(d).defense);
  assert.equal(getDamagePreview(a, d, 52).defense, getStats(d).specialDefense);
  assert.equal(getDamagePreview(a, d, 776).offense, getStats(a).defense);
  assert.equal(getDamagePreview(a, d, 473).defenseStat, "defense");
  assert.equal(getDamagePreview(a, d, 492).offense, getStats(d).attack);
  combat.attacker.stages.attack = -2;
  combat.defender.stages.defense = 2;
  const normal = getDamagePreview(a, d, 33, { combat });
  const critical = getDamagePreview(a, d, 33, { combat, critical: true });
  assert.equal(normal.offenseStage, -2);
  assert.equal(critical.offenseStage, 0);
  assert.equal(critical.defenseStage, 0);
  assert.equal(critical.criticalMultiplier, 1.5);
});

test("critical rolls use 1/24, increased 1/8 and guaranteed critical moves", () => {
  const rolls = [];
  moveResult(33, undefined, undefined, undefined, (limit) => {
    rolls.push(limit);
    return safeRandom(limit);
  });
  assert.ok(rolls.includes(24));
  rolls.length = 0;
  moveResult(75, undefined, undefined, undefined, (limit) => {
    rolls.push(limit);
    return safeRandom(limit);
  });
  assert.ok(rolls.includes(8));
  assert.equal(
    moveResult(33, undefined, undefined, undefined, () => 0).result.critical,
    true,
  );
  assert.equal(moveResult(870).result.critical, true);
  assert.equal(
    getDamagePreview(pokemon(), pokemon(113), 870).critical,
    false,
    "even guaranteed critical previews exclude critical damage",
  );
});

test("drain uses lost HP, rounds the move's ratio and respects the healing cap", () => {
  const a = pokemon(1, 40, 10),
    d = pokemon(7, 1, 5);
  const half = moveResult(71, a, d).result;
  assert.ok(half.calculatedDamage > 5);
  assert.equal(half.damage, 5);
  assert.equal(half.healing, 3);
  assert.equal(a.hp, 13);
  const threeQuarters = moveResult(
    577,
    pokemon(700, 40, 10),
    pokemon(1, 1, 5),
  ).result;
  assert.equal(threeQuarters.healing, 4);
  const almostFull = pokemon();
  almostFull.hp -= 1;
  assert.equal(moveResult(202, almostFull).result.healing, 1);
  assert.equal(moveResult(202).result.healing, 0);
});

test("misses and immunity do not drain or apply secondary effects; crash damage still applies", () => {
  const miss = moveResult(
    577,
    pokemon(700, 30, 10),
    pokemon(1),
    undefined,
    (limit) => limit - 1,
  );
  // Draining Kiss has 100 accuracy; use a stage penalty to exercise a real miss.
  const combat = createCombatState();
  combat.attacker.stages.accuracy = -6;
  const missed = moveResult(
    577,
    pokemon(700, 30, 10),
    pokemon(1),
    combat,
    (limit) => limit - 1,
  );
  assert.equal(missed.result.outcome, "miss");
  assert.equal(missed.result.healing, 0);
  assert.equal(missed.result.hits.length, 0);
  assert.equal(moveResult(33, pokemon(), pokemon(92)).result.damage, 0);
  const crash = moveResult(
    136,
    pokemon(106),
    pokemon(113),
    undefined,
    (limit) => limit - 1,
  );
  assert.equal(crash.result.outcome, "miss");
  assert.ok(crash.result.recoil > 0);
  assert.ok(miss.result.damage > 0);
});

test("charged attacks and recharge consume separate actions and remain saveable", () => {
  const a = pokemon(1),
    d = pokemon(113),
    c = createCombatState();
  const charging = moveResult(76, a, d, c).result;
  assert.equal(charging.outcome, "charge");
  assert.equal(charging.damage, 0);
  assert.equal(c.attacker.charging, 76);
  assert.equal(moveResult(76, a, d, c).result.outcome, "hit");
  assert.equal(c.attacker.charging, null);
  const beam = moveResult(63, a, d, c).result;
  assert.equal(beam.outcome, "hit");
  assert.equal(c.attacker.recharge, true);
  const hp = d.hp;
  assert.equal(moveResult(63, a, d, c).result.outcome, "recharge");
  assert.equal(d.hp, hp);
});

test("semi-invulnerable charging can evade attacks and has move-specific counters", () => {
  const c = createCombatState();
  c.defender.charging = 91;
  assert.equal(
    moveResult(33, pokemon(), pokemon(113), c).result.outcome,
    "miss",
  );
  const a = pokemon(),
    d = pokemon(113);
  assert.equal(getDamagePreview(a, d, 89, { combat: c }).modifier, 2);
  assert.equal(moveResult(89, a, d, c).result.outcome, "hit");
});

test("multi-hit attacks stop at knockout, roll per hit and apply self boosts once", () => {
  const twice = moveResult(24).result;
  assert.equal(twice.hits.length, 2);
  assert.equal(
    twice.damage,
    twice.hits.reduce((n, h) => n + h.beforeHp - h.afterHp, 0),
  );
  assert.equal(
    moveResult(24, pokemon(), pokemon(113, 30, 1)).result.hits.length,
    1,
  );
  const many = moveResult(42).result;
  assert.equal(many.hits.length, 5);
  const c = createCombatState();
  moveResult(315, pokemon(1), pokemon(113), c);
  assert.equal(c.attacker.stages.specialAttack, -2);
  const a = pokemon(),
    d = pokemon(113);
  const preview = getDamagePreview(a, d, 167);
  assert.equal(preview.minDamage, preview.hitDamages[0]);
  assert.equal(preview.minHits, 1);
  assert.equal(
    preview.maxDamage,
    moveResult(167, a, d).result.calculatedDamage,
  );
});

test("fixed and conditional damage use explicit rules instead of placeholder power 1", () => {
  const half = moveResult(877, pokemon(), pokemon(113, 30, 101)).result;
  assert.equal(half.damage, 50);
  assert.equal(half.critical, false);
  assert.equal(half.hits[0].breakdown.power, 0);
  const c = createCombatState();
  c.attacker.receivedDamage = 12;
  assert.equal(moveResult(894, undefined, undefined, c).result.damage, 18);
  const a = pokemon(1),
    d = pokemon(113),
    ctx = { combat: createCombatState() };
  const full = getDamagePreview(a, d, 284, ctx).power;
  a.hp = 1;
  assert.ok(getDamagePreview(a, d, 284, ctx).power < full);
  const fickle = getDamagePreview(pokemon(), pokemon(113), 907);
  assert.equal(
    fickle.maxDamage,
    getDamagePreview(pokemon(), pokemon(113), 907, { fickleBoost: true })
      .damage,
  );
});

test("usage prerequisites, repeated moves and type immunity make Struggle available only when necessary", () => {
  const c = createCombatState(),
    a = pokemon(132, 1),
    d = pokemon(92);
  assert.deepEqual(
    getBattleMoves(a, d, { combat: c }).map((m) => m.id),
    [165],
  );
  assert.equal(getDamagePreview(a, d, 165).effectiveness, 1);
  assert.equal(getDamagePreview(a, d, 165).stab, 1);
  assert.ok(
    !getBattleMoves(pokemon(1, 3), pokemon(4, 3)).some((m) => m.id === 165),
  );
  assert.match(
    getMoveUnavailableReason(a, d, movesById[138], { combat: c }),
    /잠들어/,
  );
  c.defender.status = "slp";
  c.defender.statusTurns = 1;
  assert.equal(
    getMoveUnavailableReason(a, d, movesById[138], { combat: c }),
    null,
  );
  c.attacker.lastMove = 893;
  assert.match(
    getMoveUnavailableReason(a, d, movesById[893], { combat: c }),
    /연속/,
  );
  c.attacker.charging = 76;
  assert.deepEqual(
    getBattleMoves(a, d, { combat: c }).map((m) => m.id),
    [76],
  );
});

test("status immunity, capped stages, sleep, thawing and residual damage are explicit", () => {
  const c = createCombatState();
  assert.equal(inflictStatus(pokemon(4), c.attacker, "brn", safeRandom), false);
  assert.equal(
    inflictStatus(pokemon(81), c.attacker, "psn", safeRandom),
    false,
  );
  assert.equal(
    inflictStatus(pokemon(25), c.attacker, "par", safeRandom),
    false,
  );
  assert.equal(
    inflictStatus(pokemon(1), c.attacker, "slp", () => 0),
    true,
  );
  const a = pokemon(),
    d = pokemon(113);
  assert.equal(moveResult(33, a, d, c).result.outcome, "blocked");
  assert.equal(moveResult(33, a, d, c).result.outcome, "hit");
  assert.equal(c.attacker.status, null);
  changeStages(c.attacker, { attack: 9, defense: -9 });
  assert.equal(c.attacker.stages.attack, 6);
  assert.equal(c.attacker.stages.defense, -6);
  c.attacker.status = "frz";
  assert.equal(moveResult(172, a, d, c).result.outcome, "hit");
  assert.equal(c.attacker.status, null);
  c.attacker.status = "brn";
  c.defender.status = "psn";
  a.hp = getStats(a).hp;
  d.hp = getStats(d).hp;
  const before = [a.hp, d.hp];
  finishCombatRound({ attacker: a, defender: d }, c);
  assert.equal(a.hp, before[0] - Math.max(1, Math.floor(getStats(a).hp / 16)));
  assert.equal(d.hp, before[1] - Math.max(1, Math.floor(getStats(d).hp / 8)));
});

test("real reducer preserves forced actions, status and RNG across version-4 saves", () => {
  let state = trainerBattle([1, 1], 30);
  state.battle.combat.defender.charging = 76;
  state.battle.combat.attacker.status = "tox";
  const restored = parseGameSave(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(restored, state);
  assert.equal(transition(state, { type: "ATTACK", moveId: 76 }), state);
  const action = { type: "CONTINUE_BATTLE" };
  assert.deepEqual(
    transitionWithEvents(state, action),
    transitionWithEvents(restored, action),
  );
  state = transition(state, action);
  assert.ok(validateSave(state));
  assert.equal(state.version, 4);
});

test("Struggle recoil resolves self knockout and simultaneous knockout without duplicated XP", () => {
  let state = trainerBattle([132, 132], 3);
  state.players[1].party[0].hp = 1;
  state.players[0].party[0].hp = 1;
  const result = transitionWithEvents(state, { type: "ATTACK", moveId: 165 });
  assert.equal(result.events.filter((e) => e.kind === "faint").length, 2);
  assert.ok(!result.events.some((e) => e.kind === "experience-gain"));
  assert.equal(result.state.battle, null);
  assert.ok(validateSave(result.state));
  assert.equal(result.state.lastBattleAction.damage, 1);
  assert.equal(result.state.lastBattleAction.recoil, 1);
  state = trainerBattle([132, 132], 30);
  state.players[1].party[0].hp = 1;
  const lost = transitionWithEvents(state, { type: "ATTACK", moveId: 165 });
  assert.equal(lost.events.find((e) => e.kind === "faint").side, "defender");
  assert.ok(
    lost.events.some((e) => e.kind === "experience-gain" && e.playerId === 0),
  );
  assert.ok(validateSave(lost.state));
});

test("delayed attacks fire once after two rounds and survive an intermediate save", () => {
  let state = trainerBattle([213, 213], 100);
  state.battle.combat.defender.charging = null;
  // Queue through the actual resolver, then continue via legal game commands.
  const source = getBattlePokemon(state, "defender"),
    target = getBattlePokemon(state, "attacker");
  resolveBattleMove(
    source,
    target,
    movesById[248],
    state.battle.combat,
    "defender",
    safeRandom,
  );
  assert.equal(state.battle.combat.delayed.length, 1);
  state = parseGameSave(JSON.parse(JSON.stringify(state)));
  assert.ok(state);
  let triggered = 0;
  for (let i = 0; i < 6 && state.battle; i++) {
    const result = transitionWithEvents(state, pokemonBattleAction(state));
    state = result.state;
    triggered += result.events.filter(
      (e) => e.attack?.moveId === 248 && e.attack.outcome === "hit",
    ).length;
  }
  assert.equal(triggered, 1);
  assert.ok(validateSave(state));
});

test("legacy v3 saves preserve HP and RNG, mark old basic attacks and forbid new move 0", () => {
  const state = trainerBattle();
  const old = structuredClone(state);
  old.version = 3;
  delete old.lastBattleAction;
  delete old.battle.combat;
  old.battle.lastAttack = {
    side: "attacker",
    moveId: 0,
    damage: 5,
    effectiveness: 1,
  };
  const migrated = parseGameSave(old);
  assert.ok(migrated);
  assert.equal(migrated.rng, old.rng);
  assert.deepEqual(migrated.players, old.players);
  assert.equal(migrated.battle.lastAttack.legacy, true);
  assert.equal(transition(migrated, { type: "ATTACK", moveId: 0 }), migrated);
  const corrupted = structuredClone(state);
  corrupted.battle.combat.attacker.stages.attack = 7;
  assert.equal(parseGameSave(corrupted), null);
});

test("round-end damage can draw; a defeated road guardian is healed in the box without placement", () => {
  const state = trainerBattle([132, 132], 30);
  const guardian = state.players[1].party[0];
  state.players[1].party[0] = {
    ...pokemon(1),
    id: `p${state.nextPokemonId++}`,
  };
  const tile = 3;
  state.players[0].position = tile;
  state.battle.kind = "road";
  state.battle.turn = "attacker";
  state.roads[tile] = { ownerId: 1, pokemon: guardian };
  state.players[0].party[0].hp = 1;
  guardian.hp = 1;
  state.battle.combat.attacker.flinch = true;
  state.battle.combat.attacker.status = "psn";
  state.battle.combat.defender.status = "brn";
  assert.ok(validateSave(state));
  const resolved = transitionWithEvents(state, { type: "ATTACK", moveId: 165 });
  assert.equal(
    resolved.events.filter((event) => event.kind === "faint").length,
    2,
  );
  assert.equal(
    resolved.events.filter((event) => event.kind === "battle-effect").length,
    2,
  );
  assert.ok(!resolved.events.some((event) => event.kind === "experience-gain"));
  assert.equal(resolved.state.roads[tile], null);
  assert.equal(resolved.state.players[1].box[0].hp, getStats(guardian).hp);
  assert.equal(resolved.state.phase, "turn-end");
  assert.equal(resolved.state.battle, null);
  assert.ok(validateSave(resolved.state));
});

test("preview and non-critical resolution agree across levels, stages and compound types", () => {
  for (const level of [1, 15, 50, 100]) {
    for (const [species, moveId] of [
      [824, 75],
      [6, 33],
      [74, 52],
      [92, 33],
      [230, 52],
    ]) {
      const source = pokemon(1, level),
        target = pokemon(species, 100);
      const combat = createCombatState();
      combat.attacker.stages.attack = -2;
      combat.defender.stages.specialDefense = 2;
      const preview = getDamagePreview(source, target, moveId, { combat });
      const { result } = moveResult(moveId, source, target, combat);
      assert.equal(result.critical, false);
      assert.equal(result.calculatedDamage, preview.damage);
      assert.equal(result.damage, Math.min(result.beforeHp, preview.damage));
    }
  }
});

test("both due attacks resolve at round end even when the first one knocks out its target", () => {
  const state = trainerBattle([132, 132], 30);
  state.battle.turn = "attacker";
  state.battle.combat.attacker.flinch = true;
  for (const side of ["defender", "attacker"]) {
    const source = getBattlePokemon(state, side);
    state.battle.combat.delayed.push({
      side,
      moveId: 248,
      dueRound: 1,
      pokemon: structuredClone(source),
      combatant: structuredClone(state.battle.combat[side]),
    });
    source.hp = 1;
  }
  const result = transitionWithEvents(state, { type: "ATTACK", moveId: 165 });
  assert.equal(
    result.events.filter((event) => event.attack?.moveId === 248).length,
    2,
  );
  assert.equal(
    result.events.filter((event) => event.kind === "faint").length,
    2,
  );
  assert.ok(!result.events.some((event) => event.kind === "experience-gain"));
  assert.ok(validateSave(result.state));
});

test("all packaged attacks have classified effects, valid resolution records and explicit exclusions", () => {
  assert.equal(Object.keys(movesById).length, 432);
  assert.equal(movesById[0], undefined);
  for (const move of Object.values(movesById)) {
    assert.ok(["full", "base", "excluded"].includes(move.effects.support));
    if (move.effects.support !== "full") assert.ok(move.effects.reason);
    if (move.effects.support !== "excluded")
      moveResult(move.id, pokemon(1, 30, 40), pokemon(113));
  }
  for (const species of speciesList)
    for (const move of getAvailableMoves(species.id, 100))
      assert.notEqual(move.effects.support, "excluded");
});

test("buttons distinguish base power, final damage and accuracy; details show applied HP separately", () => {
  const { default: Panel } = loadGameSource(`${root}BattlePanel.tsx`);
  const { default: Details } = loadGameSource(`${root}DamageDetails.tsx`);
  const state = trainerBattle();
  const move = getBattleCommands(state)[0],
    preview = getBattleMovePreview(state, move.id);
  const html = renderToStaticMarkup(
    React.createElement(Panel, { state, dispatch() {} }),
  );
  assert.match(html, new RegExp(`위력 ${preview.powerLabel}`));
  assert.match(html, /예상 피해/);
  assert.match(html, /명중/);
  assert.match(html, /계산 상세/);
  assert.doesNotMatch(html, /기본 공격/);
  const result = moveResult(71, pokemon(1, 40, 10), pokemon(7, 1, 5)).result;
  const detail = renderToStaticMarkup(
    React.createElement(Details, { result, onClose() {} }),
  );
  assert.match(detail, /실제 HP 감소 5/);
  assert.match(detail, /흡수 회복 3/);
  assert.match(detail, /소수점 버림/);
});
