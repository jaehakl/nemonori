"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createGameAudio, type AudioScene } from "./audio";
import {
  loadAudioPreferences,
  saveAudioPreferences,
  type AudioPreferences,
} from "./audio-preferences";
import {
  createPresentationPlayer,
  type PresentationFrame,
  type PresentationPlayer,
} from "./presentation-player";
import type { PresentationEvent } from "./presentation-events";

const EMPTY_FRAME: PresentationFrame = {
  event: null,
  progress: 1,
  pending: 0,
  session: 0,
};

export function useExperience() {
  const [frame, setFrame] = useState(EMPTY_FRAME);
  const [skippedRevision, setSkippedRevision] = useState<number | null>(null);
  const [preferences, setPreferences] = useState(loadAudioPreferences);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [portrait, setPortrait] = useState(false);
  const [hidden, setHidden] = useState(false);
  const player = useRef<PresentationPlayer | null>(null);
  const audio = useRef<ReturnType<typeof createGameAudio> | null>(null);
  const pausedRef = useRef(false);
  const preferencesRef = useRef(preferences);

  useEffect(() => {
    const sound = createGameAudio();
    sound.setPreferences(preferencesRef.current);
    audio.current = sound;
    const timeline = createPresentationPlayer(setFrame, (event) => {
      if (event.attack?.outcome !== "miss") sound.playCue(event.kind, event.attack?.moveType, event.capture?.success);
    });
    player.current = timeline;
    const orientation = window.matchMedia("(orientation: portrait)");
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePause = () => {
      const isHidden = document.visibilityState === "hidden";
      pausedRef.current = orientation.matches || isHidden;
      setPortrait(orientation.matches);
      setHidden(isHidden);
      timeline.setPaused(pausedRef.current);
      sound.setPaused(pausedRef.current);
    };
    const updateMotion = () => {
      setReducedMotion(motion.matches);
      timeline.setReducedMotion(motion.matches);
      sound.setReducedMotion(motion.matches);
    };
    updatePause();
    updateMotion();
    orientation.addEventListener("change", updatePause);
    motion.addEventListener("change", updateMotion);
    document.addEventListener("visibilitychange", updatePause);
    return () => {
      orientation.removeEventListener("change", updatePause);
      motion.removeEventListener("change", updateMotion);
      document.removeEventListener("visibilitychange", updatePause);
      timeline.dispose();
      sound.dispose();
      player.current = null;
      audio.current = null;
    };
  }, []);

  const unlockAudio = useCallback(() => {
    void audio.current?.unlock().catch(() => {
      /* Audio never blocks a move. */
    });
  }, []);
  const updatePreferences = useCallback((next: AudioPreferences) => {
    preferencesRef.current = next;
    setPreferences(next);
    saveAudioPreferences(next);
    audio.current?.setPreferences(next);
  }, []);
  const updateReducedMotion = useCallback((next: boolean) => {
    setReducedMotion(next);
    player.current?.setReducedMotion(next);
    audio.current?.setReducedMotion(next);
  }, []);
  const reset = useCallback((scene: AudioScene = "opening") => {
    setSkippedRevision(null);
    player.current?.reset();
    // Discard already scheduled cues without overriding orientation/visibility pause.
    audio.current?.setPaused(true);
    audio.current?.resetAdventure();
    audio.current?.setScene(scene);
    audio.current?.setPaused(pausedRef.current);
  }, []);
  const enqueue = useCallback(
    (events: PresentationEvent[]) => player.current?.enqueue(events),
    [],
  );
  const skip = useCallback(() => {
    setSkippedRevision(frame.event?.revision ?? null);
    player.current?.skip();
    audio.current?.setPaused(true);
    audio.current?.setPaused(pausedRef.current);
  }, [frame.event?.revision]);
  const isBlocked = useCallback(
    () => pausedRef.current || Boolean(player.current?.busy),
    [],
  );
  const setScene = useCallback(
    (scene: AudioScene) => audio.current?.setScene(scene),
    [],
  );
  const click = useCallback(() => audio.current?.playCue("button"), []);

  return {
    frame,
    skippedRevision,
    preferences,
    reducedMotion,
    portrait,
    paused: portrait || hidden,
    busy: frame.event !== null,
    unlockAudio,
    updatePreferences,
    updateReducedMotion,
    reset,
    enqueue,
    skip,
    isBlocked,
    setScene,
    click,
  };
}
