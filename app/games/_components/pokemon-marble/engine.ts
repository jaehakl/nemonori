import { BOARD_SIZE, BOARD_TILES, getDefaultSeatSides } from "./board";
import { getDamagePreview, getStats, getBattleMoves, getMoveUnavailableReason, getForcedMove, oppositeSide } from "./battle";
import { finishCombatRound, resolveBattleMove } from "./battle-actions";
import { createCombatState, type BattleActionResult } from "./combat-types";
import { getPartyLeader } from "./party";
import { getCaptureChance, getExperienceGrowth, getVictoryExperience } from "./progression";
import {
  speciesById as byId,
  movesById,
  isStarter,
  speciesList,
  getAvailableMoves,
  getLearnableMoves,
  MOVE_SLOT_LIMIT,
} from "./pokemon-data";
import type {
  Battle,
  BattleSide,
  GameAction,
  GameState,
  Player,
  Pokemon,
  PendingPokemonGrowth,
  SeatSide,
} from "./types";
import type {
  LapGrowthView,
  PokemonView,
  PresentationEvent,
  PresentationSnapshot,
} from "./presentation-events";

export { calculateDamage, getDamagePreview, getStats } from "./battle";

type EventDetails = Omit<
  PresentationEvent,
  "revision" | "sequence" | "snapshot" | "playerId" | "tile"
> & { playerId?: number | null; tile?: number };
type EventSink = (state: GameState, event: EventDetails) => void;

function pokemonView(pokemon: Pokemon): PokemonView {
  return { ...pokemon, moveIds: [...pokemon.moveIds], maxHp: getStats(pokemon).hp };
}

function addLog(state: GameState, message: string) {
  state.log = [...state.log.slice(-23), message];
}

function random(state: GameState, limit: number): number {
  let value = state.rng;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  state.rng = value >>> 0;
  return Math.floor((state.rng / 0x100000000) * limit);
}

function makePokemon(
  state: GameState,
  speciesId: number,
  level: number,
): Pokemon {
  const pokemon: Pokemon = {
    id: `p${state.nextPokemonId++}`,
    speciesId,
    level,
    xp: 0,
    hp: 0,
    moveIds: getAvailableMoves(speciesId, level).map((move) => move.id),
  };
  pokemon.hp = getStats(pokemon).hp;
  return pokemon;
}

export function createGame(
  starters: number[],
  names: string[],
  seed: number,
  seatSides: SeatSide[] = getDefaultSeatSides(starters.length),
): GameState {
  if (
    starters.length < 1 ||
    starters.length > 4 ||
    starters.some((id) => !byId[id] || !isStarter(byId[id]))
  ) {
    throw new Error("1~4명의 플레이어가 진화 전 일반 포켓몬을 골라야 합니다.");
  }
  if (
    seatSides.length !== starters.length ||
    seatSides.some((side) => !["bottom", "left", "top", "right"].includes(side))
  )
    throw new Error("각 플레이어의 자리 방향을 골라 주세요.");
  const state: GameState = {
    version: 5,
    revision: 0,
    rng: seed >>> 0 || 0x9e3779b9,
    nextPokemonId: 1,
    turn: 1,
    activePlayer: 0,
    players: [],
    roads: Array(BOARD_SIZE).fill(null),
    phase: "roll",
    dice: null,
    dicePurpose: null,
    movement: null,
    battle: null,
    evolution: null,
    growth: null,
    lapGrowth: null,
    winner: null,
    log: ["모험을 시작합니다. 주사위를 굴려 주세요!"],
    lastBattleAction: null,
  };
  state.players = starters.map((speciesId, id) => ({
    id,
    name: names[id]?.trim().slice(0, 30) || `플레이어 ${id + 1}`,
    position: 0,
    party: [makePokemon(state, speciesId, 5)],
    box: [],
    starterSpeciesId: speciesId,
    restTurnsRemaining: 0,
    seatSide: seatSides[id],
  }));
  return state;
}

export function getBattlePokemon(
  state: GameState,
  side: BattleSide,
): Pokemon | null {
  const battle = state.battle;
  if (!battle) return null;
  if (side === "attacker") {
    return (
      state.players[state.activePlayer].party.find(
        (pokemon) => pokemon.id === battle.attackerPokemonId,
      ) ?? null
    );
  }
  if (battle.kind === "wild") return battle.wild;
  if (battle.kind === "road") {
    const guardian = state.roads[state.players[state.activePlayer].position];
    if (guardian?.pokemon.id === battle.defenderPokemonId)
      return guardian.pokemon;
    // The defeated guardian moves to its owner's box before the winner evolves.
    return (
      state.players[battle.defenderOwner!].box.find(
        (pokemon) => pokemon.id === battle.defenderPokemonId,
      ) ?? null
    );
  }
  return (
    state.players[battle.defenderOwner!].party.find(
      (pokemon) => pokemon.id === battle.defenderPokemonId,
    ) ?? null
  );
}

