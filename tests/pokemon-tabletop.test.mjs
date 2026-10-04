import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadGameSource } from "./game-test-helpers.mjs";

const path = "app/games/_components/pokemon-marble/";
const { getTabletopLayout, SEAT_ROTATION } = loadGameSource(
  `${path}tabletop-layout.ts`,
);
const {
  DISPLAY_PREFERENCES_KEY,
  loadDisplayPreferences,
  saveDisplayPreferences,
} = loadGameSource(`${path}display-preferences.ts`);
const seats = ["bottom", "left", "top", "right"];
const { default: GameBoard, BattleHud } = loadGameSource(`${path}GameBoard.tsx`);
const { default: TabletopControls } = loadGameSource(`${path}TabletopControls.tsx`);
const { getFullscreenState, toggleFullscreen } = loadGameSource(
  `${path}fullscreen.ts`,
);
const { default: FullscreenToggle } = loadGameSource(
  `${path}FullscreenToggle.tsx`,
);
const { default: ExperienceControls } = loadGameSource(
  `${path}ExperienceControls.tsx`,
);
const { default: SystemIcon } = loadGameSource(`${path}SystemIcon.tsx`);

const inside = (rectangle, width, height) => {
  assert.ok(rectangle.left >= 0 && rectangle.top >= 0);
  assert.ok(rectangle.left + rectangle.width <= width + 0.001);
  assert.ok(rectangle.top + rectangle.height <= height + 0.001);
};

test("every seat keeps the square board fixed and controls clear of its outer tile ring", () => {
  for (const [width, height] of [[1024, 768], [1366, 1024]]) {
    const baseline = getTabletopLayout(width, height, false, "bottom");
    for (const seat of seats) {
      const layout = getTabletopLayout(width, height, false, seat);
      assert.deepEqual(layout.stage, baseline.stage);
      assert.deepEqual(layout.panel, baseline.panel);
      assert.equal(layout.stage.width, layout.stage.height);
      assert.equal(layout.stageRotation, 0);
      assert.equal(layout.stageContentWidth, layout.stage.width);
      assert.equal(layout.stageContentHeight, layout.stage.height);
      assert.equal(layout.contentWidth, layout.contentHeight);
      inside(layout.stage, width, height);
      inside(layout.panel, width, height);
      const inset = layout.panel.left - layout.stage.left;
      assert.ok(inset > layout.stage.width / 11);
      assert.ok(layout.contentWidth >= 425, "two large cards fit without scaling");
    }
  }
});

