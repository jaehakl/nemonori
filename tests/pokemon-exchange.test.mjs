import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadGameSource } from "./game-test-helpers.mjs";

const root = "app/games/_components/pokemon-marble/";
const { createGame, transition, getStats } = loadGameSource(`${root}engine.ts`);
const { parseGameSave, validateSave } = loadGameSource(`${root}save.ts`);
const { default: ActionPanel, PartySummary } = loadGameSource(`${root}ActionPanel.tsx`);
const { default: GuardianPopup } = loadGameSource(`${root}GuardianPopup.tsx`);
const { guardianPopupPosition } = loadGameSource(`${root}guardian-popup-position.ts`);

function pokemon(state, hp) {
  const pokemon = { id: `p${state.nextPokemonId++}`, speciesId: 7, level: 3, xp: 0, hp: 1 };
  pokemon.hp = hp ?? getStats(pokemon).hp;
  return pokemon;
}
function landed(tile) {
  const state = createGame([1, 4], ["민지", "준"], 12);
  state.players[0].position = tile - 1;
  state.phase = "moving";
  state.dice = [2, 2];
  state.movement = { remaining: 1, encounters: [] };
  while (state.players[0].party.length < 6) state.players[0].party.push(pokemon(state));
  return transition(state, { type: "STEP" });
}
function resume(state) {
  assert.ok(validateSave(state), `invalid ${state.phase} save`);
  const restored = parseGameSave(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(restored, state);
  return restored;
}

test("box exchange supports repeated 6–7–6 transfers and preserves unfinished exchange in saves", () => {
  let state = landed(10);
  state.players[0].box.push(pokemon(state), pokemon(state));
  const incoming = state.players[0].box[0].id;
  const outgoing = state.players[0].party[0].id;
  const receive = { type: "CENTER_TRANSFER", pokemonId: incoming, to: "party" };
  assert.equal(transition(state, receive), state);
  state = transition(state, { type: "START_EXCHANGE" });
  state = resume(transition(state, receive));
  assert.equal(state.players[0].party.length, 7);
  for (const action of [
    { type: "END_EXCHANGE" }, { type: "END_TURN" }, { type: "ROLL" },
    { type: "CENTER_TRANSFER", pokemonId: state.players[0].box[0].id, to: "party" },
  ]) assert.equal(transition(state, action), state);
  state = resume(transition(state, { type: "CENTER_TRANSFER", pokemonId: outgoing, to: "box" }));
  assert.equal(state.players[0].party.length, 6);
  assert.equal(state.exchangeActive, true);
  state = resume(transition(state, { type: "CENTER_TRANSFER", pokemonId: outgoing, to: "party" }));
  state = resume(transition(state, { type: "CENTER_TRANSFER", pokemonId: incoming, to: "box" }));
  state = transition(state, { type: "END_EXCHANGE" });
  assert.equal(state.exchangeActive, false);
  const next = transition(state, { type: "END_TURN" });
  assert.equal(next.phase, "roll");
  assert.equal(next.activePlayer, 0, "double roll still extends the turn after exchange");
});

test("road exchange repeatedly retrieves and deploys without ending the turn or healing", () => {
  let state = landed(2);
  state.roads[2] = { ownerId: 0, pokemon: pokemon(state, 2) };
  const original = state.roads[2].pokemon.id;
  const replacement = state.players[0].party[0].id;
  assert.equal(transition(state, { type: "RETRIEVE" }), state);
  state = transition(state, { type: "START_EXCHANGE" });
  assert.equal(transition(state, { type: "DEPLOY", pokemonId: replacement }), state);
  state = resume(transition(state, { type: "RETRIEVE" }));
  assert.equal(state.players[0].party.length, 7);
  assert.equal(state.players[0].party.find((p) => p.id === original).hp, 2);
  assert.equal(transition(state, { type: "END_EXCHANGE" }), state);
  assert.equal(transition(state, { type: "END_TURN" }), state);
  for (const id of [replacement, original, replacement]) {
    state = resume(transition(state, { type: "DEPLOY", pokemonId: id }));
    assert.equal(state.phase, "road");
    assert.equal(state.exchangeActive, true);
    state = resume(transition(state, { type: "RETRIEVE" }));
  }
  state = resume(transition(state, { type: "DEPLOY", pokemonId: original }));
  assert.equal(state.roads[2].pokemon.hp, 2);
  assert.equal(state.players[0].party.length, 6);
});

test("exchange validation rejects overflow outside exchange and forged destinations", () => {
  let state = transition(landed(10), { type: "START_EXCHANGE" });
  state.players[0].party.push(pokemon(state));
  resume(state);
  for (const change of [
    (s) => { delete s.exchangeActive; },
    (s) => { s.exchangeActive = false; },
    (s) => { s.exchangeActive = "true"; },
    (s) => { s.phase = "turn-end"; },
    (s) => { s.players[0].party.push(pokemon(s)); },
    (s) => { s.players[1].party = s.players[0].party.splice(0, 7); },
  ]) {
    const invalid = structuredClone(state);
    change(invalid);
    assert.equal(validateSave(invalid), false);
  }
  const road = transition(landed(2), { type: "START_EXCHANGE" });
  road.roads[2] = { ownerId: 1, pokemon: pokemon(road) };
  assert.equal(transition(road, { type: "RETRIEVE" }), road);
  assert.equal(validateSave(road), false);
  const far = transition(landed(2), { type: "START_EXCHANGE" });
  far.roads[4] = { ownerId: 0, pokemon: pokemon(far) };
  assert.equal(transition(far, { type: "RETRIEVE" }), far);
  for (const type of ["CENTER_SWAP", "SWAP_GUARDIAN"]) {
    assert.equal(transition(far, { type, pokemonId: far.players[0].party[0].id }), far);
  }
});

test("old road turn-end saves can restart exchange but resting players and enemy roads cannot", () => {
  for (const occupied of [false, true]) {
    const legacy = landed(2);
    legacy.phase = "turn-end";
    if (occupied) legacy.roads[2] = { ownerId: 0, pokemon: pokemon(legacy) };
    const opened = transition(resume(legacy), { type: "START_EXCHANGE" });
    assert.equal(opened.phase, "road");
    assert.equal(opened.exchangeActive, true);
    resume(opened);
  }
  const enemy = landed(2);
  enemy.phase = "turn-end";
  enemy.roads[2] = { ownerId: 1, pokemon: pokemon(enemy) };
  assert.equal(transition(enemy, { type: "START_EXCHANGE" }), enemy);
  const resting = landed(10);
  resting.phase = "turn-end";
  resting.players[0].restTurnsRemaining = 2;
  assert.equal(transition(resting, { type: "START_EXCHANGE" }), resting);
});

test("exchange controls use upper destinations and lower party cards without duplicate copy", () => {
  let state = landed(10);
  state.players[0].box.push(pokemon(state));
  const render = (Component, props = {}) => renderToStaticMarkup(React.createElement(Component, { state, dispatch() {}, onRestart() {}, ...props }));
  assert.match(render(ActionPanel), /교환 시작하기/);
  assert.doesNotMatch(render(ActionPanel), /YOUR ADVENTURE|다시 힘차게|한 번에 맞교환|두 포켓몬 교환|이상해씨/);
  assert.doesNotMatch(render(PartySummary), /<button/);
  state = transition(state, { type: "START_EXCHANGE" });
  assert.match(render(ActionPanel), /교환 끝내기/);
  assert.match(render(ActionPanel), /파티로 이동/);
  assert.doesNotMatch(render(ActionPanel), /턴 마치기|한 번 더 굴리기/);
  assert.match(render(PartySummary), /<button[^>]*aria-label="이상해씨, 레벨 3, 박스로 이동"/);
  assert.doesNotMatch(render(PartySummary, { blocked: true }), /<button/);
  state = transition(state, { type: "CENTER_TRANSFER", pokemonId: state.players[0].box[0].id, to: "party" });
  assert.match(render(ActionPanel), /disabled=""[^>]*>교환 끝내기/);
  assert.match(render(ActionPanel), /한 마리를 옮겨 6마리로 정리하세요/);
});

test("guardian popup displays a read-only card and stays inside small and large viewports", () => {
  const state = landed(2);
  const html = renderToStaticMarkup(React.createElement(GuardianPopup, {
    tile: 2, pokemon: state.players[0].party[0], ownerName: "민지", rootRef: { current: null }, onClose() {},
  }));
  assert.match(html, /<dialog/);
  assert.match(html, /민지의 수비/);
  assert.match(html, /이상해씨/);
  assert.match(html, /수비 정보 닫기/);
  assert.doesNotMatch(html, /파티로 이동|수비로 배치/);
  for (const [width, height] of [[320, 568], [568, 320], [768, 1024], [1366, 1024]]) {
    const popup = { width: 240, height: Math.min(300, height - 16) };
    for (const left of [0, width / 2, width - 35]) {
      for (const top of [0, height / 2, height - 35]) {
        const position = guardianPopupPosition({ left, top, width: 35, height: 35 }, popup, { width, height });
        assert.ok(position.left >= 8 && position.top >= 8);
        assert.ok(position.left + popup.width <= width - 8);
        assert.ok(position.top + popup.height <= height - 8);
      }
    }
  }
});
