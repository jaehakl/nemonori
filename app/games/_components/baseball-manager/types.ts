import { POSITIONS, SCREENS } from "./constants";

export type ScreenKey = (typeof SCREENS)[number];
export type Position = (typeof POSITIONS)[number];

export type BatHand = "L" | "R" | "S";
export type ThrowHand = "L" | "R";
export type PlayerRole = "pitcher" | "hitter" | "two-way";
export type CoachFocus = "pitching" | "hitting" | "defense" | "mental";
export type RosterLevel = "major" | "minor";
export type ReportConfidence = "low" | "medium" | "high";
export type ReportDirection = "up" | "steady" | "down" | "unclear";
export type SeasonPhase = "regular-season" | "draft";
export type MatchStrategy = "auto" | "bunt" | "pinch-hit" | "pinch-run" | "defensive-sub" | "pitching-change";

export type PlayerPublicProfile = {
  id: string;
  fullName: string;
  age: number;
  primaryPosition: Position;
  secondaryPositions: Position[];
  bats: BatHand;
  throws: ThrowHand;
  role: PlayerRole;
  jerseyNumber: number;
};

export type PhysicalRatings = {
  recovery: number;
  durability: number;
  strength: number;
  speed: number;
};

export type TechnicalRatings = {
  stuff?: number;
  command?: number;
  contact?: number;
  eye?: number;
  power?: number;
  running?: number;
  fielding: number;
  pitchMix: Record<string, number>;
};

export type MentalRatings = {
  composure: number;
  drive: number;
  baseballIq: number;
  diligence: number;
};

export type HiddenPlayerRatings = {
  physical: PhysicalRatings;
  technical: TechnicalRatings;
  mental: MentalRatings;
  potential: number;
};

export type PositionSkillMap = Partial<Record<Position, number>>;

export type PlayerCondition = {
  stamina: number;
  fatigue: number;
  injuryRisk: number;
  soreness: "fresh" | "stable" | "tired" | "risk";
  lastInterviewDay: number;
};

export type PlayerRecentUsage = {
  gamesPlayedLast7: number;
  plateAppearancesLast7: number;
  pitchesLast7: number;
  inningsLast7: number;
};

export type PlayerSeasonStats = {
  games: number;
  gamesStarted: number;
  plateAppearances: number;
  atBats: number;
  hits: number;
  doubles: number;
  triples: number;
  homeRuns: number;
  runs: number;
  runsBattedIn: number;
  walks: number;
  hitByPitch: number;
  sacrificeHits: number;
  sacrificeFlies: number;
  strikeOuts: number;
  stolenBases: number;
  caughtStealing: number;
  inningsPitched: number;
  outsRecorded: number;
  battersFaced: number;
  hitsAllowed: number;
  runsAllowed: number;
  earnedRuns: number;
  walksAllowed: number;
  hitByPitchAllowed: number;
  strikeOutsThrown: number;
  homeRunsAllowed: number;
  pitchCount: number;
};

export type PlayerCareerFlags = {
  yearsPro: number;
  agingRisk: number;
  injuryHistory: number;
};

export type CoachRatings = {
  teaching: number;
  evaluation: number;
  communication: number;
  discipline: number;
};

export type Coach = {
  id: string;
  fullName: string;
  focus: CoachFocus;
  ratings: CoachRatings;
};

export type CoachReport = {
  playerId: string;
  coachId: string;
  summary: string;
  confidence: ReportConfidence;
  direction: ReportDirection;
  updatedDay: number;
};

export type Player = {
  profile: PlayerPublicProfile;
  hidden: HiddenPlayerRatings;
  condition: PlayerCondition;
  positionSkills: PositionSkillMap;
  seasonStats: PlayerSeasonStats;
  usage: PlayerRecentUsage;
  career: PlayerCareerFlags;
  reports: CoachReport[];
  rosterLevel: RosterLevel;
  optionalUntilDay: number | null;
};

export type TeamRecord = {
  wins: number;
  losses: number;
  draws: number;
};

export type TeamDepthChart = {
  lineup: string[];
  bench: string[];
  rotation: string[];
  bullpen: string[];
};

export type Team = {
  id: string;
  name: string;
  accent: string;
  philosophy: string;
  record: TeamRecord;
  playerIds: string[];
  majorIds: string[];
  minorIds: string[];
  depthChart: TeamDepthChart;
  coachIds: string[];
};

export type ScheduledGame = {
  id: string;
  day: number;
  awayTeamId: string;
  homeTeamId: string;
  played: boolean;
  score: {
    away: number;
    home: number;
  } | null;
};

