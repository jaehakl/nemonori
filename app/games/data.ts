import type { ComponentType } from "react";

export type GameDefinition = Readonly<{
  slug: string;
  title: string;
  summary: string;
  tags: readonly string[];
  difficulty: "Easy" | "Normal" | "Hard";
  estPlayMinutes: number;
  accent: string;
}>;

export type GameLoader = () => Promise<{ default: ComponentType }>;

export type GameRegistration = GameDefinition & Readonly<{ load: GameLoader }>;

export function isValidGameSlug(slug: unknown): slug is string {
  return typeof slug === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

export function defineGameCatalog(entries: readonly GameRegistration[]): readonly GameRegistration[] {
  const slugs = new Set<string>();

  for (const game of entries) {
    if (!isValidGameSlug(game.slug)) {
      throw new Error(`Invalid game slug: ${game.slug}`);
    }
    if (slugs.has(game.slug)) {
      throw new Error(`Duplicate game slug: ${game.slug}`);
    }
    slugs.add(game.slug);
  }

  return Object.freeze(entries.map((game) => Object.freeze({ ...game, tags: Object.freeze([...game.tags]) })));
}

export const gameCatalog = defineGameCatalog([
  {
    slug: "pokemon-marble",
    title: "포켓몬 마블",
    summary: "40칸 탑뷰 보드에서 포켓몬과 함께 모험하세요. 센터에서 쉬며 파티를 회복하고, 도로 27칸을 모두 차지하면 승리합니다.",
    tags: ["보드게임", "포켓몬", "1–4인", "전략"],
    difficulty: "Normal",
    estPlayMinutes: 40,
    accent: "#0f8b76",
    load: () => import("./_components/pokemon-marble/PokemonMarble"),
  },
]);

export const allTags = Array.from(new Set(gameCatalog.flatMap((game) => game.tags))).sort();

export function getGameBySlug(slug: string): GameRegistration | undefined {
  return gameCatalog.find((game) => game.slug === slug);
}

export function filterGameCatalog(
  catalog: readonly GameDefinition[],
  query: string,
  selectedTag: string,
): readonly GameDefinition[] {
  const keyword = query.trim().toLowerCase();

  return catalog.filter((game) => {
    const passTag = selectedTag === "all" || game.tags.includes(selectedTag);
    const haystack = `${game.title} ${game.summary} ${game.tags.join(" ")}`.toLowerCase();
    return passTag && (keyword.length === 0 || haystack.includes(keyword));
  });
}
