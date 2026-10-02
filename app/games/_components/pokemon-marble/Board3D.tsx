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
import type { BattleView, PresentationEvent } from "./presentation-events";
import { HealthBar, TypeBadge } from "./PokemonSprite";
import { movesById, speciesById } from "./pokemon-data";

export type { BoardGuardian, BoardToken } from "./board-renderer";

type Props = {
  tokens: BoardToken[];
  guardians: BoardGuardian[];
  activePlayerId: number;
  dice: [number, number] | null;
  rolling: boolean;
  battle?: BattleView | null;
  presentation?: { event: PresentationEvent; progress: number } | null;
  paused?: boolean;
  reducedMotion?: boolean;
  onFailure?: () => void;
  onReady?: () => void;
  onTileSelect?: (tile: number) => void;
};

export function BattleHud({
  battle,
  presentation,
}: {
  battle: BattleView;
  presentation: Props["presentation"];
}) {
  return (
    <div className={styles.battleHud}>
      {(["attacker", "defender"] as const).map((side) => {
        const pokemon = battle[side];
        const attack = presentation?.event.attack;
        const receiving = attack && attack.side !== side;
        const hp =
          pokemon && receiving && presentation!.progress < 0.45
            ? attack.beforeHp
            : pokemon?.hp;
        return (
          <div className={styles.fighterHud} key={side}>
            <small>
              {side === "attacker" ? battle.attackerName : battle.defenderName}{" "}
              · {side === "attacker" ? "후공" : "선공"}
            </small>
            <strong>
              {pokemon ? speciesById[pokemon.speciesId].name : "파트너 선택 중"}
              {pokemon && <span>Lv. {pokemon.level}</span>}
            </strong>
            {pokemon && <HealthBar hp={hp!} max={pokemon.maxHp} />}
            {receiving && presentation!.progress >= 0.45 && (
              <span
                className={styles.damage}
                key={`${presentation!.event.revision}-${presentation!.event.sequence}`}
              >
                −{attack.damage}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function Board3D({
  tokens,
  guardians,
  activePlayerId,
  dice,
  rolling,
  battle = null,
  presentation = null,
  paused = false,
  reducedMotion = false,
  onFailure,
  onReady,
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
    battle,
    presentation,
    paused,
    reducedMotion,
  });
  const onSelectRef = useRef(onTileSelect);
  const onFailureRef = useRef(onFailure);
  const onReadyRef = useRef(onReady);
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
    snapshotRef.current = {
      tokens,
      guardians,
      activePlayerId,
      dice,
      rolling,
      battle,
      presentation,
      paused,
      reducedMotion,
    };
    onSelectRef.current = onTileSelect;
    onFailureRef.current = onFailure;
    onReadyRef.current = onReady;
    rendererRef.current?.sync(snapshotRef.current);
  }, [
    tokens,
    guardians,
    activePlayerId,
    dice,
    rolling,
    battle,
    presentation,
    paused,
    reducedMotion,
    onTileSelect,
    onFailure,
    onReady,
  ]);

  useEffect(() => {
    let mounted = true;
    // Defer WebGL creation so abandoned/StrictMode mounts cannot leave a context behind.
    const boot = requestAnimationFrame(() => {
      if (!mounted || !hostRef.current) return;
      let instance: BoardRenderer | null = null;
      try {
        instance = createBoardRenderer(hostRef.current, selectTile, () => {
          if (mounted) {
            setStatus("failed");
            onFailureRef.current?.();
          }
        });
        rendererRef.current = instance;
        instance.sync(snapshotRef.current);
        instance.selectTile(selectedRef.current);
        setStatus("ready");
        onReadyRef.current?.();
      } catch {
        instance?.dispose();
        setStatus("failed");
        onFailureRef.current?.();
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
      <div
        className={`${styles.surface} ${battle ? styles.battleSurface : ""}`}
      >
        <div className={styles.badges} aria-hidden="true">
          <span className={styles.worldBadge}>
            <span /> {battle ? "PARTNER BATTLE" : "LITTLE ADVENTURE"}
          </span>
          <span className={styles.tileBadge}>
            {battle ? "1 VS 1" : "32칸의 모험"}
          </span>
        </div>
        <div
          ref={hostRef}
          className={styles.canvas}
          role="img"
          aria-label={
            battle
              ? "포켓몬 3D 배틀 무대. 체력과 기술은 화면의 배틀 정보에서 확인할 수 있습니다."
              : `쿼터뷰 3D 게임판. ${active?.name ?? "플레이어"}의 차례. 플레이어 위치는 아래 칸 목록에서 확인할 수 있습니다.`
          }
        />
        <div
          key={battle ? "battle" : "board"}
          className={styles.sceneFade}
          aria-hidden="true"
        />
        {status === "ready" && battle && (
          <BattleHud battle={battle} presentation={presentation} />
        )}
        {status === "ready" &&
          presentation &&
          presentation.event.kind !== "move" && (
            <div className={styles.eventCaption} role="status">
              {presentation.event.attack ? (
                <>
                  <TypeBadge type={presentation.event.attack.moveType} />
                  <strong>
                    {movesById[presentation.event.attack.moveId].name}
                  </strong>
                  {presentation.progress >= 0.45 && (
                    <small>
                      {presentation.event.attack.effectiveness > 1
                        ? "효과가 굉장합니다!"
                        : presentation.event.attack.effectiveness < 1
                          ? "효과가 약합니다"
                          : "명중!"}
                    </small>
                  )}
                </>
              ) : (
                <strong>{presentation.event.message}</strong>
              )}
            </div>
          )}
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
        {status === "ready" && !battle && !presentation && (
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