export type MatchEventType =
  | "pitch"
  | "walk"
  | "strikeout"
  | "single"
  | "double"
  | "triple"
  | "home-run"
  | "hit-by-pitch"
  | "error"
  | "field-out"
  | "double-play"
  | "stolen-base"
  | "caught-stealing"
  | "substitution";

export type TeamGameLineScore = {
  teamId: string;
  runsByInning: number[];
  runs: number;
  hits: number;
  errors: number;
  leftOnBase: number;
};

export type BatterGameStats = {
  playerId: string;
  teamId: string;
  opponentTeamId: string;
  battingOrderSlot: number | null;
  defensivePosition: Position | "DH" | null;
  started: boolean;
  plateAppearances: number;
  atBats: number;
  hits: number;
  doubles: number;
  triples: number;
  homeRuns: number;
  runs: number;
  runsBattedIn: number;
  walks: number;
  hitByPitch: number;
  strikeOuts: number;
  sacrificeHits: number;
  sacrificeFlies: number;
  stolenBases: number;
  caughtStealing: number;
};

export type PitcherGameStats = {
  playerId: string;
  teamId: string;
  opponentTeamId: string;
  started: boolean;
  battersFaced: number;
  outsRecorded: number;
  hitsAllowed: number;
  runsAllowed: number;
  earnedRuns: number;
  walks: number;
  hitByPitch: number;
  strikeOuts: number;
  homeRunsAllowed: number;
  pitchesThrown: number;
  strikesThrown: number;
};

export type FielderGameStats = {
  playerId: string;
  teamId: string;
  opponentTeamId: string;
  inningsInField: number;
  positions: Array<Position | "DH">;
  putouts: number;
  assists: number;
  errors: number;
  doublePlays: number;
};

export type PlayerGameRecord = {
  gameId: string;
  seasonYear: number;
  day: number;
  playerId: string;
  teamId: string;
  opponentTeamId: string;
  batting?: BatterGameStats;
  pitching?: PitcherGameStats;
  fielding?: FielderGameStats;
};

export type MatchEventRecord = {
  sequence: number;
  inning: number;
  half: "top" | "bottom";
  outsBefore: number;
  batterId: string | null;
  pitcherId: string | null;
  offenseTeamId: string;
  defenseTeamId: string;
  eventType: MatchEventType;
  pitchesInPlateAppearance: number;
  runsScored: number;
  runsBattedIn: number;
  runnersAdvanced: {
    first: string | null;
    second: string | null;
    third: string | null;
    scored: string[];
  };
  commentary: string;
};

export type CompletedGameRecord = {
  gameId: string;
  seasonYear: number;
  day: number;
  awayTeamId: string;
  homeTeamId: string;
  finalScore: {
    away: number;
    home: number;
  };
  lineScore: {
    away: TeamGameLineScore;
    home: TeamGameLineScore;
  };
  winningPitcherId: string | null;
  losingPitcherId: string | null;
  savePitcherId: string | null;
  playerRecords: PlayerGameRecord[];
  eventLog: MatchEventRecord[];
};

export type StatsDatabase = {
  gamesById: Record<string, CompletedGameRecord>;
  gameIdsByDay: Record<number, string[]>;
  gameIdsByPlayerId: Record<string, string[]>;
};

export type ScoreboardState = {
  inning: number;
  half: "top" | "bottom";
  outs: number;
  balls: number;
  strikes: number;
  away: number;
  home: number;
};

export type BasesState = {
  first: string | null;
  second: string | null;
  third: string | null;
};

export type LiveMatchState = {
  gameId: string;
  day: number;
  awayTeamId: string;
  homeTeamId: string;
  scoreboard: ScoreboardState;
  bases: BasesState;
  batterId: string | null;
  pitcherId: string | null;
  fieldingPositions: Partial<Record<Position, string>>;
  eventLog: string[];
  canSubstitute: boolean;
  pendingStrategy: MatchStrategy;
};

export type SeasonState = {
  seasonYear: number;
  currentDay: number;
  phase: SeasonPhase;
  nextUserGameId: string | null;
  pendingUserMatch: boolean;
};

export type RosterOpsState = {
  lineup: string[];
  bench: string[];
  rotation: string[];
  bullpen: string[];
};

export type LeagueState = {
  teams: Team[];
  players: Record<string, Player>;
  coaches: Record<string, Coach>;
  schedule: ScheduledGame[];
  stats: StatsDatabase;
  draftPoolIds: string[];
  standingsOrder: string[];
};

export type GameState = {
  seed: number;
  league: LeagueState;
  userTeamId: string;
  season: SeasonState;
  rosterOps: RosterOpsState;
  liveMatch: LiveMatchState | null;
  feedLog: string[];
};

export type BaseballManagerUiState = {
  currentScreen: ScreenKey;
  selectedPlayerId: string | null;
  highlightedGameId: string | null;
};

