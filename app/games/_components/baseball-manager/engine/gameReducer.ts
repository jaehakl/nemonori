import { MAX_PLAYER_STAMINA } from "../constants";
import { createLiveMatchSession } from "../sim/generateLeague";
import type { GameState, LiveMatchState, Player, ScheduledGame, Team, UserAction } from "../types";

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

function findUserTeam(state: GameState) {
  return state.league.teams.find((team) => team.id === state.userTeamId) ?? state.league.teams[0];
}

function computeNextUserGameId(schedule: ScheduledGame[], userTeamId: string, currentDay: number) {
  return (
    schedule.find(
      (game) =>
        !game.played &&
        game.day >= currentDay &&
        (game.awayTeamId === userTeamId || game.homeTeamId === userTeamId),
    )?.id ?? null
  );
}

function replaceTeam(teams: Team[], nextTeam: Team) {
  return teams.map((team) => (team.id === nextTeam.id ? nextTeam : team));
}

function updateRecord(team: Team, runsFor: number, runsAgainst: number): Team {
  const nextRecord = { ...team.record };
  if (runsFor > runsAgainst) {
    nextRecord.wins += 1;
  } else if (runsFor < runsAgainst) {
    nextRecord.losses += 1;
  } else {
    nextRecord.draws += 1;
  }
  return {
    ...team,
    record: nextRecord,
  };
}

function appendFeed(feedLog: string[], message: string) {
  return [message, ...feedLog].slice(0, 8);
}

function progressHalfInning(match: LiveMatchState): LiveMatchState {
  const nextStrikes = match.scoreboard.strikes + 1;
  if (nextStrikes < 3) {
    return {
      ...match,
      scoreboard: {
        ...match.scoreboard,
        strikes: nextStrikes,
      },
      eventLog: ["Pitch sequence continues. Count pressure builds at the plate.", ...match.eventLog].slice(0, 10),
      pendingStrategy: "auto",
    };
  }

  const outs = match.scoreboard.outs + 1;
  if (outs < 3) {
    return {
      ...match,
      scoreboard: {
        ...match.scoreboard,
        balls: 0,
        strikes: 0,
        outs,
      },
      eventLog: ["Swinging strike three. The dugout notes the pitcher won the sequence.", ...match.eventLog].slice(0, 10),
      pendingStrategy: "auto",
    };
  }

  const nextHalf = match.scoreboard.half === "top" ? "bottom" : "top";
  const nextInning = nextHalf === "top" ? match.scoreboard.inning + 1 : match.scoreboard.inning;

  return {
    ...match,
    scoreboard: {
      ...match.scoreboard,
      inning: nextInning,
      half: nextHalf,
      balls: 0,
      strikes: 0,
      outs: 0,
    },
    bases: {
      first: null,
      second: null,
      third: null,
    },
    eventLog: ["Side retired. Clubs reset for the next half inning.", ...match.eventLog].slice(0, 10),
    pendingStrategy: "auto",
  };
}

function runDailyRecovery(state: GameState, day: number) {
  const nextPlayers = Object.fromEntries(
    Object.entries(state.league.players).map(([playerId, player]) => [playerId, updatePlayerForNewDay(player)]),
  );

  const nextSchedule = state.league.schedule.map((game) => {
    const isUserGame = game.awayTeamId === state.userTeamId || game.homeTeamId === state.userTeamId;
    if (game.played || game.day !== day || isUserGame) {
      return game;
    }
    return {
      ...game,
      played: true,
      score: {
        away: 3,
        home: 2,
      },
    };
  });

  return {
    players: nextPlayers,
    schedule: nextSchedule,
  };
}