/** Copy only what the shared board/battle stage needs at this exact instant. */
export function snapshotForPresentation(
  state: GameState,
): PresentationSnapshot {
  const attacker = getBattlePokemon(state, "attacker");
  const defender = getBattlePokemon(state, "defender");
  const battle = state.battle;
  return {
    phase: state.phase,
    players: state.players.map(
      ({ id, name, position, party, starterSpeciesId, restTurnsRemaining, seatSide }) => ({
        id,
        name,
        position,
        starterSpeciesId,
        leaderSpeciesId: getPartyLeader(party)?.speciesId ?? starterSpeciesId,
        restTurnsRemaining,
        seatSide,
      }),
    ),
    guardians: state.roads.flatMap((guardian, tile) =>
      guardian
        ? [
            {
              tile,
              ownerId: guardian.ownerId,
              speciesId: guardian.pokemon.speciesId,
            },
          ]
        : [],
    ),
    activePlayerId: state.winner ?? state.activePlayer,
    dice: state.dice ? [...state.dice] : null,
    dicePurpose: state.dicePurpose,
    battle: battle
      ? {
          kind: battle.kind,
          phase: state.phase,
          attacker: attacker ? pokemonView(attacker) : null,
          defender: defender ? pokemonView(defender) : null,
          attackerName: state.players[state.activePlayer].name,
          defenderName:
            battle.defenderOwner === null
              ? "야생 포켓몬"
              : state.players[battle.defenderOwner].name,
          turn: battle.turn,
          outcome: battle.outcome ? { ...battle.outcome } : null,
          combat: structuredClone(battle.combat),
        }
      : null,
  };
}

export function getActingPlayer(state: GameState): number | null {
  if (state.phase === "learn-move") return state.growth!.queue[0].ownerId;
  if (state.phase === "evolution") return state.evolution!.ownerId;
  if (state.phase === "choose-defender") return state.battle!.defenderOwner;
  if (state.phase === "attack" && state.battle!.turn === "defender")
    return state.battle!.defenderOwner;
  return state.activePlayer;
}

function startBattle(
  state: GameState,
  kind: Battle["kind"],
  defenderOwner: number | null,
  pokemon: Pokemon | null,
  events?: EventSink,
) {
  state.battle = {
    kind,
    defenderOwner,
    defenderPokemonId: pokemon?.id ?? null,
    attackerPokemonId: null,
    wild: kind === "wild" ? pokemon : null,
    turn: "defender",
    outcome: null,
    lastAttack: null,
    combat: createCombatState(),
  };
  state.phase = kind === "trainer" ? "choose-defender" : "choose-attacker";
  const opponent =
    kind === "wild"
      ? `야생 ${byId[pokemon!.speciesId].name}`
      : state.players[defenderOwner!].name;
  addLog(
    state,
    `${opponent}${kind === "road" ? "의 도로 수비" : ""}와 배틀! 상대가 선공합니다.`,
  );
  events?.(state, {
    kind: "encounter",
    playerId: defenderOwner,
    message: `${opponent}${kind === "road" ? "의 도로 수비" : ""}와 배틀!`,
    ...(pokemon
      ? { pokemon: pokemonView(pokemon), side: "defender" as const }
      : {}),
  });
}

// Only base species appear; stronger and legendary base species remain rare.
const wildPools = [
  speciesList.filter(
    (species) =>
      !species.legendary &&
      !species.mythical &&
      Object.values(species.stats).reduce((a, b) => a + b, 0) < 500 &&
      species.evolvesFrom === null,
  ),
  speciesList.filter(
    (species) =>
      !species.legendary &&
      !species.mythical &&
      Object.values(species.stats).reduce((a, b) => a + b, 0) >= 500 &&
      species.evolvesFrom === null,
  ),
  speciesList.filter((species) => species.evolvesFrom === null && (species.legendary || species.mythical)),
];

function healPlayer(player: Player) {
  for (const pokemon of [...player.party, ...player.box])
    pokemon.hp = getStats(pokemon).hp;
}

function arrive(state: GameState, events?: EventSink) {
  const player = state.players[state.activePlayer];
  const tile = BOARD_TILES[player.position];
  if (tile === "center") {
    healPlayer(player);
    state.phase = "center";
    addLog(state, `${player.name}의 파티와 박스를 모두 회복했습니다.`);
    events?.(state, {
      kind: "heal",
      message: `${player.name}의 포켓몬이 모두 회복했습니다!`,
    });
  } else if (tile === "grass") {
    const roll = random(state, 100);
    const pool = wildPools[roll < 90 ? 0 : roll < 99 ? 1 : 2];
    const species = pool[random(state, pool.length)];
    const levels = player.party.filter((pokemon) => pokemon.hp > 0).map((pokemon) => pokemon.level);
    const maximum = Math.max(1, Math.max(...levels) - random(state, 3));
    // A single-level party can still encounter opponents up to two levels below it.
    const minimum = Math.min(Math.min(...levels), maximum);
    const level = minimum + random(state, maximum - minimum + 1);
    startBattle(
      state,
      "wild",
      null,
      makePokemon(state, species.id, level),
      events,
    );
  } else {
    const guardian = state.roads[player.position];
    if (guardian && guardian.ownerId !== player.id)
      startBattle(state, "road", guardian.ownerId, guardian.pokemon, events);
    else state.phase = "road";
  }
}

function continueMovement(state: GameState, events?: EventSink) {
  const player = state.players[state.activePlayer];
  if (player.restTurnsRemaining > 0) {
    state.phase = "turn-end";
    state.movement = null;
    return;
  }
  const movement = state.movement!;
  // Older saves may contain encounters collected while passing a tile.
  if (movement.remaining > 0) movement.encounters = [];
  while (movement.encounters.length > 0) {
    const opponent = state.players[movement.encounters.shift()!];
    if (
      opponent.restTurnsRemaining === 0 &&
      opponent.position === player.position
    ) {
      startBattle(state, "trainer", opponent.id, null, events);
      return;
    }
  }
  if (movement.remaining > 0) state.phase = "moving";
  else arrive(state, events);
}

