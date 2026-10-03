import assert from "node:assert/strict";
import test from "node:test";
import { loadGameSource } from "./game-test-helpers.mjs";

const source = "app/games/_components/pokemon-marble/";
const { createGameAudio } = loadGameSource(`${source}audio.ts`);
const {
  AUDIO_PREFERENCES_KEY,
  DEFAULT_AUDIO_PREFERENCES,
  loadAudioPreferences,
  saveAudioPreferences,
} = loadGameSource(`${source}audio-preferences.ts`);

class FakeParam {
  value = 1;
  changes = [];
  setValueAtTime(value, time) {
    this.value = value;
    this.changes.push(["set", value, time]);
  }
  linearRampToValueAtTime(value, time) {
    this.value = value;
    this.changes.push(["linear", value, time]);
  }
  exponentialRampToValueAtTime(value, time) {
    this.value = value;
    this.changes.push(["exponential", value, time]);
  }
  cancelScheduledValues(time) {
    this.changes.push(["cancel", time]);
  }
}

function audioHarness(t) {
  const contexts = [];
  const timers = new Map();
  let nextTimer = 0;
  const original = Object.getOwnPropertyDescriptor(globalThis, "AudioContext");
  class FakeContext {
    state = "suspended";
    currentTime = 0;
    sampleRate = 24000;
    destination = {};
    gains = [];
    oscillators = [];
    bufferSources = [];
    resumeCalls = 0;
    suspendCalls = 0;
    closeCalls = 0;
    failResume = false;
    onstatechange = null;
    constructor() {
      contexts.push(this);
    }
    createGain() {
      const node = {
        gain: new FakeParam(),
        connections: [],
        disconnected: false,
        connect(target) {
          this.connections.push(target);
        },
        disconnect() {
          this.disconnected = true;
        },
      };
      this.gains.push(node);
      return node;
    }
    createScheduledSource() {
      const node = {
        onended: null,
        startedAt: null,
        endsAt: null,
        stopped: false,
        disconnected: false,
        connect(target) {
          this.output = target;
        },
        disconnect() {
          this.disconnected = true;
        },
        start(time) {
          this.startedAt = time;
        },
        stop(time) {
          if (time === undefined) this.stopped = true;
          else this.endsAt = time;
        },
      };
      return node;
    }
    createOscillator() {
      const node = {
        ...this.createScheduledSource(),
        frequency: new FakeParam(),
        type: "sine",
      };
      this.oscillators.push(node);
      return node;
    }
    createBuffer(channels, length, sampleRate) {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return {
        numberOfChannels: channels,
        length,
        sampleRate,
        duration: length / sampleRate,
        getChannelData: (channel) => data[channel],
      };
    }
    createBufferSource() {
      const node = { ...this.createScheduledSource(), buffer: null };
      this.bufferSources.push(node);
      return node;
    }
    async resume() {
      this.resumeCalls++;
      if (this.failResume) throw new Error("Audio device unavailable");
      this.state = "running";
      this.onstatechange?.();
    }
    async suspend() {
      this.suspendCalls++;
      this.state = "suspended";
      this.onstatechange?.();
    }
    async close() {
      this.closeCalls++;
      this.state = "closed";
    }
    interrupt() {
      this.state = "interrupted";
      this.onstatechange?.();
    }
  }
  Object.defineProperty(globalThis, "AudioContext", {
    configurable: true,
    value: FakeContext,
    writable: true,
  });
  t.mock.method(globalThis, "setInterval", (callback) => {
    timers.set(++nextTimer, callback);
    return nextTimer;
  });
  t.mock.method(globalThis, "clearInterval", (id) => timers.delete(id));
  const audio = createGameAudio();
  t.after(() => {
    audio.dispose();
    if (original) Object.defineProperty(globalThis, "AudioContext", original);
    else delete globalThis.AudioContext;
  });
  return {
    audio,
    contexts,
    timers,
    advance(seconds) {
      for (const context of contexts) {
        context.currentTime += seconds;
        for (const node of [...context.oscillators, ...context.bufferSources]) {
          if (!node.stopped && node.endsAt <= context.currentTime)
            node.onended?.();
        }
      }
      for (const timer of timers.values()) timer();
    },
  };
}

