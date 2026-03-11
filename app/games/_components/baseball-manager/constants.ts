export const BASEBALL_MANAGER_SLUG = "baseball-manager" as const;
export const BASEBALL_MANAGER_TITLE = "프로야구 매니저" as const;

export const TEAM_COUNT = 10;
export const GAMES_PER_TEAM = 144;
export const CALLUP_COOLDOWN_DAYS = 10;
export const MAJOR_ROSTER_LIMIT = 26;
export const MINOR_ROSTER_TARGET = 4;
export const MAX_PLAYER_STAMINA = 100;

export const TEAM_NAMES = [
  "Seoul Comets",
  "Busan Whales",
  "Incheon Storm",
  "Daegu Hawks",
  "Daejeon Sparks",
  "Gwangju Tide",
  "Suwon Foxes",
  "Ulsan Forge",
  "Changwon Knights",
  "Jeju Waves",
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
export const SCREENS = ["dashboard", "roster", "match", "draft"] as const;