/** A transfer always goes forward, including when already at a center. */
export function getNextCenter(position: number): number {
  for (let distance = 1; distance <= BOARD_SIZE; distance++) {
    const tile = (position + distance) % BOARD_SIZE;
    if (BOARD_TILES[tile] === "center") return tile;
  }
  return 0;
}

export function canMoveToCenter(state: GameState): boolean {
  const player = state.players[state.activePlayer];
  return ["roll", "road", "center", "turn-end"].includes(state.phase) &&
    !state.exchangeActive && !state.battle && !state.growth && !state.evolution &&
    player.restTurnsRemaining === 0 && player.party.length <= 6;
}

function moveToCenter(state: GameState, player: Player, voluntary: boolean, events?: EventSink) {
  const fromTile = player.position;
  player.position = getNextCenter(fromTile);
  player.restTurnsRemaining = 3;
  if (player.id === state.activePlayer) {
    state.dice = null;
    state.dicePurpose = null;
    state.movement = null;
  }
  const message = voluntary
    ? `${player.name}, 앞의 포켓몬센터로 이동합니다. 다음 자기 차례 3번 동안 휴식하며 더블로 탈출할 수 있습니다.`
    : `${player.name}의 파티가 모두 행동불능입니다. 앞의 포켓몬센터에서 3턴 쉬며 더블로 탈출할 수 있습니다.`;
  addLog(state, message);
  events?.(state, { kind: "rescue", playerId: player.id, tile: player.position, fromTile, message });
}

function rescueDefeatedPlayers(state: GameState, events?: EventSink) {
  for (const player of state.players) {
    if (
      player.restTurnsRemaining === 0 &&
      !player.party.some((pokemon) => pokemon.hp > 0)
    ) {
      moveToCenter(state, player, false, events);
    }
  }
}

function finishBattle(state: GameState, events?: EventSink) {
  const battle = state.battle!;
  state.evolution = null;
  if (battle.outcome?.kind === "capture") {
    const player = state.players[state.activePlayer];
    player.party.push(battle.wild!);
    state.battle = null;
    state.phase = "turn-end";
    return;
  }
  const knockout = battle.outcome?.kind === "knockout" ? battle.outcome : null;
  if (battle.kind === "road") {
    const defender = getBattlePokemon(state, "defender")!;
    defender.hp = getStats(defender).hp;
    const message = knockout?.winner === "defender"
      ? `${byId[defender.speciesId].name}, 수비에 성공하고 체력을 모두 회복했습니다!`
      : `${byId[defender.speciesId].name}, 박스로 돌아가 체력을 모두 회복했습니다.`;
    addLog(state, message);
    events?.(state, {
      kind: "heal",
      playerId: battle.defenderOwner,
      side: "defender",
      pokemon: pokemonView(defender),
      message,
    });
  }
  // Keep the defeated Pokemon and battlefield intact until branching evolution ends.
  state.battle = null;
  rescueDefeatedPlayers(state, events);
  if (state.players[state.activePlayer].restTurnsRemaining > 0) {
    state.phase = "turn-end";
    state.movement = null;
    return;
  }
  if (battle.kind === "wild" && knockout?.winner === "attacker" && knockout.legacyCapturePending) {
    state.battle = battle;
    state.phase = "capture";
    return;
  }
  if (battle.kind === "trainer") continueMovement(state, events);
  else
    state.phase =
      battle.kind === "road" && knockout?.winner === "attacker"
        ? "road"
        : "turn-end";
}

function evolve(
  state: GameState,
  pokemon: Pokemon,
  speciesId: number,
  ownerId: number,
  events?: EventSink,
) {
  const previousSpeciesId = pokemon.speciesId;
  const previous = byId[pokemon.speciesId].name;
  pokemon.speciesId = speciesId;
  // Evolution can lower a species' HP; clamp without granting any healing.
  pokemon.hp = Math.min(pokemon.hp, getStats(pokemon).hp);
  addLog(
    state,
    `${previous}이(가) ${byId[speciesId].name}(으)로 진화했습니다!`,
  );
  events?.(state, {
    kind: "evolution",
    playerId: ownerId,
    pokemon: pokemonView(pokemon),
    previousSpeciesId,
    message: `${previous} → ${byId[speciesId].name}!`,
  });
}

function findOwnedPokemon(
  state: GameState,
  ownerId: number,
  pokemonId: string,
) {
  const owner = state.players[ownerId];
  return (
    [...owner.party, ...owner.box].find(
      (pokemon) => pokemon.id === pokemonId,
    ) ??
    state.roads.find(
      (guardian) =>
        guardian?.ownerId === ownerId && guardian.pokemon.id === pokemonId,
    )?.pokemon
  );
}

function createGrowthRecipient(pokemon: Pokemon, ownerId: number, previousLevel: number): PendingPokemonGrowth {
  const earlier = new Set(getLearnableMoves(pokemon.speciesId, previousLevel).map((move) => move.id));
  const eligible = getLearnableMoves(pokemon.speciesId, pokemon.level).map((move) => move.id);
  return {
    ownerId,
    pokemonId: pokemon.id,
    pendingMoveIds: eligible.filter((id) => !earlier.has(id) && !pokemon.moveIds.includes(id)),
    consideredMoveIds: [...new Set([...eligible, ...pokemon.moveIds])],
  };
}

function queueEvolutionMoves(pokemon: Pokemon, growth: PendingPokemonGrowth) {
  for (const move of getLearnableMoves(pokemon.speciesId, pokemon.level)) {
    if (growth.consideredMoveIds.includes(move.id)) continue;
    growth.consideredMoveIds.push(move.id);
    if (!pokemon.moveIds.includes(move.id)) growth.pendingMoveIds.push(move.id);
  }
}

