import { MAX_PLAYER_STAMINA } from "../constants";
import type { GameState, Player, UserAction } from "../types";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function updatePlayerForNewDay(player: Player): Player {
  const staminaGain = 8 + Math.round(player.hidden.physical.recovery / 20);
  const fatigueDrop = 10 + Math.round(player.hidden.physical.recovery / 18);
  const nextStamina = clamp(player.condition.stamina + staminaGain, 0, MAX_PLAYER_STAMINA);
  const nextFatigue = clamp(player.condition.fatigue - fatigueDrop, 0, 100);
  const soreness =
    nextStamina >= 88 ? "fresh" : nextStamina >= 68 ? "stable" : nextStamina >= 44 ? "tired" : "risk";

  return {
    ...player,
    condition: {
      ...player.condition,
      stamina: nextStamina,
      fatigue: nextFatigue,
      soreness,
    },
  };
}

export function reduceGameState(state: GameState, action: UserAction): GameState {
  switch (action.type) {
    case "set_screen":
      return {
        ...state,
        currentScreen: action.screen,
      };
    case "select_player":
      return {
        ...state,
        selectedPlayerId: action.playerId,
      };
    case "queue_strategy":
      return {
        ...state,
        activeMatch: {
          ...state.activeMatch,
          pendingStrategy: action.strategy,
          eventLog: [`Manager queued ${action.strategy} strategy.`, ...state.activeMatch.eventLog].slice(0, 10),
        },
        saveMeta: {
          ...state.saveMeta,
          dirty: true,
        },
      };
    case "continue_match": {
      const nextStrikes = (state.activeMatch.scoreboard.strikes + 1) % 3;
      const nextOuts =
        nextStrikes === 0 ? (state.activeMatch.scoreboard.outs + 1) % 3 : state.activeMatch.scoreboard.outs;
      const inningBump = nextStrikes === 0 && nextOuts === 0 ? 1 : 0;
      return {
        ...state,
        activeMatch: {
          ...state.activeMatch,
          scoreboard: {
            ...state.activeMatch.scoreboard,
            strikes: nextStrikes,
            outs: nextOuts,
            inning: state.activeMatch.scoreboard.inning + inningBump,
          },
          eventLog: [
            nextStrikes === 0
              ? "Swinging strike three. The dugout notes the pitcher won the sequence."
              : "Pitch sequence continues. Count pressure builds at the plate.",
            ...state.activeMatch.eventLog,
          ].slice(0, 10),
        },
        saveMeta: {
          ...state.saveMeta,
          dirty: true,
        },
      };
    }
    case "advance_day": {
      const nextPlayers = Object.fromEntries(
        Object.entries(state.league.players).map(([playerId, player]) => [playerId, updatePlayerForNewDay(player)]),
      );
      return {
        ...state,
        league: {
          ...state.league,
          currentDay: state.league.currentDay + 1,
          players: nextPlayers,
        },
        feedLog: [
          `Day ${state.league.currentDay + 1}: roster condition updated, minor-league development processed, and scouting notes refreshed.`,
          ...state.feedLog,
        ].slice(0, 8),
        saveMeta: {
          ...state.saveMeta,
          dirty: true,
        },
      };
    }
    case "manual_save_complete":
      return {
        ...state,
        saveMeta: {
          lastSavedAt: action.savedAt,
          dirty: false,
        },
      };
    case "load_state":
      return action.state;
    default:
      return state;
  }
}
