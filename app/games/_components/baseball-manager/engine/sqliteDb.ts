import initSqlJs, { type Database, type QueryExecResult, type SqlJsStatic } from "sql.js";
import type {
  GameState,
  MatchDetailViewModel,
  MatchDirectoryFilters,
  MatchDirectoryRowViewModel,
  MatchPitchLogRowViewModel,
  PlayerDetailViewModel,
  PlayerDirectoryFilters,
  PlayerDirectoryRowViewModel,
  Position,
  ScheduledGame,
  Team,
} from "../types";

const SIM_PITCH_TYPES = ["FB", "SL", "CB", "CH", "SF"] as const;
const HIT_RESULTS = ["ground-ball", "fly-ball", "single", "double", "triple", "home-run", "error"] as const;

let sqlJsPromise: Promise<SqlJsStatic> | null = null;

export const BASEBALL_MANAGER_SQL_SCHEMA = `
CREATE TABLE IF NOT EXISTS teams (
  team_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  accent TEXT NOT NULL,
  philosophy TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS players (
  player_id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  full_name TEXT NOT NULL,
  age INTEGER NOT NULL,
  bats TEXT NOT NULL,
  throws_hand TEXT NOT NULL,
  primary_position TEXT NOT NULL,
  roster_level TEXT NOT NULL,
  jersey_number INTEGER NOT NULL,
  FOREIGN KEY (team_id) REFERENCES teams(team_id)
);

CREATE TABLE IF NOT EXISTS matches (
  match_id TEXT PRIMARY KEY,
  season_year INTEGER NOT NULL,
  match_day INTEGER NOT NULL,
  match_date TEXT,
  home_team_id TEXT NOT NULL,
  away_team_id TEXT NOT NULL,
  played INTEGER NOT NULL DEFAULT 0,
  home_score INTEGER,
  away_score INTEGER,
  FOREIGN KEY (home_team_id) REFERENCES teams(team_id),
  FOREIGN KEY (away_team_id) REFERENCES teams(team_id)
);

CREATE TABLE IF NOT EXISTS pitches (
  pitch_id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id TEXT NOT NULL,
  inning INTEGER NOT NULL,
  half_inning TEXT NOT NULL CHECK (half_inning IN ('top', 'bottom')),
  sequence_no INTEGER NOT NULL,
  pitcher_id TEXT NOT NULL,
  batter_id TEXT NOT NULL,
  pitch_type TEXT,
  velocity_kph REAL,
  outcome_category TEXT NOT NULL,
  bso_result TEXT,
  contact_type TEXT,
  play_result TEXT,
  runs_scored INTEGER NOT NULL DEFAULT 0,
  rbi INTEGER NOT NULL DEFAULT 0,
  runner_on_1b_before TEXT,
  runner_on_2b_before TEXT,
  runner_on_3b_before TEXT,
  notes TEXT,
  FOREIGN KEY (match_id) REFERENCES matches(match_id),
  FOREIGN KEY (pitcher_id) REFERENCES players(player_id),
  FOREIGN KEY (batter_id) REFERENCES players(player_id)
);

CREATE INDEX IF NOT EXISTS idx_players_team_id ON players(team_id);
CREATE INDEX IF NOT EXISTS idx_matches_day ON matches(match_day);
CREATE INDEX IF NOT EXISTS idx_matches_home_away ON matches(home_team_id, away_team_id);
CREATE INDEX IF NOT EXISTS idx_pitches_match_seq ON pitches(match_id, inning, half_inning, sequence_no);
CREATE INDEX IF NOT EXISTS idx_pitches_pitcher_id ON pitches(pitcher_id, match_id);
CREATE INDEX IF NOT EXISTS idx_pitches_batter_id ON pitches(batter_id, match_id);
`;

function getTeamById(state: GameState, teamId: string): Team | null {
  return state.league.teams.find((team) => team.id === teamId) ?? null;
}

function toMatchDateLabel(seasonYear: number, matchDay: number) {
  const baseDate = new Date(Date.UTC(seasonYear, 2, 1));
  baseDate.setUTCDate(baseDate.getUTCDate() + Math.max(matchDay - 1, 0));
  return baseDate.toISOString().slice(0, 10);
}

function normalizePosition(position: Position) {
  return position;
}

function createRng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function pick<T>(rng: () => number, items: readonly T[]) {
  return items[Math.floor(rng() * items.length)] as T;
}

function randomInt(rng: () => number, min: number, max: number) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

type SimHalfInningState = {
  inning: number;
  half: "top" | "bottom";
  sequenceNo: number;
  batterIndex: number;
  outs: number;
  runs: number;
  first: string | null;
  second: string | null;
  third: string | null;
};

type SimPitchRow = [
  string,
  number,
  "top" | "bottom",
  number,
  string,
  string,
  string,
  number,
  string,
  string | null,
  string | null,
  string | null,
  number,
  number,
  string | null,
  string | null,
  string | null,
  string
];

type SimMatchResult = {
  homeScore: number;
  awayScore: number;
  pitches: SimPitchRow[];
};

function getTeamLineup(state: GameState, teamId: string) {
  const team = getTeamById(state, teamId);
  if (!team) {
    return [];
  }
  return team.depthChart.lineup.filter((playerId) => Boolean(state.league.players[playerId])).slice(0, 9);
}

function getStartingPitcher(state: GameState, teamId: string) {
  const team = getTeamById(state, teamId);
  return team?.depthChart.rotation[0] ?? team?.majorIds.find((playerId) => state.league.players[playerId]?.profile.role === "pitcher") ?? null;
}

