import { getStats } from "./battle";
import { BOARD_SIZE, BOARD_TILES } from "./board";
import { speciesById, movesById, isStarter } from "./pokemon-data";
import type { GameState, Pokemon } from "./types";

const phases = new Set([
  "roll",
  "moving",
  "choose-defender",
  "choose-attacker",
  "attack",
  "evolution",
  "capture",
  "road",
  "center",
  "turn-end",
  "finished",
]);
const battlePhases = new Set([
  "choose-defender",
  "choose-attacker",
  "attack",
  "evolution",
  "capture",
]);
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const integer = (
  value: unknown,
  minimum = 0,
  maximum = Number.MAX_SAFE_INTEGER,
): value is number =>
  Number.isSafeInteger(value) &&
  (value as number) >= minimum &&
  (value as number) <= maximum;

function matchesEvolution(
  value: unknown,
  pokemon: Pokemon,
  ownerId: number,
): boolean {
  if (
    !record(value) ||
    value.ownerId !== ownerId ||
    value.pokemonId !== pokemon.id ||
    !Array.isArray(value.options)
  )
    return false;
  const options = value.options;
  const expected = speciesById[pokemon.speciesId].evolutions
    .filter((entry) => entry.level <= pokemon.level)
    .map((entry) => entry.speciesId);
  return (
    expected.length >= 2 &&
    expected.length === options.length &&
    expected.every((id, index) => id === options[index])
  );
}

/** Validate references and phase invariants before resuming any stored state. */
export function validateSave(value: unknown): value is GameState {
  try {
    return validate(value);
  } catch {
    return false;
  }
}