test("audio preferences use separate storage, sanitize values, and tolerate unavailable storage", () => {
  assert.deepEqual(
    loadAudioPreferences({ getItem: () => null }),
    DEFAULT_AUDIO_PREFERENCES,
  );
  assert.deepEqual(
    loadAudioPreferences({ getItem: () => "broken JSON" }),
    DEFAULT_AUDIO_PREFERENCES,
  );
  assert.deepEqual(
    loadAudioPreferences({
      getItem: () => {
        throw new Error("private mode");
      },
    }),
    DEFAULT_AUDIO_PREFERENCES,
  );
  assert.deepEqual(
    loadAudioPreferences({
      getItem: () => '{"muted":true,"musicVolume":4,"effectsVolume":-1}',
    }),
    {
      muted: true,
      musicVolume: 1,
      effectsVolume: 0,
    },
  );
  assert.deepEqual(
    loadAudioPreferences({
      getItem: () => '{"muted":"yes","musicVolume":null}',
    }),
    DEFAULT_AUDIO_PREFERENCES,
  );
  const storage = new Map();
  saveAudioPreferences(
    { muted: true, musicVolume: 0.25, effectsVolume: 0.75 },
    {
      setItem: (key, value) => storage.set(key, value),
    },
  );
  assert.equal(storage.size, 1);
  assert.ok(storage.has(AUDIO_PREFERENCES_KEY));
  assert.deepEqual(
    loadAudioPreferences({ getItem: (key) => storage.get(key) }),
    {
      muted: true,
      musicVolume: 0.25,
      effectsVolume: 0.75,
    },
  );
  assert.doesNotThrow(() =>
    saveAudioPreferences(DEFAULT_AUDIO_PREFERENCES, {
      setItem: () => {
        throw new Error("quota");
      },
    }),
  );
});

test("context creation is lazy and the initial channel volumes match user defaults", async (t) => {
  const { audio, contexts, timers } = audioHarness(t);
  audio.setScene("battle");
  audio.playCue("button");
  audio.setPreferences(DEFAULT_AUDIO_PREFERENCES);
  audio.setPaused(false);
  assert.equal(contexts.length, 0);
  await audio.unlock();
  assert.equal(contexts.length, 1);
  assert.equal(contexts[0].gains[1].gain.value, 0.3);
  assert.equal(contexts[0].gains[2].gain.value, 0.6);
  assert.equal(contexts[0].gains[3].gain.value, 0);
  assert.equal(contexts[0].gains[4].gain.value, 1);
  assert.equal(timers.size, 1);
  await audio.unlock();
  assert.equal(contexts.length, 1);
  assert.equal(timers.size, 1);
});

test("music scene changes crossfade both buses while the battle adds percussion", async (t) => {
  const { audio, contexts, timers, advance } = audioHarness(t);
  await audio.unlock();
  const context = contexts[0];
  const before = context.oscillators.length;
  audio.setScene("battle");
  const adventureFade = context.gains[3].gain.changes.at(-1);
  const battleFade = context.gains[4].gain.changes.at(-1);
  assert.equal(adventureFade[0], "linear");
  assert.equal(adventureFade[1], 0);
  assert.equal(battleFade[1], 1);
  assert.ok(battleFade[2] > context.currentTime);
  assert.equal(battleFade[2], adventureFade[2]);
  assert.ok(
    context.oscillators
      .slice(before)
      .some((node) =>
        node.frequency.changes.some(
          ([method, value]) => method === "exponential" && value < 100,
        ),
      ),
  );
  advance(30);
  assert.ok(
    context.oscillators.length - before < 12,
    "late timers must not play thirty seconds of queued beats",
  );
  assert.equal(timers.size, 1);
});

for (const [scene, tempo] of [
  ["adventure", 104],
  ["battle", 152],
]) {
  test(`${scene} score develops across eight bars with sustained harmony and a complete repeat`, async (t) => {
    const { audio, contexts, advance } = audioHarness(t);
    audio.setScene(scene);
    await audio.unlock();
    const context = contexts[0];
    const beat = 60 / tempo / 2;
    const steps = [context.oscillators.slice()];
    for (let step = 1; step <= 64; step++) {
      const before = context.oscillators.length;
      advance(beat);
      steps.push(context.oscillators.slice(before));
      assert.ok(
        context.oscillators.filter((node) => !node.disconnected).length <= 32,
      );
    }
    const signature = (nodes) =>
      nodes.map((node) => [node.type, node.frequency.changes[0][1]]);
    assert.deepEqual(
      signature(steps[0]),
      signature(steps[64]),
      "repeat begins after the whole eight-bar phrase",
    );
    assert.notDeepEqual(
      signature(steps[0]),
      signature(steps[16]),
      "third bar develops the opening motif",
    );
    assert.notDeepEqual(
      steps.slice(0, 8).map(signature),
      steps.slice(32, 40).map(signature),
      "second phrase varies the opening melody",
    );
    const chords = new Set();
    for (let bar = 0; bar < 8; bar++) {
      const sustained = steps[bar * 8].filter(
        (node) => node.endsAt - node.startedAt > beat * 5,
      );
      assert.equal(
        sustained.length,
        3,
        "a soft three-note harmony supports each full bar",
      );
      chords.add(JSON.stringify(signature(sustained)));
    }
    assert.ok(chords.size >= 4, "bass and harmony follow a varied progression");
  });
}