function advanceRunners(
  bases: Pick<SimHalfInningState, "first" | "second" | "third">,
  batterId: string,
  basesTaken: number,
) {
  let runs = 0;
  let first: string | null = null;
  let second: string | null = null;
  let third: string | null = null;

  const scoreRunner = (runnerId: string | null) => {
    if (runnerId) {
      runs += 1;
    }
  };

  if (basesTaken >= 4) {
    scoreRunner(bases.third);
    scoreRunner(bases.second);
    scoreRunner(bases.first);
    runs += 1;
    return { runs, first, second, third };
  }

  if (bases.third) {
    if (basesTaken >= 1) {
      scoreRunner(bases.third);
    } else {
      third = bases.third;
    }
  }

  if (bases.second) {
    if (basesTaken >= 2) {
      scoreRunner(bases.second);
    } else if (basesTaken === 1) {
      third = bases.second;
    } else {
      second = bases.second;
    }
  }

  if (bases.first) {
    if (basesTaken >= 3) {
      scoreRunner(bases.first);
    } else if (basesTaken === 2) {
      third = bases.first;
    } else if (basesTaken === 1) {
      second = bases.first;
    } else {
      first = bases.first;
    }
  }

  if (basesTaken === 3) {
    third = batterId;
  } else if (basesTaken === 2) {
    second = batterId;
  } else if (basesTaken === 1) {
    first = batterId;
  }

  return { runs, first, second, third };
}

function simulateHalfInning(
  rng: () => number,
  matchId: string,
  inning: number,
  half: "top" | "bottom",
  battingTeamId: string,
  fieldingTeamId: string,
  lineup: string[],
  pitcherId: string,
  initialBatterIndex: number,
) {
  const pitches: SimPitchRow[] = [];
  const state: SimHalfInningState = {
    inning,
    half,
    sequenceNo: 1,
    batterIndex: initialBatterIndex,
    outs: 0,
    runs: 0,
    first: null,
    second: null,
    third: null,
  };

  while (state.outs < 3 && lineup.length > 0) {
    const batterId = lineup[state.batterIndex % lineup.length]!;
    const pitchType = pick(rng, SIM_PITCH_TYPES);
    const velocity = randomInt(rng, 132, 157);
    const eventRoll = rng();

    let outcomeCategory = "ball-in-play";
    let bsoResult: string | null = null;
    let contactType: string | null = null;
    let playResult: string | null = null;
    let runsScored = 0;
    let rbi = 0;
    const firstBefore = state.first;
    const secondBefore = state.second;
    const thirdBefore = state.third;
    let notes = "";

    if (eventRoll < 0.12) {
      outcomeCategory = "ball";
      bsoResult = "ball";
      playResult = "walk";
      if (state.third && state.second && state.first) {
        runsScored = 1;
        rbi = 1;
      }
      state.third = state.second && state.first ? state.second : state.third;
      state.second = state.first ? state.first : state.second;
      state.first = batterId;
      notes = "Four-pitch walk.";
    } else if (eventRoll < 0.34) {
      outcomeCategory = "strike";
      bsoResult = "strike";
      playResult = "strikeout";
      state.outs += 1;
      notes = "Swinging strike three.";
    } else {
      playResult = pick(rng, HIT_RESULTS);
      if (playResult === "ground-ball" || playResult === "fly-ball") {
        contactType = playResult === "ground-ball" ? "ground-ball" : "fly-ball";
        outcomeCategory = contactType;
        state.outs += 1;
        notes = playResult === "ground-ball" ? "Routine groundout." : "Shallow flyout.";
      } else if (playResult === "error") {
        outcomeCategory = "ball-in-play";
        contactType = "ground-ball";
        const advanced = advanceRunners(state, batterId, 1);
        runsScored = advanced.runs;
        rbi = 0;
        state.first = advanced.first;
        state.second = advanced.second;
        state.third = advanced.third;
        notes = "Reached on fielding error.";
      } else {
        const basesTaken = playResult === "single" ? 1 : playResult === "double" ? 2 : playResult === "triple" ? 3 : 4;
        outcomeCategory = playResult;
        contactType = basesTaken >= 2 ? "fly-ball" : "line-drive";
        const advanced = advanceRunners(state, batterId, basesTaken);
        runsScored = advanced.runs;
        rbi = advanced.runs;
        state.first = advanced.first;
        state.second = advanced.second;
        state.third = advanced.third;
        notes =
          playResult === "home-run"
            ? "Ball leaves the yard."
            : playResult === "triple"
              ? "Gap shot rolls to the wall."
              : playResult === "double"
                ? "Lined into the alley for extra bases."
                : "Clean single through the infield.";
      }
    }

    state.runs += runsScored;
    pitches.push([
      matchId,
      state.inning,
      state.half,
      state.sequenceNo,
      pitcherId,
      batterId,
      pitchType,
      velocity,
      outcomeCategory,
      bsoResult,
      contactType,
      playResult,
      runsScored,
      rbi,
      firstBefore,
      secondBefore,
      thirdBefore,
      notes,
    ]);

    state.sequenceNo += 1;
    state.batterIndex += 1;
  }

  return {
    nextBatterIndex: state.batterIndex,
    runs: state.runs,
    pitches,
  };
}

