import {
  DEFAULT_AUDIO_PREFERENCES,
  normalizeAudioPreferences,
  type AudioPreferences,
} from "./audio-preferences";

import { createMusicPlayer } from "./music";
import type { AudioScene } from "./music-scene";
export type { AudioScene } from "./music-scene";
export type GameAudio = {
  /** Call from a start, continue, or sound button gesture. */
  unlock(): Promise<void>;
  setPreferences(preferences: AudioPreferences): void;
  setScene(scene: AudioScene): void;
  resetAdventure(): void;
  setPaused(paused: boolean): void;
  setReducedMotion(reduced: boolean): void;
  playCue(kind: string, moveType?: number | null, captureSuccess?: boolean): void;
  dispose(): void;
};

type Voice = {
  source: OscillatorNode | AudioBufferSourceNode;
  envelope: GainNode;
  channel: "effects";
};
type AudioGraph = {
  master: GainNode;
  music: GainNode;
  effects: GainNode;
};
type AttackTimbre = {
  wave: OscillatorType;
  start: number;
  end: number;
  notes: number;
};

const MAX_VOICES = 32;
const midi = (note: number) => 440 * 2 ** ((note - 69) / 12);

// Indexed by the catalog's 18 type IDs, with distinct contours and textures.
const ATTACK_TIMBRES: readonly AttackTimbre[] = [
  { wave: "triangle", start: 320, end: 90, notes: 1 }, // fallback
  { wave: "triangle", start: 420, end: 95, notes: 1 }, // normal
  { wave: "square", start: 180, end: 45, notes: 2 }, // fighting
  { wave: "sine", start: 550, end: 1600, notes: 3 }, // flying
  { wave: "sawtooth", start: 230, end: 70, notes: 3 }, // poison
  { wave: "triangle", start: 100, end: 28, notes: 3 }, // ground
  { wave: "square", start: 260, end: 55, notes: 3 }, // rock
  { wave: "sawtooth", start: 860, end: 430, notes: 4 }, // bug
  { wave: "sine", start: 700, end: 110, notes: 2 }, // ghost
  { wave: "square", start: 1300, end: 390, notes: 2 }, // steel
  { wave: "sawtooth", start: 180, end: 680, notes: 3 }, // fire
  { wave: "sine", start: 260, end: 1000, notes: 4 }, // water
  { wave: "triangle", start: 740, end: 300, notes: 3 }, // grass
  { wave: "square", start: 1550, end: 210, notes: 4 }, // electric
  { wave: "sine", start: 440, end: 880, notes: 3 }, // psychic
  { wave: "sine", start: 1800, end: 800, notes: 4 }, // ice
  { wave: "sawtooth", start: 120, end: 420, notes: 2 }, // dragon
  { wave: "triangle", start: 170, end: 40, notes: 2 }, // dark
  { wave: "sine", start: 1046, end: 2093, notes: 3 }, // fairy
];