test("muting cancels voices and independent zero-volume channels do not schedule work", async (t) => {
  const { audio, contexts, timers } = audioHarness(t);
  await audio.unlock();
  const context = contexts[0];
  audio.playCue("victory");
  audio.setPreferences({ ...DEFAULT_AUDIO_PREFERENCES, muted: true });
  assert.equal(timers.size, 0);
  assert.ok(
    context.oscillators.every((node) => node.stopped && node.disconnected),
  );
  const count = context.oscillators.length;
  audio.playCue("attack", 10);
  assert.equal(context.oscillators.length, count);
  audio.setPreferences({ muted: false, musicVolume: 0, effectsVolume: 0.7 });
  audio.playCue("button");
  assert.equal(context.oscillators.length, count + 1);
  assert.equal(timers.size, 0);
  assert.equal(context.gains[2].gain.value, 0.7);
  audio.setPreferences({ muted: false, musicVolume: 0.2, effectsVolume: 0 });
  const withMusic = context.oscillators.length;
  audio.playCue("attack", 13);
  assert.equal(context.oscillators.length, withMusic);
  assert.equal(timers.size, 1);
});

test("pause clears scheduled notes and rapid resume serializes with suspend", async (t) => {
  const { audio, contexts, timers } = audioHarness(t);
  await audio.unlock();
  const context = contexts[0];
  audio.playCue("evolution");
  assert.ok(context.oscillators.some((node) => node.startedAt > 1));
  audio.setPaused(true);
  assert.equal(context.suspendCalls, 1);
  assert.equal(timers.size, 0);
  assert.ok(context.oscillators.every((node) => node.disconnected));
  const count = context.oscillators.length;
  audio.playCue("attack", 1);
  assert.equal(context.oscillators.length, count);
  audio.setPaused(false);
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(context.state, "running");
  assert.equal(timers.size, 1);
  assert.ok(context.oscillators.length - count < 8);
});

test("Safari interruption and denied resume stay silent until a later successful gesture", async (t) => {
  const { audio, contexts, timers } = audioHarness(t);
  await audio.unlock();
  const context = contexts[0];
  context.interrupt();
  assert.equal(timers.size, 0);
  assert.ok(context.oscillators.every((node) => node.disconnected));
  const count = context.oscillators.length;
  context.failResume = true;
  await assert.doesNotReject(audio.unlock());
  audio.playCue("heal");
  assert.equal(context.oscillators.length, count);
  context.failResume = false;
  await audio.unlock();
  assert.equal(context.state, "running");
  assert.equal(timers.size, 1);
});

test("all presentation cues have sound, the 18 attacks differ, and polyphony stays bounded", async (t) => {
  const { audio, contexts } = audioHarness(t);
  audio.setPreferences({ ...DEFAULT_AUDIO_PREFERENCES, musicVolume: 0 });
  await audio.unlock();
  const context = contexts[0];
  for (const cue of [
    "button",
    "roll",
    "move",
    "encounter",
    "send-out",
    "faint",
    "heal",
    "capture",
    "capture-throw",
    "capture-shake",
    "capture-result",
    "experience-gain",
    "lap",
    "level-up",
    "evolution",
    "deploy",
    "retrieve",
    "rescue",
    "rest",
    "victory",
    "turn",
  ]) {
    const before = context.oscillators.length + context.bufferSources.length;
    audio.playCue(cue);
    assert.ok(context.oscillators.length + context.bufferSources.length > before, cue);
  }
  const attackSignatures = new Set();
  for (let type = 1; type <= 18; type++) {
    const before = context.oscillators.length;
    audio.playCue("attack", type);
    const attack = context.oscillators.slice(before);
    assert.ok(attack.length > 0);
    attackSignatures.add(
      JSON.stringify(attack.map((node) => [node.type, node.frequency.changes])),
    );
  }
  assert.equal(attackSignatures.size, 18);
  assert.ok(
    [...context.oscillators, ...context.bufferSources].filter((node) => !node.disconnected).length <= 32,
  );
});

