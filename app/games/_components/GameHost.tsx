"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getGameBySlug, type GameLoader } from "../data";
import { GameErrorBoundary, GameLoadError } from "./GameErrorBoundary";
import { startGameLoad, type GameLoadResult } from "./game-loader";
import styles from "./GameHost.module.css";

export function GameLoaderHost({ load }: { load: GameLoader }) {
  const [attempt, setAttempt] = useState(0);
  const [completed, setCompleted] = useState<{ attempt: number; load: GameLoader; result: GameLoadResult } | null>(null);

  // Games are loaded only after mounting; the server and first client render agree.
  useEffect(() => startGameLoad(load, (result) => setCompleted({ attempt, load, result })), [load, attempt]);

  const result = completed?.attempt === attempt && completed.load === load ? completed.result : null;
  const retry = () => setAttempt((previous) => previous + 1);

  return (
    <GameErrorBoundary key={attempt} resetKey={load} onRetry={retry}>
      {result === null ? (
        <div className={styles.status} role="status" aria-live="polite">
          게임을 불러오는 중입니다.
        </div>
      ) : result.status === "error" ? (
        <GameLoadError onRetry={retry} />
      ) : (
        <result.View />
      )}
    </GameErrorBoundary>
  );
}

export function GameHost({ slug }: { slug: string }) {
  const game = getGameBySlug(slug);

  if (!game) {
    return (
      <div className={styles.status} role="alert">
        <p>등록되지 않은 게임입니다.</p>
        <Link href="/" className={styles.retry}>게임 목록으로</Link>
      </div>
    );
  }

  return <GameLoaderHost key={slug} load={game.load} />;
}