/** One queue owns all post-reward choices, so resuming never grants XP twice. */
function continueGrowth(state: GameState, events?: EventSink) {
  const growth = state.growth!;
  state.evolution = null;
  while (growth.queue.length > 0) {
    const current = growth.queue[0];
    const pokemon = findOwnedPokemon(state, current.ownerId, current.pokemonId)!;
    while (current.pendingMoveIds.length > 0) {
      const moveId = current.pendingMoveIds[0];
      if (pokemon.moveIds.includes(moveId)) {
        current.pendingMoveIds.shift();
        continue;
      }
      if (pokemon.moveIds.length === MOVE_SLOT_LIMIT) {
        state.phase = "learn-move";
        return;
      }
      pokemon.moveIds.push(moveId);
      current.pendingMoveIds.shift();
      addLog(state, `${byId[pokemon.speciesId].name}, ${movesById[moveId].name}을(를) 배웠습니다!`);
    }
    const options = byId[pokemon.speciesId].evolutions
      .filter((entry) => pokemon.level >= entry.level)
      .map((entry) => entry.speciesId);
    if (options.length > 1) {
      state.evolution = { ownerId: current.ownerId, pokemonId: pokemon.id, options };
      state.phase = "evolution";
      return;
    }
    if (options.length === 1) {
      evolve(state, pokemon, options[0], current.ownerId, events);
      queueEvolutionMoves(pokemon, current);
      continue;
    }
    growth.queue.shift();
  }
  state.growth = null;
  state.lapGrowth = null;
  if (growth.resume === "movement") continueMovement(state, events);
  else finishBattle(state, events);
}

function grantExperience(
  state: GameState,
  pokemon: Pokemon,
  ownerId: number | null,
  opponentLevel: number,
  events?: EventSink,
) {
  const previousLevel = pokemon.level;
  const previousXp = pokemon.xp;
  const amount = getVictoryExperience(previousLevel, opponentLevel);
  Object.assign(pokemon, getExperienceGrowth(pokemon, amount));
  if (amount > 0) {
    const message = `${byId[pokemon.speciesId].name}, 경험치 +${amount}!`;
    addLog(state, message);
    events?.(state, {
      kind: "experience-gain",
      playerId: ownerId,
      pokemon: pokemonView(pokemon),
      experience: { amount, previousLevel, previousXp },
      message,
    });
  }
  if (pokemon.level > previousLevel)
    events?.(state, {
      kind: "level-up",
      playerId: ownerId,
      pokemon: pokemonView(pokemon),
      message: `${byId[pokemon.speciesId].name}, 레벨 ${pokemon.level}!`,
    });
  return amount;
}

function awardVictory(
  state: GameState,
  pokemon: Pokemon,
  ownerId: number | null,
  opponentLevel: number,
  events?: EventSink,
) {
  const previousLevel = pokemon.level;
  grantExperience(state, pokemon, ownerId, opponentLevel, events);
  if (ownerId !== null) {
    state.growth = { resume: "battle", queue: [createGrowthRecipient(pokemon, ownerId, previousLevel)] };
  }
}

function awardLapGrowth(state: GameState, events?: EventSink) {
  const player = state.players[state.activePlayer];
  const message = `${player.name}, 한 바퀴 완주! 파티와 수비 포켓몬이 경험치를 얻습니다.`;
  addLog(state, message);
  const participants = [
    ...player.party.map((pokemon) => ({ pokemon, location: { kind: "party" as const } })),
    ...state.roads.flatMap((guardian, tile) => guardian?.ownerId === player.id
      ? [{ pokemon: guardian.pokemon, location: { kind: "road" as const, tile } }]
      : []),
  ];
  state.growth = { resume: "movement", queue: [] };
  const growth: LapGrowthView[] = participants.map(({ pokemon, location }) => {
    const before = pokemonView(pokemon);
    // Apply every reward once; a single event presents them together before evolution.
    const amount = grantExperience(state, pokemon, player.id, pokemon.level);
    state.growth!.queue.push(createGrowthRecipient(pokemon, player.id, before.level));
    return { before, after: pokemonView(pokemon), amount, location };
  });
  events?.(state, { kind: "lap", message, growth });
  continueGrowth(state, events);
}

export function getBattleContext(state: GameState, side = state.battle!.turn) {
  const battle = state.battle!;
  const owner = side === "attacker" ? state.activePlayer : battle.defenderOwner;
  return { combat: battle.combat, side,
    faintedAllies: owner === null ? 0 : state.players[owner].party.filter(p => p.hp === 0).length };
}

export function getBattleCommands(state: GameState) {
  if (state.phase !== "attack" || !state.battle) return [];
  const side = state.battle.turn;
  return getBattleMoves(getBattlePokemon(state, side)!, getBattlePokemon(state, oppositeSide(side))!, getBattleContext(state));
}

export function getBattleMovePreview(state: GameState, moveId: number) {
  const side = state.battle!.turn;
  return getDamagePreview(getBattlePokemon(state, side)!, getBattlePokemon(state, oppositeSide(side))!, moveId, getBattleContext(state));
}

export function hasForcedBattleAction(state: GameState): boolean {
  return state.phase === "attack" && !!state.battle && getForcedMove(state.battle.combat[state.battle.turn]) !== null;
}

