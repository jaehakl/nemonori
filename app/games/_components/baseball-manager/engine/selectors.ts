import type {
  DashboardViewModel,
  GameState,
  MatchViewModel,
  Player,
  PlayerCardViewModel,
  PlayerDirectoryFilters,
  PlayerDirectoryRowViewModel,
  Position,
  Team,
} from "../types";

const FIELD_LAYOUT: Array<{ key: Position | "P"; label: string; x: number; y: number }> = [
  { key: "C", label: "C", x: 50, y: 82 },
  { key: "1B", label: "1B", x: 70, y: 54 },
  { key: "2B", label: "2B", x: 50, y: 38 },
  { key: "3B", label: "3B", x: 30, y: 54 },
  { key: "SS", label: "SS", x: 38, y: 44 },
  { key: "LF", label: "LF", x: 18, y: 24 },
  { key: "CF", label: "CF", x: 50, y: 14 },
  { key: "RF", label: "RF", x: 82, y: 24 },
  { key: "P", label: "P", x: 50, y: 60 },
];

function findUserTeam(state: GameState): Team {
  return state.league.teams.find((team) => team.id === state.userTeamId) ?? state.league.teams[0];
}

function findPlayer(state: GameState, playerId: string | null): Player | null {
  if (!playerId) {
    return null;
  }
  return state.league.players[playerId] ?? null;
}

function formatRecord(team: Team) {
  return `${team.record.wins}-${team.record.losses}-${team.record.draws}`;
}

function formatUsage(player: Player) {
  if (player.profile.role === "pitcher") {
    return `Last 7 days: ${player.usage.inningsLast7} IP / ${player.usage.pitchesLast7} pitches`;
  }
  return `Last 7 days: ${player.usage.gamesPlayedLast7} games / ${player.usage.plateAppearancesLast7} PA`;
}

function formatSeasonLine(player: Player) {
  if (player.profile.role === "pitcher") {
    return `${player.seasonStats.games}G ${player.seasonStats.inningsPitched}IP ${player.seasonStats.earnedRuns}ER`;
  }
  return `${player.seasonStats.games}G ${player.seasonStats.hits}H ${player.seasonStats.homeRuns}HR ${player.seasonStats.walks}BB`;
}

function formatCondition(player: Player) {
  return `Condition ${player.condition.soreness} / stamina band ${Math.round(player.condition.stamina / 10) * 10}`;
}

function calculateBattingAverage(player: Player) {
  const atBats = Math.max(player.seasonStats.plateAppearances - player.seasonStats.walks, 0);
  if (atBats === 0) {
    return 0;
  }
  return player.seasonStats.hits / atBats;
}

function calculateEra(player: Player) {
  if (player.seasonStats.inningsPitched <= 0) {
    return 0;
  }
  return (player.seasonStats.earnedRuns * 9) / player.seasonStats.inningsPitched;
}

function formatAverage(value: number) {
  return value === 0 ? ".000" : value.toFixed(3).replace(/^0/, "");
}

function getInterview(player: Player) {
  const { drive, diligence, composure, baseballIq } = player.hidden.mental;
  if (drive >= 65 && diligence >= 65) {
    return "Player interview: energy is high, but staff still wants the workload monitored.";
  }
  if (drive <= 45 && diligence <= 45) {
    return "Player interview: body feels heavy and confidence sounds lower than usual.";
  }
  if (composure >= 60 && baseballIq >= 60) {
    return "Player interview: status report is calm, detailed, and tactically aware.";
  }
  return "Player interview: report is mixed. Coaching notes matter more than the quote alone.";
}

function getPlayerBadge(player: Player) {
  return `${player.profile.primaryPosition} / ${player.rosterLevel === "major" ? "Major" : "Minor"}`;
}

function findTeamByPlayer(state: GameState, playerId: string) {
  return state.league.teams.find((team) => team.playerIds.includes(playerId)) ?? null;
}

export function selectDashboard(state: GameState): DashboardViewModel {
  const team = findUserTeam(state);
  const nextGame = state.season.nextUserGameId
    ? state.league.schedule.find((game) => game.id === state.season.nextUserGameId)
    : null;
  const opponentId = nextGame ? (nextGame.awayTeamId === team.id ? nextGame.homeTeamId : nextGame.awayTeamId) : null;
  const opponent = state.league.teams.find((entry) => entry.id === opponentId);

  return {
    currentDayLabel: `${state.season.seasonYear} Season Day ${state.season.currentDay}`,
    teamName: team.name,
    teamRecord: formatRecord(team),
    nextOpponent: opponent ? `${opponent.name} on day ${nextGame?.day}` : "No scheduled user game remaining",
    feedItems: state.feedLog,
    matchStatus: state.season.pendingUserMatch ? "Your next game is ready to start." : "The season can auto-sim to the next user decision point.",
  };
}

export function selectRosterCards(state: GameState): PlayerCardViewModel[] {
  const team = findUserTeam(state);
  return team.majorIds.slice(0, 10).map((playerId) => {
    const player = state.league.players[playerId];
    const playerTeam = findTeamByPlayer(state, playerId);
    const latestReport = player.reports[0];
    return {
      id: player.profile.id,
      name: player.profile.fullName,
      badge: getPlayerBadge(player),
      teamLine: playerTeam?.name ?? "Unknown club",
      profileLine: `${player.profile.age} / ${player.profile.bats}-${player.profile.throws}`,
      conditionLine: formatCondition(player),
      recentUsage: formatUsage(player),
      seasonLine: formatSeasonLine(player),
      interview: getInterview(player),
      reportSummary: latestReport?.summary ?? "No report available",
      reportMeta: latestReport
        ? `Report confidence ${latestReport.confidence} / direction ${latestReport.direction}`
        : "No recent report metadata",
    };
  });
}

