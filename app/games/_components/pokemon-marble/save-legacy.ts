import { getStats } from "./battle";
import { BOARD_SIZE, BOARD_TILES } from "./save-legacy-board";
import { speciesById, movesById, isStarter } from "./pokemon-data";
import type { GameState, Pokemon } from "./save-legacy-types";
import { XP_PER_LEVEL } from "./progression";
import { validateV2Save } from "./save-v2";
import { createCombatState } from "./combat-types";
import { validateCombat, validateBattleAction } from "./combat-save";

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
export function validateLegacySave(value: unknown): value is GameState {
  try {
    return validate(value);
  } catch {
    return false;
  }
}

function validate(value: unknown, legacy = false): value is GameState {
  if (
    !record(value) ||
    value.version !== (legacy ? 3 : 4) ||
    !integer(value.revision) ||
    !integer(value.rng, 1, 0xffffffff) ||
    !integer(value.nextPokemonId, 1) ||
    !integer(value.turn, 1) ||
    !phases.has(value.phase as string)
  )
    return false;
  if (!legacy && value.lastBattleAction !== null && !validateBattleAction(value.lastBattleAction)) return false;
  if (
    !Array.isArray(value.players) ||
    value.players.length < 1 ||
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
      !integer(candidate.xp, 0, candidate.level === 100 ? 0 : XP_PER_LEVEL - 1) ||
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

  // All rewards were committed before this queue; only evolution remains.
  if (state.lapGrowth !== undefined && state.lapGrowth !== null) {
    const growth = state.lapGrowth;
    const evolution = state.evolution;
    if (
      !record(growth) ||
      !Array.isArray(growth.remainingPokemonIds) ||
      (growth.legacyPartyOnly !== undefined && growth.legacyPartyOnly !== true) ||
      state.phase !== "evolution" ||
      state.battle !== null ||
      active.position !== 0 ||
      !state.movement ||
      pendingRecovery.length > 0 ||
      !record(evolution)
    )
      return false;
    const recipients = growth.legacyPartyOnly
      ? active.party
      : [...active.party, ...state.roads.flatMap((guardian) =>
          guardian?.ownerId === active.id ? [guardian.pokemon] : [],
        )];
    const currentIndex = recipients.findIndex(
      (pokemon) => pokemon.id === evolution.pokemonId,
    );
    if (
      currentIndex < 0 ||
      !matchesEvolution(evolution, recipients[currentIndex], active.id)
    )
      return false;
    const remaining = recipients.slice(currentIndex + 1);
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
    !state.movement
  )
    return false;
  const outcome = battle.outcome;
  if (!legacy && !validateCombat(battle.combat, true)) return false;
  if (outcome !== null) {
    if (!record(outcome) || !["knockout", "capture"].includes(outcome.kind)) return false;
    if (outcome.kind === "knockout") {
      if (!["attacker", "defender"].includes(outcome.winner)) return false;
      if (outcome.legacyCapturePending !== undefined &&
        (outcome.legacyCapturePending !== true || battle.kind !== "wild" || outcome.winner !== "attacker"))
        return false;
    } else if (battle.kind !== "wild" || "winner" in outcome || "legacyCapturePending" in outcome) return false;
  }
  const knockoutWinner = outcome?.kind === "knockout" ? outcome.winner : null;
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
    if (knockoutWinner === "attacker") {
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
    if (outcome !== null || state.evolution !== null) return false;
    if (
      state.phase === "attack" &&
      (attacker!.pokemon.hp <= 0 || defender!.pokemon.hp <= 0)
    )
      return false;
  } else if (outcome?.kind === "capture") {
    if (
      state.phase !== "evolution" || battle.turn !== "attacker" ||
      attacker!.pokemon.hp <= 0 || defender!.pokemon.hp <= 0 ||
      active.party.length >= 6 || pendingRecovery.length > 0 ||
      !matchesEvolution(state.evolution, attacker!.pokemon, active.id)
    ) return false;
  } else {
    if (
      knockoutWinner === null ||
      battle.turn !== knockoutWinner ||
      battle.lastAttack === null
    )
      return false;
    const winner = knockoutWinner === "attacker" ? attacker! : defender!;
    const loser = knockoutWinner === "attacker" ? defender! : attacker!;
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
        knockoutWinner !== "attacker" ||
        outcome?.kind !== "knockout" || !outcome.legacyCapturePending ||
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
      (!movesById[last.moveId] && !(last.moveId === 0 && (legacy || last.legacy === true))) ||
      !integer(last.damage, legacy ? 1 : 0, 1000000) ||
      ![0, 0.125, 0.25, 0.5, 1, 2, 4, 8].includes(last.effectiveness) ||
      (!legacy && last.result !== undefined && !validateBattleAction(last.result)) ||
      (!legacy && last.result === undefined && last.legacy !== true)
    )
      return false;
  }
  return true;
}

export function parseLegacyGameSave(value: unknown): GameState | null {
  if (validateLegacySave(value)) return structuredClone(value);
  try {
    if (validate(value, true)) {
      const migrated = structuredClone(value);
      migrated.version = 4;
      migrated.lastBattleAction = null;
      if (migrated.battle) {
        migrated.battle.combat = createCombatState();
        if (migrated.battle.lastAttack) migrated.battle.lastAttack.legacy = true;
      }
      return validateLegacySave(migrated) ? migrated : null;
    }
  } catch { return null; }
  if (!validateV2Save(value)) return null;
  const legacy = structuredClone(value);
  const withExperience = (pokemon: Omit<Pokemon, "xp">): Pokemon => ({ ...pokemon, xp: 0 });
  const battle = legacy.battle;
  const migrated: GameState = {
    ...legacy,
    version: 4,
    lastBattleAction: null,
    players: legacy.players.map((player) => ({
      ...player,
      party: player.party.map(withExperience),
      box: player.box.map(withExperience),
    })),
    roads: legacy.roads.map((guardian) => guardian
      ? { ...guardian, pokemon: withExperience(guardian.pokemon) } : null),
    lapGrowth: legacy.lapGrowth
      ? { ...legacy.lapGrowth, legacyPartyOnly: true } : null,
    battle: battle ? {
      kind: battle.kind,
      defenderOwner: battle.defenderOwner,
      defenderPokemonId: battle.defenderPokemonId,
      attackerPokemonId: battle.attackerPokemonId,
      wild: battle.wild ? withExperience(battle.wild) : null,
      turn: battle.turn,
      lastAttack: battle.lastAttack ? { ...battle.lastAttack, legacy: true } : null,
      combat: createCombatState(),
      outcome: battle.winner === null ? null : {
        kind: "knockout",
        winner: battle.winner,
        ...(battle.kind === "wild" && battle.winner === "attacker"
          ? { legacyCapturePending: true as const } : {}),
      },
    } : null,
  };
  return validateLegacySave(migrated) ? migrated : null;
}
