import type { Move } from "./data-types";
import { movesById, speciesById } from "./pokemon-data";

/** Frozen v2-v4 loadout: strongest attacks, diverse types, three slots. */
export function getLegacyAvailableMoves(speciesId: number, level: number): Move[] {
  const learned = (speciesById[speciesId]?.learnset ?? [])
    .filter((entry) => entry.level <= level)
    .map((entry) => movesById[entry.moveId])
    .filter((move): move is Move => Boolean(move) && move.effects.support !== "excluded" && move.id !== 165)
    .sort((left, right) => right.power - left.power || left.id - right.id);
  const selected: Move[] = [];
  const selectedTypes = new Set<number | null>();
  for (const move of learned) {
    if (selectedTypes.has(move.type)) continue;
    selected.push(move);
    selectedTypes.add(move.type);
    if (selected.length === 3) break;
  }
  for (const move of learned) {
    if (selected.length === 3) break;
    if (!selected.some((entry) => entry.id === move.id)) selected.push(move);
  }
  return selected;
}
