import { BOARD_SIZE, BOARD_TILES, getDefaultSeatSides } from "./board";
import { getDamagePreview, getStats } from "./battle";
import { getPartyLeader } from "./party";
import { getCaptureChance, getExperienceGrowth, getVictoryExperience } from "./progression";
import {
  speciesById as byId,
  getAvailableMoves,
  isStarter,
  speciesList,
} from "./pokemon-data";
import type {
  Battle,
  BattleSide,
  GameAction,
  GameState,
  Player,
  Pokemon,
  SeatSide,
} from "./types";
import type {
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
  return { ...pokemon, maxHp: getStats(pokemon).hp };
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
    version: 3,
    revision: 0,
    rng: seed >>> 0 || 0x9e3779b9,
    nextPokemonId: 1,
    turn: 1,
    activePlayer: 0,
    players: [],
    roads: Array(BOARD_SIZE).fill(null),
    phase: "roll",
    dice: null,
    movement: null,
    battle: null,
    evolution: null,
    lapGrowth: null,
    winner: null,
    log: ["모험을 시작합니다. 주사위를 굴려 주세요!"],
  };
  state.players = starters.map((speciesId, id) => ({
    id,
    name: names[id]?.trim().slice(0, 30) || `플레이어 ${id + 1}`,
    position: 0,
    party: [makePokemon(state, speciesId, 3)],
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
        }
      : null,
  };
}

