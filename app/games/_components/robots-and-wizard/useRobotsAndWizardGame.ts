"use client";

import { useEffect, useRef, useState } from "react";
import { loadGameSave, saveGameSave } from "@/app/lib/save-protocol";
import { DEFAULT_MESSAGE, DEFAULT_SPELL, GAME_SLUG, GAME_TITLE, PLAYER_MAX_HEALTH } from "./constants";
import type { SpellId } from "./types";

function loadInitialBestTime() {
  const saved = loadGameSave<{ bestTime?: number }>(GAME_SLUG);
  if (saved?.data && typeof saved.data.bestTime === "number" && Number.isFinite(saved.data.bestTime)) {
    return Math.max(0, Math.floor(saved.data.bestTime));
  }

  return null;
}

export function useRobotsAndWizardGame() {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const bestTimeRef = useRef<number | null>(null);
  const selectedSpellRef = useRef<SpellId>(DEFAULT_SPELL);

  const [runId, setRunId] = useState(0);
  const [visitedCount, setVisitedCount] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isCleared, setIsCleared] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [playerHealth, setPlayerHealth] = useState(PLAYER_MAX_HEALTH);
  const [fireballChargeLevel, setFireballChargeLevel] = useState(0);
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [bestTime, setBestTime] = useState<number | null>(loadInitialBestTime);
  const [selectedSpell, setSelectedSpell] = useState<SpellId>(DEFAULT_SPELL);

  useEffect(() => {
    bestTimeRef.current = bestTime;
  }, [bestTime]);

  useEffect(() => {
    selectedSpellRef.current = selectedSpell;
  }, [selectedSpell]);

  useEffect(() => {
    if (bestTime === null) {
      return;
    }
    saveGameSave(GAME_SLUG, GAME_TITLE, { bestTime });
  }, [bestTime]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === panelRef.current);
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, []);

  const restart = () => {
    setRunId((prev) => prev + 1);
  };

  const toggleFullscreen = async () => {
    const panel = panelRef.current;
    if (!panel) {
      return;
    }

    if (document.fullscreenElement === panel) {
      await document.exitFullscreen();
      return;
    }

    await panel.requestFullscreen();
  };

  return {
    panelRef,
    mountRef,
    bestTimeRef,
    selectedSpellRef,
    runId,
    visitedCount,
    elapsedSeconds,
    isCleared,
    isFullscreen,
    playerHealth,
    fireballChargeLevel,
    message,
    bestTime,
    selectedSpell,
    setVisitedCount,
    setElapsedSeconds,
    setIsCleared,
    setPlayerHealth,
    setFireballChargeLevel,
    setMessage,
    setBestTime,
    setSelectedSpell,
    restart,
    toggleFullscreen,
  };
}