function presentBattleAction(
  state: GameState,
  result: BattleActionResult,
  events?: EventSink,
) {
  const battle = state.battle!;
  battle.lastAttack = {
    side: result.side,
    moveId: result.moveId,
    damage: result.damage,
    effectiveness: result.effectiveness,
    result,
  };
  state.lastBattleAction = structuredClone(result);
  const details =
    result.outcome === "hit"
      ? `${result.damage} 피해${result.critical ? " · 급소!" : ""}${result.healing ? ` · ${result.healing} 회복` : ""}${result.recoil ? ` · 반동 ${result.recoil}` : ""}`
      : result.message;
  addLog(state, `${result.moveName} · ${details}`);
  events?.(state, {
    kind:
      result.outcome === "hit" || result.outcome === "miss"
        ? "attack"
        : "battle-action",
    playerId:
      result.side === "attacker" ? state.activePlayer : battle.defenderOwner,
    side: result.side,
    pokemon: pokemonView(getBattlePokemon(state, result.side)!),
    message: result.message,
    attack: result,
  });
}

function attack(state: GameState, moveId: number, events?: EventSink): boolean {
  const battle = state.battle!,
    side = battle.turn;
  const attacker = getBattlePokemon(state, side)!,
    defender = getBattlePokemon(state, oppositeSide(side))!;
  const move = getBattleCommands(state).find(
    (candidate) => candidate.id === moveId,
  );
  if (!move) return false;
  if (
    !hasForcedBattleAction(state) &&
    getMoveUnavailableReason(attacker, defender, move, getBattleContext(state))
  )
    return false;
  const randomBattle = (limit: number) => random(state, limit);

  const result = resolveBattleMove(
    attacker,
    defender,
    move,
    battle.combat,
    side,
    randomBattle,
    getBattleContext(state),
  );
  presentBattleAction(state, result, events);
  finishBattleAction(state, side, events);
  return true;
}

function finishBattleAction(
  state: GameState,
  side: BattleSide,
  events?: EventSink,
) {
  const battle = state.battle!;
  const attacker = getBattlePokemon(state, side)!,
    defender = getBattlePokemon(state, oppositeSide(side))!;
  const randomBattle = (limit: number) => random(state, limit);
  if (battle.combat[side].throatChop > 0) battle.combat[side].throatChop -= 1;
  const fighters = {
    attacker: getBattlePokemon(state, "attacker")!,
    defender: getBattlePokemon(state, "defender")!,
  };
  if (attacker.hp > 0 && defender.hp > 0 && side === "attacker") {
    const due = battle.combat.delayed.filter(
      (entry) => entry.dueRound <= battle.combat.round,
    );
    battle.combat.delayed = battle.combat.delayed.filter(
      (entry) => entry.dueRound > battle.combat.round,
    );
    for (const entry of due) {
      // A scheduled attack still lands if its original user fell to another
      // round-end effect. Judge the round only after both sides have resolved.
      if (!fighters[oppositeSide(entry.side)].hp) continue;
      const liveSource = battle.combat[entry.side];
      battle.combat[entry.side] = structuredClone(entry.combatant);
      const delayed = resolveBattleMove(
        structuredClone(entry.pokemon),
        fighters[oppositeSide(entry.side)],
        movesById[entry.moveId],
        battle.combat,
        entry.side,
        randomBattle,
        getBattleContext(state, entry.side),
        true,
      );
      battle.combat[entry.side] = liveSource;
      delayed.sourceBeforeHp = delayed.sourceAfterHp = fighters[entry.side].hp;
      presentBattleAction(state, delayed, events);
    }
    // Residuals and due attacks belong to the same round-end outcome.
    finishCombatRound(fighters, battle.combat, (effect) => {
      state.lastBattleAction?.changes.push({
        side: effect.side,
        message: effect.message,
      });
      events?.(state, {
        kind: "battle-effect",
        side: effect.side,
        message: effect.message,
        effect,
      });
      addLog(state, effect.message);
    });
  }
  if (fighters.attacker.hp > 0 && fighters.defender.hp > 0) {
    battle.turn = oppositeSide(side);
    return true;
  }
  const winner =
    fighters.attacker.hp > 0
      ? "attacker"
      : fighters.defender.hp > 0
        ? "defender"
        : null;
  battle.outcome = winner ? { kind: "knockout", winner } : { kind: "draw" };
  for (const lostSide of ["defender", "attacker"] as const) {
    if (fighters[lostSide].hp > 0) continue;
    events?.(state, {
      kind: "faint",
      side: lostSide,
      playerId:
        lostSide === "attacker" ? state.activePlayer : battle.defenderOwner,
      pokemon: pokemonView(fighters[lostSide]),
      message: `${byId[fighters[lostSide].speciesId].name}, 잠시 쉬어요!`,
    });
  }
  if (battle.kind === "road" && fighters.defender.hp === 0) {
    state.players[battle.defenderOwner!].box.push(fighters.defender);
    state.roads[state.players[state.activePlayer].position] = null;
  }
  battle.combat = createCombatState();
  if (winner) {
    battle.turn = winner;
    awardVictory(
      state,
      fighters[winner],
      winner === "attacker" ? state.activePlayer : battle.defenderOwner,
      fighters[oppositeSide(winner)].level,
      events,
    );
  } else addLog(state, "양쪽 포켓몬이 모두 쓰러졌습니다. 무승부입니다.");
  if (state.growth) continueGrowth(state, events);
  else finishBattle(state, events);
  return true;
}

export function hasExtraRoll(state: GameState): boolean {
  return state.phase !== "finished" && state.players[state.activePlayer].restTurnsRemaining === 0 &&
    state.dicePurpose === "movement" &&
    state.dice !== null && state.dice[0] === state.dice[1];
}