export function selectSelectedPlayerCard(state: GameState, playerId: string | null): PlayerCardViewModel | null {
  const player = findPlayer(state, playerId);
  if (!player) {
    return null;
  }
  const playerTeam = findTeamByPlayer(state, player.profile.id);
  const latestReport = player.reports[0];
  return {
    id: player.profile.id,
    name: player.profile.fullName,
    badge: getPlayerBadge(player),
    teamLine: playerTeam?.name ?? "Unknown club",
    profileLine: `${player.profile.age} / ${player.profile.primaryPosition} / ${player.profile.bats}-${player.profile.throws}`,
    conditionLine: formatCondition(player),
    recentUsage: formatUsage(player),
    seasonLine: formatSeasonLine(player),
    interview: getInterview(player),
    reportSummary: latestReport?.summary ?? "No report available",
    reportMeta: latestReport ? `Day ${latestReport.updatedDay} / ${latestReport.confidence}` : "No recent report metadata",
  };
}

export function selectMatchView(state: GameState): MatchViewModel | null {
  if (!state.liveMatch) {
    return null;
  }

  const awayTeam = state.league.teams.find((team) => team.id === state.liveMatch?.awayTeamId);
  const homeTeam = state.league.teams.find((team) => team.id === state.liveMatch?.homeTeamId);

  return {
    header: `${awayTeam?.name ?? "Away"} @ ${homeTeam?.name ?? "Home"}`,
    inningLine: `${state.liveMatch.scoreboard.inning} ${state.liveMatch.scoreboard.half} / ${state.liveMatch.scoreboard.away}:${state.liveMatch.scoreboard.home}`,
    countLine: `B ${state.liveMatch.scoreboard.balls} / S ${state.liveMatch.scoreboard.strikes} / O ${state.liveMatch.scoreboard.outs}`,
    basesLine: `1B ${state.liveMatch.bases.first ? "occupied" : "empty"} / 2B ${state.liveMatch.bases.second ? "occupied" : "empty"} / 3B ${state.liveMatch.bases.third ? "occupied" : "empty"}`,
    eventLog: state.liveMatch.eventLog,
    fieldMarkers: FIELD_LAYOUT.map((spot) => ({
      key: spot.key,
      label: spot.label,
      x: spot.x,
      y: spot.y,
      active: spot.key === "P" ? Boolean(state.liveMatch?.pitcherId) : Boolean(state.liveMatch?.fieldingPositions[spot.key as Position]),
    })),
  };
}

export function selectPlayerDirectory(state: GameState, filters: PlayerDirectoryFilters): PlayerDirectoryRowViewModel[] {
  const search = filters.search.trim().toLowerCase();

  const rows = Object.values(state.league.players)
    .map((player) => {
      const team = findTeamByPlayer(state, player.profile.id);
      return {
        id: player.profile.id,
        name: player.profile.fullName,
        teamName: team?.name ?? "Unknown club",
        teamId: team?.id ?? "",
        rosterLevel: player.rosterLevel === "major" ? "Major" : "Minor",
        role: player.profile.role,
        position: player.profile.primaryPosition,
        age: player.profile.age,
        games: player.seasonStats.games,
        inningsPitched: player.seasonStats.inningsPitched,
        battingAverage: calculateBattingAverage(player),
        battingAverageLabel: formatAverage(calculateBattingAverage(player)),
        homeRuns: player.seasonStats.homeRuns,
        earnedRunAverage: calculateEra(player),
        earnedRunAverageLabel: formatAverage(calculateEra(player)),
      };
    })
    .filter((row) => {
      if (search && !`${row.name} ${row.teamName} ${row.position}`.toLowerCase().includes(search)) {
        return false;
      }
      if (filters.teamId !== "all" && row.teamId !== filters.teamId) {
        return false;
      }
      if (filters.rosterLevel !== "all" && row.rosterLevel.toLowerCase() !== filters.rosterLevel) {
        return false;
      }
      if (filters.role !== "all" && row.role !== filters.role) {
        return false;
      }
      if (filters.position !== "all" && row.position !== filters.position) {
        return false;
      }
      return true;
    });

  const direction = filters.sortDirection === "asc" ? 1 : -1;
  rows.sort((left, right) => {
    switch (filters.sortKey) {
      case "team":
        return direction * left.teamName.localeCompare(right.teamName);
      case "age":
        return direction * (left.age - right.age);
      case "position":
        return direction * left.position.localeCompare(right.position);
      case "roster":
        return direction * left.rosterLevel.localeCompare(right.rosterLevel);
      case "role":
        return direction * left.role.localeCompare(right.role);
      case "games":
        return direction * (left.games - right.games);
      case "inningsPitched":
        return direction * (left.inningsPitched - right.inningsPitched);
      case "battingAverage":
        return direction * (left.battingAverage - right.battingAverage);
      case "homeRuns":
        return direction * (left.homeRuns - right.homeRuns);
      case "earnedRunAverage":
        return direction * (left.earnedRunAverage - right.earnedRunAverage);
      case "name":
      default:
        return direction * left.name.localeCompare(right.name);
    }
  });

  return rows.map(({ teamId: _teamId, ...row }) => row);
}
