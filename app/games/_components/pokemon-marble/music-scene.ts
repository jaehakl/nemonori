import type { PresentationEvent, PresentationSnapshot } from "./presentation-events";

export type AudioScene =
  | "opening"
  | "adventure"
  | "center"
  | "wild"
  | "road"
  | "trainer"
  | "wild-victory"
  | "trainer-victory";

/** Follow the visible snapshot, not the already committed next game state. */
export function getAudioScene(
  view: PresentationSnapshot | null,
  event: PresentationEvent | null = null,
  resultSkipped = false,
): AudioScene {
  if (!view) return "opening";
  if (event?.kind === "victory") return resultSkipped ? "adventure" : "trainer-victory";
  const battle = view.battle;
  if (battle) {
    if (resultSkipped && battle.outcome) return "adventure";
    if (battle.outcome?.kind === "capture") return "wild-victory";
    if (battle.outcome?.kind === "knockout") {
      if (battle.kind !== "wild") return "trainer-victory";
      if (battle.outcome.winner === "attacker") return "wild-victory";
    }
    return battle.kind;
  }
  return ["center", "rest-roll", "rest-end"].includes(view.phase) ? "center" : "adventure";
}
