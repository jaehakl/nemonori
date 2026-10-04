import { getStats } from "./battle";
import type { Pokemon } from "./types";

export const XP_PER_LEVEL = 1000;
const victoryAnchors = [
  [1, 5000],
  [15, 2000],
  [30, 1000],
  [50, 500],
  [100, 250],
] as const;

/** Evaluate once at the winner's level before the reward is applied. */
export function getVictoryExperience(level: number, opponentLevel: number): number {
  if (level >= 100) return 0;
  const upperIndex = victoryAnchors.findIndex(([anchorLevel]) => anchorLevel >= level);
  const [upperLevel, upperReward] = victoryAnchors[Math.max(0, upperIndex)];
  const [lowerLevel, lowerReward] = victoryAnchors[Math.max(0, upperIndex - 1)];
  const fraction = upperLevel === lowerLevel ? 0 : (level - lowerLevel) / (upperLevel - lowerLevel);
  const baseReward = lowerReward + (upperReward - lowerReward) * fraction;
  const differenceMultiplier = Math.max(0.1, Math.min(2, opponentLevel / level));
  return Math.round(baseReward * differenceMultiplier);
}

export function getExperienceGrowth(
  pokemon: Pick<Pokemon, "level" | "xp">,
  amount: number,
): Pick<Pokemon, "level" | "xp"> {
  const total = pokemon.xp + amount;
  const level = Math.min(100, pokemon.level + Math.floor(total / XP_PER_LEVEL));
  return { level, xp: level === 100 ? 0 : total % XP_PER_LEVEL };
}

/** HP gives 25–90%; each positive level advantage adds one point, up to 95%. */
export function getCaptureChance(pokemon: Pokemon, attackerLevel = pokemon.level): number {
  const healthFraction = Math.max(0, Math.min(1, pokemon.hp / getStats(pokemon).hp));
  const levelBonus = Math.max(0, attackerLevel - pokemon.level) * 0.01;
  return Math.min(0.95, 0.25 + 0.65 * (1 - healthFraction) + levelBonus);
}
