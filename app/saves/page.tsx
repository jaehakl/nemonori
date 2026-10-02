"use client";

import Link from "next/link";
import { useState } from "react";
import { getGameBySlug } from "../games/data";
import {
  clearAllGameSaves,
  deleteGameSaveByKey,
  type SaveDeleteSummary,
  type SaveResult,
} from "../lib/save-protocol";
import { refreshGameSaves } from "../lib/save-store";
import { useGameSaves } from "../lib/use-game-saves";
import styles from "./page.module.css";

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

type Notice = { tone: "success" | "error"; message: string };

function deletionNotice(result: SaveResult<SaveDeleteSummary>): Notice {
  if (result.ok) {
    return { tone: "success", message: `${result.value.deletedKeys.length}개의 세이브를 삭제했습니다.` };
  }
  const partial = result.partial;
  const progress = partial
    ? ` ${partial.deletedKeys.length}개 삭제 완료, ${partial.failedKeys.length}개 삭제 실패.`
    : "";
  return { tone: "error", message: result.error.message + progress };
}

export default function SavesPage() {
  const snapshot = useGameSaves();
  const [notice, setNotice] = useState<Notice | null>(null);
  const saves = snapshot.entries;
  const totalBytes = saves.reduce((sum, row) => sum + row.byteSize, 0);

  const refresh = () => {
    setNotice(null);
    refreshGameSaves();
  };

  const handleDelete = (storageKey: string) => {
    setNotice(deletionNotice(deleteGameSaveByKey(storageKey)));
  };

  const handleClearAll = () => {
    if (!window.confirm("이 브라우저에 저장된 모든 게임 세이브를 삭제할까요? 삭제한 데이터는 복구할 수 없습니다.")) return;
    setNotice(deletionNotice(clearAllGameSaves()));
  };

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <Link href="/" className={styles.backLink}>← 메인으로</Link>
        <h1>세이브 데이터 관리</h1>
        <p>이 브라우저에 저장된 데이터를 관리합니다. 게임이 제거되어도 기존 세이브는 보관됩니다.</p>
      </header>

      <section className={styles.toolbar} aria-label="세이브 관리">
        <span>총 {saves.length}개</span>
        <span>{totalBytes} bytes</span>
        <button type="button" onClick={refresh} className={styles.secondaryButton}>새로고침</button>
        <button type="button" onClick={handleClearAll} className={styles.dangerButton} disabled={saves.length === 0}>
          전체 삭제
        </button>
      </section>

      {notice ? (
        <p className={`${styles.notice} ${notice.tone === "error" ? styles.errorNotice : ""}`} role={notice.tone === "error" ? "alert" : "status"}>
          {notice.message}
        </p>
      ) : null}
      {snapshot.status === "error" ? <p className={`${styles.notice} ${styles.errorNotice}`} role="alert">{snapshot.error.message} 새로고침으로 다시 시도할 수 있습니다.</p> : null}

      {snapshot.status === "loading" ? (
        <section className={styles.empty} role="status">저장된 데이터를 확인하고 있습니다.</section>
      ) : saves.length === 0 ? (
        snapshot.status === "ready" ? <section className={styles.empty}>저장된 게임 데이터가 없습니다.</section> : null
      ) : (
        <section className={styles.list} aria-label="저장된 세이브">
          {saves.map((save) => {
            const registeredGame = save.kind === "valid" ? getGameBySlug(save.gameSlug) : undefined;
            return (
              <article key={save.storageKey} className={`${styles.card} ${save.kind === "corrupt" ? styles.corruptCard : ""}`}>
                <div className={styles.cardHead}>
                  <div>
                    <h2>{save.kind === "valid" ? save.gameTitle : "손상된 세이브"}</h2>
                    <p>{save.gameSlug || "게임 식별자 없음"}</p>
                  </div>
                  {registeredGame ? (
                    <Link href={`/games/${registeredGame.slug}`} className={styles.playLink}>게임 열기</Link>
                  ) : save.kind === "valid" ? <span className={styles.unavailable}>현재 제공되지 않는 게임</span> : null}
                </div>
                <div className={styles.meta}>
                  {save.kind === "valid" ? <span>저장 시각: {formatTime(save.updatedAt)}</span> : null}
                  <span>크기: {save.byteSize} bytes</span>
                </div>
                {save.kind === "corrupt" ? <p className={styles.corruptReason}>{save.error.message} 데이터는 자동으로 삭제되지 않습니다.</p> : null}
                <details className={styles.details}>
                  <summary>{save.kind === "valid" ? "데이터 보기" : "원본 데이터 보기"}</summary>
                  <pre>{save.kind === "valid" ? JSON.stringify(save.data, null, 2) : save.raw || "(빈 데이터)"}</pre>
                </details>
                <button type="button" onClick={() => handleDelete(save.storageKey)} className={styles.deleteButton}>
                  이 세이브 삭제
                </button>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