export function getActingPlayer(state: GameState): number | null {
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
    const level = random(state, 3) + 1;
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

/** Ties go to the next center in the direction of travel. */
export function getNearestCenter(position: number): number {
  let nearest = 0;
  let shortestDistance = BOARD_SIZE;
  let shortestForward = BOARD_SIZE;
  for (const [tile, kind] of BOARD_TILES.entries()) {
    if (kind !== "center") continue;
    const forward = (tile - position + BOARD_SIZE) % BOARD_SIZE;
    const backward = (position - tile + BOARD_SIZE) % BOARD_SIZE;
    const distance = Math.min(forward, backward);
    if (
      distance < shortestDistance ||
      (distance === shortestDistance && forward < shortestForward)
    ) {
      nearest = tile;
      shortestDistance = distance;
      shortestForward = forward;
    }
  }
  return nearest;
}

function rescueDefeatedPlayers(state: GameState, events?: EventSink) {
  for (const player of state.players) {
    if (
      player.restTurnsRemaining === 0 &&
      !player.party.some((pokemon) => pokemon.hp > 0)
    ) {
      const fromTile = player.position;
      player.position = getNearestCenter(fromTile);
      player.restTurnsRemaining = 3;
      addLog(
        state,
        `${player.name}의 파티가 모두 행동불능입니다. 가까운 포켓몬센터에서 다음 자기 차례 3번을 쉽니다.`,
      );
      events?.(state, {
        kind: "rescue",
        playerId: player.id,
        tile: player.position,
        fromTile,
        message: `${player.name}, 포켓몬센터로! 3턴 뒤 모두 회복합니다.`,
      });
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

function continueEvolution(
  state: GameState,
  pokemon: Pokemon,
  ownerId: number,
  events?: EventSink,
) {
  state.evolution = null;
  while (true) {
    const options = byId[pokemon.speciesId].evolutions
      .filter((evolution) => pokemon.level >= evolution.level)
      .map((evolution) => evolution.speciesId);
    if (options.length === 0) return;
    if (options.length > 1) {
      state.evolution = { ownerId, pokemonId: pokemon.id, options };
      state.phase = "evolution";
      return;
    }
    evolve(state, pokemon, options[0], ownerId, events);
  }
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
}

function awardVictory(
  state: GameState,
  pokemon: Pokemon,
  ownerId: number | null,
  opponentLevel: number,
  events?: EventSink,
) {
  grantExperience(state, pokemon, ownerId, opponentLevel, events);
  if (ownerId !== null) continueEvolution(state, pokemon, ownerId, events);
}

function continueLapGrowth(state: GameState, events?: EventSink) {
  const player = state.players[state.activePlayer];
  const remaining = state.lapGrowth!.remainingPokemonIds;
  state.evolution = null;
  while (remaining.length > 0) {
    const pokemonId = remaining.shift()!;
    const pokemon = findOwnedPokemon(state, player.id, pokemonId)!;
    continueEvolution(state, pokemon, player.id, events);
    if (state.evolution) return;
  }
  state.lapGrowth = null;
  continueMovement(state, events);
}

function awardLapGrowth(state: GameState, events?: EventSink) {
  const player = state.players[state.activePlayer];
  const message = `${player.name}, 한 바퀴 완주! 파티와 수비 포켓몬이 경험치를 얻습니다.`;
  addLog(state, message);
  events?.(state, { kind: "lap", message });
  const participants = [
    ...player.party,
    ...state.roads.flatMap((guardian) => guardian?.ownerId === player.id ? [guardian.pokemon] : []),
  ];
  state.lapGrowth = { remainingPokemonIds: participants.map((pokemon) => pokemon.id) };
  for (const pokemon of participants)
    grantExperience(state, pokemon, player.id, pokemon.level, events);
  continueLapGrowth(state, events);
}

function attack(state: GameState, moveId: number, events?: EventSink): boolean {
  const battle = state.battle!;
  const side = battle.turn;
  const attacker = getBattlePokemon(state, side)!;
  const defender = getBattlePokemon(
    state,
    side === "attacker" ? "defender" : "attacker",
  )!;
  const move = getAvailableMoves(attacker.speciesId, attacker.level).find(
    (candidate) => candidate.id === moveId,
  );
  if (!move) return false;
  const preview = getDamagePreview(attacker, defender, move);
  if (preview.effectiveness === 0) return false;
  const beforeHp = defender.hp;
  defender.hp = Math.max(0, defender.hp - preview.damage);
  battle.lastAttack = {
    side,
    moveId,
    damage: preview.damage,
    effectiveness: preview.effectiveness,
  };
  addLog(
    state,
    `${byId[attacker.speciesId].name}의 ${move.name}! ${preview.damage} 피해`,
  );
  events?.(state, {
    kind: "attack",
    playerId: side === "attacker" ? state.activePlayer : battle.defenderOwner,
    side,
    pokemon: pokemonView(attacker),
    message: `${byId[attacker.speciesId].name}의 ${move.name}!`,
    attack: {
      side,
      moveId,
      moveType: move.type,
      category: move.category,
      damage: preview.damage,
      effectiveness: preview.effectiveness,
      beforeHp,
      afterHp: defender.hp,
    },
  });
  if (defender.hp > 0) {
    battle.turn = side === "attacker" ? "defender" : "attacker";
    return true;
  }
  battle.outcome = { kind: "knockout", winner: side };
  events?.(state, {
    kind: "faint",
    playerId: side === "attacker" ? battle.defenderOwner : state.activePlayer,
    side: side === "attacker" ? "defender" : "attacker",
    pokemon: pokemonView(defender),
    message: `${byId[defender.speciesId].name}, 잠시 쉬어요!`,
  });
  if (battle.kind === "road" && side === "attacker") {
    state.players[battle.defenderOwner!].box.push(defender);
    state.roads[state.players[state.activePlayer].position] = null;
  }
  const winnerOwner =
    side === "attacker" ? state.activePlayer : battle.defenderOwner;
  awardVictory(state, attacker, winnerOwner, defender.level, events);
  if (!state.evolution) finishBattle(state, events);
  return true;
}

export function hasExtraRoll(state: GameState): boolean {
  return (
    state.phase !== "finished" &&
    state.players[state.activePlayer].restTurnsRemaining === 0 &&
    state.dice !== null &&
    state.dice[0] === state.dice[1]
  );
}

function canEndTurn(state: GameState): boolean {
  return (
    !state.exchangeActive &&
    state.players[state.activePlayer].party.length <= 6 &&
    ["center", "road", "turn-end"].includes(state.phase)
  );
}

function nextTurn(state: GameState, events?: EventSink) {
  const extraRoll = hasExtraRoll(state);
  state.dice = null;
  state.movement = null;
  state.battle = null;
  state.phase = "roll";
  if (extraRoll) {
    const message = `${state.players[state.activePlayer].name}, 더블! 한 번 더 굴리세요.`;
    addLog(state, message);
    events?.(state, { kind: "turn", message });
    return;
  }
  while (true) {
    state.activePlayer = (state.activePlayer + 1) % state.players.length;
    state.turn += 1;
    const player = state.players[state.activePlayer];
    if (player.restTurnsRemaining === 0) break;
    player.restTurnsRemaining -= 1;
    const message = `${player.name}의 휴식 차례입니다. 남은 휴식 ${player.restTurnsRemaining}턴`;
    addLog(state, message);
    events?.(state, { kind: "rest", message });
    if (player.restTurnsRemaining === 0) {
      healPlayer(player);
      const healed = `${player.name}의 휴식이 끝나 파티와 박스가 모두 회복했습니다.`;
      addLog(state, healed);
      events?.(state, { kind: "heal", message: healed });
    }
    // The third resting turn is still skipped; rolling resumes on the next turn.
  }
  addLog(state, `${state.players[state.activePlayer].name}의 차례입니다.`);
  events?.(state, {
    kind: "turn",
    message: `${state.players[state.activePlayer].name}의 차례입니다!`,
  });
}

/** Preview the same rest and extra-roll rules without changing the game or RNG. */
export function getNextRollPlayer(state: GameState): Player | null {
  if (state.phase === "roll") return state.players[state.activePlayer];
  if (!canEndTurn(state)) return null;
  const preview = structuredClone(state);
  nextTurn(preview);
  return preview.players[preview.activePlayer];
}

function rollDice(state: GameState, events?: EventSink) {
  state.dice = [random(state, 6) + 1, random(state, 6) + 1];
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
      if (state.phase !== "roll") return previous;
      rollDice(state, events);
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
        getActingPlayer(state) === null ||
        !attack(state, action.moveId, events)
      )
        return previous;
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
      const options = getAvailableMoves(wild.speciesId, wild.level).filter(
        (move) => getDamagePreview(wild, opponent, move).effectiveness > 0,
      );
      attack(state, options[random(state, options.length)].id, events);
      break;
    }
    case "THROW_BALL": {
      const battle = state.battle;
      if (
        state.phase !== "attack" ||
        battle?.kind !== "wild" ||
        battle.turn !== "attacker" ||
        battle.outcome !== null ||
        !battle.wild || battle.wild.hp <= 0 ||
        player.party.length >= 6
      ) return previous;
      const attacker = getBattlePokemon(state, "attacker");
      if (!attacker || attacker.hp <= 0) return previous;
      const wild = battle.wild;
      const success = random(state, 1000000) < Math.round(getCaptureChance(wild) * 1000000);
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
        awardVictory(state, attacker, player.id, wild.level, events);
        if (!state.evolution) finishBattle(state, events);
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
      continueEvolution(state, pokemon, ownerId, events);
      if (state.evolution) break;
      if (state.lapGrowth) continueLapGrowth(state, events);
      else finishBattle(state, events);
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
