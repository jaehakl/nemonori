import {
  DEFAULT_AUDIO_PREFERENCES,
  normalizeAudioPreferences,
  type AudioPreferences,
} from "./audio-preferences";

export type AudioScene = "adventure" | "battle";
export type GameAudio = {
  /** Call from a start, continue, or sound button gesture. */
  unlock(): Promise<void>;
  setPreferences(preferences: AudioPreferences): void;
  setScene(scene: AudioScene): void;
  setPaused(paused: boolean): void;
  playCue(kind: string, moveType?: number | null): void;
  dispose(): void;
};

type Voice = {
  oscillator: OscillatorNode;
  envelope: GainNode;
  channel: "music" | "effects";
};
type MusicClock = { step: number; next: number; remaining: number };
type AudioGraph = {
  master: GainNode;
  music: GainNode;
  effects: GainNode;
  adventure: GainNode;
  battle: GainNode;
};
type AttackTimbre = {
  wave: OscillatorType;
  start: number;
  end: number;
  notes: number;
};

const MAX_VOICES = 32;
const LOOK_AHEAD = 0.12;
const CROSSFADE = 0.35;
const TEMPO: Record<AudioScene, number> = { adventure: 104, battle: 152 };
// Original eight-bar themes: each row is one 4/4 bar of eighth notes.
// A null note lets the previous tone ring, giving each phrase room to breathe.
const ADVENTURE_MELODY = [
  76,
  null,
  79,
  81,
  79,
  null,
  76,
  74,
  72,
  null,
  76,
  79,
  81,
  79,
  null,
  76,
  77,
  null,
  81,
  84,
  83,
  81,
  79,
  null,
  74,
  76,
  79,
  null,
  77,
  74,
  71,
  null,
  76,
  null,
  79,
  83,
  86,
  83,
  81,
  79,
  81,
  79,
  76,
  null,
  72,
  76,
  79,
  null,
  77,
  81,
  84,
  null,
  81,
  79,
  77,
  76,
  74,
  null,
  79,
  77,
  76,
  74,
  72,
  null,
];
const BATTLE_MELODY = [
  76,
  71,
  74,
  76,
  null,
  79,
  78,
  76,
  76,
  null,
  72,
  76,
  79,
  83,
  81,
  null,
  81,
  76,
  72,
  71,
  null,
  72,
  76,
  81,
  78,
  75,
  71,
  null,
  75,
  78,
  83,
  null,
  76,
  79,
  83,
  86,
  83,
  null,
  81,
  79,
  79,
  null,
  74,
  71,
  74,
  79,
  81,
  83,
  84,
  83,
  79,
  null,
  76,
  79,
  84,
  83,
  78,
  75,
  71,
  75,
  78,
  83,
  75,
  null,
];
// Bass and close-voiced harmony advance together, once per full bar.
const ADVENTURE_HARMONY = [
  { bass: 48, chord: [60, 64, 67] }, // C
  { bass: 45, chord: [57, 60, 64] }, // Am
  { bass: 41, chord: [57, 60, 65] }, // F
  { bass: 43, chord: [55, 59, 62] }, // G
  { bass: 40, chord: [55, 59, 64] }, // Em
  { bass: 45, chord: [57, 60, 64] }, // Am
  { bass: 41, chord: [57, 60, 65] }, // F
  { bass: 43, chord: [55, 59, 62] }, // G
];
const BATTLE_HARMONY = [
  { bass: 40, chord: [55, 59, 64] }, // Em
  { bass: 48, chord: [55, 60, 64] }, // C
  { bass: 45, chord: [57, 60, 64] }, // Am
  { bass: 47, chord: [54, 59, 63] }, // B, resolving to Em
  { bass: 40, chord: [55, 59, 64] }, // Em
  { bass: 43, chord: [55, 59, 62] }, // G
  { bass: 48, chord: [55, 60, 64] }, // C
  { bass: 47, chord: [54, 59, 63] }, // B
];
const midi = (note: number) => 440 * 2 ** ((note - 69) / 12);
const stepLength = (scene: AudioScene) => 60 / TEMPO[scene] / 2;

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

