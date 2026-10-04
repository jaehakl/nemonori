import type { BattleActionResult, CombatState as CurrentCombatState } from "./combat-types";

/** Frozen version 3/4 shapes, kept independent of current save fields. */
type CombatState = Omit<CurrentCombatState, "delayed"> & {
  delayed: (Omit<CurrentCombatState["delayed"][number], "pokemon"> & { pokemon: Pokemon })[];
};

export interface Pokemon {
  id: string;
  speciesId: number;
  level: number;
  /** Progress toward the next level; 1,000 XP advances one level. */
  xp: number;
  hp: number;
}

export type SeatSide = "bottom" | "left" | "top" | "right";

export interface Player {
  id: number;
  name: string;
  position: number;
  party: Pokemon[];
  box: Pokemon[];
  starterSpeciesId: number;
  restTurnsRemaining: number;
  seatSide: SeatSide;
}

export interface Guardian {
  ownerId: number;
  pokemon: Pokemon;
}

export type BattleSide = "defender" | "attacker";

export interface Battle {
  kind: "trainer" | "wild" | "road";
  defenderOwner: number | null;
  defenderPokemonId: string | null;
  attackerPokemonId: string | null;
  wild: Pokemon | null;
  turn: BattleSide;
  outcome:
    | { kind: "knockout"; winner: BattleSide; legacyCapturePending?: true }
    | { kind: "capture" }
    | { kind: "draw" }
    | null;
  lastAttack: {
    side: BattleSide;
    moveId: number;
    damage: number;
    effectiveness: number;
    result?: BattleActionResult;
    legacy?: true;
  } | null;
  combat: CombatState;
}

export interface PendingEvolution {
  ownerId: number;
  pokemonId: string;
  options: number[];
}

export interface PendingLapGrowth {
  remainingPokemonIds: string[];
  /** A migrated version-2 reward had already grown only the party. */
  legacyPartyOnly?: true;
}

export type GamePhase =
  | "roll"
  | "moving"
  | "choose-defender"
  | "choose-attacker"
  | "attack"
  | "evolution"
  | "capture"
  | "road"
  | "center"
  | "turn-end"
  | "finished";

export interface GameState {
  version: 4;
  revision: number;
  rng: number;
  nextPokemonId: number;
  turn: number;
  activePlayer: number;
  players: Player[];
  roads: (Guardian | null)[];
  phase: GamePhase;
  dice: [number, number] | null;
  movement: { remaining: number; encounters: number[] } | null;
  battle: Battle | null;
  evolution: PendingEvolution | null;
  /** Missing only in earlier version-2 saves, before lap growth was introduced. */
  lapGrowth?: PendingLapGrowth | null;
  exchangeActive?: boolean;
  winner: number | null;
  log: string[];
  lastBattleAction: BattleActionResult | null;
}

export type GameAction =
  | { type: "ROLL" }
  | { type: "STEP" }
  | { type: "CHOOSE_POKEMON"; pokemonId: string }
  | { type: "ATTACK"; moveId: number }
  | { type: "WILD_ATTACK" }
  | { type: "CONTINUE_BATTLE" }
  | { type: "THROW_BALL" }
  | { type: "CHOOSE_EVOLUTION"; speciesId: number }
  | { type: "CAPTURE"; capture: boolean }
  | { type: "DEPLOY"; pokemonId: string }
  | { type: "RETRIEVE" }
  | { type: "START_EXCHANGE" }
  | { type: "END_EXCHANGE" }
  | { type: "CENTER_TRANSFER"; pokemonId: string; to: "party" | "box" }
  | { type: "END_TURN" }
  | { type: "END_TURN_AND_ROLL" };
