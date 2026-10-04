import { getStats } from "./battle";
import { BOARD_SIZE, BOARD_TILES } from "./board";
import { speciesById, movesById, isStarter, getAvailableMoves, getLearnableMoves } from "./pokemon-data";
import type { GameState, Pokemon } from "./types";
import { XP_PER_LEVEL } from "./progression";
import { parseLegacyGameSave } from "./save-legacy";
import { BOARD_TILES as LEGACY_BOARD_TILES } from "./save-legacy-board";
import { validateCombat, validateBattleAction, validateMoveIds } from "./combat-save";

const phases = new Set([
  "roll",
  "rest-roll",
  "rest-end",
  "moving",
  "choose-defender",
  "choose-attacker",
  "attack",
  "evolution",
  "learn-move",
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
  "learn-move",
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
    value.version !== 5 ||
    !integer(value.revision) ||
    !integer(value.rng, 1, 0xffffffff) ||
    !integer(value.nextPokemonId, 1) ||
    !integer(value.turn, 1) ||
    !phases.has(value.phase as string)
  )
    return false;
  if (value.lastBattleAction !== null && !validateBattleAction(value.lastBattleAction)) return false;
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
      !integer(candidate.hp, 0) ||
      !validateMoveIds(candidate.moveIds)
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
      if (BOARD_TILES[player.position] !== "center")
        return false;
    } else if (!hasHealthyPokemon) {
      // Rescue follows the winner's branching evolution, before play continues.
      if (value.phase !== "evolution" && value.phase !== "learn-move") return false;
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

  if (active.restTurnsRemaining > 0 && !["turn-end", "rest-roll", "rest-end"].includes(state.phase))
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
    ["roll", "rest-roll"].includes(state.phase) &&
    (state.dice !== null || state.movement !== null)
  )
    return false;
  if (![null, "movement", "rest"].includes(state.dicePurpose)) return false;
  if ((state.dice === null) !== (state.dicePurpose === null)) return false;
  if (state.phase === "roll" && active.restTurnsRemaining !== 0) return false;
  if (state.phase === "rest-roll" && active.restTurnsRemaining === 0) return false;
  if (state.phase === "rest-end" &&
    (state.dicePurpose !== "rest" || !state.dice || state.dice[0] === state.dice[1] ||
      state.movement !== null || BOARD_TILES[active.position] !== "center" ||
      active.restTurnsRemaining > 2 ||
      (active.restTurnsRemaining === 0 && [...active.party, ...active.box].some(
        (pokemon) => pokemon.hp !== getStats(pokemon).hp,
      )))) return false;
  if (state.dicePurpose === "rest" && state.phase !== "rest-end" &&
    (!state.dice || state.dice[0] !== state.dice[1])) return false;
  if (!["roll", "rest-roll"].includes(state.phase) && state.dice === null &&
    !(state.phase === "turn-end" && active.restTurnsRemaining > 0)) return false;
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

  // Every reward is already committed; this queue stores only unresolved choices.
  if (state.lapGrowth !== undefined && state.lapGrowth !== null) return false;
  const growth = state.growth;
  const choosingGrowth = state.phase === "learn-move" || state.phase === "evolution";
  if (choosingGrowth !== (growth !== null)) return false;
  if (growth !== null) {
    if (!record(growth) || !["battle", "movement"].includes(growth.resume) ||
      !Array.isArray(growth.queue) || growth.queue.length < 1 ||
      (growth.legacyPartyOnly !== undefined && growth.legacyPartyOnly !== true)) return false;
    const queuedIds = new Set<string>();
    for (const item of growth.queue) {
      if (!record(item) || !integer(item.ownerId, 0, state.players.length - 1) ||
        typeof item.pokemonId !== "string" || queuedIds.has(item.pokemonId) ||
        !validLearningList(item.pendingMoveIds) || !validLearningList(item.consideredMoveIds)) return false;
      const learner = ownedPokemon.get(item.pokemonId);
      if (!learner || learner.ownerId !== item.ownerId ||
        !["party", "road"].includes(learner.location) ||
        item.pendingMoveIds.some((id) => !item.consideredMoveIds.includes(id) || learner.pokemon.moveIds.includes(id))) return false;
      const pokemon = learner.pokemon;
      const eligible = getLearnableMoves(pokemon.speciesId, pokemon.level).map((move) => move.id);
      const required = [...eligible, ...pokemon.moveIds];
      if (required.some((id) => !item.consideredMoveIds.includes(id))) return false;
      const inherited = new Set(pokemon.moveIds);
      let speciesId: number | null = pokemon.speciesId;
      const ancestors = new Set<number>();
      while (speciesId !== null && !ancestors.has(speciesId)) {
        ancestors.add(speciesId);
        for (const move of getLearnableMoves(speciesId, pokemon.level)) inherited.add(move.id);
        speciesId = speciesById[speciesId]?.evolvesFrom ?? null;
      }
      if (item.consideredMoveIds.some((id) => !inherited.has(id))) return false;
      if (item.pendingMoveIds.some((id, index) => {
        const position = eligible.indexOf(id);
        return position < 0 || (index > 0 && position <= eligible.indexOf(item.pendingMoveIds[index - 1]));
      })) return false;
      queuedIds.add(item.pokemonId);
    }
    const first = growth.queue[0];
    const learner = ownedPokemon.get(first.pokemonId)!;
    if (state.phase === "learn-move") {
      if (state.evolution !== null || first.pendingMoveIds.length < 1 || learner.pokemon.moveIds.length !== 3) return false;
    } else if (first.pendingMoveIds.length !== 0 ||
      !matchesEvolution(state.evolution, learner.pokemon, first.ownerId)) return false;
    if (growth.resume === "movement") {
      if (state.battle !== null || active.position !== 0 || !state.movement || pendingRecovery.length > 0) return false;
      const recipients = growth.legacyPartyOnly ? active.party : [
        ...active.party,
        ...state.roads.flatMap((guardian) => guardian?.ownerId === active.id ? [guardian.pokemon] : []),
      ];
      const firstIndex = recipients.findIndex((pokemon) => pokemon.id === first.pokemonId);
      const remaining = recipients.slice(firstIndex);
      return firstIndex >= 0 && remaining.length === growth.queue.length &&
        remaining.every((pokemon, index) => growth.queue[index].ownerId === active.id && growth.queue[index].pokemonId === pokemon.id);
    }
    if (growth.legacyPartyOnly !== undefined || growth.queue.length !== 1) return false;
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
  if (!validateCombat(battle.combat)) return false;
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
      !["evolution", "learn-move"].includes(state.phase) || battle.turn !== "attacker" ||
      attacker!.pokemon.hp <= 0 || defender!.pokemon.hp <= 0 ||
      active.party.length >= 6 || pendingRecovery.length > 0 ||
      growth?.queue[0].ownerId !== active.id || growth?.queue[0].pokemonId !== attacker!.pokemon.id
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
    if (state.phase === "evolution" || state.phase === "learn-move") {
      if (
        winner.ownerId === null || growth?.queue[0].ownerId !== winner.ownerId ||
        growth?.queue[0].pokemonId !== winner.pokemon.id
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
      (!movesById[last.moveId] && !(last.moveId === 0 && last.legacy === true)) ||
      !integer(last.damage, 0, 1000000) ||
      ![0, 0.125, 0.25, 0.5, 1, 2, 4, 8].includes(last.effectiveness) ||
      (last.result !== undefined && !validateBattleAction(last.result)) ||
      (last.result === undefined && last.legacy !== true)
    )
      return false;
  }
  return true;
}