test("capture shake, successful latch and failed escape have distinct cues with normal audio controls", async (t) => {
  const { audio, contexts } = audioHarness(t);
  audio.setPreferences({ ...DEFAULT_AUDIO_PREFERENCES, musicVolume: 0 });
  await audio.unlock();
  const context = contexts[0];
  function cue(kind, success) {
    const before = context.oscillators.length;
    audio.playCue(kind, undefined, success);
    return context.oscillators.slice(before);
  }
  const shake = cue("capture-shake");
  assert.equal(shake.length, 2);
  assert.ok(shake[1].startedAt > shake[0].startedAt);
  const success = cue("capture-result", true);
  const failure = cue("capture-result", false);
  assert.ok(success.length > failure.length);
  assert.notDeepEqual(success.map((note) => note.frequency.changes), failure.map((note) => note.frequency.changes));
  audio.setPaused(true);
  assert.ok([...shake, ...success, ...failure].every((note) => note.stopped));
  assert.deepEqual(cue("capture-result", true), []);
  audio.setPreferences({ ...DEFAULT_AUDIO_PREFERENCES, muted: true });
  audio.setPaused(false);
  assert.deepEqual(cue("capture-shake"), []);
});

test("disposal closes and disconnects every audio resource and prevents late restarts", async (t) => {
  const { audio, contexts, timers } = audioHarness(t);
  await audio.unlock();
  const context = contexts[0];
  audio.setPaused(true);
  audio.setPaused(false);
  audio.dispose();
  audio.dispose();
  await Promise.resolve();
  await audio.unlock();
  audio.playCue("victory");
  audio.setScene("battle");
  audio.setPreferences(DEFAULT_AUDIO_PREFERENCES);
  audio.setPaused(false);
  assert.equal(context.closeCalls, 1);
  assert.equal(contexts.length, 1);
  assert.equal(timers.size, 0);
  assert.ok(context.oscillators.every((node) => node.disconnected));
  assert.ok(context.gains.every((node) => node.disconnected));
  assert.equal(context.onstatechange, null);
});

test("finished effects release nodes and a failed instrument does not leave a retry timer", async (t) => {
  const { audio, contexts, timers, advance } = audioHarness(t);
  audio.setPreferences({ ...DEFAULT_AUDIO_PREFERENCES, musicVolume: 0 });
  await audio.unlock();
  const context = contexts[0];
  audio.playCue("button");
  const oscillator = context.oscillators.at(-1);
  advance(1);
  assert.equal(oscillator.disconnected, true);
  assert.equal(oscillator.output.disconnected, true);
  const createOscillator = context.createOscillator;
  context.createOscillator = () => {
    throw new Error("Audio allocation failed");
  };
  assert.doesNotThrow(() => audio.setPreferences(DEFAULT_AUDIO_PREFERENCES));
  assert.equal(timers.size, 0);
  context.createOscillator = createOscillator;
  await audio.unlock();
  assert.equal(timers.size, 1);
});

test("a closed context is replaced only by an explicit unlock and its old graph is released", async (t) => {
  const { audio, contexts, timers } = audioHarness(t);
  await audio.unlock();
  const first = contexts[0];
  await first.close();
  first.onstatechange?.();
  audio.playCue("roll");
  assert.equal(contexts.length, 1);
  assert.equal(timers.size, 0);
  await audio.unlock();
  assert.equal(contexts.length, 2);
  assert.equal(contexts[1].state, "running");
  assert.equal(timers.size, 1);
  assert.equal(first.onstatechange, null);
  assert.ok(first.gains.every((node) => node.disconnected));
});

test("an unavailable Web Audio implementation never throws into game controls", async (t) => {
  const { audio, contexts } = audioHarness(t);
  globalThis.AudioContext = class {
    constructor() {
      throw new Error("No audio hardware");
    }
  };
  await assert.doesNotReject(audio.unlock());
  assert.doesNotThrow(() => {
    audio.setPreferences(DEFAULT_AUDIO_PREFERENCES);
    audio.setScene("battle");
    audio.setPaused(true);
    audio.playCue("roll");
    audio.dispose();
  });
  assert.equal(contexts.length, 0);
});

