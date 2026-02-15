import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { ComponentType } from "react";
import { gameCatalog, getGameBySlug, type GameComponentKey } from "../data";
import { TapRaceGame } from "../_components/TapRaceGame";
import { MemoryLightsGame } from "../_components/MemoryLightsGame";
import styles from "./page.module.css";

const gameViewByComponent: Record<GameComponentKey, ComponentType> = {
  "tap-race": TapRaceGame,
  "memory-lights": MemoryLightsGame,
};

type Params = {
  slug: string;
};

export function generateStaticParams() {
  return gameCatalog.map((game) => ({ slug: game.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const game = getGameBySlug(slug);

  if (!game) {
    return {
      title: "Game Not Found",
    };
  }

  return {
    title: `${game.title} | Nemonori Arcade`,
    description: game.summary,
  };
}

export default async function GamePage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const game = getGameBySlug(slug);

  if (!game) {
    notFound();
  }

  const GameView = gameViewByComponent[game.component];

  return (
    <main className={styles.shell}>
      <Link href="/" className={styles.backLink}>
        {"<- "}메인으로
      </Link>
      <header className={styles.header}>
        <h1>{game.title}</h1>
        <p>{game.summary}</p>
      </header>
      <section className={styles.gameWrap}>
        <GameView />
      </section>
    </main>
  );
}
