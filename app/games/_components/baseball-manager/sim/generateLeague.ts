import {
  CALLUP_COOLDOWN_DAYS,
  MAJOR_ROSTER_LIMIT,
  MAX_PLAYER_STAMINA,
  MINOR_ROSTER_TARGET,
  TEAM_COLORS,
  TEAM_COUNT,
  TEAM_NAMES,
} from "../constants";
import { FAMILY_NAME_SYLLABLES, FINAL_NAME_SYLLABLES, MIDDLE_NAME_SYLLABLES } from "../data/name-pool";
import type {
  Coach,
  CoachFocus,
  CoachReport,
  GameState,
  LeagueState,
  LiveMatchState,
  Player,
  Position,
  RosterOpsState,
  ScheduledGame,
  Team,
} from "../types";

type Rng = () => number;

const COACH_FOCUS: CoachFocus[] = ["pitching", "hitting", "defense", "mental"];
const MAJOR_POSITIONS: Position[] = [
  "SP",
  "SP",
  "SP",
  "SP",
  "SP",
  "RP",
  "RP",
  "RP",
  "RP",
  "RP",
  "RP",
  "RP",
  "RP",
  "C",
  "C",
  "1B",
  "2B",
  "3B",
  "SS",
  "LF",
  "CF",
  "RF",
  "DH",
  "1B",
  "2B",
  "3B",
  "SS",
  "LF",
  "RF",
];
const MINOR_POSITIONS: Position[] = [
  "SP",
  "SP",
  "SP",
  "SP",
  "SP",
  "SP",
  "RP",
  "RP",
  "RP",
  "RP",
  "RP",
  "RP",
  "RP",
  "RP",
  "C",
  "C",
  "C",
  "1B",
  "1B",
  "2B",
  "2B",
  "3B",
  "3B",
  "SS",
  "SS",
  "LF",
  "LF",
  "CF",
  "CF",
  "RF",
  "DH",
];
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
  const lastName = pick(rng, FAMILY_NAME_SYLLABLES);
  const middleSyllable = pick(rng, MIDDLE_NAME_SYLLABLES);
  const finalSyllable = pick(rng, FINAL_NAME_SYLLABLES);

  if (coach && rng() > 0.65) {
    return `${lastName}${finalSyllable}${middleSyllable}`;
  }

  return `${lastName}${middleSyllable}${finalSyllable}`;
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
  const allPositions: Position[] = [...MAJOR_POSITIONS, ...MINOR_POSITIONS];
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

function createRosterOps(team: Team): RosterOpsState {
  return {
    lineup: [...team.depthChart.lineup],
    bench: [...team.depthChart.bench],
    rotation: [...team.depthChart.rotation],
    bullpen: [...team.depthChart.bullpen],
  };
}

function findNextUserGameId(schedule: ScheduledGame[], userTeamId: string, currentDay: number) {
  return (
    schedule.find(
      (game) =>
        !game.played &&
        game.day >= currentDay &&
        (game.awayTeamId === userTeamId || game.homeTeamId === userTeamId),
    )?.id ?? null
  );
}

export function createLiveMatchSession(gameState: GameState): LiveMatchState | null {
  const { league, rosterOps, userTeamId, season } = gameState;
  if (!season.nextUserGameId) {
    return null;
  }

  const nextGame = league.schedule.find((game) => game.id === season.nextUserGameId);
  if (!nextGame) {
    return null;
  }

  const userIsAway = nextGame.awayTeamId === userTeamId;
  const battingOrder = rosterOps.lineup;

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
    batterId: battingOrder[0] ?? null,
    pitcherId: rosterOps.rotation[0] ?? null,
    fieldingPositions: {
      C: battingOrder[0] ?? null,
      "1B": battingOrder[1] ?? null,
      "2B": battingOrder[2] ?? null,
      "3B": battingOrder[3] ?? null,
      SS: battingOrder[4] ?? null,
      LF: battingOrder[5] ?? null,
      CF: battingOrder[6] ?? null,
      RF: battingOrder[7] ?? null,
      DH: battingOrder[8] ?? null,
      ...(userIsAway ? {} : {}),
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
            ? "Recent form looks stable, but workload management still matters."
            : "Box-score production only tells part of the story. Coaches want more live looks.",
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
    teams,
    players,
    coaches,
    schedule,
    draftPoolIds: [],
    standingsOrder: teams.map((team) => team.id),
  };
  const userTeamId = teams[0]?.id ?? "team-1";
  const userTeam = teams.find((team) => team.id === userTeamId) ?? teams[0];
  const currentDay = 1;
  const nextUserGameId = findNextUserGameId(schedule, userTeamId, currentDay);

  return {
    seed,
    league,
    userTeamId,
    season: {
      seasonYear: 2026,
      currentDay,
      phase: "regular-season",
      nextUserGameId,
      pendingUserMatch: Boolean(nextUserGameId && schedule.find((game) => game.id === nextUserGameId)?.day === currentDay),
    },
    rosterOps: createRosterOps(userTeam),
    liveMatch: null,
    feedLog: [
      "Spring campaign has settled into the regular season rhythm.",
      "Coaches report that several reserve players are trending upward in the minors.",
      "Medical staff warns that catcher workload should be monitored closely.",
    ],
  };
}