export type PlayerDirectorySortKey =
  | "name"
  | "team"
  | "age"
  | "position"
  | "roster"
  | "role"
  | "games"
  | "plateAppearances"
  | "hits"
  | "walks"
  | "strikeOuts"
  | "inningsPitched"
  | "earnedRuns"
  | "hitsAllowed"
  | "walksAllowed"
  | "strikeOutsThrown"
  | "pitchCount"
  | "battingAverage"
  | "homeRuns"
  | "earnedRunAverage";

export type PlayerDirectoryFilters = {
  search: string;
  teamId: string;
  rosterLevel: "all" | "major" | "minor";
  role: "all" | PlayerRole;
  position: "all" | Position;
  sortKey: PlayerDirectorySortKey;
  sortDirection: "asc" | "desc";
};

export type MatchDirectorySortKey =
  | "day"
  | "date"
  | "homeTeam"
  | "awayTeam"
  | "score"
  | "pitchCount"
  | "status";

export type MatchDirectoryFilters = {
  search: string;
  teamId: string;
  played: "all" | "played" | "scheduled";
  sortKey: MatchDirectorySortKey;
  sortDirection: "asc" | "desc";
};

export type UserAction =
  | { type: "set_user_lineup"; lineup: string[] }
  | { type: "set_user_bench_order"; bench: string[] }
  | { type: "set_user_rotation"; rotation: string[] }
  | { type: "set_user_bullpen_roles"; bullpen: string[] }
  | { type: "promote_player"; playerId: string }
  | { type: "demote_player"; playerId: string }
  | { type: "start_next_user_match" }
  | { type: "resolve_match_step" }
  | { type: "queue_match_strategy"; strategy: MatchStrategy }
  | {
      type: "commit_match_substitution";
      playerId: string;
      replacePlayerId: string;
    }
  | { type: "finish_user_match" }
  | { type: "simulate_until_user_decision" }
  | { type: "acknowledge_feed_items"; count?: number }
  | { type: "enter_draft_phase" };

export type DashboardViewModel = {
  currentDayLabel: string;
  teamName: string;
  teamRecord: string;
  nextOpponent: string;
  feedItems: string[];
  matchStatus: string;
};

export type PlayerCardViewModel = {
  id: string;
  name: string;
  badge: string;
  teamLine: string;
  profileLine: string;
  conditionLine: string;
  recentUsage: string;
  seasonLine: string;
  interview: string;
  reportSummary: string;
  reportMeta: string;
};

export type PlayerDirectoryRowViewModel = {
  id: string;
  name: string;
  teamName: string;
  rosterLevel: string;
  role: string;
  position: string;
  age: number;
  games: number;
  plateAppearances: number;
  hits: number;
  walks: number;
  strikeOuts: number;
  inningsPitched: number;
  earnedRuns: number;
  hitsAllowed: number;
  walksAllowed: number;
  strikeOutsThrown: number;
  pitchCount: number;
  battingAverage: number;
  battingAverageLabel: string;
  homeRuns: number;
  earnedRunAverage: number;
  earnedRunAverageLabel: string;
};

export type MatchViewModel = {
  header: string;
  inningLine: string;
  countLine: string;
  basesLine: string;
  eventLog: string[];
  fieldMarkers: Array<{
    key: string;
    label: string;
    x: number;
    y: number;
    active: boolean;
  }>;
};

export type MatchDirectoryRowViewModel = {
  id: string;
  day: number;
  dateLabel: string;
  homeTeamId: string;
  homeTeamName: string;
  awayTeamId: string;
  awayTeamName: string;
  scoreLine: string;
  pitchCount: number;
  played: boolean;
  statusLabel: string;
};

export type MatchPitchLogRowViewModel = {
  pitchNumber: number;
  inningLabel: string;
  pitcherName: string;
  batterName: string;
  pitchType: string;
  velocityLabel: string;
  resultLabel: string;
  runsScored: number;
  note: string;
};

export type MatchDetailViewModel = {
  id: string;
  title: string;
  metaLine: string;
  scoreLine: string;
  pitchCount: number;
  pitches: MatchPitchLogRowViewModel[];
};

export type PlayerDetailSummaryItemViewModel = {
  label: string;
  value: string;
};

export type PlayerGameLogRowViewModel = {
  matchId: string;
  day: number;
  dateLabel: string;
  opponentName: string;
  venueLabel: string;
  scoreLine: string;
  statLine: string;
};

export type PlayerDetailViewModel = {
  playerId: string;
  role: "hitter" | "pitcher";
  teamName: string;
  summaryItems: PlayerDetailSummaryItemViewModel[];
  games: PlayerGameLogRowViewModel[];
};
