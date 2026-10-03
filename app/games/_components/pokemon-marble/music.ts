import type { AudioScene } from "./music-scene";

const ADVENTURE_TRACKS = ["gym", "route-2", "route-6"] as const;
const SCENE_TRACKS = {
  opening: "opening",
  center: "pokemon-center",
  wild: "wild-battle",
  road: "rival-battle",
  trainer: "last-pokemon",
  "wild-victory": "wild-victory",
  "trainer-victory": "trainer-victory",
} as const;
const FADE_SECONDS = 0.2;

/** One streaming element keeps memory bounded and preserves Safari's audio unlock. */
export function createMusicPlayer(context: AudioContext, output: GainNode) {
  const media = new Audio();
  media.preload = "none";
  const source = context.createMediaElementSource(media);
  const fade = context.createGain();
  source.connect(fade);
  fade.connect(output);

  let scene: AudioScene = "opening";
  let loadedScene: AudioScene | null = null;
  let loadedTrack: string | null = null;
  let adventureIndex = 0;
  let adventurePosition = 0;
  let enabled = false;
  let disposed = false;
  let failed = false;
  let completed = false;
  let generation = 0;
  let transition: ReturnType<typeof setTimeout> | null = null;

  function cancelTransition() {
    if (transition !== null) clearTimeout(transition);
    transition = null;
    fade.gain.cancelScheduledValues(context.currentTime);
  }

  function fadeTo(value: number) {
    const now = context.currentTime;
    if (typeof fade.gain.cancelAndHoldAtTime === "function") {
      fade.gain.cancelAndHoldAtTime(now);
    } else {
      const current = fade.gain.value;
      fade.gain.cancelScheduledValues(now);
      fade.gain.setValueAtTime(current, now);
    }
    fade.gain.linearRampToValueAtTime(value, now + FADE_SECONDS);
  }

  function play() {
    if (disposed || !enabled || failed || completed || !media.paused) return;
    const request = generation;
    try {
      void media.play().then(() => {
        // A stale completion must never pause a newer, valid playback request.
        if (disposed || !enabled) media.pause();
      }).catch(() => {
        if (request === generation && enabled && !disposed) failed = true;
      });
    } catch {
      failed = true;
    }
  }

  function selectTrack() {
    cancelTransition();
    if (disposed || !enabled) return;
    if (loadedScene === "adventure") adventurePosition = media.currentTime;
    media.pause();
    generation++;
    loadedScene = scene;
    loadedTrack = scene === "adventure" ? ADVENTURE_TRACKS[adventureIndex] : SCENE_TRACKS[scene];
    failed = false;
    completed = false;
    media.loop = scene !== "adventure" && !scene.endsWith("-victory");
    media.src = `/pokemon-marble/bgm/${loadedTrack}.m4a`;
    // Setting currentTime before metadata is loaded also sets the default start position.
    media.currentTime = scene === "adventure" ? adventurePosition : 0;
    fade.gain.setValueAtTime(0, context.currentTime);
    play();
    fadeTo(1);
  }

  function sync() {
    if (disposed) return;
    if (!enabled) {
      cancelTransition();
      generation++;
      media.pause();
      return;
    }
    const track = scene === "adventure" ? ADVENTURE_TRACKS[adventureIndex] : SCENE_TRACKS[scene];
    if (track === loadedTrack) {
      cancelTransition();
      play();
      fadeTo(1);
    } else if (transition === null) {
      if (loadedTrack && !media.paused) {
        fadeTo(0);
        transition = setTimeout(selectTrack, FADE_SECONDS * 1000);
      } else selectTrack();
    }
  }

  media.onended = () => {
    if (disposed || !enabled || loadedScene !== scene) return;
    if (scene === "adventure") {
      adventureIndex = (adventureIndex + 1) % ADVENTURE_TRACKS.length;
      adventurePosition = 0;
      loadedScene = null; // Do not save the previous track's end as the next track's offset.
      selectTrack();
    } else completed = true;
  };
  media.onerror = () => { failed = true; };

  return {
    update(nextScene: AudioScene, canPlay: boolean) {
      scene = nextScene;
      enabled = canPlay;
      sync();
    },
    retry() {
      if (disposed) return;
      if (failed && media.error) media.load();
      failed = false;
      sync();
    },
    resetAdventure() {
      if (disposed) return;
      cancelTransition();
      generation++;
      media.pause();
      adventureIndex = 0;
      adventurePosition = 0;
      loadedScene = null;
      loadedTrack = null;
      completed = false;
      failed = false;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      enabled = false;
      generation++;
      cancelTransition();
      media.onended = null;
      media.onerror = null;
      media.pause();
      media.removeAttribute("src");
      media.load();
      source.disconnect();
      fade.disconnect();
    },
  };
}
