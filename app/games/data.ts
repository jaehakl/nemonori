export type GameComponentKey = "tap-race" | "memory-lights" | "tetris" | "roguelike-rpg";

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
    slug: "tap-race",
    title: "Tap Race 10",
    summary: "10초 동안 최대한 빠르게 탭해서 최고 점수를 갱신하세요.",
    tags: ["reflex", "score-attack", "one-button"],
    difficulty: "Easy",
    estPlayMinutes: 1,
    accent: "#ef4444",
    component: "tap-race",
  },
  {
    slug: "memory-lights",
    title: "Memory Lights",
    summary: "점점 길어지는 빛 순서를 기억해 따라 누르는 초간단 기억력 게임입니다.",
    tags: ["memory", "pattern", "simon-like"],
    difficulty: "Normal",
    estPlayMinutes: 3,
    accent: "#0ea5e9",
    component: "memory-lights",
  },
  {
    slug: "tetris",
    title: "Pixel Tetris",
    summary: "블록을 회전/이동해 가로줄을 지우는 클래식 테트리스입니다.",
    tags: ["classic", "puzzle", "line-clear"],
    difficulty: "Normal",
    estPlayMinutes: 5,
    accent: "#f59e0b",
    component: "tetris",
  },
  {
    slug: "roguelike-rpg",
    title: "Drift Rogue",
    summary: "이동할 때마다 지형이 생성되는 실시간 교전 로그라이크 RPG입니다.",
    tags: ["roguelike", "rpg", "realtime-combat", "procedural-map"],
    difficulty: "Hard",
    estPlayMinutes: 10,
    accent: "#0f766e",
    component: "roguelike-rpg",
  },
];

export const allTags = Array.from(new Set(gameCatalog.flatMap((game) => game.tags))).sort();

export function getGameBySlug(slug: string) {
  return gameCatalog.find((game) => game.slug === slug);
}
