import type { Move, Species } from "./data-types";
import {
  importedMoves,
  importedSpecies,
  importedTypeEffectiveness,
  importedTypeNames,
} from "./generated/catalog";

export type { Move, PokemonStats, Species } from "./data-types";

export const speciesList: Species[] = importedSpecies;
export const speciesById: Record<number, Species> = Object.fromEntries(
  speciesList.map((species) => [species.id, species]),
);
export const movesById: Record<number, Move> = importedMoves;
export const struggleMove = movesById[165];
export const typeNames: Record<number, string> = importedTypeNames;
export const typeColors: Record<number, string> = {
  1: "#787663",
  2: "#bd5149",
  3: "#7b73c7",
  4: "#a04cb1",
  5: "#ad873c",
  6: "#99842f",
  7: "#708821",
  8: "#67539a",
  9: "#777b97",
  10: "#cf581e",
  11: "#3975c9",
  12: "#44843b",
  13: "#aa8508",
  14: "#cf4675",
  15: "#328a91",
  16: "#7751ce",
  17: "#665242",
  18: "#b95e95",
};

export function spriteUrl(speciesId: number): string {
  return `/pokemon-marble/sprites/${speciesId}.png`;
}

export function isStarter(species: Species): boolean {
  return (
    species.evolvesFrom === null && !species.legendary && !species.mythical
  );
}

export function typeEffectiveness(
  moveType: number | null,
  defenderTypes: number[],
): number {
  if (moveType === null) return 1;
  return defenderTypes.reduce(
    (factor, type) =>
      factor * (importedTypeEffectiveness[moveType]?.[type] ?? 1),
    1,
  );
}

/** Keep strong attacks diverse; contextual availability and Struggle belong to battle.ts. */
export function getAvailableMoves(speciesId: number, level: number): Move[] {
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
