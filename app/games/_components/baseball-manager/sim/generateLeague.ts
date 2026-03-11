import {
  CALLUP_COOLDOWN_DAYS,
  MAJOR_ROSTER_LIMIT,
  MAX_PLAYER_STAMINA,
  MINOR_ROSTER_TARGET,
  TEAM_COLORS,
  TEAM_COUNT,
  TEAM_NAMES,
} from "../constants";
import { COACH_GIVEN_NAMES, FAMILY_NAMES, GIVEN_NAMES } from "../data/name-pool";
import type {
  Coach,
  CoachFocus,
  CoachReport,
  GameState,
  LeagueState,
  MatchState,
  Player,
  Position,
  ScheduledGame,
  Team,
} from "../types";

type Rng = () => number;

const COACH_FOCUS: CoachFocus[] = ["pitching", "hitting", "defense", "mental"];
const HITTER_POSITIONS: Position[] = ["C", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH", "1B", "2B", "3B", "SS", "LF", "CF", "RF"];
const PITCHER_POSITIONS: Position[] = ["SP", "SP", "SP", "SP", "SP", "RP", "RP", "RP", "RP"];
const PITCH_TYPES = ["FB", "SL", "CB", "CH", "SF"];

function createRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function pick<T>(rng: Rng, items: readonly T[]) {
  return items[Math.floor(rng() * items.length)] as T;
}

function randomInt(rng: Rng, min: number, max: number) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function createName(rng: Rng, coach = false) {
  return `${pick(rng, FAMILY_NAMES)} ${pick(rng, coach ? COACH_GIVEN_NAMES : GIVEN_NAMES)}`;
}

function createPitchMix(rng: Rng) {
  const mix: Record<string, number> = {};
  for (const pitch of PITCH_TYPES) {
    mix[pitch] = randomInt(rng, 35, 80);
  }
  return mix;
}

function createCoach(rng: Rng, teamId: string, focus: CoachFocus, index: number): Coach {
  return {
    id: `${teamId}-coach-${focus}-${index}`,
    fullName: createName(rng, true),
    focus,
    ratings: {
      teaching: randomInt(rng, 40, 80),
      evaluation: randomInt(rng, 35, 85),
      communication: randomInt(rng, 35, 85),
      discipline: randomInt(rng, 35, 85),
    },
  };
}

function createReport(playerId: string, coachId: string, day: number, summary: string): CoachReport {
  return {
    playerId,
    coachId,
    summary,
    confidence: "medium",
    direction: "steady",
    updatedDay: day,
  };
}

function createPlayer(rng: Rng, teamId: string, index: number, position: Position, major: boolean): Player {
  const role = position === "SP" || position === "RP" ? "pitcher" : "hitter";
  const secondaryPositions: Position[] =
    role === "pitcher" ? ["RP"] : position === "C" ? ["DH"] : position === "CF" ? ["LF", "RF"] : ["LF", "RF", "DH"];

  return {
    profile: {
      id: `${teamId}-player-${index}`,
      fullName: createName(rng),
      age: randomInt(rng, 19, 35),
      primaryPosition: position,
      secondaryPositions,
      bats: pick(rng, ["L", "R", "S"] as const),
      throws: pick(rng, ["L", "R"] as const),
      role,
      jerseyNumber: randomInt(rng, 1, 99),
    },
    hidden: {
      physical: {
        recovery: randomInt(rng, 35, 80),
        durability: randomInt(rng, 35, 85),
        strength: randomInt(rng, 35, 85),
        speed: randomInt(rng, 30, 85),
      },
      technical: {
        stuff: role === "pitcher" ? randomInt(rng, 35, 85) : undefined,
        command: role === "pitcher" ? randomInt(rng, 30, 85) : undefined,
        contact: role !== "pitcher" ? randomInt(rng, 35, 85) : undefined,
        eye: role !== "pitcher" ? randomInt(rng, 35, 85) : undefined,
        power: role !== "pitcher" ? randomInt(rng, 30, 85) : undefined,
        running: role !== "pitcher" ? randomInt(rng, 30, 85) : undefined,
        fielding: randomInt(rng, 30, 80),
        pitchMix: role === "pitcher" ? createPitchMix(rng) : {},
      },
      mental: {
        composure: randomInt(rng, 30, 85),
        drive: randomInt(rng, 30, 85),
        baseballIq: randomInt(rng, 30, 85),
        diligence: randomInt(rng, 30, 85),
      },
      potential: randomInt(rng, 40, 90),
    },
    condition: {
      stamina: MAX_PLAYER_STAMINA - randomInt(rng, 0, 18),
      fatigue: randomInt(rng, 0, 25),
      injuryRisk: randomInt(rng, 5, 28),
      soreness: "stable",
      lastInterviewDay: 0,
    },
    positionSkills: {
      [position]: randomInt(rng, 45, 85),
    },
    seasonStats: {
      games: randomInt(rng, 0, 22),
      plateAppearances: role !== "pitcher" ? randomInt(rng, 0, 90) : randomInt(rng, 0, 12),
      hits: role !== "pitcher" ? randomInt(rng, 0, 30) : randomInt(rng, 0, 3),
      homeRuns: role !== "pitcher" ? randomInt(rng, 0, 6) : 0,
      walks: randomInt(rng, 0, 16),
      strikeOuts: randomInt(rng, 0, 28),
      inningsPitched: role === "pitcher" ? randomInt(rng, 0, 55) : 0,
      earnedRuns: role === "pitcher" ? randomInt(rng, 0, 20) : 0,
      pitchCount: role === "pitcher" ? randomInt(rng, 0, 780) : 0,
    },
    usage: {
      gamesPlayedLast7: randomInt(rng, 0, 6),
      plateAppearancesLast7: role !== "pitcher" ? randomInt(rng, 0, 22) : 0,
      pitchesLast7: role === "pitcher" ? randomInt(rng, 0, 160) : 0,
      inningsLast7: role === "pitcher" ? randomInt(rng, 0, 12) : 0,
    },
    career: {
      yearsPro: randomInt(rng, 0, 13),
      agingRisk: randomInt(rng, 5, 40),
      injuryHistory: randomInt(rng, 0, 4),
    },
    reports: [],
    rosterLevel: major ? "major" : "minor",
    optionalUntilDay: major ? null : CALLUP_COOLDOWN_DAYS,
  };
}

function createTeamRoster(rng: Rng, teamId: string) {
  const allPositions: Position[] = [...PITCHER_POSITIONS, ...HITTER_POSITIONS, "RP", "C", "LF", "2B"];
  const players = allPositions.map((position, index) => createPlayer(rng, teamId, index + 1, position, index < MAJOR_ROSTER_LIMIT));
  const majorIds = players.slice(0, MAJOR_ROSTER_LIMIT).map((player) => player.profile.id);
  const minorIds = players.slice(MAJOR_ROSTER_LIMIT, MAJOR_ROSTER_LIMIT + MINOR_ROSTER_TARGET).map((player) => player.profile.id);
  return { players, majorIds, minorIds };
}

function createSchedule(teamIds: string[]) {
  const schedule: ScheduledGame[] = [];
  let gameCounter = 1;
  let day = 1;

  for (let round = 0; round < 18; round += 1) {
    for (let index = 0; index < teamIds.length; index += 2) {
      const awayTeamId = teamIds[(index + round) % teamIds.length];
      const homeTeamId = teamIds[(teamIds.length - 1 - index + round) % teamIds.length];
      if (awayTeamId === homeTeamId) {
        continue;
      }
      schedule.push({
        id: `game-${gameCounter}`,
        day,
        awayTeamId,
        homeTeamId,
        played: false,
        score: null,
      });
      gameCounter += 1;
    }
    day += 1;
    if (day % 7 === 1) {
      day += 1;
    }
  }

  return schedule;
}

function createActiveMatch(league: LeagueState, selectedTeamId: string): MatchState {
  const selectedTeam = league.teams.find((team) => team.id === selectedTeamId) ?? league.teams[0];
  const nextGame =
    league.schedule.find((game) => !game.played && (game.awayTeamId === selectedTeam.id || game.homeTeamId === selectedTeam.id)) ??
    league.schedule[0];

  return {
    gameId: nextGame.id,
    day: nextGame.day,
    awayTeamId: nextGame.awayTeamId,
    homeTeamId: nextGame.homeTeamId,
    scoreboard: {
      inning: 1,
      half: "top",
      outs: 0,
      balls: 0,
      strikes: 0,
      away: 0,
      home: 0,
    },
    bases: {
      first: null,
      second: null,
      third: null,
    },
    batterId: selectedTeam.depthChart.lineup[0] ?? null,
    pitcherId: selectedTeam.depthChart.rotation[0] ?? null,
    fieldingPositions: {
      C: selectedTeam.depthChart.lineup[1],
      "1B": selectedTeam.depthChart.lineup[2],
      "2B": selectedTeam.depthChart.lineup[3],
      "3B": selectedTeam.depthChart.lineup[4],
      SS: selectedTeam.depthChart.lineup[5],
      LF: selectedTeam.depthChart.lineup[6],
      CF: selectedTeam.depthChart.lineup[7],
      RF: selectedTeam.depthChart.lineup[8],
    },
    eventLog: ["Opening pitch planned. Manager can watch or intervene with simple tactics."],
    canSubstitute: true,
    pendingStrategy: "auto",
  };
}

export function createNewGameState(seed = 20260311): GameState {
  const rng = createRng(seed);
  const players: LeagueState["players"] = {};
  const coaches: LeagueState["coaches"] = {};
  const teams: Team[] = [];

  for (let index = 0; index < TEAM_COUNT; index += 1) {
    const teamId = `team-${index + 1}`;
    const { players: teamPlayers, majorIds, minorIds } = createTeamRoster(rng, teamId);
    const teamCoaches = COACH_FOCUS.map((focus, coachIndex) => createCoach(rng, teamId, focus, coachIndex + 1));
    const coachIds = teamCoaches.map((coach) => coach.id);

    for (const coach of teamCoaches) {
      coaches[coach.id] = coach;
    }

    for (const player of teamPlayers) {
      player.reports = coachIds.slice(0, 2).map((coachId, reportIndex) =>
        createReport(
          player.profile.id,
          coachId,
          1,
          reportIndex === 0
            ? "최근 상태는 무난하다. 다만 실제 컨디션은 출장 관리에 따라 빠르게 흔들릴 수 있다."
            : "성적만 보면 단정하기 어렵다. 기술 성장 여지를 텍스트 리포트로 보완해야 한다.",
        ),
      );
      players[player.profile.id] = player;
    }

    const lineup = majorIds.filter((id) => players[id].profile.role !== "pitcher").slice(0, 9);
    const bench = majorIds.filter((id) => !lineup.includes(id) && players[id].profile.role !== "pitcher");
    const rotation = majorIds.filter((id) => players[id].profile.primaryPosition === "SP").slice(0, 5);
    const bullpen = majorIds.filter((id) => players[id].profile.primaryPosition === "RP");

    teams.push({
      id: teamId,
      name: TEAM_NAMES[index],
      accent: TEAM_COLORS[index],
      philosophy: pick(rng, ["pitching-first", "contact-and-speed", "power-balance", "defense-discipline"] as const),
      record: {
        wins: randomInt(rng, 8, 18),
        losses: randomInt(rng, 8, 18),
        draws: randomInt(rng, 0, 2),
      },
      playerIds: [...majorIds, ...minorIds],
      majorIds,
      minorIds,
      coachIds,
      depthChart: {
        lineup,
        bench,
        rotation,
        bullpen,
      },
    });
  }

  const schedule = createSchedule(teams.map((team) => team.id));
  const league: LeagueState = {
    seasonYear: 2026,
    currentDay: 12,
    teams,
    players,
    coaches,
    schedule,
    draftPoolIds: [],
    standingsOrder: teams.map((team) => team.id),
  };
  const selectedTeamId = teams[0]?.id ?? "team-1";

  return {
    seed,
    currentScreen: "dashboard",
    selectedTeamId,
    selectedPlayerId: teams[0]?.majorIds[0] ?? null,
    highlightedGameId: schedule[0]?.id ?? null,
    league,
    activeMatch: createActiveMatch(league, selectedTeamId),
    feedLog: [
      "Spring campaign has settled into the regular season rhythm.",
      "Coaches report that several reserve players are trending upward in the minors.",
      "Medical staff warns that catcher workload should be monitored closely.",
    ],
    saveMeta: {
      lastSavedAt: null,
      dirty: false,
    },
  };
}
