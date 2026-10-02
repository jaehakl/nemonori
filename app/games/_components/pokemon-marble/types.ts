export interface Pokemon {
  id: string;
  speciesId: number;
  level: number;
  hp: number;
}

export interface Player {
  id: number;
  name: string;
  position: number;
  party: Pokemon[];
  box: Pokemon[];
  eliminated: boolean;
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
  winner: BattleSide | null;
  lastAttack: {
    side: BattleSide;
    moveId: number;
    damage: number;
    effectiveness: number;
  } | null;
}

export interface PendingEvolution {
  ownerId: number;
  pokemonId: string;
  options: number[];
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
  version: 1;
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
  winner: number | null;
  log: string[];
}

export type GameAction =
  | { type: "ROLL" }
  | { type: "STEP" }
  | { type: "CHOOSE_POKEMON"; pokemonId: string }
  | { type: "ATTACK"; moveId: number }
  | { type: "WILD_ATTACK" }
  | { type: "CHOOSE_EVOLUTION"; speciesId: number }
  | { type: "CAPTURE"; capture: boolean }
  | { type: "DEPLOY"; pokemonId: string }
  | { type: "RETRIEVE" }
  | { type: "SWAP_GUARDIAN"; pokemonId: string }
  | { type: "CENTER_TRANSFER"; pokemonId: string; to: "party" | "box" }
  | { type: "CENTER_SWAP"; partyPokemonId: string; boxPokemonId: string }
  | { type: "END_TURN" };
