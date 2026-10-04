import type { LapGrowthView } from "./presentation-events";
import { getExperienceGrowth, XP_PER_LEVEL } from "./progression";

const clamp = (value: number) => Math.max(0, Math.min(1, value));

/** All cards share one clock; the last 200ms of the 1.2s event holds the result. */
export function getGrowthFrame(growth: LapGrowthView, progress: number, reducedMotion = false) {
  const fill = reducedMotion ? 1 : clamp(progress * 1.2);
  const current = fill === 1
    ? { level: growth.after.level, xp: growth.after.xp }
    : getExperienceGrowth(growth.before, Math.floor(growth.amount * fill));
  const levelsGained = current.level - growth.before.level;
  const lastThreshold = levelsGained * XP_PER_LEVEL - growth.before.xp;
  const thresholdProgress = growth.amount > 0 ? lastThreshold / growth.amount / 1.2 : 1;
  const glow = levelsGained > 0 && !reducedMotion
    ? clamp(1 - (progress - thresholdProgress) / 0.35)
    : 0;
  return { ...current, levelsGained, glow };
}

/** Choose the largest uniformly scaled cards that all fit, with no paging. */
export function getRewardGrid(count: number, width: number, height: number) {
  const availableWidth = Math.max(1, width - 48);
  const availableHeight = Math.max(1, height - 136);
  let best = { columns: 1, rows: Math.max(1, count), scale: 0 };
  for (let columns = 1; columns <= Math.max(1, count); columns++) {
    const rows = Math.ceil(Math.max(1, count) / columns);
    const scale = Math.min(
      availableWidth / (columns * 168 - 8),
      availableHeight / (rows * 120 - 8),
    );
    if (scale > best.scale) best = { columns, rows, scale };
  }
  return best;
}

export function getEvolutionFrame(progress: number, reducedMotion = false) {
  const p = reducedMotion ? 1 : clamp(progress);
  const stage = p < 0.3 ? "charge" : p < 0.6 ? "transform" : "reveal";
  const transform = clamp((p - 0.3) / 0.3);
  const reveal = clamp((p - 0.6) / 0.4);
  return {
    stage,
    progress: p,
    transform,
    reveal,
    scale: reducedMotion ? 1 : stage === "reveal"
      ? 1 + 0.18 * (1 - reveal) ** 3
      : 0.92 + Math.sin(p / 0.6 * Math.PI) * 0.1,
  };
}
