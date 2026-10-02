"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { allTags, filterGameCatalog, gameCatalog, type GameDefinition } from "./games/data";
import styles from "./page.module.css";

export function CatalogResults({
  games,
  onReset,
}: {
  games: readonly GameDefinition[];
  onReset: () => void;
}) {
  if (games.length === 0) {
    return (
      <section className={styles.empty} role="status">
        <p>검색 결과가 없습니다.</p>
        <button type="button" className={styles.resetButton} onClick={onReset}>
          검색 및 필터 초기화
        </button>
      </section>
    );
  }

  return (
    <section className={styles.grid} aria-label="게임 목록">
      {games.map((game) => (
        <article key={game.slug} className={styles.card}>
          <div className={styles.cardTop}>
            <span className={styles.accent} style={{ backgroundColor: game.accent }} aria-hidden="true" />
            <h2>{game.title}</h2>
          </div>
          <p>{game.summary}</p>
          <div className={styles.meta}>
            <span>{game.difficulty}</span>
            <span>{game.estPlayMinutes}분</span>
          </div>
          <div className={styles.tagsInline}>
            {game.tags.map((tag) => <span key={tag}>#{tag}</span>)}
          </div>
          <Link href={`/games/${game.slug}`} className={styles.playLink}>플레이</Link>
        </article>
      ))}
    </section>
  );
}

export default function HomePage() {
  const [query, setQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState("all");
  const filtered = useMemo(() => filterGameCatalog(gameCatalog, query, selectedTag), [query, selectedTag]);

  const resetFilters = () => {
    setQuery("");
    setSelectedTag("all");
  };

  return (
    <main className={styles.pageShell}>
      <section className={styles.hero}>
        <h1>Nemonori Arcade</h1>
        <div className={styles.heroActions}>
          <Link href="/saves" className={styles.manageSavesLink}>세이브 데이터 관리</Link>
        </div>
      </section>

      {gameCatalog.length === 0 ? (
        <section className={styles.empty} role="status">
          <p>등록된 게임이 없습니다.</p>
        </section>
      ) : (
        <>
          <section className={styles.controls} aria-label="게임 검색 및 필터">
            <input
              aria-label="게임 검색"
              className={styles.search}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="게임 이름, 태그, 설명으로 검색"
            />
            <div className={styles.tags}>
              <button
                type="button"
                onClick={() => setSelectedTag("all")}
                className={selectedTag === "all" ? styles.tagActive : styles.tag}
                aria-pressed={selectedTag === "all"}
              >
                전체
              </button>
              {allTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setSelectedTag(tag)}
                  className={selectedTag === tag ? styles.tagActive : styles.tag}
                  aria-pressed={selectedTag === tag}
                >
                  #{tag}
                </button>
              ))}
            </div>
          </section>
          <CatalogResults games={filtered} onReset={resetFilters} />
        </>
      )}
    </main>
  );
}