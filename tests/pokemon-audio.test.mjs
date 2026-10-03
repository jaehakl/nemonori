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
  const media = [];
  let now = 0;
  const timers = new Map();
  let nextTimer = 0;
  const original = Object.getOwnPropertyDescriptor(globalThis, "AudioContext");
  const originalAudio = Object.getOwnPropertyDescriptor(globalThis, "Audio");
  class FakeAudio {
    src = "";
    paused = true;
    currentTime = 0;
    loop = false;
    playCalls = 0;
    loadCalls = 0;
    failPlay = false;
    error = null;
    pendingPlay = null;
    constructor() { media.push(this); }
    play() {
      this.playCalls++;
      if (this.failPlay) return Promise.reject(new Error("Playback blocked"));
      this.paused = false;
      return this.pendingPlay || Promise.resolve();
    }
    pause() { this.paused = true; }
    load() { this.loadCalls++; this.error = null; }
    removeAttribute(name) { if (name === "src") this.src = ""; }
    end() { this.paused = true; this.onended?.(); }
  }
  Object.defineProperty(globalThis, "Audio", { configurable: true, value: FakeAudio });
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
    createMediaElementSource(element) {
      this.mediaSource = {
        mediaElement: element,
        connect(target) { this.output = target; },
        disconnect() { this.disconnected = true; },
      };
      return this.mediaSource;
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
  t.mock.method(globalThis, "setTimeout", (callback, delay) => {
    timers.set(++nextTimer, { callback, due: now + delay });
    return nextTimer;
  });
  t.mock.method(globalThis, "clearTimeout", (id) => timers.delete(id));
  const audio = createGameAudio();
  t.after(() => {
    audio.dispose();
    if (original) Object.defineProperty(globalThis, "AudioContext", original);
    else delete globalThis.AudioContext;
    if (originalAudio) Object.defineProperty(globalThis, "Audio", originalAudio);
    else delete globalThis.Audio;
  });
  return {
    audio,
    contexts,
    media,
    timers,
    advance(seconds) {
      now += seconds * 1000;
      for (const context of contexts) {
        context.currentTime += seconds;
        for (const node of [...context.oscillators, ...context.bufferSources]) {
          if (!node.stopped && node.endsAt <= context.currentTime)
            node.onended?.();
        }
      }
      for (const [id, timer] of [...timers]) {
        if (timer.due <= now) {
          timers.delete(id);
          timer.callback();
        }
      }
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

test("music is lazy, uses the selected file, and shares independent gain controls", async (t) => {
  const { audio, contexts, media } = audioHarness(t);
  audio.setScene("road");
  audio.playCue("button");
  audio.setPreferences(DEFAULT_AUDIO_PREFERENCES);
  assert.equal(contexts.length, 0);
  assert.equal(media.length, 0);
  await audio.unlock();
  assert.equal(contexts.length, 1);
  assert.equal(media.length, 1);
  assert.equal(media[0].src, "/pokemon-marble/bgm/rival-battle.m4a");
  assert.equal(media[0].loop, true);
  assert.equal(media[0].preload, "none");
  assert.equal(contexts[0].gains[1].gain.value, 0.3);
  assert.equal(contexts[0].gains[2].gain.value, 0.6);
  assert.equal(contexts[0].oscillators.length, 0, "No synthesized BGM remains");
  await audio.unlock();
  assert.equal(media.length, 1);
  assert.equal(media[0].playCalls, 1);
});

test("adventure cycles all three tracks and resumes its offset after battle and center", async (t) => {
  const { audio, media, advance } = audioHarness(t);
  audio.setScene("adventure");
  await audio.unlock();
  const player = media[0];
  assert.match(player.src, /gym.m4a$/);
  player.end();
  assert.match(player.src, /route-2.m4a$/);
  player.currentTime = 23;
  audio.setScene("road");
  advance(0.2);
  assert.match(player.src, /rival-battle.m4a$/);
  audio.setScene("center");
  advance(0.2);
  assert.match(player.src, /pokemon-center.m4a$/);
  audio.setScene("adventure");
  advance(0.2);
  assert.match(player.src, /route-2.m4a$/);
  assert.equal(player.currentTime, 23);
  const calls = player.playCalls;
  audio.setScene("adventure");
  assert.equal(player.playCalls, calls);
  player.end();
  assert.match(player.src, /route-6.m4a$/);
  assert.equal(player.currentTime, 0);
  player.end();
  assert.match(player.src, /gym.m4a$/);
  audio.resetAdventure();
  await audio.unlock();
  assert.match(player.src, /gym.m4a$/);
  assert.equal(player.currentTime, 0);
});

test("scene fades coalesce rapid changes and never load canceled tracks", async (t) => {
  const { audio, media, contexts, timers, advance } = audioHarness(t);
  await audio.unlock();
  audio.setScene("road");
  audio.setScene("trainer");
  assert.equal(timers.size, 1);
  assert.match(media[0].src, /opening.m4a$/);
  assert.equal(contexts[0].gains[3].gain.changes.at(-1)[1], 0);
  advance(0.2);
  assert.match(media[0].src, /last-pokemon.m4a$/);
  assert.equal(contexts[0].gains[3].gain.changes.at(-1)[1], 1);
  audio.setScene("wild");
  audio.setScene("trainer");
  advance(0.2);
  assert.match(media[0].src, /last-pokemon.m4a$/);
  assert.equal(timers.size, 0);
});

test("victory is one-shot and leaves immediately when the presentation scene changes", async (t) => {
  const { audio, media, advance } = audioHarness(t);
  audio.setScene("wild-victory");
  await audio.unlock();
  assert.match(media[0].src, /wild-victory.m4a$/);
  assert.equal(media[0].loop, false);
  media[0].end();
  const count = media[0].playCalls;
  await audio.unlock();
  assert.equal(media[0].playCalls, count, "A finished fanfare must not replay on input");
  audio.setScene("adventure");
  assert.match(media[0].src, /gym.m4a$/);
  audio.setScene("trainer-victory");
  advance(0.2);
  audio.setScene("center");
  advance(0.2);
  assert.match(media[0].src, /pokemon-center.m4a$/);
});

test("mute and zero music volume pause streaming without disabling effects", async (t) => {
  const { audio, media, contexts } = audioHarness(t);
  await audio.unlock();
  media[0].currentTime = 12;
  audio.setPreferences({ ...DEFAULT_AUDIO_PREFERENCES, muted: true });
  assert.equal(media[0].paused, true);
  audio.playCue("attack", 10);
  assert.equal(contexts[0].oscillators.length, 0);
  audio.setPreferences({ muted: false, musicVolume: 0, effectsVolume: 0.7 });
  audio.playCue("button");
  assert.equal(contexts[0].oscillators.length, 1);
  assert.equal(media[0].paused, true);
  audio.setPreferences({ muted: false, musicVolume: 0.2, effectsVolume: 0 });
  assert.equal(media[0].paused, false);
  assert.equal(media[0].currentTime, 12);
  assert.equal(contexts[0].gains[1].gain.value, 0.2);
  audio.playCue("attack", 13);
  assert.equal(contexts[0].oscillators.length, 1);
});

test("pause cancels transitions and resumes the latest scene after suspend", async (t) => {
  const { audio, media, contexts, timers, advance } = audioHarness(t);
  await audio.unlock();
  audio.playCue("evolution");
  audio.setScene("road");
  audio.setPaused(true);
  assert.equal(timers.size, 0);
  assert.equal(media[0].paused, true);
  assert.ok(contexts[0].oscillators.every((node) => node.disconnected));
  audio.setScene("center");
  advance(1);
  assert.match(media[0].src, /opening.m4a$/);
  audio.setPaused(false);
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  assert.match(media[0].src, /pokemon-center.m4a$/);
  assert.equal(media[0].paused, false);
});

test("media errors and denied play recover on an explicit gesture", async (t) => {
  const { audio, media, contexts } = audioHarness(t);
  await audio.unlock();
  const player = media[0];
  player.pause();
  player.error = { code: 2 };
  player.onerror();
  player.failPlay = true;
  await audio.unlock();
  assert.equal(player.loadCalls, 1);
  assert.equal(player.paused, true);
  player.failPlay = false;
  await audio.unlock();
  assert.equal(player.paused, false);
  contexts[0].interrupt();
  assert.equal(player.paused, true);
  contexts[0].failResume = true;
  await audio.unlock();
  assert.equal(player.paused, true);
  contexts[0].failResume = false;
  await audio.unlock();
  assert.equal(contexts[0].state, "running");
  assert.equal(player.paused, false);
});

test("late play completion cannot resurrect disposed audio", async (t) => {
  const { audio, media, contexts } = audioHarness(t);
  await audio.unlock();
  let finishPlay;
  media[0].pendingPlay = new Promise((resolve) => { finishPlay = resolve; });
  media[0].pause();
  await audio.unlock();
  audio.dispose();
  finishPlay();
  await Promise.resolve();
  assert.equal(media[0].paused, true);
  assert.equal(media[0].src, "");
  assert.equal(media[0].onended, null);
  assert.ok(contexts[0].mediaSource.disconnected);
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
  audio.setScene("road");
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
  assert.equal(timers.size, 0);
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
  assert.equal(timers.size, 0);
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
    audio.setScene("road");
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
