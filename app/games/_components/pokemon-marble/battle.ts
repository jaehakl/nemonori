import {
  speciesById as byId,
  movesById,
  typeEffectiveness,
} from "./pokemon-data";
import type { Move } from "./pokemon-data";
import type { Pokemon } from "./types";

/** No IVs, EVs or natures: all players use the same species and level formula. */
export function getStats(pokemon: Pick<Pokemon, "speciesId" | "level">) {
  const base = byId[pokemon.speciesId].stats;
  const stat = (value: number) =>
    Math.floor((2 * value * pokemon.level) / 100) + 5;
  return {
    hp: Math.floor((2 * base.hp * pokemon.level) / 100) + pokemon.level + 10,
    attack: stat(base.attack),
    defense: stat(base.defense),
    specialAttack: stat(base.specialAttack),
    specialDefense: stat(base.specialDefense),
    speed: stat(base.speed),
  };
}

export function getDamagePreview(
  attacker: Pokemon,
  defender: Pokemon,
  moveOrId: Move | number,
) {
  const move = typeof moveOrId === "number" ? movesById[moveOrId] : moveOrId;
  const attackStats = getStats(attacker);
  const defenseStats = getStats(defender);
  const special = move.category === "special";
  const offense = special ? attackStats.specialAttack : attackStats.attack;
  const defense = special ? defenseStats.specialDefense : defenseStats.defense;
  const effectiveness = typeEffectiveness(
    move.type,
    byId[defender.speciesId].types,
  );
  const stab =
    move.type !== null && byId[attacker.speciesId].types.includes(move.type)
      ? 1.5
      : 1;
  const levelFactor = Math.floor((2 * attacker.level) / 5) + 2;
  const baseDamage =
    Math.floor(
      Math.floor((levelFactor * move.power * offense) / defense) / 50,
    ) + 2;
  const damage =
    effectiveness === 0
      ? 0
      : Math.max(1, Math.floor(baseDamage * stab * effectiveness));
  return {
    damage,
    effectiveness,
    stab,
    category: move.category,
    power: move.power,
  };
}

export function calculateDamage(
  attacker: Pokemon,
  defender: Pokemon,
  moveOrId: Move | number,
): number {
  return getDamagePreview(attacker, defender, moveOrId).damage;
}
