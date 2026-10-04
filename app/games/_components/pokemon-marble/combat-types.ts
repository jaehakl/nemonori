import type { BattleStat, StatChanges, Status } from "./data-types";
import type { BattleSide, Pokemon } from "./types";

export type CombatantState = {
  stages: Record<BattleStat, number>;
  status: Status | null;
  statusTurns: number;
  toxicCounter: number;
  confusion: number;
  flinch: boolean;
  binding: number;
  saltCure: boolean;
  syrup: number;
  throatChop: number;
  grounded: boolean;
  exposed: boolean;
  types: number[] | null;
  charging: number | null;
  recharge: boolean;
  locked: { moveId: number; remaining: number } | null;
  lastMove: number | null;
  lastFailed: boolean;
  consecutive: number;
  usedMoves: number[];
  actions: number;
  timesHit: number;
  receivedDamage: number;
  receivedPhysical: boolean;
  damagedRound: number;
};

export type CombatState = {
  round: number;
  attacker: CombatantState;
  defender: CombatantState;
  plasma: boolean;
  delayed: {
    side: BattleSide;
    moveId: number;
    dueRound: number;
    pokemon: Pokemon;
    combatant: CombatantState;
  }[];
};

export type DamageBreakdown = {
  level: number;
  levelFactor: number;
  originalPower: number;
  power: number;
  powerLabel: string;
  category: "physical" | "special";
  offenseStat: BattleStat;
  defenseStat: BattleStat;
  offense: number;
  defense: number;
  offenseStage: number;
  defenseStage: number;
  baseDamage: number;
  stab: number;
  effectiveness: number;
  critical: boolean;
  criticalMultiplier: number;
  modifier: number;
  damage: number;
  fixed: boolean;
  accuracy: number | null;
  moveType: number | null;
};

export type BattleActionResult = {
  side: BattleSide;
  moveId: number;
  moveName: string;
  moveType: number | null;
  category: "physical" | "special";
  outcome: "hit" | "miss" | "charge" | "recharge" | "blocked" | "delayed";
  message: string;
  damage: number;
  calculatedDamage: number;
  effectiveness: number;
  critical: boolean;
  beforeHp: number;
  afterHp: number;
  sourceBeforeHp: number;
  sourceAfterHp: number;
  healing: number;
  recoil: number;
  hits: { breakdown: DamageBreakdown; beforeHp: number; afterHp: number }[];
  changes: { side: BattleSide; message: string; boosts?: StatChanges }[];
  legacy?: true;
};

export function createCombatant(): CombatantState {
  return {
    stages: {
      attack: 0,
      defense: 0,
      specialAttack: 0,
      specialDefense: 0,
      speed: 0,
      accuracy: 0,
      evasion: 0,
    },
    status: null,
    statusTurns: 0,
    toxicCounter: 0,
    confusion: 0,
    flinch: false,
    binding: 0,
    saltCure: false,
    syrup: 0,
    throatChop: 0,
    grounded: false,
    exposed: false,
    types: null,
    charging: null,
    recharge: false,
    locked: null,
    lastMove: null,
    lastFailed: false,
    consecutive: 0,
    usedMoves: [],
    actions: 0,
    timesHit: 0,
    receivedDamage: 0,
    receivedPhysical: false,
    damagedRound: 0,
  };
}

export function createCombatState(): CombatState {
  return {
    round: 1,
    attacker: createCombatant(),
    defender: createCombatant(),
    plasma: false,
    delayed: [],
  };
}