function validate(value: unknown): value is GameState {
  if (
    !record(value) ||
    value.version !== 2 ||
    !integer(value.revision) ||
    !integer(value.rng, 1, 0xffffffff) ||
    !integer(value.nextPokemonId, 1) ||
    !integer(value.turn, 1) ||
    !phases.has(value.phase as string)
  )
    return false;
  if (
    !Array.isArray(value.players) ||
    value.players.length < 2 ||
    value.players.length > 4 ||
    !integer(value.activePlayer, 0, value.players.length - 1) ||
    !Array.isArray(value.roads) ||
    value.roads.length !== BOARD_SIZE ||
    !Array.isArray(value.log) ||
    value.log.length > 24 ||
    value.log.some((line) => typeof line !== "string" || line.length > 300)
  )
    return false;

  const pokemonIds = new Set<string>();
  const ownedPokemon = new Map<
    string,
    {
      ownerId: number | null;
      pokemon: Pokemon;
      location: "party" | "box" | "road" | "wild";
    }
  >();
  const validatePokemon = (
    candidate: unknown,
    ownerId: number | null,
    location: "party" | "box" | "road" | "wild",
  ) => {
    if (
      !record(candidate) ||
      typeof candidate.id !== "string" ||
      !/^p[1-9]\d*$/.test(candidate.id) ||
      !integer(
        Number(candidate.id.slice(1)),
        1,
        (value.nextPokemonId as number) - 1,
      ) ||
      pokemonIds.has(candidate.id) ||
      !integer(candidate.speciesId, 1, 1025) ||
      !speciesById[candidate.speciesId] ||
      !integer(candidate.level, 1, 100) ||
      !integer(candidate.hp, 0)
    )
      return false;
    const pokemon = candidate as unknown as Pokemon;
    if (pokemon.hp > getStats(pokemon).hp) return false;
    pokemonIds.add(pokemon.id);
    ownedPokemon.set(pokemon.id, { ownerId, pokemon, location });
    return true;
  };

  const pendingRecovery: number[] = [];
  for (const [index, player] of value.players.entries()) {
    if (
      !record(player) ||
      player.id !== index ||
      typeof player.name !== "string" ||
      !player.name.trim() ||
      player.name.length > 30 ||
      !integer(player.position, 0, BOARD_SIZE - 1) ||
      !integer(player.starterSpeciesId, 1, 1025) ||
      !speciesById[player.starterSpeciesId] ||
      !isStarter(speciesById[player.starterSpeciesId]) ||
      !integer(player.restTurnsRemaining, 0, 3) ||
      typeof player.seatSide !== "string" ||
      !["bottom", "left", "top", "right"].includes(player.seatSide) ||
      !Array.isArray(player.party) ||
      player.party.length < 1 ||
      player.party.length > (value.exchangeActive === true && index === value.activePlayer ? 7 : 6) ||
      !Array.isArray(player.box) ||
      player.box.length > 10000 ||
      !player.party.every((pokemon) =>
        validatePokemon(pokemon, index, "party"),
      ) ||
      !player.box.every((pokemon) => validatePokemon(pokemon, index, "box"))
    )
      return false;
    const hasHealthyPokemon = player.party.some(
      (pokemon: Pokemon) => pokemon.hp > 0,
    );
    if (player.restTurnsRemaining > 0) {
      if (hasHealthyPokemon || BOARD_TILES[player.position] !== "center")
        return false;
    } else if (!hasHealthyPokemon) {
      // Rescue follows the winner's branching evolution, before play continues.
      if (value.phase !== "evolution") return false;
      pendingRecovery.push(index);
    }
  }
  const state = value as unknown as GameState;
  for (const [index, guardian] of state.roads.entries()) {
    if (guardian === null) continue;
    if (
      !record(guardian) ||
      BOARD_TILES[index] !== "road" ||
      !integer(guardian.ownerId, 0, state.players.length - 1) ||
      !validatePokemon(guardian.pokemon, guardian.ownerId, "road") ||
      guardian.pokemon.hp <= 0
    )
      return false;
  }
  const monopolyOwner =
    state.players.find((player) =>
      BOARD_TILES.every(
        (kind, tile) => kind !== "road" || state.roads[tile]?.ownerId === player.id,
      ),
    )?.id ?? null;
  if (
    state.winner !== null &&
    (!integer(state.winner, 0, state.players.length - 1) ||
      state.winner !== state.activePlayer)
  )
    return false;
  if (state.winner !== monopolyOwner) return false;
  if ((state.phase === "finished") !== (state.winner !== null))
    return false;
  const active = state.players[state.activePlayer];
  if (state.exchangeActive !== undefined && typeof state.exchangeActive !== "boolean") return false;
  if (state.exchangeActive && !["center", "road"].includes(state.phase)) return false;
  // A temporary seventh party member must be returned before leaving exchange.
  if (active.party.length === 7 && state.phase === "road" && state.roads[active.position]) return false;

  if (active.restTurnsRemaining > 0 && state.phase !== "turn-end")
    return false;

  if (
    state.dice !== null &&
    (!Array.isArray(state.dice) ||
      state.dice.length !== 2 ||
      !state.dice.every((die) => integer(die, 1, 6)))
  )
    return false;
  if (state.movement !== null) {
    const movement = state.movement;
    if (
      !record(movement) ||
      !integer(movement.remaining, 0, 12) ||
      !Array.isArray(movement.encounters) ||
      !state.dice ||
      (movement.remaining >= state.dice[0] + state.dice[1] &&
        state.phase !== "moving") ||
      new Set(movement.encounters).size !== movement.encounters.length ||
      movement.encounters.some(
        (id, index) =>
          !integer(id, 0, state.players.length - 1) ||
          id === state.activePlayer ||
          state.players[id].restTurnsRemaining > 0 ||
          state.players[id].position !== active.position ||
          (index > 0 && id <= movement.encounters[index - 1]),
      )
    )
      return false;
    if (movement.remaining > state.dice[0] + state.dice[1]) return false;
  }
  if (
    state.phase === "roll" &&
    (state.dice !== null || state.movement !== null)
  )
    return false;
  if (state.phase !== "roll" && state.dice === null) return false;
  if (state.phase === "finished" && state.movement !== null) return false;
  if (
    state.phase === "moving" &&
    (!state.movement ||
      state.movement.remaining < 1 ||
      state.movement.encounters.length > 0)
  )
    return false;
  if (
    ["center", "road", "capture"].includes(state.phase) &&
    (!state.movement ||
      state.movement.remaining !== 0 ||
      state.movement.encounters.length !== 0)
  )
    return false;
  if (
    state.phase === "turn-end" &&
    active.restTurnsRemaining === 0 &&
    (!state.movement ||
      state.movement.remaining !== 0 ||
      state.movement.encounters.length !== 0)
  )
    return false;
  if (active.restTurnsRemaining > 0 && state.movement !== null) return false;
  if (
    state.phase === "center" &&
    (BOARD_TILES[active.position] !== "center" ||
      [...active.party, ...active.box].some(
        (pokemon) => pokemon.hp !== getStats(pokemon).hp,
      ))
  )
    return false;
  if (
    state.phase === "road" &&
    (BOARD_TILES[active.position] !== "road" ||
      (state.roads[active.position] &&
        state.roads[active.position]!.ownerId !== active.id))
  )
    return false;

  // Older v2 saves have no lapGrowth field. A live queue exists only while a
  // party member's branching evolution interrupts the completed lap.
  if (state.lapGrowth !== undefined && state.lapGrowth !== null) {
    const growth = state.lapGrowth;
    const evolution = state.evolution;
    if (
      !record(growth) ||
      !Array.isArray(growth.remainingPokemonIds) ||
      state.phase !== "evolution" ||
      state.battle !== null ||
      active.position !== 0 ||
      !state.movement ||
      pendingRecovery.length > 0 ||
      !record(evolution)
    )
      return false;
    const currentIndex = active.party.findIndex(
      (pokemon) => pokemon.id === evolution.pokemonId,
    );
    if (
      currentIndex < 0 ||
      !matchesEvolution(evolution, active.party[currentIndex], active.id)
    )
      return false;
    const remaining = active.party.slice(currentIndex + 1);
    return (
      remaining.length === growth.remainingPokemonIds.length &&
      remaining.every(
        (pokemon, index) => pokemon.id === growth.remainingPokemonIds[index],
      )
    );
  }

  if (!battlePhases.has(state.phase))
    return (
      state.battle === null &&
      state.evolution === null &&
      pendingRecovery.length === 0
    );
  const battle = state.battle;
  if (
    !record(battle) ||
    !["trainer", "wild", "road"].includes(battle.kind) ||
    !["defender", "attacker"].includes(battle.turn) ||
    (battle.winner !== null &&
      !["attacker", "defender"].includes(battle.winner)) ||
    !state.movement
  )
    return false;
  if (battle.kind === "wild") {
    if (
      battle.defenderOwner !== null ||
      !validatePokemon(battle.wild, null, "wild") ||
      battle.defenderPokemonId !== battle.wild!.id ||
      BOARD_TILES[active.position] !== "grass"
    )
      return false;
  } else {
    if (
      !integer(battle.defenderOwner, 0, state.players.length - 1) ||
      battle.defenderOwner === state.activePlayer ||
      battle.wild !== null
    )
      return false;
    if (
      battle.kind === "trainer" &&
      (state.players[battle.defenderOwner].position !== active.position ||
        state.players[battle.defenderOwner].restTurnsRemaining > 0)
    )
      return false;
    if (
      battle.kind === "trainer" &&
      state.movement.encounters.includes(battle.defenderOwner)
    )
      return false;
    if (battle.kind === "road" && BOARD_TILES[active.position] !== "road")
      return false;
  }
  if (
    battle.kind !== "trainer" &&
    (state.movement.remaining !== 0 || state.movement.encounters.length !== 0)
  )
    return false;
  const attacker =
    typeof battle.attackerPokemonId === "string"
      ? ownedPokemon.get(battle.attackerPokemonId)
      : null;
  const defender =
    typeof battle.defenderPokemonId === "string"
      ? ownedPokemon.get(battle.defenderPokemonId)
      : null;
  if (
    attacker &&
    (attacker.ownerId !== state.activePlayer || attacker.location !== "party")
  )
    return false;
  if (
    defender &&
    (defender.ownerId !== battle.defenderOwner ||
      (battle.kind === "trainer" && defender.location !== "party") ||
      (battle.kind === "wild" && defender.location !== "wild"))
  )
    return false;
  if (battle.kind === "road" && defender) {
    if (battle.winner === "attacker") {
      if (defender.location !== "box" || state.roads[active.position] !== null)
        return false;
    } else if (
      defender.location !== "road" ||
      state.roads[active.position]?.pokemon.id !== defender.pokemon.id
    )
      return false;
  }
  if (state.phase === "choose-defender") {
    if (
      battle.kind !== "trainer" ||
      battle.defenderPokemonId !== null ||
      battle.attackerPokemonId !== null
    )
      return false;
  } else if (state.phase === "choose-attacker") {
    if (
      !defender ||
      defender.pokemon.hp <= 0 ||
      battle.attackerPokemonId !== null
    )
      return false;
  } else if (!attacker || !defender) return false;
  if (
    (state.phase === "choose-defender" || state.phase === "choose-attacker") &&
    (battle.turn !== "defender" || battle.lastAttack !== null)
  )
    return false;
  if (["choose-defender", "choose-attacker", "attack"].includes(state.phase)) {
    if (battle.winner !== null || state.evolution !== null) return false;
    if (
      state.phase === "attack" &&
      (attacker!.pokemon.hp <= 0 || defender!.pokemon.hp <= 0)
    )
      return false;
  } else {
    if (
      battle.winner === null ||
      battle.turn !== battle.winner ||
      battle.lastAttack === null
    )
      return false;
    const winner = battle.winner === "attacker" ? attacker! : defender!;
    const loser = battle.winner === "attacker" ? defender! : attacker!;
    if (winner.pokemon.hp <= 0 || loser.pokemon.hp !== 0) return false;
    if (
      pendingRecovery.length > 1 ||
      pendingRecovery.some(
        (ownerId) => ownerId !== loser.ownerId || loser.location !== "party",
      )
    )
      return false;
    if (
      state.phase === "capture" &&
      (battle.kind !== "wild" ||
        battle.winner !== "attacker" ||
        state.evolution !== null)
    )
      return false;
    if (state.phase === "evolution") {
      if (
        winner.ownerId === null ||
        !matchesEvolution(state.evolution, winner.pokemon, winner.ownerId)
      )
        return false;
    }
  }
  if (battle.lastAttack !== null) {
    const last = battle.lastAttack;
    if (
      !record(last) ||
      !["attacker", "defender"].includes(last.side) ||
      !integer(last.moveId) ||
      !movesById[last.moveId] ||
      !integer(last.damage, 1, 1000000) ||
      ![0.25, 0.5, 1, 2, 4].includes(last.effectiveness)
    )
      return false;
  }
  return true;
}

export function parseGameSave(value: unknown): GameState | null {
  return validateSave(value) ? structuredClone(value) : null;
}
