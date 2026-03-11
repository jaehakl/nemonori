import { loadGameSave, saveGameSave } from "@/app/lib/save-protocol";
import { BASEBALL_MANAGER_SLUG, BASEBALL_MANAGER_TITLE } from "../constants";
import type { GameState } from "../types";

type BaseballManagerSaveData = {
  state: GameState;
};

export function loadBaseballManagerState() {
  const envelope = loadGameSave<BaseballManagerSaveData>(BASEBALL_MANAGER_SLUG);
  const state = envelope?.data?.state;
  if (!state || typeof state !== "object") {
    return null;
  }

  if (!("season" in state) || !("rosterOps" in state) || !("userTeamId" in state) || !("liveMatch" in state)) {
    return null;
  }

  return state as GameState;
}

export function saveBaseballManagerState(state: GameState) {
  return saveGameSave<BaseballManagerSaveData>(BASEBALL_MANAGER_SLUG, BASEBALL_MANAGER_TITLE, { state });
}