test("dice sound contains stereo rattle, rolling impacts and a quieter settle without game randomness", async (t) => {
  const { audio, contexts, advance } = audioHarness(t);
  audio.setPreferences({ ...DEFAULT_AUDIO_PREFERENCES, musicVolume: 0 });
  await audio.unlock();
  t.mock.method(Math, "random", () => { throw new Error("Dice audio must use its own noise source"); });
  const context = contexts[0];
  audio.playCue("roll");
  const first = context.bufferSources[0];
  assert.ok(first, "The cue should synthesize a textured recording");
  assert.equal(first.buffer.numberOfChannels, 2);
  assert.ok(first.buffer.duration > 1.5 && first.buffer.duration < 1.8);
  assert.equal(first.output.connections[0], context.gains[2], "The normal effects volume controls dice too");
  const left = first.buffer.getChannelData(0);
  const right = first.buffer.getChannelData(1);
  let peak = 0;
  let stereoDifference = 0;
  for (let index = 0; index < left.length; index++) {
    assert.ok(Number.isFinite(left[index]) && Number.isFinite(right[index]));
    peak = Math.max(peak, Math.abs(left[index]), Math.abs(right[index]));
    stereoDifference += Math.abs(left[index] - right[index]);
  }
  assert.ok(peak > 0.15 && peak <= 0.85, "Impacts should have presence without clipping");
  assert.ok(stereoDifference / left.length > 0.005, "The two dice occupy distinct stereo positions");
  const energy = (from, to) => {
    const begin = Math.round(from * context.sampleRate);
    const end = Math.round(to * context.sampleRate);
    let total = 0;
    for (let index = begin; index < end; index++)
      total += left[index] ** 2 + right[index] ** 2;
    return Math.sqrt(total / (end - begin));
  };
  assert.ok(energy(0, 0.25) > 0.005, "The hand shake has audible dice chatter");
  assert.ok(energy(0.3, 0.55) > energy(0, 0.25), "Landing has more weight than the shake");
  assert.ok(energy(1.36, 1.6) > 0.001, "Settling taps continue through the visual landing");
  assert.ok(energy(1.36, 1.6) < energy(0.3, 0.55), "The roll loses energy as it settles");
  assert.equal(left.at(-1), 0);
  audio.playCue("roll");
  assert.equal(first.stopped, true, "A new roll replaces any lingering dice cue");
  assert.equal(first.disconnected, true);
  assert.notDeepEqual(context.bufferSources[1].buffer.getChannelData(0), left, "Successive rolls have small organic timbre variations");
  advance(2);
  assert.ok(context.bufferSources.every((node) => node.disconnected && node.output.disconnected));
});

test("dice buffers obey unlock, mute, effects volume, pause, reduced motion and disposal", async (t) => {
  const { audio, contexts } = audioHarness(t);
  audio.setPreferences({ ...DEFAULT_AUDIO_PREFERENCES, musicVolume: 0 });
  audio.playCue("roll");
  assert.equal(contexts.length, 0);
  await audio.unlock();
  const context = contexts[0];
  audio.playCue("roll");
  const fullRoll = context.bufferSources.at(-1);
  audio.setPreferences({ ...DEFAULT_AUDIO_PREFERENCES, musicVolume: 0, muted: true });
  assert.ok(fullRoll.stopped && fullRoll.disconnected);
  audio.playCue("roll");
  assert.equal(context.bufferSources.length, 1);
  audio.setPreferences({ muted: false, musicVolume: 0, effectsVolume: 0 });
  audio.playCue("roll");
  assert.equal(context.bufferSources.length, 1);
  audio.setPreferences({ muted: false, musicVolume: 0, effectsVolume: 0.4 });
  audio.playCue("roll");
  const interrupted = context.bufferSources.at(-1);
  audio.setPaused(true);
  assert.ok(interrupted.stopped && interrupted.disconnected);
  audio.playCue("roll");
  assert.equal(context.bufferSources.length, 2);
  audio.setPaused(false);
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  audio.playCue("roll");
  const beforeReduction = context.bufferSources.at(-1);
  audio.setReducedMotion(true);
  assert.ok(beforeReduction.stopped && beforeReduction.disconnected);
  audio.playCue("roll");
  const shortRoll = context.bufferSources.at(-1);
  assert.ok(shortRoll.buffer.duration <= 0.18, "The static reveal must not leave a long rolling sound behind");
  assert.equal(context.gains[2].gain.value, 0.4);
  audio.dispose();
  assert.ok(shortRoll.stopped && shortRoll.disconnected && shortRoll.output.disconnected);
  const count = context.bufferSources.length;
  audio.playCue("roll");
  assert.equal(context.bufferSources.length, count);
});