function simulateOpeningDayMatch(state: GameState, game: ScheduledGame, seedOffset: number): SimMatchResult {
  const rng = createRng((state.seed + seedOffset) >>> 0);
  const awayLineup = getTeamLineup(state, game.awayTeamId);
  const homeLineup = getTeamLineup(state, game.homeTeamId);
  const awayPitcherId = getStartingPitcher(state, game.awayTeamId);
  const homePitcherId = getStartingPitcher(state, game.homeTeamId);

  if (!awayPitcherId || !homePitcherId || awayLineup.length === 0 || homeLineup.length === 0) {
    return {
      awayScore: 0,
      homeScore: 0,
      pitches: [],
    };
  }

  let awayScore = 0;
  let homeScore = 0;
  let awayBatterIndex = 0;
  let homeBatterIndex = 0;
  const pitches: SimPitchRow[] = [];

  for (let inning = 1; inning <= 9; inning += 1) {
    const topHalf = simulateHalfInning(
      rng,
      game.id,
      inning,
      "top",
      game.awayTeamId,
      game.homeTeamId,
      awayLineup,
      homePitcherId,
      awayBatterIndex,
    );
    awayBatterIndex = topHalf.nextBatterIndex;
    awayScore += topHalf.runs;
    pitches.push(...topHalf.pitches);

    const bottomHalf = simulateHalfInning(
      rng,
      game.id,
      inning,
      "bottom",
      game.homeTeamId,
      game.awayTeamId,
      homeLineup,
      awayPitcherId,
      homeBatterIndex,
    );
    homeBatterIndex = bottomHalf.nextBatterIndex;
    homeScore += bottomHalf.runs;
    pitches.push(...bottomHalf.pitches);
  }

  return {
    awayScore,
    homeScore,
    pitches,
  };
}

export async function loadSqlJs() {
  sqlJsPromise ??= initSqlJs({
    locateFile: (file) => `/vendor/${file}`,
  });
  return sqlJsPromise;
}

export async function createBaseballManagerDb(): Promise<Database> {
  const SQL = await loadSqlJs();
  const db = new SQL.Database();
  db.exec(BASEBALL_MANAGER_SQL_SCHEMA);
  return db;
}

function insertTeams(db: Database, state: GameState) {
  const stmt = db.prepare(`
    INSERT INTO teams (team_id, name, accent, philosophy)
    VALUES (?, ?, ?, ?)
  `);

  try {
    for (const team of state.league.teams) {
      stmt.run([team.id, team.name, team.accent, team.philosophy]);
    }
  } finally {
    stmt.free();
  }
}

