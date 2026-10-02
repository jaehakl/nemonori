"use client";

import { useSyncExternalStore } from "react";
import {
  getGameSavesServerSnapshot,
  getGameSavesSnapshot,
  subscribeGameSaves,
} from "./save-store";

export function useGameSaves() {
  return useSyncExternalStore(subscribeGameSaves, getGameSavesSnapshot, getGameSavesServerSnapshot);
}