/** A small, lazy Web Audio instrument rack; no assets, network, or game RNG. */
export function createGameAudio(): GameAudio {
  let context: AudioContext | null = null;
  let graph: AudioGraph | null = null;
  let preferences: AudioPreferences = { ...DEFAULT_AUDIO_PREFERENCES };
  let scene: AudioScene = "adventure";
  let paused = false;
  let disposed = false;
  let scheduler: ReturnType<typeof setInterval> | null = null;
  let outgoing: { scene: AudioScene; until: number } | null = null;
  let suspendPromise: Promise<void> = Promise.resolve();
  const voices = new Set<Voice>();
  const clocks: Record<AudioScene, MusicClock> = {
    adventure: { step: 0, next: 0, remaining: 0.03 },
    battle: { step: 0, next: 0, remaining: 0.03 },
  };

  function release(voice: Voice, stop = true) {
    if (!voices.delete(voice)) return;
    voice.oscillator.onended = null;
    if (stop) {
      try {
        voice.oscillator.stop();
      } catch {
        /* Already ended. */
      }
    }
    voice.oscillator.disconnect();
    voice.envelope.disconnect();
  }

  function cancelVoices(channel?: Voice["channel"]) {
    for (const voice of voices) {
      if (!channel || voice.channel === channel) release(voice);
    }
  }

  function stopScheduler() {
    if (scheduler !== null) clearInterval(scheduler);
    scheduler = null;
    if (context) {
      for (const track of ["adventure", "battle"] as const) {
        clocks[track].remaining = Math.max(
          0.03,
          Math.min(stepLength(track), clocks[track].next - context.currentTime),
        );
      }
    }
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
    track: AudioScene = scene,
    attack = 0.012,
  ) {
    if (!context || !graph || !canPlay()) return;
    if (voices.size >= MAX_VOICES) {
      // Effects take priority over a musical tail; polyphony stays bounded.
      const oldest =
        [...voices].find((voice) => voice.channel === "music") ??
        voices.values().next().value;
      if (oldest) release(oldest);
    }
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    const voice: Voice = { oscillator, envelope, channel };
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
    envelope.connect(channel === "music" ? graph[track] : graph.effects);
    oscillator.onended = () => release(voice, false);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  function scheduleBeat(track: AudioScene, step: number, time: number) {
    const beat = stepLength(track);
    const melody = track === "adventure" ? ADVENTURE_MELODY : BATTLE_MELODY;
    const progression =
      track === "adventure" ? ADVENTURE_HARMONY : BATTLE_HARMONY;
    const phraseStep = step % melody.length;
    const barStep = phraseStep % 8;
    const harmony = progression[Math.floor(phraseStep / 8)];
    const note = melody[phraseStep];
    if (note !== null) {
      const ringsIntoRest = melody[(phraseStep + 1) % melody.length] === null;
      // A wooden mallet fundamental with a quiet bell overtone, never a square lead.
      tone(
        "music",
        midi(note),
        time,
        beat * (ringsIntoRest ? 1.9 : 1.05),
        track === "adventure" ? 0.13 : 0.14,
        "triangle",
        undefined,
        track,
      );
      tone(
        "music",
        midi(note + 12),
        time,
        beat * 0.65,
        0.025,
        "sine",
        undefined,
        track,
      );
    }
    if (barStep === 0) {
      // Soft, slow-attack chords add a sustained bed beneath the plucked parts.
      harmony.chord.forEach((pitch, index) =>
        tone(
          "music",
          midi(pitch),
          time + index * 0.008,
          beat * 7.2,
          0.027,
          "triangle",
          undefined,
          track,
          0.12,
        ),
      );
    }
    if (barStep === 0 || barStep === 4) {
      const bassNote = harmony.bass + (barStep === 4 ? 7 : 0);
      tone(
        "music",
        midi(bassNote),
        time,
        beat * 3.3,
        track === "adventure" ? 0.13 : 0.16,
        "triangle",
        undefined,
        track,
      );
      tone(
        "music",
        track === "battle" ? 145 : 95,
        time,
        0.11,
        track === "battle" ? 0.14 : 0.055,
        "sine",
        42,
        track,
      );
    }
    if (barStep % 2 === 1) {
      const pitch = harmony.chord[Math.floor(barStep / 2) % 3] + 12;
      tone(
        "music",
        midi(pitch),
        time,
        beat * 1.25,
        0.045,
        "triangle",
        undefined,
        track,
      );
    }
    if (track === "battle" && (barStep === 2 || barStep === 6)) {
      // A restrained backbeat keeps battles energetic without a piercing chip lead.
      tone("music", 650, time, 0.075, 0.055, "triangle", 170, track);
      tone("music", 2400, time, 0.035, 0.018, "triangle", 1300, track);
    }
  }

  function tick(): boolean {
    if (!context || !canPlay() || preferences.musicVolume === 0) return false;
    try {
      const now = context.currentTime;
      if (outgoing && outgoing.until <= now) outgoing = null;
      for (const track of ["adventure", "battle"] as const) {
        if (track !== scene && outgoing?.scene !== track) continue;
        const clock = clocks[track];
        // A delayed timer skips silence instead of playing a backlog of notes.
        if (clock.next < now - LOOK_AHEAD) clock.next = now + 0.03;
        while (clock.next < now + LOOK_AHEAD) {
          scheduleBeat(track, clock.step++, clock.next);
          clock.next += stepLength(track);
        }
      }
      return true;
    } catch {
      stopScheduler();
      cancelVoices();
      return false;
    }
  }

  function startScheduler() {
    if (
      !context ||
      !canPlay() ||
      preferences.musicVolume === 0 ||
      scheduler !== null
    )
      return;
    for (const track of ["adventure", "battle"] as const) {
      clocks[track].next = context.currentTime + clocks[track].remaining;
    }
    if (tick()) scheduler = setInterval(tick, 40);
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
      adventure: context.createGain(),
      battle: context.createGain(),
    };
    graph.master.gain.value = preferences.muted ? 0 : 0.65;
    graph.music.gain.value = preferences.musicVolume;
    graph.effects.gain.value = preferences.effectsVolume;
    graph.adventure.gain.value = scene === "adventure" ? 1 : 0;
    graph.battle.gain.value = scene === "battle" ? 1 : 0;
    graph.adventure.connect(graph.music);
    graph.battle.connect(graph.music);
    graph.music.connect(graph.master);
    graph.effects.connect(graph.master);
    graph.master.connect(context.destination);
    context.onstatechange = () => {
      if (context?.state === "running") {
        startScheduler();
      } else {
        // Safari can enter its additional "interrupted" state after screen lock.
        stopScheduler();
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
        startScheduler();
      }
    } catch {
      // A later explicit sound-button gesture can retry a blocked resume.
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
          stopScheduler();
          cancelVoices();
          context.onstatechange = null;
          disconnectGraph();
          context = null;
        }
        if (!context) createContext();
        await resumeContext();
      } catch {
        // Unsupported browsers or an unavailable audio device remain playable.
        stopScheduler();
        cancelVoices();
      }
    },
    setPreferences(next) {
      if (disposed) return;
      preferences = normalizeAudioPreferences(next);
      try {
        applyVolumes();
        if (preferences.muted) {
          stopScheduler();
          cancelVoices();
        } else {
          if (preferences.musicVolume === 0) {
            stopScheduler();
            cancelVoices("music");
          } else startScheduler();
          if (preferences.effectsVolume === 0) cancelVoices("effects");
        }
      } catch {
        /* Audio must never block a game action. */
      }
    },
    setScene(next) {
      if (disposed || next === scene) return;
      const previous = scene;
      scene = next;
      if (!context || !graph) return;
      try {
        outgoing = { scene: previous, until: context.currentTime + CROSSFADE };
        clocks[next].next = context.currentTime + 0.03;
        ramp(graph[previous].gain, 0, CROSSFADE);
        ramp(graph[next].gain, 1, CROSSFADE);
        tick();
      } catch {
        /* Silence is the fallback for device failures. */
      }
    },
    setPaused(next) {
      if (disposed) return;
      paused = next;
      if (!context) return;
      if (next) {
        stopScheduler();
        cancelVoices();
        outgoing = null;
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
    playCue(kind, moveType) {
      if (!context || !canPlay() || preferences.effectsVolume === 0) return;
      try {
        const now = context.currentTime + 0.005;
        switch (kind) {
          case "button":
            notes([83], 0, 0.06, "triangle");
            break;
          case "dice":
          case "roll":
            [0, 0.08, 0.18, 0.3, 0.46, 0.65].forEach((offset, index) =>
              tone(
                "effects",
                380 + index * 45,
                now + offset,
                0.045,
                0.13,
                "triangle",
                100,
              ),
            );
            tone("effects", 130, now + 0.74, 0.12, 0.3, "sine", 45);
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
          case "eliminate":
            notes([60, 57, 53, 48], 0.16, 0.35, "triangle");
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
      stopScheduler();
      cancelVoices();
      if (context) {
        context.onstatechange = null;
        try {
          void context.close().catch(() => {});
        } catch {
          /* Already closed. */
        }
      }
      disconnectGraph();
      context = null;
    },
  };
}
