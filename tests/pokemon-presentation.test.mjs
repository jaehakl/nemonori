import assert from "node:assert/strict";
import test from "node:test";
import { loadGameSource } from "./game-test-helpers.mjs";

const { createPresentationPlayer } = loadGameSource(
  "app/games/_components/pokemon-marble/presentation-player.ts",
);
const event = (kind, sequence = 0) => ({
  kind,
  revision: 1,
  sequence,
  message: kind,
  snapshot: {},
});

function harness(onCue) {
  let now = 0;
  let id = 0;
  const scheduled = new Map();
  const frames = [];
  const cues = [];
  const player = createPresentationPlayer(
    (value) => frames.push(value),
    (value) => {
      cues.push(value.kind);
      onCue?.(value);
    },
    {
      now: () => now,
      request: (callback) => {
        scheduled.set(++id, callback);
        return id;
      },
      cancel: (key) => scheduled.delete(key),
    },
  );
  const tick = (ms = 50) => {
    now += ms;
    const callbacks = [...scheduled.values()];
    scheduled.clear();
    for (const callback of callbacks) callback(now);
  };
  const advance = (ms) => {
    for (let remaining = ms; remaining > 0; remaining -= 50)
      tick(Math.min(50, remaining));
  };
  return { player, frames, cues, scheduled, tick, advance };
}

test("dice settles before movement and attack impact sounds exactly once", () => {
  const h = harness();
  h.player.enqueue([event("roll"), event("move", 1), event("attack", 2)]);
  h.advance(1750);
  assert.equal(h.frames.at(-1).event.kind, "roll");
  assert.deepEqual(h.cues, ["roll"]);
  h.advance(50);
  assert.equal(h.frames.at(-1).event.kind, "move");
  h.advance(700);
  assert.deepEqual(h.cues, ["roll", "move"]);
  h.advance(50);
  assert.deepEqual(h.cues, ["roll", "move", "attack"]);
  h.advance(550);
  assert.equal(h.player.busy, false);
  assert.equal(h.frames.at(-1).event, null);
  assert.equal(h.scheduled.size, 0);
});

test("one lap cue and 1.2s reward precede sequential 3s evolutions and the next movement", () => {
  for (const count of [1, 33]) {
    const h = harness();
    h.player.enqueue([
      { ...event("lap"), growth: Array.from({ length: count }, () => ({})) },
      event("evolution", 1), event("evolution", 2), event("move", 3),
    ]);
    h.advance(1000);
    assert.equal(h.frames.at(-1).event.kind, "lap");
    assert.equal(h.frames.at(-1).progress, 5 / 6);
    h.player.setPaused(true);
    h.advance(5000);
    assert.equal(h.frames.at(-1).progress, 5 / 6);
    assert.deepEqual(h.cues, ["lap"]);
    h.player.setPaused(false);
    h.advance(200);
    assert.equal(h.frames.at(-1).event.sequence, 1);
    h.advance(1500);
    h.player.setPaused(true);
    h.advance(5000);
    assert.equal(h.frames.at(-1).progress, 0.5);
    h.player.setPaused(false);
    h.advance(1500);
    assert.equal(h.frames.at(-1).event.sequence, 2);
    h.advance(2950);
    assert.equal(h.frames.at(-1).event.kind, "evolution");
    h.advance(50);
    assert.equal(h.frames.at(-1).event.kind, "move");
    h.advance(300);
    assert.equal(h.player.busy, false);
    assert.deepEqual(h.cues, ["lap", "evolution", "evolution", "move"]);
  }
});

test("pause preserves elapsed time and does not replay sounds on resume", () => {
  const h = harness();
  h.player.enqueue([event("attack")]);
  h.advance(400);
  h.player.setPaused(true);
  const progress = h.frames.at(-1).progress;
  h.tick(30_000);
  assert.equal(h.frames.at(-1).progress, progress);
  assert.deepEqual(h.cues, []);
  h.player.setPaused(false);
  h.advance(50);
  assert.deepEqual(h.cues, ["attack"]);
  h.advance(550);
  assert.equal(h.player.busy, false);
});

