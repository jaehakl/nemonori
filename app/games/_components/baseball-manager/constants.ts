export const BASEBALL_MANAGER_SLUG = "baseball-manager" as const;
export const BASEBALL_MANAGER_TITLE = "프로야구 매니저" as const;

export const TEAM_COUNT = 10;
export const GAMES_PER_TEAM = 144;
export const CALLUP_COOLDOWN_DAYS = 10;
export const MAJOR_ROSTER_LIMIT = 29;
export const MINOR_ROSTER_TARGET = 31;
export const MAX_PLAYER_STAMINA = 100;

export const TEAM_NAMES = [
  "한화 이글스",
  "롯데 자이언츠",
  "넥센 히어로즈",
  "KT 위즈",
  "삼성 라이온즈",
  "LG 트윈스",
  "SSG 랜더스",
  "두산 베어스",
  "NC 다이노스",
  "기아 타이거즈",
] as const;

export const TEAM_COLORS = [
  "#0f172a",
  "#0f766e",
  "#b91c1c",
  "#1d4ed8",
  "#7c3aed",
  "#d97706",
  "#1f2937",
  "#0f766e",
  "#a16207",
  "#0369a1",
] as const;

export const POSITIONS = ["SP", "RP", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH"] as const;
export const SCREENS = ["dashboard", "roster", "games", "match", "draft"] as const;
