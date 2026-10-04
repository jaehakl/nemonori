import type { BattleActionResult, CombatState } from "./combat-types";

export interface Pokemon {
  id: string;
  speciesId: number;
  level: number;
  /** Progress toward the next level; 1,000 XP advances one level. */
  xp: number;
  hp: number;
  /** Up to four persistent moves, ordered from oldest to newest. */
  moveIds: number[];
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

export interface PendingPokemonGrowth {
  ownerId: number;
  pokemonId: string;
  pendingMoveIds: number[];
  /** Eligible moves already processed in this reward, including forgotten moves. */
  consideredMoveIds: number[];
}

export interface PendingGrowth {
  resume: "battle" | "movement" | "center-return";
  /** Center rewards can belong to several rescued players, including opponents. */
  centerReturn?: { playerIds: number[]; resume: "movement" | "turn-end" };
  /** Version-2 lap rewards did not include deployed guardians. */
  legacyPartyOnly?: true;
  /** Experience is already awarded; only automatic learning and evolution choices remain. */
  queue: PendingPokemonGrowth[];
}

export type GamePhase =
  | "roll"
  | "rest-roll"
  | "rest-end"
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
  version: 6;
  revision: number;
  rng: number;
  nextPokemonId: number;
  turn: number;
  activePlayer: number;
  players: Player[];
  roads: (Guardian | null)[];
  phase: GamePhase;
  dice: [number, number] | null;
  /** Rest doubles permit movement, but never earn an extra roll. */
  dicePurpose: "movement" | "rest" | null;
  movement: { remaining: number; encounters: number[] } | null;
  battle: Battle | null;
  evolution: PendingEvolution | null;
  growth: PendingGrowth | null;
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
  | { type: "MOVE_TO_CENTER" }
  | { type: "CAPTURE"; capture: boolean }
  | { type: "DEPLOY"; pokemonId: string }
  | { type: "RETRIEVE" }
  | { type: "START_EXCHANGE" }
  | { type: "END_EXCHANGE" }
  | { type: "CENTER_TRANSFER"; pokemonId: string; to: "party" | "box" }
  | { type: "END_TURN" };
