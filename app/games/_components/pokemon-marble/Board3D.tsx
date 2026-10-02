"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createBoardRenderer,
  TILE_NAMES,
  type BoardGuardian,
  type BoardRenderer,
  type BoardSnapshot,
  type BoardToken,
} from "./board-renderer";
import styles from "./Board3D.module.css";

export type { BoardGuardian, BoardToken } from "./board-renderer";

type Props = {
  tokens: BoardToken[];
  guardians: BoardGuardian[];
  activePlayerId: number;
  dice: [number, number] | null;
  rolling: boolean;
  onTileSelect?: (tile: number) => void;
};

export default function Board3D({
  tokens,
  guardians,
  activePlayerId,
  dice,
  rolling,
  onTileSelect,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<BoardRenderer | null>(null);
  const snapshotRef = useRef<BoardSnapshot>({
    tokens,
    guardians,
    activePlayerId,
    dice,
    rolling,
  });
  const onSelectRef = useRef(onTileSelect);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">(
    "loading",
  );
  const [attempt, setAttempt] = useState(0);
  const [selectedTile, setSelectedTile] = useState<number | null>(null);
  const selectedRef = useRef<number | null>(null);

  const selectTile = useCallback((tile: number) => {
    setSelectedTile(tile);
    selectedRef.current = tile;
    rendererRef.current?.selectTile(tile);
    onSelectRef.current?.(tile);
  }, []);

  useEffect(() => {
    snapshotRef.current = { tokens, guardians, activePlayerId, dice, rolling };
    onSelectRef.current = onTileSelect;
    rendererRef.current?.sync(snapshotRef.current);
  }, [tokens, guardians, activePlayerId, dice, rolling, onTileSelect]);

  useEffect(() => {
    let mounted = true;
    // Defer WebGL creation so abandoned/StrictMode mounts cannot leave a context behind.
    const boot = requestAnimationFrame(() => {
      if (!mounted || !hostRef.current) return;
      let instance: BoardRenderer | null = null;
      try {
        instance = createBoardRenderer(hostRef.current, selectTile, () => {
          if (mounted) setStatus("failed");
        });
        rendererRef.current = instance;
        instance.sync(snapshotRef.current);
        instance.selectTile(selectedRef.current);
        setStatus("ready");
      } catch {
        instance?.dispose();
        setStatus("failed");
      }
    });
    return () => {
      mounted = false;
      cancelAnimationFrame(boot);
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
  }, [attempt, selectTile]);

  const active = tokens.find((token) => token.id === activePlayerId);
  const tileSummary = (index: number) => {
    const occupants = tokens
      .filter((token) => !token.eliminated && token.position === index)
      .map((token) => token.name);
    const guardian = guardians.find((entry) => entry.tile === index);
    const owner = guardian
      ? tokens.find((token) => token.id === guardian.ownerId)
      : undefined;
    return `${index + 1}번 ${TILE_NAMES[index]}${occupants.length ? ` · ${occupants.join(", ")}` : ""}${owner ? ` · ${owner.name}의 수비` : ""}`;
  };

  return (
    <section className={styles.board} aria-label="포켓몬 마블 게임판">
      <div className={styles.surface}>
        <div className={styles.badges} aria-hidden="true">
          <span className={styles.worldBadge}>
            <span /> LITTLE ADVENTURE
          </span>
          <span className={styles.tileBadge}>32칸의 모험</span>
        </div>
        <div
          ref={hostRef}
          className={styles.canvas}
          role="img"
          aria-label={`쿼터뷰 3D 게임판. ${active?.name ?? "플레이어"}의 차례. 플레이어 위치는 아래 칸 목록에서 확인할 수 있습니다.`}
        />
        {status === "loading" && (
          <div className={styles.overlay}>
            <span className={styles.loader} />
            <p>작은 모험의 섬을 펼치는 중…</p>
          </div>
        )}
        {status === "failed" && (
          <div className={styles.overlay} role="alert">
            <span className={styles.errorIcon}>◇</span>
            <strong>3D 게임판을 표시할 수 없어요</strong>
            <p>
              브라우저의 그래픽 가속 설정을 확인한 뒤 다시 시도해 주세요.
              <br />
              아래 칸 목록에서 위치를 확인할 수 있습니다.
            </p>
            <button
              type="button"
              className={styles.retry}
              onClick={() => {
                setStatus("loading");
                setAttempt((value) => value + 1);
              }}
            >
              게임판 다시 불러오기
            </button>
          </div>
        )}
        {status === "ready" && (
          <div className={styles.diceResult} aria-live="polite">
            {rolling ? (
              "주사위를 굴리는 중…"
            ) : dice ? (
              <>
                <span>
                  {dice[0]} + {dice[1]}
                </span>
                <strong>{dice[0] + dice[1]}칸</strong>
              </>
            ) : (
              "주사위를 굴려 모험을 시작하세요"
            )}
          </div>
        )}
      </div>
      <div className={styles.legend} aria-label="게임판 범례">
        <span>
          <i className={styles.centerDot} />
          포켓몬센터
        </span>
        <span>
          <i className={styles.grassDot} />
          풀숲
        </span>
        <span>
          <i className={styles.roadDot} />
          도로
        </span>
        <span className={styles.direction}>시계 방향으로 이동 ↻</span>
      </div>
      {selectedTile !== null && (
        <p className={styles.selection} aria-live="polite">
          {tileSummary(selectedTile)}
        </p>
      )}
      <details className={styles.tileDetails}>
        <summary>칸 목록 · 키보드로 살펴보기</summary>
        <div className={styles.tileList}>
          {TILE_NAMES.map((name, index) => (
            <button
              key={index}
              type="button"
              aria-label={tileSummary(index)}
              aria-pressed={selectedTile === index}
              className={
                selectedTile === index ? styles.selectedButton : undefined
              }
              onClick={() => selectTile(index)}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              {name}
              {tokens
                .filter(
                  (token) => !token.eliminated && token.position === index,
                )
                .map((token) => (
                  <i
                    key={token.id}
                    style={{ backgroundColor: token.color }}
                    title={token.name}
                  />
                ))}
            </button>
          ))}
        </div>
      </details>
    </section>
  );
}
