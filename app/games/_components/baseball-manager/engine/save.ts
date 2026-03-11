import { loadGameSave, saveGameSave } from "@/app/lib/save-protocol";
import { BASEBALL_MANAGER_SLUG, BASEBALL_MANAGER_TITLE } from "../constants";
import type { GameState } from "../types";

type BaseballManagerSaveData = {
  state: GameState;
};

export function loadBaseballManagerState() {
  const envelope = loadGameSave<BaseballManagerSaveData>(BASEBALL_MANAGER_SLUG);
  return envelope?.data?.state ?? null;
}

export function saveBaseballManagerState(state: GameState) {
  return saveGameSave<BaseballManagerSaveData>(BASEBALL_MANAGER_SLUG, BASEBALL_MANAGER_TITLE, { state });
}