function canEndTurn(state: GameState): boolean {
  return (
    !state.exchangeActive &&
    state.players[state.activePlayer].party.length <= 6 &&
    ["center", "road", "turn-end", "rest-end"].includes(state.phase)
  );
}

function nextTurn(state: GameState, events?: EventSink) {
  const extraRoll = hasExtraRoll(state);
  state.dice = null;
  state.dicePurpose = null;
  state.movement = null;
  state.battle = null;
  state.phase = "roll";
  if (extraRoll) {
    const message = `${state.players[state.activePlayer].name}, 더블! 한 번 더 굴리세요.`;
    addLog(state, message);
    events?.(state, { kind: "turn", message });
    return;
  }
  state.activePlayer = (state.activePlayer + 1) % state.players.length;
  state.turn += 1;
  if (state.players[state.activePlayer].restTurnsRemaining > 0) state.phase = "rest-roll";
  addLog(state, `${state.players[state.activePlayer].name}의 차례입니다.`);
  events?.(state, {
    kind: "turn",
    message: `${state.players[state.activePlayer].name}의 차례입니다!`,
  });
}

/** Preview the same rest and extra-roll rules without changing the game or RNG. */
export function getNextRollPlayer(state: GameState): Player | null {
  if (state.phase === "roll" || state.phase === "rest-roll") return state.players[state.activePlayer];
  if (!canEndTurn(state)) return null;
  const preview = structuredClone(state);
  nextTurn(preview);
  return preview.players[preview.activePlayer];
}

function rollDice(state: GameState, events?: EventSink) {
  const resting = state.phase === "rest-roll";
  const player = state.players[state.activePlayer];
  state.dice = [random(state, 6) + 1, random(state, 6) + 1];
  state.dicePurpose = resting ? "rest" : "movement";
  if (resting) {
    const escaped = state.dice[0] === state.dice[1];
    player.restTurnsRemaining = escaped ? 0 : player.restTurnsRemaining - 1;
    if (player.restTurnsRemaining === 0) healPlayer(player);
    state.movement = escaped ? { remaining: state.dice[0] + state.dice[1], encounters: [] } : null;
    state.phase = escaped ? "moving" : "rest-end";
    const message = escaped
      ? `${player.name}: ${state.dice.join(" + ")}, 더블! 모두 회복하고 ${state.movement!.remaining}칸 이동합니다.`
      : `${player.name}: ${state.dice.join(" + ")}, 남은 휴식 ${player.restTurnsRemaining}턴`;
    addLog(state, message);
    events?.(state, { kind: "roll", message });
    if (!escaped) events?.(state, { kind: "rest", message });
    if (player.restTurnsRemaining === 0) {
      const healed = escaped
        ? `${player.name}, 더블로 탈출! 파티와 박스를 모두 회복했습니다.`
        : `${player.name}의 휴식이 끝나 모두 회복했습니다. 다음 자기 차례부터 이동합니다.`;
      addLog(state, healed);
      events?.(state, { kind: "heal", message: healed });
    }
    return;
  }
  state.movement = {
    remaining: state.dice[0] + state.dice[1],
    encounters: [],
  };
  state.phase = "moving";
  addLog(state, `${state.players[state.activePlayer].name}: 주사위 ${state.dice.join(" + ")}`);
  events?.(state, {
    kind: "roll",
    message: `${state.dice.join(" + ")} = ${state.movement.remaining}칸!${hasExtraRoll(state) ? " 더블! 도착 칸의 행동을 마치면 한 번 더!" : ""}`,
  });
}

function finishIfAllRoadsOwned(state: GameState, events?: EventSink) {
  const player = state.players[state.activePlayer];
  const ownsEveryRoad = BOARD_TILES.every(
    (kind, tile) => kind !== "road" || state.roads[tile]?.ownerId === player.id,
  );
  if (!ownsEveryRoad) return;
  state.winner = player.id;
  state.phase = "finished";
  state.exchangeActive = false;
  state.battle = null;
  state.evolution = null;
  state.growth = null;
  state.movement = null;
  const message = `${player.name}, 모든 도로를 차지해 승리했습니다!`;
  addLog(state, message);
  events?.(state, { kind: "victory", message });
}

