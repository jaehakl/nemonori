import type { Battle, BattleSide, Player, Pokemon } from "./types";

/** A detached view: presentation must never mutate the saved game. */
export interface PokemonView extends Pokemon {
  maxHp: number;
}

export interface BattleView {
  kind: Battle["kind"];
  attacker: PokemonView | null;
  defender: PokemonView | null;
  attackerName: string;
  defenderName: string;
  turn: BattleSide;
}

export interface PresentationSnapshot {
  players: Pick<
    Player,
    "id" | "name" | "position" | "starterSpeciesId" | "restTurnsRemaining" | "seatSide"
  >[];
  guardians: { tile: number; ownerId: number; speciesId: number }[];
  activePlayerId: number;
  dice: [number, number] | null;
  battle: BattleView | null;
}

export type PresentationEventKind =
  | "roll"
  | "move"
  | "lap"
  | "encounter"
  | "send-out"
  | "attack"
  | "faint"
  | "level-up"
  | "evolution"
  | "heal"
  | "capture"
  | "deploy"
  | "retrieve"
  | "rescue"
  | "rest"
  | "victory"
  | "turn";

/** Events are transient and never become part of GameState or the save format. */
export interface PresentationEvent {
  kind: PresentationEventKind;
  revision: number;
  sequence: number;
  playerId: number | null;
  tile: number;
  message: string;
  snapshot: PresentationSnapshot;
  attack?: {
    side: BattleSide;
    moveId: number;
    moveType: number | null;
    category: "physical" | "special";
    damage: number;
    effectiveness: number;
    beforeHp: number;
    afterHp: number;
  };
  pokemon?: PokemonView;
  previousSpeciesId?: number;
  side?: BattleSide;
  fromTile?: number;
}
