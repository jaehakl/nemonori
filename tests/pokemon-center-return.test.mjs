import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadGameSource, pokemonBattleAction } from "./game-test-helpers.mjs";

const root = "app/games/_components/pokemon-marble/";
const { createGame, transition, transitionWithEvents, getStats, getActingPlayer } = loadGameSource(`${root}engine.ts`);
const { getAvailableMoves } = loadGameSource(`${root}pokemon-data.ts`);
const { getExperienceGrowth, getVictoryExperience } = loadGameSource(`${root}progression.ts`);
const { validateSave, parseGameSave } = loadGameSource(`${root}save.ts`);
const { default: ActionPanel } = loadGameSource(`${root}ActionPanel.tsx`);

function pokemon(state, speciesId = 133, level = 19, hp = 1, xp = 999) {
  return { id: `p${state.nextPokemonId++}`, speciesId, level, xp, hp,
    moveIds: getAvailableMoves(speciesId, level).map((move) => move.id) };
}

function reload(state) {
  assert.ok(validateSave(state), `invalid ${state.phase} save`);
  const loaded = parseGameSave(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(loaded, state);
  return loaded;
}

function finishEvolution(state) {
  const events = [];
  while (state.phase === "evolution") {
    state = reload(state);
    assert.equal(getActingPlayer(state), state.evolution.ownerId);
    const action = { type: "CHOOSE_EVOLUTION", speciesId: state.evolution.options[0] };
    const result = transitionWithEvents(state, action);
    assert.deepEqual(result, transitionWithEvents(reload(state), action));
    events.push(...result.events);
    state = result.state;
  }
  return { state: reload(state), events };
}

function battleAtLastSide(state) {
  state.players[0].position = 30;
  for (const player of state.players.slice(1)) player.position = 31;
  state.phase = "moving";
  state.dice = [1, 2];
  state.dicePurpose = "movement";
  state.movement = { remaining: 1, encounters: [] };
  state = transition(state, { type: "STEP" });
  for (const owner of [1, 0]) state = transition(state, {
    type: "CHOOSE_POKEMON", pokemonId: state.players[owner].party[0].id,
  });
  return reload(state);
}

test("voluntary start return commits party and guardian rewards once across saved branch choices", () => {
  const initial = createGame([1], [], 1);
  initial.players[0].position = 39;
  initial.players[0].party = [pokemon(initial), pokemon(initial, 7, 5, 0, 0)];
  initial.players[0].box = [pokemon(initial)];
  initial.roads[3] = { ownerId: 0, pokemon: pokemon(initial) };
  const participants = [...initial.players[0].party, initial.roads[3].pokemon];
  const result = transitionWithEvents(initial, { type: "MOVE_TO_CENTER" });
  assert.equal(result.state.phase, "evolution");
  assert.equal(result.state.players[0].restTurnsRemaining, 3);
  assert.deepEqual(result.events.map((event) => event.kind), ["rescue", "heal", "lap"]);
  const reward = result.events.find((event) => event.kind === "lap");
  assert.equal(reward.playerId, 0);
  assert.deepEqual(reward.growth.map((entry) => entry.before.id), participants.map((entry) => entry.id));
  const completed = finishEvolution(result.state);
  assert.equal(completed.state.phase, "turn-end");
  assert.ok(completed.events.every((event) => event.kind !== "lap"));
  const after = [...completed.state.players[0].party, completed.state.roads[3].pokemon];
  participants.forEach((member, index) => {
    const expected = getExperienceGrowth(member, getVictoryExperience(member.level, member.level));
    assert.equal(after[index].level, expected.level);
    assert.equal(after[index].xp, expected.xp);
  });
  for (const member of [...completed.state.players[0].party, ...completed.state.players[0].box])
    assert.equal(member.hp, getStats(member).hp);
  assert.equal(completed.state.players[0].box[0].level, 19);
  assert.equal(completed.state.roads[3].pokemon.hp, 1);
  assert.equal(completed.state.rng, initial.rng);
  assert.equal(transition(completed.state, { type: "MOVE_TO_CENTER" }), completed.state);
});

test("an injured active player returns, heals and finishes the turn after reward evolution", () => {
  const initial = createGame([1, 4], [], 9182);
  initial.players[0].party = [pokemon(initial)];
  initial.players[1].party = [pokemon(initial, 128, 100, 100, 0)];
  const battle = battleAtLastSide(initial);
  const result = transitionWithEvents(battle, pokemonBattleAction(battle));
  assert.equal(result.events.find((event) => event.kind === "rescue").playerId, 0);
  assert.equal(result.events.find((event) => event.kind === "lap").playerId, 0);
  assert.equal(result.events.find((event) => event.kind === "attack").snapshot.battle.attacker.hp, 0);
  assert.equal(result.state.players[0].party[0].hp, getStats(result.state.players[0].party[0]).hp);
  const completed = finishEvolution(result.state).state;
  assert.equal(completed.phase, "turn-end");
  assert.equal(completed.movement, null);
  assert.equal(completed.players[0].position, 0);
  assert.equal(transition(completed, { type: "END_TURN" }).activePlayer, 1);
});

test("defeated opponent receives its own start reward then the active player's encounters resume", () => {
  const initial = createGame([1, 4, 7], [], 9182);
  initial.players[0].party = [pokemon(initial, 128, 100, 100, 0)];
  initial.players[1].party = [pokemon(initial)];
  let battle = battleAtLastSide(initial);
  battle = transition(battle, pokemonBattleAction(battle));
  assert.equal(battle.battle.turn, "attacker");
  const result = transitionWithEvents(battle, pokemonBattleAction(battle));
  assert.equal(result.state.activePlayer, 0);
  assert.equal(result.state.evolution.ownerId, 1);
  assert.equal(result.events.find((event) => event.kind === "lap").playerId, 1);
  assert.equal(result.events.find((event) => event.kind === "lap").tile, 0);
  const completed = finishEvolution(result.state).state;
  assert.equal(completed.phase, "choose-defender");
  assert.equal(completed.battle.defenderOwner, 2);
  assert.equal(completed.players[0].position, 31);
  assert.equal(completed.players[1].position, 0);
  assert.equal(completed.players[1].party[0].hp, getStats(completed.players[1].party[0]).hp);
});

test("simultaneous knockout rewards both owners once and preserves both guardian choices", () => {
  const initial = createGame([1, 4], [], 9182);
  for (const player of initial.players) {
    player.party = [pokemon(initial, 132, 3, 1, 0)];
    initial.roads[player.id + 3] = { ownerId: player.id, pokemon: pokemon(initial) };
  }
  const result = transitionWithEvents(battleAtLastSide(initial), { type: "ATTACK", moveId: 165 });
  assert.equal(result.events.filter((event) => event.kind === "faint").length, 2);
  assert.deepEqual(result.events.filter((event) => event.kind === "lap").map((event) => event.playerId), [0, 1]);
  assert.deepEqual(result.state.growth.centerReturn.playerIds, [0, 1]);
  const completed = finishEvolution(result.state);
  assert.equal(completed.state.phase, "turn-end");
  assert.deepEqual(completed.events.filter((event) => event.kind === "evolution").map((event) => event.playerId), [0, 1]);
  for (const player of completed.state.players) {
    assert.equal(player.restTurnsRemaining, 3);
    assert.equal(player.party[0].hp, getStats(player.party[0]).hp);
    assert.equal(completed.state.roads[player.id + 3].pokemon.hp, 1);
  }
});

test("rest exchange supports saved 6-7-6 transfers without consuming a turn or escape dice", () => {
  let state = createGame([1], [], 2688);
  while (state.players[0].party.length < 6) state.players[0].party.push(pokemon(state, 7, 5, 1, 0));
  state.players[0].box.push(pokemon(state, 7, 5, 1, 0));
  state = transition(state, { type: "MOVE_TO_CENTER" });
  assert.equal(transition(state, { type: "START_EXCHANGE" }), state);
  state = transition(state, { type: "END_TURN" });
  const before = structuredClone(state);
  state = reload(transition(state, { type: "START_EXCHANGE" }));
  const outgoing = state.players[0].party[0].id;
  state = reload(transition(state, { type: "CENTER_TRANSFER", pokemonId: state.players[0].box[0].id, to: "party" }));
  assert.equal(state.players[0].party.length, 7);
  for (const type of ["ROLL", "END_TURN", "END_EXCHANGE", "MOVE_TO_CENTER"])
    assert.equal(transition(state, { type }), state);
  const panel = renderToStaticMarkup(React.createElement(ActionPanel, { state, dispatch() {}, onRestart() {} }));
  assert.match(panel, /aria-label="[^"]*탈출 주사위 굴리기" disabled=""/);
  state = reload(transition(state, { type: "CENTER_TRANSFER", pokemonId: outgoing, to: "box" }));
  state = reload(transition(state, { type: "END_EXCHANGE" }));
  assert.equal(state.phase, "rest-roll");
  assert.equal(state.turn, before.turn);
  assert.equal(state.rng, before.rng);
  assert.equal(state.players[0].restTurnsRemaining, 3);
  const escaped = reload(transition(state, { type: "ROLL" }));
  assert.equal(escaped.phase, "moving");
  assert.deepEqual(escaped.dice, [2, 2]);
});

test("save validation rejects forged center continuations and invalid resting exchanges", () => {
  const initial = createGame([1], [], 1);
  initial.players[0].position = 39;
  initial.players[0].party = [pokemon(initial)];
  const state = reload(transition(initial, { type: "MOVE_TO_CENTER" }));
  for (const change of [
    (s) => { s.growth.centerReturn.playerIds = []; },
    (s) => { s.growth.centerReturn.playerIds = [0, 0]; },
    (s) => { s.growth.centerReturn.playerIds = [1]; },
    (s) => { s.growth.centerReturn.resume = "movement"; },
    (s) => { s.growth.queue[0].ownerId = 1; },
    (s) => { s.players[0].position = 10; },
    (s) => { s.exchangeActive = true; },
    (s) => { s.players[0].restTurnsRemaining = 2; },
    (s) => { s.players[0].party[0].hp = 1; },
  ]) {
    const invalid = structuredClone(state);
    change(invalid);
    assert.equal(validateSave(invalid), false);
  }
  let resting = transition(finishEvolution(state).state, { type: "END_TURN" });
  resting = reload(transition(resting, { type: "START_EXCHANGE" }));
  resting.players[0].position = 3;
  assert.equal(validateSave(resting), false);
});
