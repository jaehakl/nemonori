import type { DashboardViewModel, GameState, MatchViewModel, Player, PlayerCardViewModel, Position, Team } from "../types";

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

function findSelectedTeam(state: GameState): Team {
  return state.league.teams.find((team) => team.id === state.selectedTeamId) ?? state.league.teams[0];
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
    return `최근 7일 ${player.usage.inningsLast7}이닝 / ${player.usage.pitchesLast7}구`;
  }
  return `최근 7일 ${player.usage.gamesPlayedLast7}경기 / ${player.usage.plateAppearancesLast7}타석`;
}

function formatSeasonLine(player: Player) {
  if (player.profile.role === "pitcher") {
    return `${player.seasonStats.games}G ${player.seasonStats.inningsPitched}IP ${player.seasonStats.earnedRuns}ER`;
  }
  return `${player.seasonStats.games}G ${player.seasonStats.hits}H ${player.seasonStats.homeRuns}HR ${player.seasonStats.walks}BB`;
}

function getInterview(player: Player) {
  const { drive, diligence, composure, baseballIq } = player.hidden.mental;
  if (drive >= 65 && diligence >= 65) {
    return "선수 면담: 아직 더 뛸 수 있다고 강하게 말한다. 실제 피로는 과소평가할 가능성이 있다.";
  }
  if (drive <= 45 && diligence <= 45) {
    return "선수 면담: 몸이 무겁다고 반복해서 말한다. 실제 상태보다 보수적으로 말할 수 있다.";
  }
  if (composure >= 60 && baseballIq >= 60) {
    return "선수 면담: 오늘 상태를 비교적 차분하고 객관적으로 설명한다.";
  }
  return "선수 면담: 상태 보고가 다소 애매하다. 기록과 코치 의견을 함께 봐야 한다.";
}

function getPlayerBadge(player: Player) {
  return `${player.profile.primaryPosition} · ${player.rosterLevel === "major" ? "1군" : "2군"}`;
}

export function selectDashboard(state: GameState): DashboardViewModel {
  const team = findSelectedTeam(state);
  const nextGame = state.league.schedule.find(
    (game) => !game.played && (game.awayTeamId === team.id || game.homeTeamId === team.id),
  );
  const opponentId = nextGame ? (nextGame.awayTeamId === team.id ? nextGame.homeTeamId : nextGame.awayTeamId) : null;
  const opponent = state.league.teams.find((entry) => entry.id === opponentId);

  return {
    currentDayLabel: `2026 시즌 Day ${state.league.currentDay}`,
    teamName: team.name,
    teamRecord: formatRecord(team),
    nextOpponent: opponent ? `${opponent.name}전 예정` : "예정 경기 없음",
    feedItems: state.feedLog,
    saveStatus: state.saveMeta.lastSavedAt
      ? `마지막 저장 ${new Date(state.saveMeta.lastSavedAt).toLocaleString("ko-KR")}`
      : state.saveMeta.dirty
        ? "저장되지 않은 변경 있음"
        : "아직 저장 기록 없음",
  };
}

export function selectRosterCards(state: GameState): PlayerCardViewModel[] {
  const team = findSelectedTeam(state);
  return team.majorIds.slice(0, 10).map((playerId) => {
    const player = state.league.players[playerId];
    const latestReport = player.reports[0];
    return {
      id: player.profile.id,
      name: player.profile.fullName,
      badge: getPlayerBadge(player),
      profileLine: `${player.profile.age}세 / ${player.profile.bats}-${player.profile.throws}`,
      recentUsage: formatUsage(player),
      seasonLine: formatSeasonLine(player),
      interview: getInterview(player),
      reportSummary: latestReport?.summary ?? "리포트 없음",
      reportMeta: latestReport
        ? `리포트 신뢰도 ${latestReport.confidence} / 방향 ${latestReport.direction}`
        : "리포트 메타 없음",
    };
  });
}

export function selectSelectedPlayerCard(state: GameState): PlayerCardViewModel | null {
  const player = findPlayer(state, state.selectedPlayerId);
  if (!player) {
    return null;
  }
  const latestReport = player.reports[0];
  return {
    id: player.profile.id,
    name: player.profile.fullName,
    badge: getPlayerBadge(player),
    profileLine: `${player.profile.age}세 / ${player.profile.primaryPosition} / ${player.profile.bats}-${player.profile.throws}`,
    recentUsage: formatUsage(player),
    seasonLine: formatSeasonLine(player),
    interview: getInterview(player),
    reportSummary: latestReport?.summary ?? "리포트 없음",
    reportMeta: latestReport ? `Day ${latestReport.updatedDay} / ${latestReport.confidence}` : "리포트 메타 없음",
  };
}

export function selectMatchView(state: GameState): MatchViewModel {
  const awayTeam = state.league.teams.find((team) => team.id === state.activeMatch.awayTeamId);
  const homeTeam = state.league.teams.find((team) => team.id === state.activeMatch.homeTeamId);
  return {
    header: `${awayTeam?.name ?? "Away"} @ ${homeTeam?.name ?? "Home"}`,
    inningLine: `${state.activeMatch.scoreboard.inning}회 ${state.activeMatch.scoreboard.half} / ${state.activeMatch.scoreboard.away}:${state.activeMatch.scoreboard.home}`,
    countLine: `B ${state.activeMatch.scoreboard.balls} / S ${state.activeMatch.scoreboard.strikes} / O ${state.activeMatch.scoreboard.outs}`,
    basesLine: `1루 ${state.activeMatch.bases.first ? "점유" : "비어 있음"} · 2루 ${state.activeMatch.bases.second ? "점유" : "비어 있음"} · 3루 ${state.activeMatch.bases.third ? "점유" : "비어 있음"}`,
    eventLog: state.activeMatch.eventLog,
    fieldMarkers: FIELD_LAYOUT.map((spot) => ({
      key: spot.key,
      label: spot.label,
      x: spot.x,
      y: spot.y,
      active: spot.key === "P" ? Boolean(state.activeMatch.pitcherId) : Boolean(state.activeMatch.fieldingPositions[spot.key as Position]),
    })),
  };
}