function insertPlayers(db: Database, state: GameState) {
  const stmt = db.prepare(`
    INSERT INTO players (
      player_id, team_id, full_name, age, bats, throws_hand, primary_position, roster_level, jersey_number
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  try {
    for (const team of state.league.teams) {
      for (const playerId of team.playerIds) {
        const player = state.league.players[playerId];
        if (!player) {
          continue;
        }

        stmt.run([
          player.profile.id,
          team.id,
          player.profile.fullName,
          player.profile.age,
          player.profile.bats,
          player.profile.throws,
          normalizePosition(player.profile.primaryPosition),
          player.rosterLevel,
          player.profile.jerseyNumber,
        ]);
      }
    }
  } finally {
    stmt.free();
  }
}

function insertMatches(db: Database, state: GameState) {
  const stmt = db.prepare(`
    INSERT INTO matches (
      match_id, season_year, match_day, match_date, home_team_id, away_team_id, played, home_score, away_score
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const openingDayGames = state.league.schedule.filter((game) => game.day === 1).slice(0, 5);
  const openingDayResults = new Map(openingDayGames.map((game, index) => [game.id, simulateOpeningDayMatch(state, game, index + 1)]));

  try {
    for (const game of state.league.schedule) {
      stmt.run(matchRowFromSchedule(state, game, openingDayResults.get(game.id)));
    }
  } finally {
    stmt.free();
  }
}

function matchRowFromSchedule(state: GameState, game: ScheduledGame, simulated?: SimMatchResult) {
  return [
    game.id,
    state.season.seasonYear,
    game.day,
    toMatchDateLabel(state.season.seasonYear, game.day),
    game.homeTeamId,
    game.awayTeamId,
    simulated ? 1 : game.played ? 1 : 0,
    simulated ? simulated.homeScore : game.score?.home ?? null,
    simulated ? simulated.awayScore : game.score?.away ?? null,
  ];
}

function insertSimulatedOpeningDayPitches(db: Database, state: GameState) {
  const openingDayGames = state.league.schedule.filter((game) => game.day === 1).slice(0, 5);
  const stmt = db.prepare(`
    INSERT INTO pitches (
      match_id, inning, half_inning, sequence_no, pitcher_id, batter_id, pitch_type, velocity_kph,
      outcome_category, bso_result, contact_type, play_result, runs_scored, rbi,
      runner_on_1b_before, runner_on_2b_before, runner_on_3b_before, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  try {
    for (const [index, game] of openingDayGames.entries()) {
      const simulation = simulateOpeningDayMatch(state, game, index + 1);
      for (const pitchRow of simulation.pitches) {
        stmt.run(pitchRow);
      }
    }
  } finally {
    stmt.free();
  }
}

export async function seedBaseballManagerDb(state: GameState) {
  const db = await createBaseballManagerDb();
  db.exec("BEGIN TRANSACTION");

  try {
    insertTeams(db, state);
    insertPlayers(db, state);
    insertMatches(db, state);
    insertSimulatedOpeningDayPitches(db, state);
    db.exec("COMMIT");
    return db;
  } catch (error) {
    db.exec("ROLLBACK");
    db.close();
    throw error;
  }
}

export function getPlayerSeasonBoxQuery(playerId: string) {
  return `
    SELECT
      p.player_id,
      p.full_name,
      t.name AS team_name,
      COUNT(*) AS total_pitches,
      SUM(CASE WHEN pitch.batter_id = '${playerId}' THEN 1 ELSE 0 END) AS batter_pitch_count,
      SUM(CASE WHEN pitch.pitcher_id = '${playerId}' THEN 1 ELSE 0 END) AS pitcher_pitch_count
    FROM players p
    JOIN teams t ON t.team_id = p.team_id
    LEFT JOIN pitches pitch
      ON pitch.batter_id = p.player_id
      OR pitch.pitcher_id = p.player_id
    WHERE p.player_id = '${playerId}'
    GROUP BY p.player_id, p.full_name, t.name
  `;
}

export function getMatchHeaderQuery() {
  return `
    SELECT
      m.match_id,
      m.match_day,
      m.match_date,
      home.name AS home_team_name,
      away.name AS away_team_name,
      m.home_score,
      m.away_score,
      m.played
    FROM matches m
    JOIN teams home ON home.team_id = m.home_team_id
    JOIN teams away ON away.team_id = m.away_team_id
    ORDER BY m.match_day, m.match_id
  `;
}

export function getPitchLogByMatchQuery(matchId: string) {
  return `
    SELECT
      pitch.match_id,
      pitch.inning,
      pitch.half_inning,
      pitch.sequence_no,
      pitch.pitcher_id,
      pitcher.full_name AS pitcher_name,
      pitch.batter_id,
      batter.full_name AS batter_name,
      pitch.pitch_type,
      pitch.velocity_kph,
      pitch.outcome_category,
      pitch.bso_result,
      pitch.contact_type,
      pitch.play_result,
      pitch.runs_scored,
      pitch.rbi,
      pitch.notes
    FROM pitches pitch
    JOIN players pitcher ON pitcher.player_id = pitch.pitcher_id
    JOIN players batter ON batter.player_id = pitch.batter_id
    WHERE pitch.match_id = '${matchId}'
    ORDER BY pitch.inning, pitch.half_inning, pitch.sequence_no
  `;
}

function mapQueryRows<T extends Record<string, unknown>>(results: QueryExecResult[]): T[] {
  const first = results[0];
  if (!first) {
    return [];
  }

  return first.values.map((row) =>
    Object.fromEntries(first.columns.map((column, index) => [column, row[index]])) as T,
  );
}

function compareValues(left: string | number | boolean, right: string | number | boolean) {
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }
  if (typeof left === "boolean" && typeof right === "boolean") {
    return Number(left) - Number(right);
  }
  return String(left).localeCompare(String(right));
}

function formatAverage(value: number) {
  return value === 0 ? ".000" : value.toFixed(3).replace(/^0/, "");
}

function formatEra(earnedRuns: number, outsRecorded: number) {
  if (outsRecorded <= 0) {
    return ".000";
  }
  const inningsPitched = outsRecorded / 3;
  const era = (earnedRuns * 9) / inningsPitched;
  return formatAverage(era);
}

export function selectPlayerDirectoryFromDb(db: Database, filters: PlayerDirectoryFilters): PlayerDirectoryRowViewModel[] {
  const mode = filters.role === "pitcher" ? "pitcher" : "hitter";
  const rows = mapQueryRows<{
    player_id: string;
    full_name: string;
    team_id: string;
    team_name: string;
    roster_level: string;
    primary_position: string;
    age: number;
    role: string;
    games: number;
    plate_appearances: number;
    at_bats: number;
    hits: number;
    home_runs: number;
    walks: number;
    strike_outs: number;
    pitching_games: number;
    outs_recorded: number;
    hits_allowed: number;
    walks_allowed: number;
    strike_outs_thrown: number;
    earned_runs_allowed: number;
    pitch_count: number;
  }>(
    db.exec(`
      SELECT
        p.player_id,
        p.full_name,
        p.team_id,
        t.name AS team_name,
        p.roster_level,
        p.primary_position,
        p.age,
        CASE
          WHEN p.primary_position IN ('SP', 'RP') THEN 'pitcher'
          ELSE 'hitter'
        END AS role,
        COUNT(DISTINCT CASE WHEN bp.pitch_id IS NOT NULL THEN bp.match_id END) AS games,
        COUNT(bp.pitch_id) AS plate_appearances,
        SUM(CASE WHEN bp.play_result IN ('single', 'double', 'triple', 'home-run', 'ground-ball', 'fly-ball') THEN 1 ELSE 0 END) AS at_bats,
        SUM(CASE WHEN bp.play_result IN ('single', 'double', 'triple', 'home-run') THEN 1 ELSE 0 END) AS hits,
        SUM(CASE WHEN bp.play_result = 'home-run' THEN 1 ELSE 0 END) AS home_runs,
        SUM(CASE WHEN bp.play_result = 'walk' THEN 1 ELSE 0 END) AS walks,
        SUM(CASE WHEN bp.play_result = 'strikeout' THEN 1 ELSE 0 END) AS strike_outs,
        COUNT(DISTINCT CASE WHEN pp.pitch_id IS NOT NULL THEN pp.match_id END) AS pitching_games,
        SUM(CASE WHEN pp.play_result IN ('ground-ball', 'fly-ball', 'strikeout') THEN 1 ELSE 0 END) AS outs_recorded,
        SUM(CASE WHEN pp.play_result IN ('single', 'double', 'triple', 'home-run') THEN 1 ELSE 0 END) AS hits_allowed,
        SUM(CASE WHEN pp.play_result = 'walk' THEN 1 ELSE 0 END) AS walks_allowed,
        SUM(CASE WHEN pp.play_result = 'strikeout' THEN 1 ELSE 0 END) AS strike_outs_thrown,
        SUM(pp.runs_scored) AS earned_runs_allowed,
        COUNT(pp.pitch_id) AS pitch_count
      FROM players p
      JOIN teams t ON t.team_id = p.team_id
      LEFT JOIN pitches bp ON bp.batter_id = p.player_id
      LEFT JOIN pitches pp ON pp.pitcher_id = p.player_id
      WHERE ${mode === "pitcher" ? "p.primary_position IN ('SP', 'RP')" : "p.primary_position NOT IN ('SP', 'RP')"}
      GROUP BY p.player_id, p.full_name, p.team_id, t.name, p.roster_level, p.primary_position, p.age
    `),
  ).map((row) => {
    const atBats = Number(row.at_bats ?? 0);
    const hits = Number(row.hits ?? 0);
    const outsRecorded = Number(row.outs_recorded ?? 0);
    const earnedRunsAllowed = Number(row.earned_runs_allowed ?? 0);
    const inningsPitched = outsRecorded / 3;
    const battingAverage = atBats > 0 ? hits / atBats : 0;
    const earnedRunAverage = outsRecorded > 0 ? (earnedRunsAllowed * 9) / inningsPitched : 0;

    return {
      id: String(row.player_id),
      name: String(row.full_name),
      teamName: String(row.team_name),
      teamId: String(row.team_id),
      rosterLevel: String(row.roster_level) === "major" ? "Major" : "Minor",
      role: String(row.role),
      position: String(row.primary_position),
      age: Number(row.age),
      games: Math.max(Number(row.games ?? 0), Number(row.pitching_games ?? 0)),
      plateAppearances: Number(row.plate_appearances ?? 0),
      hits,
      walks: Number(row.walks ?? 0),
      strikeOuts: Number(row.strike_outs ?? 0),
      inningsPitched,
      earnedRuns: earnedRunsAllowed,
      hitsAllowed: Number(row.hits_allowed ?? 0),
      walksAllowed: Number(row.walks_allowed ?? 0),
      strikeOutsThrown: Number(row.strike_outs_thrown ?? 0),
      pitchCount: Number(row.pitch_count ?? 0),
      battingAverage,
      battingAverageLabel: formatAverage(battingAverage),
      homeRuns: Number(row.home_runs ?? 0),
      earnedRunAverage,
      earnedRunAverageLabel: formatEra(earnedRunsAllowed, outsRecorded),
    };
  });

  const filteredRows = rows.filter((row) => {
    const search = filters.search.trim().toLowerCase();
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
  filteredRows.sort((left, right) => {
    switch (filters.sortKey) {
      case "team":
        return direction * compareValues(left.teamName, right.teamName);
      case "age":
        return direction * compareValues(left.age, right.age);
      case "position":
        return direction * compareValues(left.position, right.position);
      case "roster":
        return direction * compareValues(left.rosterLevel, right.rosterLevel);
      case "role":
        return direction * compareValues(left.role, right.role);
      case "games":
        return direction * compareValues(left.games, right.games);
      case "plateAppearances":
        return direction * compareValues(left.plateAppearances, right.plateAppearances);
      case "hits":
        return direction * compareValues(left.hits, right.hits);
      case "walks":
        return direction * compareValues(left.walks, right.walks);
      case "strikeOuts":
        return direction * compareValues(left.strikeOuts, right.strikeOuts);
      case "inningsPitched":
        return direction * compareValues(left.inningsPitched, right.inningsPitched);
      case "earnedRuns":
        return direction * compareValues(left.earnedRuns, right.earnedRuns);
      case "hitsAllowed":
        return direction * compareValues(left.hitsAllowed, right.hitsAllowed);
      case "walksAllowed":
        return direction * compareValues(left.walksAllowed, right.walksAllowed);
      case "strikeOutsThrown":
        return direction * compareValues(left.strikeOutsThrown, right.strikeOutsThrown);
      case "pitchCount":
        return direction * compareValues(left.pitchCount, right.pitchCount);
      case "battingAverage":
        return direction * compareValues(left.battingAverage, right.battingAverage);
      case "homeRuns":
        return direction * compareValues(left.homeRuns, right.homeRuns);
      case "earnedRunAverage":
        return direction * compareValues(left.earnedRunAverage, right.earnedRunAverage);
      case "name":
      default:
        return direction * compareValues(left.name, right.name);
    }
  });

  return filteredRows.map(({ teamId: _teamId, ...row }) => row);
}

export function selectMatchDirectory(db: Database, filters: MatchDirectoryFilters): MatchDirectoryRowViewModel[] {
  const rows = mapQueryRows<{
    match_id: string;
    match_day: number;
    match_date: string | null;
    home_team_id: string;
    away_team_id: string;
    home_team_name: string;
    away_team_name: string;
    home_score: number | null;
    away_score: number | null;
    played: number;
    pitch_count: number;
  }>(
    db.exec(`
      SELECT
        m.match_id,
        m.match_day,
        m.match_date,
        m.home_team_id,
        m.away_team_id,
        home.name AS home_team_name,
        away.name AS away_team_name,
        m.home_score,
        m.away_score,
        m.played,
        COUNT(p.pitch_id) AS pitch_count
      FROM matches m
      JOIN teams home ON home.team_id = m.home_team_id
      JOIN teams away ON away.team_id = m.away_team_id
      LEFT JOIN pitches p ON p.match_id = m.match_id
      GROUP BY
        m.match_id, m.match_day, m.match_date, m.home_team_id, m.away_team_id,
        home.name, away.name, m.home_score, m.away_score, m.played
    `),
  )
    .map((row) => ({
      id: String(row.match_id),
      day: Number(row.match_day),
      dateLabel: String(row.match_date ?? "-"),
      homeTeamId: String(row.home_team_id),
      homeTeamName: String(row.home_team_name),
      awayTeamId: String(row.away_team_id),
      awayTeamName: String(row.away_team_name),
      scoreLine:
        Number(row.played) === 1 && row.home_score !== null && row.away_score !== null
          ? `${row.away_score} - ${row.home_score}`
          : "Scheduled",
      pitchCount: Number(row.pitch_count ?? 0),
      played: Number(row.played) === 1,
      statusLabel: Number(row.played) === 1 ? "Final" : "Scheduled",
    }))
    .filter((row) => {
      const search = filters.search.trim().toLowerCase();
      if (search && !`${row.awayTeamName} ${row.homeTeamName} ${row.dateLabel}`.toLowerCase().includes(search)) {
        return false;
      }
      if (filters.teamId !== "all" && row.homeTeamId !== filters.teamId && row.awayTeamId !== filters.teamId) {
        return false;
      }
      if (filters.played === "played" && !row.played) {
        return false;
      }
      if (filters.played === "scheduled" && row.played) {
        return false;
      }
      return true;
    });

  const direction = filters.sortDirection === "asc" ? 1 : -1;
  rows.sort((left, right) => {
    switch (filters.sortKey) {
      case "date":
        return direction * compareValues(left.dateLabel, right.dateLabel);
      case "homeTeam":
        return direction * compareValues(left.homeTeamName, right.homeTeamName);
      case "awayTeam":
        return direction * compareValues(left.awayTeamName, right.awayTeamName);
      case "score":
        return direction * compareValues(left.scoreLine, right.scoreLine);
      case "pitchCount":
        return direction * compareValues(left.pitchCount, right.pitchCount);
      case "status":
        return direction * compareValues(left.statusLabel, right.statusLabel);
      case "day":
      default:
        return direction * compareValues(left.day, right.day);
    }
  });

  return rows;
}

export function selectMatchDetail(db: Database, matchId: string): MatchDetailViewModel | null {
  const matchRows = mapQueryRows<{
    match_id: string;
    match_day: number;
    match_date: string | null;
    home_team_name: string;
    away_team_name: string;
    home_score: number | null;
    away_score: number | null;
    played: number;
    pitch_count: number;
  }>(
    db.exec(
      `
      SELECT
        m.match_id,
        m.match_day,
        m.match_date,
        home.name AS home_team_name,
        away.name AS away_team_name,
        m.home_score,
        m.away_score,
        m.played,
        COUNT(p.pitch_id) AS pitch_count
      FROM matches m
      JOIN teams home ON home.team_id = m.home_team_id
      JOIN teams away ON away.team_id = m.away_team_id
      LEFT JOIN pitches p ON p.match_id = m.match_id
      WHERE m.match_id = ?
      GROUP BY
        m.match_id, m.match_day, m.match_date, home.name, away.name, m.home_score, m.away_score, m.played
    `,
      [matchId],
    ),
  );

  const match = matchRows[0];
  if (!match) {
    return null;
  }

  const pitches = mapQueryRows<{
    inning: number;
    half_inning: "top" | "bottom";
    sequence_no: number;
    pitcher_name: string;
    batter_name: string;
    pitch_type: string | null;
    velocity_kph: number | null;
    outcome_category: string;
    bso_result: string | null;
    contact_type: string | null;
    play_result: string | null;
    runs_scored: number;
    notes: string | null;
  }>(
    db.exec(
      `
      SELECT
        pitch.inning,
        pitch.half_inning,
        pitch.sequence_no,
        pitcher.full_name AS pitcher_name,
        batter.full_name AS batter_name,
        pitch.pitch_type,
        pitch.velocity_kph,
        pitch.outcome_category,
        pitch.bso_result,
        pitch.contact_type,
        pitch.play_result,
        pitch.runs_scored,
        pitch.notes
      FROM pitches pitch
      JOIN players pitcher ON pitcher.player_id = pitch.pitcher_id
      JOIN players batter ON batter.player_id = pitch.batter_id
      WHERE pitch.match_id = ?
      ORDER BY pitch.inning, pitch.half_inning, pitch.sequence_no
    `,
      [matchId],
    ),
  ).map<MatchPitchLogRowViewModel>((row) => ({
    pitchNumber: Number(row.sequence_no),
    inningLabel: `${row.inning} ${row.half_inning === "top" ? "Top" : "Bottom"}`,
    pitcherName: String(row.pitcher_name),
    batterName: String(row.batter_name),
    pitchType: String(row.pitch_type ?? "-"),
    velocityLabel: row.velocity_kph === null ? "-" : `${row.velocity_kph} km/h`,
    resultLabel: [row.outcome_category, row.play_result, row.bso_result, row.contact_type].filter(Boolean).join(" / "),
    runsScored: Number(row.runs_scored ?? 0),
    note: String(row.notes ?? ""),
  }));

  return {
    id: String(match.match_id),
    title: `${match.away_team_name} @ ${match.home_team_name}`,
    metaLine: `Day ${match.match_day} / ${match.match_date ?? "-"}`,
    scoreLine:
      Number(match.played) === 1 && match.home_score !== null && match.away_score !== null
        ? `${match.away_team_name} ${match.away_score} - ${match.home_score} ${match.home_team_name}`
        : "Scheduled game",
    pitchCount: Number(match.pitch_count ?? 0),
    pitches,
  };
}

export function selectPlayerDetailFromDb(db: Database, playerId: string): PlayerDetailViewModel | null {
  const playerRows = mapQueryRows<{
    player_id: string;
    full_name: string;
    team_id: string;
    team_name: string;
    primary_position: string;
    role: "pitcher" | "hitter";
    games: number;
    plate_appearances: number;
    at_bats: number;
    hits: number;
    home_runs: number;
    walks: number;
    strike_outs: number;
    pitching_games: number;
    outs_recorded: number;
    hits_allowed: number;
    walks_allowed: number;
    strike_outs_thrown: number;
    earned_runs_allowed: number;
    pitch_count: number;
  }>(
    db.exec(
      `
      SELECT
        p.player_id,
        p.full_name,
        p.team_id,
        t.name AS team_name,
        p.primary_position,
        CASE WHEN p.primary_position IN ('SP', 'RP') THEN 'pitcher' ELSE 'hitter' END AS role,
        COUNT(DISTINCT CASE WHEN bp.pitch_id IS NOT NULL THEN bp.match_id END) AS games,
        COUNT(bp.pitch_id) AS plate_appearances,
        SUM(CASE WHEN bp.play_result IN ('single', 'double', 'triple', 'home-run', 'ground-ball', 'fly-ball') THEN 1 ELSE 0 END) AS at_bats,
        SUM(CASE WHEN bp.play_result IN ('single', 'double', 'triple', 'home-run') THEN 1 ELSE 0 END) AS hits,
        SUM(CASE WHEN bp.play_result = 'home-run' THEN 1 ELSE 0 END) AS home_runs,
        SUM(CASE WHEN bp.play_result = 'walk' THEN 1 ELSE 0 END) AS walks,
        SUM(CASE WHEN bp.play_result = 'strikeout' THEN 1 ELSE 0 END) AS strike_outs,
        COUNT(DISTINCT CASE WHEN pp.pitch_id IS NOT NULL THEN pp.match_id END) AS pitching_games,
        SUM(CASE WHEN pp.play_result IN ('ground-ball', 'fly-ball', 'strikeout') THEN 1 ELSE 0 END) AS outs_recorded,
        SUM(CASE WHEN pp.play_result IN ('single', 'double', 'triple', 'home-run') THEN 1 ELSE 0 END) AS hits_allowed,
        SUM(CASE WHEN pp.play_result = 'walk' THEN 1 ELSE 0 END) AS walks_allowed,
        SUM(CASE WHEN pp.play_result = 'strikeout' THEN 1 ELSE 0 END) AS strike_outs_thrown,
        SUM(pp.runs_scored) AS earned_runs_allowed,
        COUNT(pp.pitch_id) AS pitch_count
      FROM players p
      JOIN teams t ON t.team_id = p.team_id
      LEFT JOIN pitches bp ON bp.batter_id = p.player_id
      LEFT JOIN pitches pp ON pp.pitcher_id = p.player_id
      WHERE p.player_id = ?
      GROUP BY p.player_id, p.full_name, p.team_id, t.name, p.primary_position
    `,
      [playerId],
    ),
  );

  const player = playerRows[0];
  if (!player) {
    return null;
  }

  const role = player.role;
  const atBats = Number(player.at_bats ?? 0);
  const hits = Number(player.hits ?? 0);
  const battingAverage = atBats > 0 ? hits / atBats : 0;
  const outsRecorded = Number(player.outs_recorded ?? 0);
  const inningsPitched = outsRecorded / 3;
  const earnedRuns = Number(player.earned_runs_allowed ?? 0);
  const era = outsRecorded > 0 ? (earnedRuns * 9) / inningsPitched : 0;

  const games = role === "pitcher"
    ? mapQueryRows<{
        match_id: string;
        match_day: number;
        match_date: string | null;
        opponent_name: string;
        venue_label: string;
        team_score: number | null;
        opponent_score: number | null;
        outs_recorded: number;
        hits_allowed: number;
        walks_allowed: number;
        strike_outs_thrown: number;
        earned_runs: number;
        pitch_count: number;
      }>(
        db.exec(
          `
          SELECT
            m.match_id,
            m.match_day,
            m.match_date,
            CASE WHEN m.home_team_id = p.team_id THEN away.name ELSE home.name END AS opponent_name,
            CASE WHEN m.home_team_id = p.team_id THEN 'vs' ELSE '@' END AS venue_label,
            CASE WHEN m.home_team_id = p.team_id THEN m.home_score ELSE m.away_score END AS team_score,
            CASE WHEN m.home_team_id = p.team_id THEN m.away_score ELSE m.home_score END AS opponent_score,
            SUM(CASE WHEN pitch.play_result IN ('ground-ball', 'fly-ball', 'strikeout') THEN 1 ELSE 0 END) AS outs_recorded,
            SUM(CASE WHEN pitch.play_result IN ('single', 'double', 'triple', 'home-run') THEN 1 ELSE 0 END) AS hits_allowed,
            SUM(CASE WHEN pitch.play_result = 'walk' THEN 1 ELSE 0 END) AS walks_allowed,
            SUM(CASE WHEN pitch.play_result = 'strikeout' THEN 1 ELSE 0 END) AS strike_outs_thrown,
            SUM(pitch.runs_scored) AS earned_runs,
            COUNT(pitch.pitch_id) AS pitch_count
          FROM players p
          JOIN pitches pitch ON pitch.pitcher_id = p.player_id
          JOIN matches m ON m.match_id = pitch.match_id
          JOIN teams home ON home.team_id = m.home_team_id
          JOIN teams away ON away.team_id = m.away_team_id
          WHERE p.player_id = ?
          GROUP BY m.match_id, m.match_day, m.match_date, opponent_name, venue_label, team_score, opponent_score
          ORDER BY m.match_day DESC, m.match_id DESC
        `,
          [playerId],
        ),
      ).map((row) => {
        const gameOuts = Number(row.outs_recorded ?? 0);
        const gameIp = gameOuts / 3;
        const gameEr = Number(row.earned_runs ?? 0);
        const gameEra = gameOuts > 0 ? (gameEr * 9) / gameIp : 0;
        return {
          matchId: String(row.match_id),
          day: Number(row.match_day),
          dateLabel: String(row.match_date ?? "-"),
          opponentName: String(row.opponent_name),
          venueLabel: String(row.venue_label),
          scoreLine:
            row.team_score !== null && row.opponent_score !== null ? `${row.team_score}-${row.opponent_score}` : "Scheduled",
          statLine: `${gameIp.toFixed(1)} IP / ${row.hits_allowed} H / ${row.walks_allowed} BB / ${row.strike_outs_thrown} K / ${gameEr} ER / ${gameEra.toFixed(2)} ERA`,
        };
      })
    : mapQueryRows<{
        match_id: string;
        match_day: number;
        match_date: string | null;
        opponent_name: string;
        venue_label: string;
        team_score: number | null;
        opponent_score: number | null;
        plate_appearances: number;
        at_bats: number;
        hits: number;
        walks: number;
        strike_outs: number;
        home_runs: number;
      }>(
        db.exec(
          `
          SELECT
            m.match_id,
            m.match_day,
            m.match_date,
            CASE WHEN m.home_team_id = p.team_id THEN away.name ELSE home.name END AS opponent_name,
            CASE WHEN m.home_team_id = p.team_id THEN 'vs' ELSE '@' END AS venue_label,
            CASE WHEN m.home_team_id = p.team_id THEN m.home_score ELSE m.away_score END AS team_score,
            CASE WHEN m.home_team_id = p.team_id THEN m.away_score ELSE m.home_score END AS opponent_score,
            COUNT(pitch.pitch_id) AS plate_appearances,
            SUM(CASE WHEN pitch.play_result IN ('single', 'double', 'triple', 'home-run', 'ground-ball', 'fly-ball') THEN 1 ELSE 0 END) AS at_bats,
            SUM(CASE WHEN pitch.play_result IN ('single', 'double', 'triple', 'home-run') THEN 1 ELSE 0 END) AS hits,
            SUM(CASE WHEN pitch.play_result = 'walk' THEN 1 ELSE 0 END) AS walks,
            SUM(CASE WHEN pitch.play_result = 'strikeout' THEN 1 ELSE 0 END) AS strike_outs,
            SUM(CASE WHEN pitch.play_result = 'home-run' THEN 1 ELSE 0 END) AS home_runs
          FROM players p
          JOIN pitches pitch ON pitch.batter_id = p.player_id
          JOIN matches m ON m.match_id = pitch.match_id
          JOIN teams home ON home.team_id = m.home_team_id
          JOIN teams away ON away.team_id = m.away_team_id
          WHERE p.player_id = ?
          GROUP BY m.match_id, m.match_day, m.match_date, opponent_name, venue_label, team_score, opponent_score
          ORDER BY m.match_day DESC, m.match_id DESC
        `,
          [playerId],
        ),
      ).map((row) => {
        const gameAb = Number(row.at_bats ?? 0);
        const gameHits = Number(row.hits ?? 0);
        const gameAvg = gameAb > 0 ? gameHits / gameAb : 0;
        return {
          matchId: String(row.match_id),
          day: Number(row.match_day),
          dateLabel: String(row.match_date ?? "-"),
          opponentName: String(row.opponent_name),
          venueLabel: String(row.venue_label),
          scoreLine:
            row.team_score !== null && row.opponent_score !== null ? `${row.team_score}-${row.opponent_score}` : "Scheduled",
          statLine: `${row.plate_appearances} PA / ${gameHits}-${gameAb} / ${row.walks} BB / ${row.strike_outs} K / ${row.home_runs} HR / ${formatAverage(gameAvg)}`,
        };
      });

  return {
    playerId,
    role,
    teamName: String(player.team_name),
    summaryItems:
      role === "pitcher"
        ? [
            { label: "G", value: String(Number(player.pitching_games ?? 0)) },
            { label: "IP", value: inningsPitched.toFixed(1) },
            { label: "H", value: String(Number(player.hits_allowed ?? 0)) },
            { label: "BB", value: String(Number(player.walks_allowed ?? 0)) },
            { label: "K", value: String(Number(player.strike_outs_thrown ?? 0)) },
            { label: "ER", value: String(earnedRuns) },
            { label: "Pitches", value: String(Number(player.pitch_count ?? 0)) },
            { label: "ERA", value: era > 0 ? era.toFixed(2) : "0.00" },
          ]
        : [
            { label: "G", value: String(Number(player.games ?? 0)) },
            { label: "PA", value: String(Number(player.plate_appearances ?? 0)) },
            { label: "H", value: String(hits) },
            { label: "BB", value: String(Number(player.walks ?? 0)) },
            { label: "K", value: String(Number(player.strike_outs ?? 0)) },
            { label: "HR", value: String(Number(player.home_runs ?? 0)) },
            { label: "AVG", value: formatAverage(battingAverage) },
          ],
    games,
  };
}

export function lookupMatchTeams(state: GameState, matchId: string) {
  const game = state.league.schedule.find((entry) => entry.id === matchId);
  if (!game) {
    return null;
  }

  return {
    home: getTeamById(state, game.homeTeamId),
    away: getTeamById(state, game.awayTeamId),
  };
}
