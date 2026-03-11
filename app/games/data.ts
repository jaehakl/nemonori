export type GameComponentKey =
  | "tetris"
  | "roguelike-rpg"
  | "phaser-meteor-dodge"
  | "phaser-border-collie-roundup"
  | "bakery-tycoon"
  | "phaser-joseon-warfront"
  | "robots-and-wizard"
  | "baseball-manager";

export type GameDefinition = {
  slug: string;
  title: string;
  summary: string;
  tags: string[];
  difficulty: "Easy" | "Normal" | "Hard";
  estPlayMinutes: number;
  accent: string;
  component: GameComponentKey;
};

export const gameCatalog: GameDefinition[] = [
  {
    slug: "baseball-manager",
    title: "프로야구 매니저",
    summary:
      "숨겨진 선수 능력치와 코치 리포트를 해석하며 1군/2군 운용, 시즌 일정, 경기 개입을 관리하는 프로야구 매니지먼트 시뮬레이션입니다.",
    tags: ["management", "simulation", "baseball", "roster", "season"],
    difficulty: "Hard",
    estPlayMinutes: 15,
    accent: "#0f766e",
    component: "baseball-manager",
  },
  {
    slug: "robots-and-wizard",
    title: "로봇과 마법사",
    summary: "마을을 탐험하며 주요 지점을 돌고 마법으로 로봇 공세를 돌파하는 3D 액션 탐험 게임입니다.",
    tags: ["3d", "action", "exploration", "wizard", "robots"],
    difficulty: "Easy",
    estPlayMinutes: 4,
    accent: "#0f766e",
    component: "robots-and-wizard",
  },
  {
    slug: "tetris",
    title: "테트리스",
    summary: "블록을 회전하고 배치해 가로줄을 지우는 클래식 퍼즐 게임입니다.",
    tags: ["classic", "puzzle", "line-clear"],
    difficulty: "Normal",
    estPlayMinutes: 5,
    accent: "#f59e0b",
    component: "tetris",
  },
  {
    slug: "roguelike-rpg",
    title: "드리프트 로그",
    summary: "절차적으로 생성된 맵을 탐험하며 실시간 전투를 치르는 로그라이크 RPG입니다.",
    tags: ["roguelike", "rpg", "realtime-combat", "procedural-map"],
    difficulty: "Hard",
    estPlayMinutes: 10,
    accent: "#0f766e",
    component: "roguelike-rpg",
  },
  {
    slug: "phaser-meteor-dodge",
    title: "운석 피하기",
    summary: "좌우로 이동하며 떨어지는 운석을 피하고 오래 생존하는 Phaser 액션 게임입니다.",
    tags: ["phaser", "arcade", "dodge", "survival"],
    difficulty: "Easy",
    estPlayMinutes: 3,
    accent: "#2563eb",
    component: "phaser-meteor-dodge",
  },
  {
    slug: "phaser-border-collie-roundup",
    title: "보더콜리 양몰이",
    summary: "Babylon.js 3D 목장에서 보더콜리를 움직여 제한 시간 안에 모든 양을 우리(PEN)로 몰아넣으세요.",
    tags: ["babylonjs", "3d", "herding", "animal", "time-attack"],
    difficulty: "Normal",
    estPlayMinutes: 4,
    accent: "#ca8a04",
    component: "phaser-border-collie-roundup",
  },
  {
    slug: "bakery-tycoon",
    title: "빵집 경영 시뮬레이션",
    summary:
      "냉장고-조리대-오븐-진열대 동선을 운영하며 유통기한, 투자, 확장, 종업원 자동 생산까지 관리하는 경영 게임입니다.",
    tags: ["management", "simulation", "tycoon", "bakery", "economy"],
    difficulty: "Hard",
    estPlayMinutes: 12,
    accent: "#c2410c",
    component: "bakery-tycoon",
  },
  {
    slug: "phaser-joseon-warfront",
    title: "조선 전선",
    summary:
      "냉병기 시대 한반도를 배경으로 턴제 전략 지도에서 침공을 결정하고, 실시간 전투에서 주인공 검술과 부하 AI로 영토를 확장하는 전략 시뮬레이션입니다.",
    tags: ["phaser", "strategy", "simulation", "realtime-combat", "turn-based"],
    difficulty: "Hard",
    estPlayMinutes: 10,
    accent: "#b91c1c",
    component: "phaser-joseon-warfront",
  },

];

export const allTags = Array.from(new Set(gameCatalog.flatMap((game) => game.tags))).sort();

export function getGameBySlug(slug: string) {
  return gameCatalog.find((game) => game.slug === slug);
}
