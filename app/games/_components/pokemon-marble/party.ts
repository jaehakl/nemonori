import type { Pokemon } from "./types";

/** Sorting a view must not change the saved party order or evolution queues. */
export function sortPartyByLevel(party: readonly Pokemon[]): Pokemon[] {
  return [...party].sort((left, right) => right.level - left.level);
}

/** Ties retain the party's existing order, including fainted members. */
export function getPartyLeader(party: readonly Pokemon[]): Pokemon | undefined {
  return party.reduce<Pokemon | undefined>(
    (leader, pokemon) => !leader || pokemon.level > leader.level ? pokemon : leader,
    undefined,
  );
}
