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

// Register each future game here with metadata and a literal dynamic import.
export const gameCatalog = defineGameCatalog([]);

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