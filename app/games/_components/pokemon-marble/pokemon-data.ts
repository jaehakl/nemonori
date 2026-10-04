import type { Move, Species } from "./data-types";
import type { Pokemon } from "./types";
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

export const MOVE_SLOT_LIMIT = 4;
/** Preserve the automatic loadout used by v2–v4 saves. */
export const LEGACY_MOVE_SLOT_LIMIT = 3;

/** The newest learned moves fill four slots, ordered from oldest to newest. */
export function getAvailableMoves(speciesId: number, level: number, slotLimit: 3 | 4 = MOVE_SLOT_LIMIT): Move[] {
  return getLearnableMoves(speciesId, level).slice(-slotLimit);
}

/** Preserve learning order without adding a duplicate or changing the input. */
export function learnMove(moveIds: number[], moveId: number): number[] {
  if (moveIds.includes(moveId)) return [...moveIds];
  return [...moveIds, moveId].slice(-MOVE_SLOT_LIMIT);
}

/** Learning order is stable even when several levels are gained at once. */
export function getLearnableMoves(speciesId: number, level: number): Move[] {
  return (speciesById[speciesId]?.learnset ?? [])
    .filter((entry) => entry.level <= level)
    .toSorted((left, right) => left.level - right.level || left.moveId - right.moveId)
    .map((entry) => movesById[entry.moveId])
    .filter((move): move is Move => Boolean(move) && move.effects.support !== "excluded" && move.id !== 165);
}

export function getPokemonMoves(pokemon: Pokemon): Move[] {
  return pokemon.moveIds.map((id) => movesById[id]);
}
