import type { ComponentType } from "react";
import type { GameLoader } from "../data";

export type GameLoadResult =
  | { status: "ready"; View: ComponentType }
  | { status: "error" };

export function startGameLoad(load: GameLoader, onResult: (result: GameLoadResult) => void): () => void {
  let cancelled = false;

  void (async () => {
    try {
      const loaded = await load();
      if (!cancelled) {
        onResult({ status: "ready", View: loaded.default });
      }
    } catch {
      if (!cancelled) {
        onResult({ status: "error" });
      }
    }
  })();

  return () => {
    cancelled = true;
  };
}