function validLearningList(value: unknown): value is number[] {
  return Array.isArray(value) && value.length <= Object.keys(movesById).length &&
    new Set(value).size === value.length && value.every((id) =>
      integer(id, 1) && !!movesById[id] && id !== 165 && movesById[id].effects.support !== "excluded",
    );
}

/** Match old and new cells by kind and order, preserving guardians and encounters. */
export function getLegacyTileMapping(): number[] {
  const mapping: number[] = [];
  for (const kind of ["center", "grass", "road"] as const) {
    const oldTiles = LEGACY_BOARD_TILES.flatMap((tileKind, tile) => tileKind === kind ? [tile] : []);
    const newTiles = BOARD_TILES.flatMap((tileKind, tile) => tileKind === kind ? [tile] : []);
    oldTiles.forEach((tile, index) => { mapping[tile] = newTiles[index]; });
  }
  return mapping;
}

export function parseGameSave(value: unknown): GameState | null {
  if (validateSave(value)) return structuredClone(value);
  const legacy = parseLegacyGameSave(value);
  if (!legacy) return null;
  const mapping = getLegacyTileMapping();
  const withMoves = (pokemon: Omit<Pokemon, "moveIds">): Pokemon => ({
    ...pokemon,
    moveIds: getAvailableMoves(pokemon.speciesId, pokemon.level).map((move) => move.id),
  });
  const migrated: GameState = {
    ...legacy,
    version: 5,
    dicePurpose: legacy.dice ? "movement" : null,
    growth: null,
    lapGrowth: null,
    log: [...legacy.log.slice(-23), "저장한 모험을 새 보드 배치로 업데이트했습니다. 위치와 수비 포켓몬은 같은 종류의 칸 순서에 맞췄습니다."],
    players: legacy.players.map((player) => ({
      ...player,
      position: mapping[player.position],
      party: player.party.map(withMoves),
      box: player.box.map(withMoves),
    })),
    roads: Array.from({ length: BOARD_SIZE }, () => null),
    battle: legacy.battle ? {
      ...legacy.battle,
      wild: legacy.battle.wild ? withMoves(legacy.battle.wild) : null,
      combat: {
        ...legacy.battle.combat,
        delayed: legacy.battle.combat.delayed.map((entry) => ({ ...entry, pokemon: withMoves(entry.pokemon) })),
      },
    } : null,
  };
  legacy.roads.forEach((guardian, tile) => {
    if (guardian) migrated.roads[mapping[tile]] = { ...guardian, pokemon: withMoves(guardian.pokemon) };
  });
  if (legacy.evolution) {
    const ownerId = legacy.evolution.ownerId;
    const ids = [legacy.evolution.pokemonId, ...(legacy.lapGrowth?.remainingPokemonIds ?? [])];
    const owned = [
      ...migrated.players[ownerId].party,
      ...migrated.roads.flatMap((guardian) => guardian?.ownerId === ownerId ? [guardian.pokemon] : []),
    ];
    migrated.growth = {
      resume: legacy.lapGrowth ? "movement" : "battle",
      ...(legacy.lapGrowth?.legacyPartyOnly ? { legacyPartyOnly: true as const } : {}),
      queue: ids.map((pokemonId) => {
        const pokemon = owned.find((entry) => entry.id === pokemonId)!;
        return { ownerId, pokemonId, pendingMoveIds: [],
          consideredMoveIds: [...new Set(getLearnableMoves(pokemon.speciesId, pokemon.level).map((move) => move.id))],
        };
      }),
    };
  }
  return validateSave(migrated) ? migrated : null;
}