/** Lazy streaming BGM and synthesized effects, independent of the game RNG. */
export function createGameAudio(): GameAudio {
  let context: AudioContext | null = null;
  let graph: AudioGraph | null = null;
  let preferences: AudioPreferences = { ...DEFAULT_AUDIO_PREFERENCES };
  let scene: AudioScene = "opening";
  let music: ReturnType<typeof createMusicPlayer> | null = null;
  let paused = false;
  let reducedMotion = false;
  let diceTake = 0;
  let diceVoice: Voice | null = null;
  let disposed = false;
  let suspendPromise: Promise<void> = Promise.resolve();
  const voices = new Set<Voice>();

  function release(voice: Voice, stop = true) {
    if (!voices.delete(voice)) return;
    if (voice === diceVoice) diceVoice = null;
    voice.source.onended = null;
    if (stop) {
      try {
        voice.source.stop();
      } catch {
        /* Already ended. */
      }
    }
    voice.source.disconnect();
    voice.envelope.disconnect();
  }

  function cancelVoices(channel?: Voice["channel"]) {
    for (const voice of voices) {
      if (!channel || voice.channel === channel) release(voice);
    }
  }

  function stopMusic() {
    music?.update(scene, false);
  }

  function startMusic() {
    music?.update(scene, canPlay() && preferences.musicVolume > 0);
  }

  function canPlay() {
    return (
      !disposed && !paused && !preferences.muted && context?.state === "running"
    );
  }

  function ramp(parameter: AudioParam, value: number, duration = 0.04) {
    if (!context) return;
    const now = context.currentTime;
    // cancelAndHoldAtTime is not available in every Safari version.
    if (typeof parameter.cancelAndHoldAtTime === "function") {
      parameter.cancelAndHoldAtTime(now);
    } else {
      const current = parameter.value;
      parameter.cancelScheduledValues(now);
      parameter.setValueAtTime(current, now);
    }
    parameter.linearRampToValueAtTime(value, now + duration);
  }

  function tone(
    channel: Voice["channel"],
    frequency: number,
    start: number,
    duration: number,
    amplitude: number,
    wave: OscillatorType = "sine",
    endFrequency?: number,
    attack = 0.012,
  ) {
    if (!context || !graph || !canPlay()) return;
    if (voices.size >= MAX_VOICES) {
      // Keep effect polyphony bounded.
      const oldest = voices.values().next().value;
      if (oldest) release(oldest);
    }
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    const voice: Voice = { source: oscillator, envelope, channel };
    voices.add(voice);
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(frequency, start);
    if (endFrequency)
      oscillator.frequency.exponentialRampToValueAtTime(
        endFrequency,
        start + duration,
      );
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(
      amplitude,
      start + Math.min(attack, duration / 4),
    );
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(envelope);
    envelope.connect(graph.effects);
    oscillator.onended = () => release(voice, false);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  function rollDice(start: number) {
    if (!context || !graph || !canPlay()) return;
    if (diceVoice) release(diceVoice);
    if (voices.size >= MAX_VOICES) {
      const oldest = voices.values().next().value;
      if (oldest) release(oldest);
    }

    const sampleRate = context.sampleRate;
    const duration = reducedMotion ? 0.16 : 1.62;
    const buffer = context.createBuffer(2, Math.ceil(duration * sampleRate), sampleRate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);
    // This generator belongs only to the instrument, never to the saved game.
    let noiseSeed = (0x6d2b79f5 ^ Math.imul(++diceTake, 0x9e3779b1)) >>> 0;
    const noise = () => {
      noiseSeed = (Math.imul(noiseSeed, 1664525) + 1013904223) >>> 0;
      return noiseSeed / 0x80000000 - 1;
    };

    function impact(offset: number, strength: number, pan: number, pitch: number) {
      const begin = Math.round(offset * sampleRate);
      const length = Math.min(Math.ceil(0.09 * sampleRate), left.length - begin);
      const leftGain = Math.sqrt((1 - pan) / 2);
      const rightGain = Math.sqrt((1 + pan) / 2);
      let softNoise = 0;
      for (let index = 0; index < length; index++) {
        const time = index / sampleRate;
        const grain = noise();
        softNoise += (grain - softNoise) * 0.3;
        // A hard plastic click sits above a warm wooden tabletop knock.
        const click = (grain - softNoise) * Math.exp(-time * 430);
        const shell = (
          Math.sin(2 * Math.PI * pitch * time) +
          0.32 * Math.sin(2 * Math.PI * pitch * 1.73 * time)
        ) * Math.exp(-time * 95);
        const table = Math.sin(2 * Math.PI * (145 + pitch * 0.08) * time) * Math.exp(-time * 55);
        const grainTail = softNoise * Math.exp(-time * 85);
        const attack = Math.min(1, time / 0.0007);
        const sample = strength * attack * (0.54 * click + 0.26 * shell + 0.24 * table + 0.22 * grainTail);
        left[begin + index] += sample * leftGain;
        right[begin + index] += sample * rightGain;
      }
    }

    if (reducedMotion) {
      // Match the brief, static dice reveal instead of trailing a long roll.
      impact(0.008, 0.5, -0.45, 780);
      impact(0.048, 0.43, 0.45, 960);
    } else {
      // Loose dice chatter in the hand before two distinct bodies hit the board.
      [0, 0.034, 0.071, 0.11, 0.154, 0.192, 0.232].forEach((offset, index) => {
        impact(offset, 0.16 + index * 0.018, index % 2 ? 0.2 : -0.2, 1100 + noise() * 170);
      });
      const bounceTimes = [0.31, 0.39, 0.495, 0.635, 0.805, 1.01, 1.255];
      for (const die of [0, 1]) {
        const pan = die === 0 ? -0.58 : 0.58;
        const pitch = die === 0 ? 735 : 930;
        bounceTimes.forEach((offset, index) => {
          const jitter = noise() * 0.009;
          const strength = 0.76 * Math.exp(-index * 0.19);
          impact(offset + die * 0.043 + jitter, strength, pan, pitch + noise() * 95);
        });
        // Quiet, uneven surface friction fills the gaps between collisions.
        let previousNoise = 0;
        for (let index = Math.round(0.3 * sampleRate); index < Math.round(1.29 * sampleRate); index++) {
          const time = index / sampleRate;
          const grain = noise();
          const friction = (grain - previousNoise) * 0.022 * (1.3 - time) *
            (0.6 + 0.4 * Math.sin(time * 77 + die * 2));
          previousNoise = grain;
          left[index] += friction * (die === 0 ? 0.85 : 0.3);
          right[index] += friction * (die === 0 ? 0.3 : 0.85);
        }
        impact(1.365 + die * 0.045, 0.2, pan, pitch * 0.94);
        impact(1.48 + die * 0.034, 0.11, pan, pitch * 0.88);
      }
    }
    // Gentle saturation protects against overlapping clicks without raising volume.
    for (let index = 0; index < left.length; index++) {
      left[index] = Math.tanh(left[index] * 1.2) * 0.85;
      right[index] = Math.tanh(right[index] * 1.2) * 0.85;
    }

    const source = context.createBufferSource();
    const envelope = context.createGain();
    const voice: Voice = { source, envelope, channel: "effects" };
    voices.add(voice);
    diceVoice = voice;
    source.buffer = buffer;
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(1, start + 0.002);
    envelope.gain.setValueAtTime(1, start + duration - 0.015);
    envelope.gain.linearRampToValueAtTime(0, start + duration);
    source.connect(envelope);
    envelope.connect(graph.effects);
    source.onended = () => release(voice, false);
    source.start(start);
    source.stop(start + duration);
  }

  function applyVolumes() {
    if (!graph) return;
    ramp(graph.master.gain, preferences.muted ? 0 : 0.65);
    ramp(graph.music.gain, preferences.musicVolume);
    ramp(graph.effects.gain, preferences.effectsVolume);
  }

  function disconnectGraph() {
    if (!graph) return;
    for (const node of Object.values(graph)) node.disconnect();
    graph = null;
  }

  function createContext() {
    const browser = globalThis as typeof globalThis & {
      webkitAudioContext?: typeof AudioContext;
    };
    const Constructor = browser.AudioContext ?? browser.webkitAudioContext;
    if (!Constructor) return;
    context = new Constructor({ latencyHint: "interactive" });
    graph = {
      master: context.createGain(),
      music: context.createGain(),
      effects: context.createGain(),
    };
    graph.master.gain.value = preferences.muted ? 0 : 0.65;
    graph.music.gain.value = preferences.musicVolume;
    graph.effects.gain.value = preferences.effectsVolume;
    graph.music.connect(graph.master);
    graph.effects.connect(graph.master);
    graph.master.connect(context.destination);
    try {
      music = createMusicPlayer(context, graph.music);
    } catch {
      // An unavailable media backend must not disable synthesized effects.
      music = null;
    }
    context.onstatechange = () => {
      if (context?.state === "running") {
        startMusic();
      } else {
        // Safari can enter its additional "interrupted" state after screen lock.
        stopMusic();
        cancelVoices();
      }
    };
  }

  async function resumeContext() {
    const current = context;
    if (!current || disposed || paused) return;
    try {
      await current.resume();
      if (disposed || context !== current) return;
      if (paused) {
        await current.suspend();
      } else {
        startMusic();
      }
    } catch {
      // A later explicit sound-button gesture can retry a blocked resume.
      stopMusic();
    }
  }

  function notes(
    pitches: readonly number[],
    spacing = 0.075,
    duration = 0.25,
    wave: OscillatorType = "sine",
  ) {
    if (!context) return;
    const now = context.currentTime + 0.005;
    pitches.forEach((pitch, index) =>
      tone("effects", midi(pitch), now + index * spacing, duration, 0.2, wave),
    );
  }

  return {
    async unlock() {
      if (disposed) return;
      try {
        if (context?.state === "closed") {
          stopMusic();
          cancelVoices();
          context.onstatechange = null;
          music?.dispose();
          music = null;
          disconnectGraph();
          context = null;
        }
        if (!context) createContext();
        // Call play inside the gesture, before awaiting AudioContext.resume (Safari).
        music?.update(scene, !paused && !preferences.muted && preferences.musicVolume > 0);
        music?.retry();
        await resumeContext();
      } catch {
        // Unsupported browsers or an unavailable audio device remain playable.
        stopMusic();
        cancelVoices();
      }
    },
    setPreferences(next) {
      if (disposed) return;
      preferences = normalizeAudioPreferences(next);
      try {
        applyVolumes();
        if (preferences.muted) {
          stopMusic();
          cancelVoices();
        } else {
          if (preferences.musicVolume === 0) {
            stopMusic();
          } else startMusic();
          if (preferences.effectsVolume === 0) cancelVoices("effects");
        }
      } catch {
        /* Audio must never block a game action. */
      }
    },
    setScene(next) {
      if (disposed || next === scene) return;
      scene = next;
      startMusic();
    },
    resetAdventure() {
      if (!disposed) music?.resetAdventure();
    },
    setPaused(next) {
      if (disposed) return;
      paused = next;
      if (!context) return;
      if (next) {
        stopMusic();
        cancelVoices();
        try {
          suspendPromise = context.suspend().catch(() => {});
        } catch {
          suspendPromise = Promise.resolve();
        }
      } else {
        // Serialize a fast hide/show pair so a late suspend cannot mute resume.
        void suspendPromise.then(resumeContext);
      }
    },
    setReducedMotion(next) {
      if (disposed || reducedMotion === next) return;
      reducedMotion = next;
      if (next && diceVoice) release(diceVoice);
    },
    playCue(kind, moveType, captureSuccess) {
      if (!context || !canPlay() || preferences.effectsVolume === 0) return;
      try {
        const now = context.currentTime + 0.005;
        switch (kind) {
          case "button":
            notes([83], 0, 0.06, "triangle");
            break;
          case "dice":
          case "roll":
            rollDice(now);
            break;
          case "move":
            notes([76, 79], 0.045, 0.08, "triangle");
            break;
          case "encounter":
            notes([64, 71, 76], 0.075, 0.2, "square");
            break;
          case "send-out":
            notes([60, 67, 76, 84], 0.055, 0.19);
            break;
          case "attack": {
            const timbre = ATTACK_TIMBRES[moveType ?? 0] ?? ATTACK_TIMBRES[0];
            for (let index = 0; index < timbre.notes; index++) {
              const interval = 1 + index * 0.17;
              tone(
                "effects",
                timbre.start * interval,
                now + index * 0.065,
                0.18,
                0.13,
                timbre.wave,
                timbre.end * interval,
              );
            }
            tone("effects", 170, now + 0.24, 0.15, 0.23, "triangle", 42);
            break;
          }
          case "faint":
            notes([60, 55, 48, 40], 0.1, 0.2, "triangle");
            break;
          case "heal":
            notes([72, 76, 79, 84, 88], 0.09, 0.35);
            break;
          case "capture":
            notes([67, 72, 76, 79, 84], 0.1, 0.28);
            break;
          case "capture-throw":
            tone("effects", 340, now, 0.22, 0.11, "triangle", 1300);
            tone("effects", 920, now + 0.24, 0.12, 0.1, "sine", 260);
            break;
          case "capture-shake":
            // Two brief, dry taps track a single visible left/right wobble.
            tone("effects", 170, now, 0.055, 0.12, "triangle", 65);
            tone("effects", 240, now + 0.14, 0.055, 0.1, "triangle", 90);
            break;
          case "capture-result":
            if (captureSuccess) {
              tone("effects", 1568, now, 0.12, 0.1, "sine", 2093);
              notes([72, 76, 79, 84], 0.1, 0.26);
            } else {
              tone("effects", 900, now, 0.14, 0.11, "triangle", 180);
              notes([67, 60], 0.12, 0.12, "triangle");
            }
            break;
          case "experience-gain":
            notes([72, 79], 0.055, 0.15, "sine");
            break;
          case "lap":
          case "level-up":
            notes([72, 76, 79, 84], 0.065, 0.25);
            break;
          case "evolution":
            notes([60, 64, 67, 72, 76, 79, 84, 88, 91, 96], 0.17, 0.45);
            break;
          case "deploy":
            notes([60, 67, 72], 0.07, 0.2, "triangle");
            break;
          case "retrieve":
            notes([79, 76, 72], 0.07, 0.17, "triangle");
            break;
          case "rescue":
            notes([60, 64, 67, 72], 0.14, 0.3, "triangle");
            break;
          case "rest":
            notes([67, 64], 0.12, 0.16, "triangle");
            break;
          case "victory":
            notes([72, 72, 76, 79, 84, 79, 84, 88, 91], 0.2, 0.5, "triangle");
            notes([48, 55, 60, 64], 0.4, 0.7);
            break;
          case "turn":
            notes([67, 72], 0.08, 0.15);
            break;
        }
      } catch {
        cancelVoices("effects");
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stopMusic();
      cancelVoices();
      if (context) {
        context.onstatechange = null;
        try {
          void context.close().catch(() => {});
        } catch {
          /* Already closed. */
        }
      }
      music?.dispose();
      music = null;
      disconnectGraph();
      context = null;
    },
  };
}
