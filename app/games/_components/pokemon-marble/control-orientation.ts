import { getActingPlayer } from "./engine";
import type { DisplayMode } from "./display-preferences";
import type { GameState, SeatSide } from "./types";

export type ControlLayout = { mode: DisplayMode; seatSide: SeatSide };

/** Keep the last actor's controls in place until the presentation queue finishes. */
export function resolveControlLayout(
  state: GameState | null,
  mode: DisplayMode,
  previous: ControlLayout,
  busy: boolean,
): ControlLayout {
  if (busy) return previous;

  const actor = state ? getActingPlayer(state) ?? state.activePlayer : null;
  const seatSide =
    mode === "auto" && state && actor !== null
      ? state.players[actor].seatSide
      : "bottom";

  if (previous.mode === mode && previous.seatSide === seatSide) return previous;
  return { mode, seatSide };
}
