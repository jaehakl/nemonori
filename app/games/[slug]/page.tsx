import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { gameCatalog, getGameBySlug } from "../data";
import { GameHost } from "../_components/GameHost";
import styles from "./page.module.css";

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
      title: "게임을 찾을 수 없습니다 | Nemonori Arcade",
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

  return (
    <main className={styles.shell}>
      <div className={styles.navLinks}>
        <Link href="/" className={styles.backLink}>
          {"<- "}메인으로
        </Link>
        <Link href="/saves" className={styles.saveLink}>
          세이브 관리
        </Link>
      </div>
      <header className={styles.header}>
        <h1>{game.title}</h1>
        <p>{game.summary}</p>
      </header>
      <section className={styles.gameWrap}>
        <GameHost key={game.slug} slug={game.slug} />
      </section>
    </main>
  );
}