test("the board preserves accessible tile controls without a separate tile list", () => {
  const tokens = [
    {
      id: 0,
      name: "민준",
      color: "#ef6559",
      position: 39,
      starterSpeciesId: 1,
      leaderSpeciesId: 1,
      restTurnsRemaining: 0,
    },
    {
      id: 1,
      name: "지우",
      color: "#3988e5",
      position: 0,
      starterSpeciesId: 4,
      leaderSpeciesId: 4,
      restTurnsRemaining: 3,
    },
  ];
  const html = renderToStaticMarkup(React.createElement(GameBoard, {
    dice: null, rolling: false, activePlayerId: 0,
    tokens,
    guardians: [{ tile: 3, ownerId: 1, speciesId: 25 }],
    selectedTile: 39,
    onTileSelect() {},
  }));
  assert.equal((html.match(/data-tile="/g) ?? []).length, 40);
  assert.match(html, /aria-label="1번 포켓몬센터 · 지우 · 휴식 3턴"/);
  assert.match(html, /aria-label="4번 도로 · 지우의 피카츄 수비"/);
  assert.match(html, /aria-label="40번 도로 · 민준" aria-pressed="true"/);
  assert.doesNotMatch(html, /칸 목록/);
});

test("compact battle modals face each seat without overlapping the fighters' viewport", () => {
  for (const [width, height] of [[1024, 672], [1366, 928], [844, 560]]) {
    for (const seat of seats) {
      const { stage, panel, contentWidth, contentHeight, rotation } =
        getTabletopLayout(width, height, true, seat);
      inside(stage, width, height);
      inside(panel, width, height);
      const overlapWidth = Math.min(stage.left + stage.width, panel.left + panel.width)
        - Math.max(stage.left, panel.left);
      const overlapHeight = Math.min(stage.top + stage.height, panel.top + panel.height)
        - Math.max(stage.top, panel.top);
      assert.ok(overlapWidth <= 0.001 || overlapHeight <= 0.001);
      const sideways = seat === "left" || seat === "right";
      assert.equal(contentWidth, sideways ? panel.height : panel.width);
      assert.equal(contentHeight, sideways ? panel.width : panel.height);
      assert.equal(rotation, SEAT_ROTATION[seat]);
      assert.ok(contentHeight >= 220 && contentHeight <= 260);
      assert.ok(contentWidth >= 480 && contentWidth <= 620);
      assert.ok(panel.left >= 16 && panel.top >= 16);
      assert.ok(stage.width >= 500 && stage.height >= 290);
    }
  }
});

test("movement does not change the tabletop structure or resize its control panel", () => {
  const render = (compact) => renderToStaticMarkup(React.createElement(TabletopControls, {
    battle: false,
    seatSide: "left",
    mode: "auto",
    compact,
    board: React.createElement("svg", { "aria-label": "게임판" }),
  }, React.createElement("button", null, "주사위 굴리기")));
  assert.equal(render(true), render(false));
});

test("full-area celebrations face their owner and make the underlying board and panel inert", () => {
  for (const mode of ["auto", "fixed"]) {
    for (const seatSide of seats) {
      const html = renderToStaticMarkup(React.createElement(TabletopControls, {
        battle: true, mode, seatSide: "bottom",
        board: React.createElement("button", null, "보드"),
        overlay: { seatSide, render: () => React.createElement("section", null, "진화 연출") },
      }, React.createElement("button", null, "배틀 행동")));
      const rotation = mode === "auto" ? SEAT_ROTATION[seatSide] : 0;
      assert.match(html, /data-overlay="true"/);
      assert.equal((html.match(/inert="" aria-hidden="true"/g) ?? []).length, 2);
      assert.ok(html.match(/class="orientedOverlay"[^>]+/)?.[0].includes(`rotate(${rotation}deg)`));
      assert.match(html, /<section>진화 연출<\/section>/);
    }
  }
});

test("rotated battle contents fill the reserved stage at every seat and tablet size", () => {
  for (const [width, height] of [[1366, 928], [1024, 672], [844, 560], [768, 560], [560, 768]]) {
    for (const seat of seats) {
      const layout = getTabletopLayout(width, height, true, seat);
      const { stage, panel, stageRotation, stageContentWidth, stageContentHeight } = layout;
      assert.equal(stageRotation, layout.rotation);
      const radians = stageRotation * Math.PI / 180;
      const rotatedWidth = Math.abs(Math.cos(radians)) * stageContentWidth
        + Math.abs(Math.sin(radians)) * stageContentHeight;
      const rotatedHeight = Math.abs(Math.sin(radians)) * stageContentWidth
        + Math.abs(Math.cos(radians)) * stageContentHeight;
      assert.ok(Math.abs(rotatedWidth - stage.width) < 0.001);
      assert.ok(Math.abs(rotatedHeight - stage.height) < 0.001);
      inside(stage, width, height);
      inside(panel, width, height);
      const overlaps = stage.left < panel.left + panel.width
        && stage.left + stage.width > panel.left
        && stage.top < panel.top + panel.height
        && stage.top + stage.height > panel.top;
      assert.equal(overlaps, false, `${width}x${height} at ${seat}`);
    }
  }
});

test("the whole battle stage and its system controls face the same seat as the action panel", () => {
  for (const mode of ["auto", "fixed"]) {
    for (const seatSide of seats) {
      for (const battle of [true, false]) {
        const rotation = mode === "fixed" ? 0 : SEAT_ROTATION[seatSide];
        const html = renderToStaticMarkup(React.createElement(TabletopControls, {
          battle,
          seatSide,
          mode,
          board: React.createElement("svg", { "aria-label": "배경·포켓몬·효과" }),
          systemControls: React.createElement("header", null, "화면 설정"),
        }, React.createElement("button", null, "배틀 행동")));
        const stage = html.match(/<div class="orientedStage"[^>]*>[\s\S]*?<\/header><\/div>/)?.[0];
        assert.ok(stage, "artwork and system controls share one rotation container");
        assert.ok(stage.includes(`rotate(${battle ? rotation : 0}deg)`));
        assert.match(stage, /<svg aria-label="배경·포켓몬·효과"><\/svg><header>화면 설정<\/header>/);
        const panel = html.match(/<div class="orientedPanel"[^>]*>/)?.[0];
        assert.ok(panel?.includes(`rotate(${rotation}deg)`));
      }
    }
  }
});

test("compact battle HP groups identify each trainer and reflect damage only at impact", () => {
  const battle = {
    kind: "trainer",
    attacker: { id: "a", speciesId: 1, level: 5, xp: 250, hp: 30, maxHp: 30 },
    defender: { id: "d", speciesId: 4, level: 5, xp: 500, hp: 0, maxHp: 20 },
    attackerName: "민준",
    defenderName: "지우",
    turn: "attacker",
  };
  const render = (progress) => renderToStaticMarkup(React.createElement(BattleHud, {
    battle,
    inline: true,
    presentation: {
      progress,
      event: {
        revision: 1,
        sequence: 0,
        attack: { side: "attacker", beforeHp: 12, afterHp: 0, damage: 12 },
      },
    },
  }));
  const before = render(0.2);
  assert.match(before, /aria-label="민준 · 이상해씨 · HP 30 \/ 30"/);
  assert.match(before, /aria-label="지우 · 파이리 · HP 12 \/ 20"/);
  assert.match(before, /aria-valuenow="12"/);
  const after = render(0.8);
  assert.match(after, /aria-label="지우 · 파이리 · HP 0 \/ 20 · 행동불능"/);
  assert.match(after, /aria-valuenow="0"/);
  assert.equal((after.match(/role="meter"/g) ?? []).length, 4);
  assert.match(after, /aria-label="이상해씨 타입"/);
  assert.match(after, /aria-label="파이리 타입"/);
  assert.match(after, />풀<\/span>/);
  assert.match(after, />독<\/span>/);
  assert.match(after, />불꽃<\/span>/);
  assert.match(after, /aria-valuetext="25%"/);
  assert.match(after, /aria-valuetext="50%"/);
});

test("the normal board renders SVG immediately without a canvas or graphics initialization", () => {
  const html = renderToStaticMarkup(React.createElement(GameBoard, {
    tokens: [],
    guardians: [],
    activePlayerId: 0,
    dice: null,
    rolling: false,
    tabletop: true,
    hideHud: true,
    selectedTile: 39,
  }));
  assert.match(html, /<svg\b/);
  assert.doesNotMatch(html, /<canvas\b|class="canvas"/);
  assert.doesNotMatch(html, /배틀 무대를 준비하는 중|배틀 무대를 표시할 수 없어요/);
});

test("display preferences default safely and persist auto mode independently of game saves", () => {
  let stored = null;
  const storage = {
    getItem(key) {
      assert.equal(key, DISPLAY_PREFERENCES_KEY);
      return stored;
    },
    setItem(key, value) {
      assert.equal(key, DISPLAY_PREFERENCES_KEY);
      stored = value;
    },
  };
  assert.deepEqual(loadDisplayPreferences(storage), { mode: "fixed" });
  saveDisplayPreferences({ mode: "auto" }, storage);
  assert.deepEqual(loadDisplayPreferences(storage), { mode: "auto" });
  for (stored of ["{", "null", '{"mode":"unexpected"}', '{"mode":false}']) {
    assert.deepEqual(loadDisplayPreferences(storage), { mode: "fixed" });
  }
  assert.deepEqual(loadDisplayPreferences({ getItem() { throw Error("Denied"); } }), { mode: "fixed" });
  assert.doesNotThrow(() => saveDisplayPreferences({ mode: "auto" }, {
    setItem() { throw Error("Quota exceeded"); },
  }));
});

test("fullscreen enters the game element, exits it and reads external exits accurately", async () => {
  const calls = [];
  const target = {
    async requestFullscreen() {
      calls.push("enter");
      document.fullscreenElement = target;
    },
  };
  const document = {
    fullscreenEnabled: true,
    fullscreenElement: null,
    documentElement: target,
    async exitFullscreen() {
      calls.push("exit");
      document.fullscreenElement = null;
    },
  };
  assert.deepEqual(getFullscreenState(target, document), { supported: true, active: false });
  await toggleFullscreen(target, document);
  assert.deepEqual(getFullscreenState(target, document), { supported: true, active: true });
  await toggleFullscreen(target, document);
  assert.deepEqual(calls, ["enter", "exit"]);
  await toggleFullscreen(target, document);
  document.fullscreenElement = null; // Escape or the browser's own exit control.
  assert.equal(getFullscreenState(target, document).active, false);
});

test("unsupported and rejected fullscreen requests never pretend to enter fullscreen", async () => {
  const denied = {
    async requestFullscreen() {
      throw new Error("User activation required");
    },
  };
  const document = {
    fullscreenEnabled: false,
    fullscreenElement: null,
    documentElement: denied,
    async exitFullscreen() {},
  };
  assert.equal(getFullscreenState(denied, document).supported, false);
  await assert.rejects(toggleFullscreen(denied, document), /unavailable/);
  document.fullscreenEnabled = true;
  await assert.rejects(toggleFullscreen(denied, document), /User activation/);
  assert.equal(getFullscreenState(denied, document).active, false);
  const html = renderToStaticMarkup(React.createElement(FullscreenToggle, {
    targetRef: { current: null },
  }));
  assert.match(html, /disabled=""/);
  assert.match(html, /aria-pressed="false"/);
  assert.match(html, /이 브라우저에서는 전체 화면을 지원하지 않습니다/);
});

test("system controls use consistent decorative SVG icons and Korean accessible names", () => {
  const fullscreen = renderToStaticMarkup(React.createElement(FullscreenToggle, {
    targetRef: { current: null },
  }));
  assert.match(fullscreen, /class="iconButton"/);
  assert.match(fullscreen, /aria-label="전체 화면"/);
  assert.match(fullscreen, /<svg width="22" height="22"/);
  assert.doesNotMatch(fullscreen, /⛶/);
  const settings = renderToStaticMarkup(React.createElement(ExperienceControls, {
    preferences: { muted: false, musicVolume: 0.3, effectsVolume: 0.6 },
    onPreferences() {},
    reducedMotion: false,
    onReducedMotion() {},
    onUnlock() {},
    displayMode: "fixed",
    onDisplayMode() {},
  }));
  const summary = settings.match(/<summary\b[^>]*>[\s\S]*?<\/summary>/)?.[0];
  assert.ok(summary);
  assert.match(summary, /class="iconButton"/);
  assert.match(summary, /aria-label="화면 방향과 사운드 설정"/);
  assert.match(summary, /title="화면 방향과 사운드 설정"/);
  assert.match(summary, /<svg width="22" height="22"/);
  assert.doesNotMatch(summary, /⚙|화면·사운드/);
  for (const name of ["fullscreen", "exitFullscreen", "settings", "guide", "restart"]) {
    const icon = renderToStaticMarkup(React.createElement(SystemIcon, { name }));
    assert.match(icon, /aria-hidden="true" focusable="false"/);
    assert.match(icon, /stroke="currentColor"/);
    assert.match(icon, /<path d="[^"]+"/);
  }
});
