import { BOARD_SIZE, BOARD_TILES } from "./board";
import { getDamagePreview, getStats } from "./battle";
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
    hp: 0,
  };
  pokemon.hp = getStats(pokemon).hp;
  return pokemon;
}

export function createGame(
  starters: number[],
  names: string[],
  seed: number,
): GameState {
  if (
    starters.length < 2 ||
    starters.length > 4 ||
    starters.some((id) => !byId[id] || !isStarter(byId[id]))
  ) {
    throw new Error("2~4명의 플레이어가 진화 전 일반 포켓몬을 골라야 합니다.");
  }
  const state: GameState = {
    version: 1,
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
    winner: null,
    log: ["모험을 시작합니다. 주사위를 굴려 주세요!"],
  };
  state.players = starters.map((speciesId, id) => ({
    id,
    name: names[id]?.trim().slice(0, 30) || `플레이어 ${id + 1}`,
    position: 0,
    party: [makePokemon(state, speciesId, 1)],
    box: [],
    eliminated: false,
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
    players: state.players.map(({ id, name, position, eliminated }) => ({
      id,
      name,
      position,
      eliminated,
    })),
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
          attacker: attacker ? pokemonView(attacker) : null,
          defender: defender ? pokemonView(defender) : null,
          attackerName: state.players[state.activePlayer].name,
          defenderName:
            battle.defenderOwner === null
              ? "야생 포켓몬"
              : state.players[battle.defenderOwner].name,
          turn: battle.turn,
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
    winner: null,
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

// Exclusive encounter pools: rare status, high stats/final form, middle form, basic.
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
      Object.values(species.stats).reduce((a, b) => a + b, 0) < 500 &&
      species.evolvesFrom !== null &&
      species.evolutions.length > 0,
  ),
  speciesList.filter(
    (species) =>
      !species.legendary &&
      !species.mythical &&
      (Object.values(species.stats).reduce((a, b) => a + b, 0) >= 500 ||
        (species.evolvesFrom !== null && species.evolutions.length === 0)),
  ),
  speciesList.filter((species) => species.legendary || species.mythical),
];

function arrive(state: GameState, events?: EventSink) {
  const player = state.players[state.activePlayer];
  const tile = BOARD_TILES[player.position];
  if (tile === "center") {
    for (const pokemon of [...player.party, ...player.box])
      pokemon.hp = getStats(pokemon).hp;
    state.phase = "center";
    addLog(state, `${player.name}의 파티와 박스를 모두 회복했습니다.`);
    events?.(state, {
      kind: "heal",
      message: `${player.name}의 포켓몬이 모두 회복했습니다!`,
    });
  } else if (tile === "grass") {
    const roll = random(state, 100);
    const pool = wildPools[roll < 70 ? 0 : roll < 90 ? 1 : roll < 99 ? 2 : 3];
    const species = pool[random(state, pool.length)];
    const highestLevel = Math.max(
      ...player.party
        .filter((pokemon) => pokemon.hp > 0)
        .map((pokemon) => pokemon.level),
    );
    const level = Math.max(
      1,
      Math.min(100, highestLevel + random(state, 3) - 1),
    );
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
  if (player.eliminated) {
    state.phase = "turn-end";
    state.movement = null;
    return;
  }
  const movement = state.movement!;
  while (movement.encounters.length > 0) {
    const opponent = state.players[movement.encounters.shift()!];
    if (!opponent.eliminated && opponent.position === player.position) {
      startBattle(state, "trainer", opponent.id, null, events);
      return;
    }
  }
  if (movement.remaining > 0) state.phase = "moving";
  else arrive(state, events);
}

function eliminateDefeatedPlayers(state: GameState, events?: EventSink) {
  for (const player of state.players) {
    if (!player.eliminated && !player.party.some((pokemon) => pokemon.hp > 0)) {
      player.eliminated = true;
      state.roads = state.roads.map((guardian) =>
        guardian?.ownerId === player.id ? null : guardian,
      );
      addLog(
        state,
        `${player.name}의 파티가 모두 행동불능입니다. 탈락했습니다.`,
      );
      events?.(state, {
        kind: "eliminate",
        playerId: player.id,
        tile: player.position,
        message: `${player.name}의 모험이 끝났습니다.`,
      });
    }
  }
  const survivors = state.players.filter((player) => !player.eliminated);
  if (survivors.length === 1) state.winner = survivors[0].id;
}

function finishBattle(state: GameState, events?: EventSink) {
  const battle = state.battle!;
  state.evolution = null;
  if (state.winner !== null) {
    state.phase = "finished";
    state.battle = null;
    state.movement = null;
    addLog(state, `${state.players[state.winner].name}의 승리!`);
    events?.(state, {
      kind: "victory",
      playerId: state.winner,
      tile: state.players[state.winner].position,
      message: `${state.players[state.winner].name}, 최후의 트레이너!`,
    });
    return;
  }
  if (battle.kind === "wild" && battle.winner === "attacker") {
    state.phase = "capture";
    return;
  }
  state.battle = null;
  if (battle.kind === "trainer") continueMovement(state, events);
  else
    state.phase =
      battle.kind === "road" && battle.winner === "attacker"
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

function awardVictory(
  state: GameState,
  pokemon: Pokemon,
  ownerId: number | null,
  events?: EventSink,
) {
  // Wild opponents can also gain a level, but they leave the board after battle.
  const previousLevel = pokemon.level;
  pokemon.level = Math.min(100, pokemon.level + 1);
  addLog(state, `${byId[pokemon.speciesId].name} 승리! 레벨 ${pokemon.level}`);
  if (pokemon.level > previousLevel)
    events?.(state, {
      kind: "level-up",
      playerId: ownerId,
      pokemon: pokemonView(pokemon),
      message: `${byId[pokemon.speciesId].name} 승리! 레벨 ${pokemon.level}`,
    });
  if (ownerId === null) return;
  const options = byId[pokemon.speciesId].evolutions
    .filter((evolution) => pokemon.level >= evolution.level)
    .map((evolution) => evolution.speciesId);
  if (options.length === 1) evolve(state, pokemon, options[0], ownerId, events);
  else if (options.length > 1) {
    state.evolution = { ownerId, pokemonId: pokemon.id, options };
    state.phase = "evolution";
  }
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
  battle.winner = side;
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
  awardVictory(state, attacker, winnerOwner, events);
  eliminateDefeatedPlayers(state, events);
  if (!state.evolution) finishBattle(state, events);
  return true;
}

function returnToOwner(player: Player, pokemon: Pokemon) {
  (player.party.length < 6 ? player.party : player.box).push(pokemon);
}

function nextTurn(state: GameState, events?: EventSink) {
  do {
    state.activePlayer = (state.activePlayer + 1) % state.players.length;
  } while (state.players[state.activePlayer].eliminated);
  state.turn += 1;
  state.dice = null;
  state.movement = null;
  state.battle = null;
  state.phase = "roll";
  addLog(state, `${state.players[state.activePlayer].name}의 차례입니다.`);
  events?.(state, {
    kind: "turn",
    message: `${state.players[state.activePlayer].name}의 차례입니다!`,
  });
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
      state.dice = [random(state, 6) + 1, random(state, 6) + 1];
      state.movement = {
        remaining: state.dice[0] + state.dice[1],
        encounters: [],
      };
      state.phase = "moving";
      addLog(state, `${player.name}: 주사위 ${state.dice.join(" + ")}`);
      events?.(state, {
        kind: "roll",
        message: `${state.dice.join(" + ")} = ${state.movement.remaining}칸!`,
      });
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
      state.movement.encounters = state.players
        .filter(
          (other) =>
            other.id !== player.id &&
            !other.eliminated &&
            other.position === player.position,
        )
        .map((other) => other.id);
      events?.(state, {
        kind: "move",
        fromTile,
        message: `${player.name}, ${player.position + 1}번 칸으로!`,
      });
      continueMovement(state, events);
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
      evolve(state, pokemon, action.speciesId, state.evolution.ownerId, events);
      finishBattle(state, events);
      break;
    }
    case "CAPTURE": {
      if (state.phase !== "capture" || typeof action.capture !== "boolean")
        return previous;
      if (action.capture) {
        returnToOwner(player, state.battle!.wild!);
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
    case "DEPLOY":
    case "SWAP_GUARDIAN": {
      if (state.phase !== "road") return previous;
      if (
        action.type === "DEPLOY"
          ? !!guardian
          : !guardian || guardian.ownerId !== player.id
      )
        return previous;
      const pokemon = player.party.find(
        (candidate) => candidate.id === action.pokemonId && candidate.hp > 0,
      );
      if (!pokemon) return previous;
      const remaining = player.party.filter(
        (candidate) => candidate.id !== pokemon.id,
      );
      if (
        !remaining.some((candidate) => candidate.hp > 0) &&
        !(guardian?.pokemon.hp && action.type === "SWAP_GUARDIAN")
      )
        return previous;
      player.party = remaining;
      if (guardian) returnToOwner(player, guardian.pokemon);
      state.roads[player.position] = { ownerId: player.id, pokemon };
      state.phase = "turn-end";
      addLog(
        state,
        `${byId[pokemon.speciesId].name}을(를) 도로에 배치했습니다.`,
      );
      events?.(state, {
        kind: "deploy",
        pokemon: pokemonView(pokemon),
        message: `${byId[pokemon.speciesId].name}, 도로를 부탁해!`,
      });
      break;
    }
    case "RETRIEVE": {
      if (state.phase !== "road" || !guardian || guardian.ownerId !== player.id)
        return previous;
      returnToOwner(player, guardian.pokemon);
      state.roads[player.position] = null;
      state.phase = "turn-end";
      events?.(state, {
        kind: "retrieve",
        pokemon: pokemonView(guardian.pokemon),
        message: `${byId[guardian.pokemon.speciesId].name}, 돌아와!`,
      });
      break;
    }
    case "CENTER_TRANSFER": {
      if (
        state.phase !== "center" ||
        (action.to !== "party" && action.to !== "box")
      )
        return previous;
      const source = action.to === "party" ? player.box : player.party;
      const destination = action.to === "party" ? player.party : player.box;
      const index = source.findIndex(
        (pokemon) => pokemon.id === action.pokemonId,
      );
      if (index < 0 || (action.to === "party" && destination.length >= 6))
        return previous;
      if (
        action.to === "box" &&
        !source.some(
          (pokemon, pokemonIndex) => pokemonIndex !== index && pokemon.hp > 0,
        )
      )
        return previous;
      destination.push(source.splice(index, 1)[0]);
      break;
    }
    case "CENTER_SWAP": {
      if (state.phase !== "center") return previous;
      const partyIndex = player.party.findIndex(
        (pokemon) => pokemon.id === action.partyPokemonId,
      );
      const boxIndex = player.box.findIndex(
        (pokemon) => pokemon.id === action.boxPokemonId,
      );
      if (partyIndex < 0 || boxIndex < 0) return previous;
      [player.party[partyIndex], player.box[boxIndex]] = [
        player.box[boxIndex],
        player.party[partyIndex],
      ];
      break;
    }
    case "END_TURN": {
      if (!["center", "road", "turn-end"].includes(state.phase))
        return previous;
      nextTurn(state, events);
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