test("skip releases only presentation while a paused session stays paused", () => {
  const h = harness();
  h.player.enqueue([event("evolution")]);
  h.player.setPaused(true);
  h.player.skip();
  h.player.enqueue([event("move")]);
  h.advance(1000);
  assert.equal(h.player.busy, true);
  assert.equal(h.frames.at(-1).progress, 0);
  assert.deepEqual(h.cues, []);
  h.player.setPaused(false);
  h.advance(300);
  assert.equal(h.player.busy, false);
});

test("late callbacks after pause/reset/disposal cannot touch a replacement session", () => {
  const h = harness();
  h.player.enqueue([event("evolution")]);
  const oldFrame = [...h.scheduled.values()][0];
  h.player.reset();
  h.player.enqueue([event("attack")]);
  oldFrame(99999);
  assert.equal(h.frames.at(-1).event.kind, "attack");
  assert.equal(h.frames.at(-1).progress, 0);
  const oldPauseFrame = [...h.scheduled.values()][0];
  h.player.setPaused(true);
  h.player.setPaused(false);
  oldPauseFrame(100000);
  h.advance(1000);
  assert.deepEqual(h.cues, ["attack"]);
  h.player.dispose();
  h.player.enqueue([event("victory")]);
  assert.equal(h.scheduled.size, 0);
});

test("reduced motion is short and sound errors never block completion", () => {
  const h = harness(() => {
    throw new Error("audio unavailable");
  });
  h.player.setReducedMotion(true);
  h.player.enqueue([event("attack"), event("evolution", 1)]);
  h.advance(400);
  assert.equal(h.player.busy, false);
  assert.deepEqual(h.cues, ["attack", "evolution"]);
});

test("reduced dice motion reveals the result promptly and plays its cue only once", () => {
  const h = harness();
  h.player.setReducedMotion(true);
  h.player.enqueue([event("roll"), event("move", 1)]);
  h.advance(150);
  assert.equal(h.frames.at(-1).event.kind, "roll");
  h.advance(30);
  assert.equal(h.frames.at(-1).event.kind, "move");
  h.advance(180);
  assert.equal(h.player.busy, false);
  assert.deepEqual(h.cues, ["roll", "move"]);
});

test("capture shakes have separate cues, pause in place, and reveal the result only after all shakes", () => {
  const h = harness();
  h.player.enqueue([
    event("capture-throw"),
    ...[1, 2, 3].map((shake) => ({ ...event("capture-shake", shake), capture: { success: true, shake } })),
    { ...event("capture-result", 4), capture: { success: true } },
  ]);
  h.advance(500);
  assert.equal(h.frames.at(-1).event.kind, "capture-shake");
  h.advance(100);
  h.player.setPaused(true);
  const paused = h.frames.at(-1);
  h.advance(2000);
  assert.equal(h.frames.at(-1), paused);
  assert.deepEqual(h.cues, ["capture-throw", "capture-shake"]);
  h.player.setPaused(false);
  h.advance(1250);
  assert.equal(h.frames.at(-1).event.kind, "capture-result");
  assert.deepEqual(h.cues, ["capture-throw", "capture-shake", "capture-shake", "capture-shake"]);
  h.advance(700);
  assert.deepEqual(h.cues, ["capture-throw", "capture-shake", "capture-shake", "capture-shake", "capture-result"]);
  assert.equal(h.player.busy, false);
});

test("skipping capture does not play later shakes or success and reduced motion preserves cue order", () => {
  const h = harness();
  const capture = [event("capture-throw"), event("capture-shake", 1), event("capture-result", 2)];
  h.player.enqueue(capture);
  h.advance(100);
  h.player.skip();
  h.advance(3000);
  assert.deepEqual(h.cues, ["capture-throw"]);
  assert.equal(h.player.busy, false);
  h.player.setReducedMotion(true);
  h.player.enqueue(capture);
  h.advance(600);
  assert.deepEqual(h.cues.slice(1), ["capture-throw", "capture-shake", "capture-result"]);
  assert.equal(h.player.busy, false);
});
