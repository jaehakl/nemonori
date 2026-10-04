export type PokemonStats = {
  hp: number;
  attack: number;
  defense: number;
  specialAttack: number;
  specialDefense: number;
  speed: number;
};

export type Species = {
  id: number;
  name: string;
  englishName: string;
  generation: number;
  types: number[];
  stats: PokemonStats;
  evolvesFrom: number | null;
  legendary: boolean;
  mythical: boolean;
  evolutions: { speciesId: number; level: number }[];
  learnset: { moveId: number; level: number }[];
};

export type Move = {
  id: number;
  name: string;
  type: number | null;
  power: number;
  category: "physical" | "special";
  accuracy: number | null;
  effects: MoveEffects;
};

export type BattleStat = "attack" | "defense" | "specialAttack" | "specialDefense" | "speed" | "accuracy" | "evasion";
export type Status = "brn" | "psn" | "tox" | "par" | "slp" | "frz";
export type StatChanges = Partial<Record<BattleStat, number>>;
export type MoveEffect = {
  chance: number;
  self?: boolean;
  status?: Status;
  randomStatuses?: Status[];
  volatile?: string;
  boosts?: StatChanges;
};
/** Data describes shared effects; named rules implement the remaining move-specific behavior. */
export type MoveEffects = {
  support: "full" | "base" | "excluded";
  reason?: string;
  rule?: string;
  criticalStage?: number;
  alwaysCritical?: boolean;
  drain?: number;
  recoil?: number;
  selfDamage?: "quarter" | "half" | "faint";
  hits?: [number, number];
  perHitAccuracy?: boolean;
  charge?: "normal" | "air" | "ground" | "water" | "vanish";
  chargeBoosts?: StatChanges;
  recharge?: boolean;
  lock?: "rampage" | "rollout" | "uproar";
  secondary?: MoveEffect[];
  selfBoosts?: StatChanges;
  offensiveStat?: "defense";
  defensiveStat?: "defense";
  targetOffense?: boolean;
  ignoreDefenseStages?: boolean;
  ignoreEvasion?: boolean;
  sound?: boolean;
  contact?: boolean;
  defrost?: boolean;
  thawsTarget?: boolean;
  crash?: boolean;
};
