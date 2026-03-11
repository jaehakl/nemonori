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
  plateAppearances: number;
  hits: number;
  homeRuns: number;
  walks: number;
  strikeOuts: number;
  inningsPitched: number;
  earnedRuns: number;
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
  | "inningsPitched"
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
  inningsPitched: number;
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