function applyTransition(
  previous: GameState,
  action: GameAction,
  events?: EventSink,
): GameState {
  if (previous.phase === "finished") return previous;
  const state: GameState = structuredClone(previous);
  const player = state.players[state.activePlayer];
  const guardian = state.roads[player.position];
  switch (action.type) {
    case "ROLL": {
      if (state.phase !== "roll" && state.phase !== "rest-roll") return previous;
      rollDice(state, events);
      break;
    }
    case "MOVE_TO_CENTER": {
      if (!canMoveToCenter(state)) return previous;
      moveToCenter(state, player, true, events);
      state.phase = "turn-end";
      break;
    }
    case "STEP": {
      if (
        state.phase !== "moving" ||
        !state.movement ||
        state.movement.remaining <= 0
      )
        return previous;
      const fromTile = player.position;
      player.position = (player.position + 1) % BOARD_SIZE;
      state.movement.remaining -= 1;
      const arrived = state.movement.remaining === 0;
      state.movement.encounters = state.players
        .filter(
          (other) =>
            arrived &&
            other.id !== player.id &&
            other.restTurnsRemaining === 0 &&
            other.position === player.position,
        )
        .map((other) => other.id);
      events?.(state, {
        kind: "move",
        fromTile,
        message: `${player.name}, ${player.position + 1}번 칸으로!`,
      });
      if (fromTile === BOARD_SIZE - 1 && player.position === 0)
        awardLapGrowth(state, events);
      else continueMovement(state, events);
      break;
    }
    case "CHOOSE_POKEMON": {
      if (
        state.phase !== "choose-defender" &&
        state.phase !== "choose-attacker"
      )
        return previous;
      const side = state.phase === "choose-defender" ? "defender" : "attacker";
      const owner =
        side === "defender" ? state.battle!.defenderOwner! : state.activePlayer;
      const pokemon = state.players[owner].party.find(
        (candidate) => candidate.id === action.pokemonId && candidate.hp > 0,
      );
      if (!pokemon) return previous;
      if (side === "defender") {
        state.battle!.defenderPokemonId = pokemon.id;
        state.phase = "choose-attacker";
      } else {
        state.battle!.attackerPokemonId = pokemon.id;
        state.phase = "attack";
      }
      events?.(state, {
        kind: "send-out",
        playerId: owner,
        side,
        pokemon: pokemonView(pokemon),
        message: `${byId[pokemon.speciesId].name}, 너로 정했다!`,
      });
      break;
    }
    case "ATTACK": {
      if (
        state.phase !== "attack" ||
        hasForcedBattleAction(state) ||
        getActingPlayer(state) === null ||
        !attack(state, action.moveId, events)
      )
        return previous;
      break;
    }
    case "CONTINUE_BATTLE": {
      if (!hasForcedBattleAction(state)) return previous;
      if (!attack(state, getForcedMove(state.battle!.combat[state.battle!.turn])!, events)) return previous;
      break;
    }
    case "WILD_ATTACK": {
      if (
        state.phase !== "attack" ||
        state.battle!.kind !== "wild" ||
        state.battle!.turn !== "defender"
      )
        return previous;
      const wild = getBattlePokemon(state, "defender")!;
      const opponent = getBattlePokemon(state, "attacker")!;
      const forced = getForcedMove(state.battle!.combat.defender);
      const options = getBattleCommands(state).filter(move => !getMoveUnavailableReason(wild, opponent, move, getBattleContext(state)));
      if (forced !== null) attack(state, forced, events);
      else if (options.length) attack(state, options[random(state, options.length)].id, events);
      else return previous;
      break;
    }
    case "THROW_BALL": {
      const battle = state.battle;
      if (
        state.phase !== "attack" || hasForcedBattleAction(state) ||
        battle?.kind !== "wild" ||
        battle.turn !== "attacker" ||
        battle.outcome !== null ||
        !battle.wild || battle.wild.hp <= 0 ||
        player.party.length >= 6
      ) return previous;
      const attacker = getBattlePokemon(state, "attacker");
      if (!attacker || attacker.hp <= 0) return previous;
      const wild = battle.wild;
      const success = random(state, 1000000) < Math.round(getCaptureChance(wild, attacker.level) * 1000000);
      events?.(state, {
        kind: "capture-throw",
        pokemon: pokemonView(wild),
        capture: { success },
        message: "가라, 몬스터볼!",
      });
      for (const shake of [1, 2, 3])
        events?.(state, {
          kind: "capture-shake",
          pokemon: pokemonView(wild),
          capture: { success, shake },
          message: "몬스터볼이 흔들립니다…",
        });
      if (success) battle.outcome = { kind: "capture" };
      else battle.turn = "defender";
      const message = success
        ? `${byId[wild.speciesId].name}을(를) 포획했습니다!`
        : `${byId[wild.speciesId].name}이(가) 몬스터볼에서 빠져나왔습니다!`;
      addLog(state, message);
      events?.(state, {
        kind: "capture-result",
        pokemon: pokemonView(wild),
        capture: { success },
        message,
      });
      if (success) {
        battle.combat = createCombatState();
        awardVictory(state, attacker, player.id, wild.level, events);
        continueGrowth(state, events);
      } else {
        battle.combat.attacker.exposed = false;
        battle.combat.attacker.actions += 1;
        battle.combat.defender.receivedDamage = 0;
        battle.combat.defender.receivedPhysical = false;
        finishBattleAction(state, "attacker", events);
      }
      break;
    }
    case "CHOOSE_EVOLUTION": {
      if (
        state.phase !== "evolution" ||
        !state.evolution?.options.includes(action.speciesId)
      )
        return previous;
      const pokemon = findOwnedPokemon(
        state,
        state.evolution.ownerId,
        state.evolution.pokemonId,
      );
      if (!pokemon) return previous;
      const ownerId = state.evolution.ownerId;
      evolve(state, pokemon, action.speciesId, ownerId, events);
      queueEvolutionMoves(pokemon, state.growth!.queue[0]);
      continueGrowth(state, events);
      break;
    }
    case "LEARN_MOVE":
    case "CHOOSE_MOVE": {
      if (state.phase !== "learn-move" || !state.growth) return previous;
      const current = state.growth.queue[0];
      const pokemon = findOwnedPokemon(state, current.ownerId, current.pokemonId);
      const moveId = current.pendingMoveIds[0];
      if (!pokemon || !moveId || pokemon.moveIds.includes(moveId)) return previous;
      if (action.type === "LEARN_MOVE") {
        if (pokemon.moveIds.length >= MOVE_SLOT_LIMIT) return previous;
        pokemon.moveIds.push(moveId);
        addLog(state, `${byId[pokemon.speciesId].name}, ${movesById[moveId].name}을(를) 배웠습니다!`);
      } else if (action.replaceMoveId !== null) {
        const index = pokemon.moveIds.indexOf(action.replaceMoveId);
        if (index < 0) return previous;
        pokemon.moveIds[index] = moveId;
        addLog(state, `${byId[pokemon.speciesId].name}, ${movesById[action.replaceMoveId].name} 대신 ${movesById[moveId].name}을(를) 배웠습니다!`);
      } else {
        addLog(state, `${byId[pokemon.speciesId].name}, ${movesById[moveId].name}을(를) 배우지 않았습니다.`);
      }
      current.pendingMoveIds.shift();
      continueGrowth(state, events);
      break;
    }
    case "CAPTURE": {
      if (
        state.phase !== "capture" || typeof action.capture !== "boolean" ||
        state.battle?.outcome?.kind !== "knockout" ||
        !state.battle.outcome.legacyCapturePending
      )
        return previous;
      if (action.capture) {
        if (player.party.length >= 6) return previous;
        player.party.push(state.battle!.wild!);
        addLog(
          state,
          `${byId[state.battle!.wild!.speciesId].name}을(를) 포획했습니다. 센터에서 회복해 주세요.`,
        );
        events?.(state, {
          kind: "capture",
          pokemon: pokemonView(state.battle!.wild!),
          message: `${byId[state.battle!.wild!.speciesId].name}, 새로운 파트너!`,
        });
      }
      state.battle = null;
      state.phase = "turn-end";
      break;
    }
    case "START_EXCHANGE": {
      if (state.exchangeActive || player.restTurnsRemaining > 0) return previous;
      const roadAvailable = BOARD_TILES[player.position] === "road" &&
        (!guardian || guardian.ownerId === player.id);
      if (state.phase !== "center" && !(roadAvailable && ["road", "turn-end"].includes(state.phase)))
        return previous;
      if (roadAvailable) state.phase = "road";
      state.exchangeActive = true;
      break;
    }
    case "END_EXCHANGE": {
      if (!state.exchangeActive || !["center", "road"].includes(state.phase) || player.party.length > 6) return previous;
      state.exchangeActive = false;
      break;
    }
    case "DEPLOY": {
      if (state.phase !== "road" || !state.exchangeActive || guardian) return previous;
      const pokemon = player.party.find(
        (candidate) => candidate.id === action.pokemonId && candidate.hp > 0,
      );
      if (!pokemon) return previous;
      const remaining = player.party.filter((candidate) => candidate.id !== pokemon.id);
      if (!remaining.some((candidate) => candidate.hp > 0)) return previous;
      player.party = remaining;
      state.roads[player.position] = { ownerId: player.id, pokemon };
      addLog(state, `${byId[pokemon.speciesId].name}을(를) 도로에 배치했습니다.`);
      events?.(state, {
        kind: "deploy",
        pokemon: pokemonView(pokemon),
        message: `${byId[pokemon.speciesId].name}, 도로를 부탁해!`,
      });
      finishIfAllRoadsOwned(state, events);
      break;
    }
    case "RETRIEVE": {
      if (state.phase !== "road" || !state.exchangeActive || !guardian ||
        guardian.ownerId !== player.id || player.party.length >= 7) return previous;
      player.party.push(guardian.pokemon);
      state.roads[player.position] = null;
      events?.(state, {
        kind: "retrieve",
        pokemon: pokemonView(guardian.pokemon),
        message: `${byId[guardian.pokemon.speciesId].name}, 돌아와!`,
      });
      break;
    }
    case "CENTER_TRANSFER": {
      if (
        state.phase !== "center" || !state.exchangeActive ||
        (action.to !== "party" && action.to !== "box")
      )
        return previous;
      const source = action.to === "party" ? player.box : player.party;
      const destination = action.to === "party" ? player.party : player.box;
      const index = source.findIndex(
        (pokemon) => pokemon.id === action.pokemonId,
      );
      if (index < 0 || (action.to === "party" && destination.length >= 7))
        return previous;
      if (
        action.to === "box" &&
        !source.some(
          (pokemon, pokemonIndex) => pokemonIndex !== index && pokemon.hp > 0,
        )
      )
        return previous;
      const pokemon = source.splice(index, 1)[0];
      if (action.to === "box") pokemon.hp = getStats(pokemon).hp;
      destination.push(pokemon);
      break;
    }
    case "END_TURN":
    case "END_TURN_AND_ROLL": {
      if (!canEndTurn(state)) return previous;
      const rollImmediately = action.type === "END_TURN_AND_ROLL";
      // Keep rest/heal/turn logs, but let the dice be the first visible event.
      nextTurn(state, rollImmediately ? undefined : events);
      if (rollImmediately) rollDice(state, events);
      break;
    }
    default:
      return previous;
  }
  state.revision += 1;
  return state;
}

/** Invalid actions preserve object identity; accepted actions advance one revision. */
export function transition(previous: GameState, action: GameAction): GameState {
  return applyTransition(previous, action);
}

/** Capture events during the same deterministic transition, without saving them. */
export function transitionWithEvents(
  previous: GameState,
  action: GameAction,
): { state: GameState; events: PresentationEvent[] } {
  const events: PresentationEvent[] = [];
  const state = applyTransition(previous, action, (current, event) => {
    events.push({
      ...event,
      revision: previous.revision + 1,
      sequence: events.length,
      playerId:
        event.playerId === undefined ? current.activePlayer : event.playerId,
      tile: event.tile ?? current.players[current.activePlayer].position,
      snapshot: snapshotForPresentation(current),
    });
  });
  return { state, events: state === previous ? [] : events };
}
