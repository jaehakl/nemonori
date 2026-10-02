import { useEffect, useRef } from "react";
import { getActingPlayer } from "./engine";
import type { GameAction, GameState } from "./types";

/** Preserve the remaining delay when orientation or visibility pauses play. */
export function useAutomaticAction(
  game: GameState | null,
  blocked: boolean,
  session: number,
  dispatch: (action: GameAction, revision?: number) => void,
) {
  const pending = useRef({ key: "", remaining: 0 });
  useEffect(() => {
    if (!game) {
      pending.current.key = "";
      return;
    }
    const action: GameAction | null =
      game.phase === "moving"
        ? { type: "STEP" }
        : game.phase === "attack" && getActingPlayer(game) === null
          ? { type: "WILD_ATTACK" }
          : null;
    if (!action) {
      pending.current.key = "";
      return;
    }
    const key = `${session}:${game.revision}:${action.type}`;
    if (pending.current.key !== key)
      pending.current = {
        key,
        remaining: action.type === "STEP" ? 40 : 350,
      };
    if (blocked) return;
    const started = performance.now();
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (!cancelled && pending.current.key === key)
        dispatch(action, game.revision);
    }, pending.current.remaining);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (pending.current.key === key) {
        pending.current.remaining = Math.max(
          0,
          pending.current.remaining - (performance.now() - started),
        );
      }
    };
  }, [game, blocked, session, dispatch]);
}