export function reduceGameState(state: GameState, action: UserAction): GameState {
  switch (action.type) {
    case "set_user_lineup":
      return {
        ...state,
        rosterOps: {
          ...state.rosterOps,
          lineup: action.lineup.slice(0, 9),
        },
      };
    case "set_user_bench_order":
      return {
        ...state,
        rosterOps: {
          ...state.rosterOps,
          bench: action.bench,
        },
      };
    case "set_user_rotation":
      return {
        ...state,
        rosterOps: {
          ...state.rosterOps,
          rotation: action.rotation.slice(0, 5),
        },
      };
    case "set_user_bullpen_roles":
      return {
        ...state,
        rosterOps: {
          ...state.rosterOps,
          bullpen: action.bullpen,
        },
      };
    case "promote_player": {
      const userTeam = findUserTeam(state);
      if (!userTeam || !userTeam.minorIds.includes(action.playerId) || userTeam.majorIds.includes(action.playerId)) {
        return state;
      }

      const player = state.league.players[action.playerId];
      const nextTeam = {
        ...userTeam,
        majorIds: [...userTeam.majorIds, action.playerId],
        minorIds: userTeam.minorIds.filter((id) => id !== action.playerId),
      };

      return {
        ...state,
        league: {
          ...state.league,
          teams: replaceTeam(state.league.teams, nextTeam),
          players: {
            ...state.league.players,
            [action.playerId]: {
              ...player,
              rosterLevel: "major",
            },
          },
        },
        rosterOps: {
          ...state.rosterOps,
          bench: player.profile.role === "pitcher" ? state.rosterOps.bench : [...state.rosterOps.bench, action.playerId],
          bullpen: player.profile.primaryPosition === "RP" ? [...state.rosterOps.bullpen, action.playerId] : state.rosterOps.bullpen,
        },
      };
    }
    case "demote_player": {
      const userTeam = findUserTeam(state);
      if (!userTeam || !userTeam.majorIds.includes(action.playerId) || userTeam.minorIds.includes(action.playerId)) {
        return state;
      }

      const player = state.league.players[action.playerId];
      const nextTeam = {
        ...userTeam,
        majorIds: userTeam.majorIds.filter((id) => id !== action.playerId),
        minorIds: [...userTeam.minorIds, action.playerId],
      };

      return {
        ...state,
        league: {
          ...state.league,
          teams: replaceTeam(state.league.teams, nextTeam),
          players: {
            ...state.league.players,
            [action.playerId]: {
              ...player,
              rosterLevel: "minor",
            },
          },
        },
        rosterOps: {
          lineup: state.rosterOps.lineup.filter((id) => id !== action.playerId),
          bench: state.rosterOps.bench.filter((id) => id !== action.playerId),
          rotation: state.rosterOps.rotation.filter((id) => id !== action.playerId),
          bullpen: state.rosterOps.bullpen.filter((id) => id !== action.playerId),
        },
      };
    }
    case "simulate_until_user_decision": {
      if (state.season.phase !== "regular-season" || state.liveMatch || state.season.pendingUserMatch) {
        return state;
      }

      let nextState = state;
      while (nextState.season.phase === "regular-season" && !nextState.season.pendingUserMatch) {
        const nextGameId = computeNextUserGameId(nextState.league.schedule, nextState.userTeamId, nextState.season.currentDay);
        if (!nextGameId) {
          return {
            ...nextState,
            season: {
              ...nextState.season,
              nextUserGameId: null,
            },
          };
        }

        const nextGame = nextState.league.schedule.find((game) => game.id === nextGameId);
        if (!nextGame) {
          return nextState;
        }

        if (nextGame.day <= nextState.season.currentDay) {
          return {
            ...nextState,
            season: {
              ...nextState.season,
              nextUserGameId: nextGame.id,
              pendingUserMatch: true,
            },
            feedLog: appendFeed(nextState.feedLog, `Day ${nextState.season.currentDay}: your club is ready for game day.`),
          };
        }

        const { players, schedule } = runDailyRecovery(nextState, nextState.season.currentDay);
        nextState = {
          ...nextState,
          league: {
            ...nextState.league,
            players,
            schedule,
          },
          season: {
            ...nextState.season,
            currentDay: nextState.season.currentDay + 1,
            nextUserGameId: computeNextUserGameId(schedule, nextState.userTeamId, nextState.season.currentDay + 1),
            pendingUserMatch: false,
          },
          feedLog: appendFeed(
            nextState.feedLog,
            `Day ${nextState.season.currentDay + 1}: roster condition updated, minor-league development processed, and scouting notes refreshed.`,
          ),
        };
      }

      return nextState;
    }
    case "start_next_user_match": {
      if (state.liveMatch || !state.season.pendingUserMatch || !state.season.nextUserGameId) {
        return state;
      }

      const liveMatch = createLiveMatchSession(state);
      if (!liveMatch) {
        return state;
      }

      return {
        ...state,
        liveMatch,
      };
    }
    case "resolve_match_step":
      if (!state.liveMatch) {
        return state;
      }
      return {
        ...state,
        liveMatch: progressHalfInning(state.liveMatch),
      };
    case "queue_match_strategy":
      if (!state.liveMatch) {
        return state;
      }
      return {
        ...state,
        liveMatch: {
          ...state.liveMatch,
          pendingStrategy: action.strategy,
          eventLog: [`Manager queued ${action.strategy} strategy.`, ...state.liveMatch.eventLog].slice(0, 10),
        },
      };
    case "commit_match_substitution":
      if (!state.liveMatch) {
        return state;
      }
      return {
        ...state,
        liveMatch: {
          ...state.liveMatch,
          batterId: state.liveMatch.batterId === action.replacePlayerId ? action.playerId : state.liveMatch.batterId,
          pitcherId: state.liveMatch.pitcherId === action.replacePlayerId ? action.playerId : state.liveMatch.pitcherId,
          fieldingPositions: Object.fromEntries(
            Object.entries(state.liveMatch.fieldingPositions).map(([position, playerId]) => [
              position,
              playerId === action.replacePlayerId ? action.playerId : playerId,
            ]),
          ),
          eventLog: [
            `Substitution made: ${action.playerId} replaces ${action.replacePlayerId}.`,
            ...state.liveMatch.eventLog,
          ].slice(0, 10),
          pendingStrategy: "auto",
        },
      };
    case "finish_user_match": {
      if (!state.liveMatch) {
        return state;
      }

      const playedGame = state.league.schedule.find((game) => game.id === state.liveMatch?.gameId);
      if (!playedGame) {
        return {
          ...state,
          liveMatch: null,
        };
      }

      const finalScore = {
        away: state.liveMatch.scoreboard.away,
        home: state.liveMatch.scoreboard.home,
      };

      const nextSchedule = state.league.schedule.map((game) =>
        game.id === playedGame.id
          ? {
              ...game,
              played: true,
              score: finalScore,
            }
          : game,
      );

      const awayTeam = state.league.teams.find((team) => team.id === playedGame.awayTeamId);
      const homeTeam = state.league.teams.find((team) => team.id === playedGame.homeTeamId);
      const nextTeams = state.league.teams.map((team) => {
        if (awayTeam && team.id === awayTeam.id) {
          return updateRecord(team, finalScore.away, finalScore.home);
        }
        if (homeTeam && team.id === homeTeam.id) {
          return updateRecord(team, finalScore.home, finalScore.away);
        }
        return team;
      });

      const nextCurrentDay = Math.max(state.season.currentDay + 1, playedGame.day + 1);
      const nextUserGameId = computeNextUserGameId(nextSchedule, state.userTeamId, nextCurrentDay);

      return {
        ...state,
        league: {
          ...state.league,
          teams: nextTeams,
          schedule: nextSchedule,
        },
        season: {
          ...state.season,
          currentDay: nextCurrentDay,
          nextUserGameId,
          pendingUserMatch: false,
        },
        liveMatch: null,
        feedLog: appendFeed(
          state.feedLog,
          `Final: ${finalScore.away}-${finalScore.home}. The club turns the page to day ${nextCurrentDay}.`,
        ),
      };
    }
    case "acknowledge_feed_items": {
      const count = clamp(action.count ?? state.feedLog.length, 0, state.feedLog.length);
      return {
        ...state,
        feedLog: state.feedLog.slice(count),
      };
    }
    case "enter_draft_phase":
      return {
        ...state,
        season: {
          ...state.season,
          phase: "draft",
          pendingUserMatch: false,
          nextUserGameId: null,
        },
        liveMatch: null,
      };
    default:
      return state;
  }
}
