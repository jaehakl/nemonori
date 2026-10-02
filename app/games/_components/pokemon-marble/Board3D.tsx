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
import Board2D from "./Board2D";

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
  tabletop?: boolean;
  hideHud?: boolean;
  selectedTile?: number | null;
  retryKey?: number;
  onFailure?: () => void;
  onReady?: () => void;
  onTileSelect?: (tile: number) => void;
};

export function BattleHud({
  battle,
  presentation,
  inline = false,
}: {
  battle: BattleView;
  presentation: Props["presentation"];
  inline?: boolean;
}) {
  return (
    <div className={`${styles.battleHud} ${inline ? styles.inlineHud : ""}`}>
      {(["attacker", "defender"] as const).map((side) => {
        const pokemon = battle[side];
        const attack = presentation?.event.attack;
        const receiving = attack && attack.side !== side;
        const hp =
          pokemon && receiving && presentation!.progress < 0.45
            ? attack.beforeHp
            : pokemon?.hp;
        const trainerName =
          side === "attacker" ? battle.attackerName : battle.defenderName;
        const healthDescription = pokemon
          ? `${speciesById[pokemon.speciesId].name} · HP ${hp} / ${pokemon.maxHp}${hp === 0 ? " · 행동불능" : ""}`
          : "출전 대기";
        return (
          <div
            className={styles.fighterHud}
            key={side}
            role="group"
            aria-label={`${trainerName} · ${healthDescription}`}
          >
            <small>
              {trainerName} · {side === "attacker" ? "후공" : "선공"}
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

export function EventCaption({
  presentation,
  inline = false,
}: {
  presentation: Props["presentation"];
  inline?: boolean;
}) {
  if (!presentation || presentation.event.kind === "move") return null;
  const attack = presentation.event.attack;
  return (
    <div
      className={`${styles.eventCaption} ${inline ? styles.inlineCaption : ""}`}
      role="status"
    >
      {attack ? (
        <>
          <TypeBadge type={attack.moveType} />
          <strong>{movesById[attack.moveId].name}</strong>
          {presentation.progress >= 0.45 && (
            <small>
              {attack.effectiveness > 1
                ? "효과가 굉장합니다!"
                : attack.effectiveness < 1
                  ? "효과가 약합니다"
                  : "명중!"}
            </small>
          )}
        </>
      ) : (
        <strong>{presentation.event.message}</strong>
      )}
    </div>
  );
}

function describeTile(
  index: number,
  tokens: BoardToken[],
  guardians: BoardGuardian[],
) {
  const occupants = tokens
    .filter((token) => token.position === index)
    .map((token) => token.name);
  const guardian = guardians.find((entry) => entry.tile === index);
  const owner = guardian
    ? tokens.find((token) => token.id === guardian.ownerId)
    : undefined;
  return `${index + 1}번 ${TILE_NAMES[index]}${occupants.length ? ` · ${occupants.join(", ")}` : ""}${owner ? ` · ${owner.name}의 수비` : ""}`;
}

/** Reusable in the rotating controls, including when WebGL is unavailable. */
export function BoardTileList({
  tokens,
  guardians,
  selectedTile,
  onTileSelect,
}: {
  tokens: BoardToken[];
  guardians: BoardGuardian[];
  selectedTile?: number | null;
  onTileSelect: (tile: number) => void;
}) {
  return (
    <details className={styles.tileDetails}>
      <summary>칸 목록 · 키보드로 살펴보기</summary>
      <div className={styles.tileList}>
        {TILE_NAMES.map((name, index) => (
          <button
            key={index}
            type="button"
            aria-label={describeTile(index, tokens, guardians)}
            aria-pressed={selectedTile === index}
            className={
              selectedTile === index ? styles.selectedButton : undefined
            }
            onClick={() => onTileSelect(index)}
          >
            <span>{String(index + 1).padStart(2, "0")}</span>
            {name}
            {tokens
              .filter((token) => token.position === index)
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
  tabletop = false,
  hideHud = false,
  selectedTile: controlledSelectedTile,
  retryKey = 0,
  onFailure,
  onReady,
  onTileSelect,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<BoardRenderer | null>(null);
  const initializeRef = useRef<(() => void) | null>(null);
  const renderedSnapshotRef = useRef<BoardSnapshot | null>(null);
  const battleVisible = Boolean(battle);
  const snapshotRef = useRef<BoardSnapshot>({
    tokens,
    guardians,
    activePlayerId,
    dice,
    rolling,
    battle,
    presentation,
    paused: paused || !battle,
    reducedMotion,
  });
  const onSelectRef = useRef(onTileSelect);
  const onFailureRef = useRef(onFailure);
  const onReadyRef = useRef(onReady);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">(
    "loading",
  );
  const [attempt, setAttempt] = useState(0);
  const [internalSelectedTile, setSelectedTile] = useState<number | null>(null);
  const selectedTile =
    controlledSelectedTile === undefined
      ? internalSelectedTile
      : controlledSelectedTile;
  const selectedRef = useRef<number | null>(null);

  const selectTile = useCallback((tile: number) => {
    setSelectedTile(tile);
    selectedRef.current = tile;
    rendererRef.current?.selectTile(tile);
    onSelectRef.current?.(tile);
  }, []);

  useEffect(() => {
    if (controlledSelectedTile === undefined) return;
    selectedRef.current = controlledSelectedTile;
    rendererRef.current?.selectTile(controlledSelectedTile);
  }, [controlledSelectedTile]);

  useEffect(() => {
    snapshotRef.current = {
      tokens,
      guardians,
      activePlayerId,
      dice,
      rolling,
      battle,
      presentation,
      paused: paused || !battle,
      reducedMotion,
    };
    onSelectRef.current = onTileSelect;
    onFailureRef.current = onFailure;
    onReadyRef.current = onReady;
    if (battle) {
      renderedSnapshotRef.current = snapshotRef.current;
      rendererRef.current?.sync(snapshotRef.current);
    } else if (renderedSnapshotRef.current && !renderedSnapshotRef.current.paused) {
      // Freeze the last battle once; SVG movement never redraws a hidden 3D board.
      const frozen = { ...renderedSnapshotRef.current, paused: true };
      renderedSnapshotRef.current = frozen;
      rendererRef.current?.sync(frozen);
    }
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
    let pendingFrame: number | null = null;
    let attempted = false;
    // Allocate WebGL on the first battle, then retain it across turns and seats.
    initializeRef.current = () => {
      if (!mounted || attempted || pendingFrame !== null) return;
      pendingFrame = requestAnimationFrame(() => {
        pendingFrame = null;
        if (!mounted || !hostRef.current || !snapshotRef.current.battle) return;
        attempted = true;
        setStatus("loading");
        let instance: BoardRenderer | null = null;
        try {
          instance = createBoardRenderer(hostRef.current, selectTile, () => {
            if (mounted) {
              setStatus("failed");
              onFailureRef.current?.();
            }
          });
          rendererRef.current = instance;
          renderedSnapshotRef.current = snapshotRef.current;
          instance.sync(snapshotRef.current);
          instance.selectTile(selectedRef.current);
          setStatus("ready");
          onReadyRef.current?.();
        } catch {
          instance?.dispose();
          rendererRef.current = null;
          setStatus("failed");
          onFailureRef.current?.();
        }
      });
    };
    return () => {
      mounted = false;
      if (pendingFrame !== null) cancelAnimationFrame(pendingFrame);
      initializeRef.current = null;
      rendererRef.current?.dispose();
      rendererRef.current = null;
      renderedSnapshotRef.current = null;
    };
  }, [attempt, retryKey, selectTile]);

  useEffect(() => {
    if (battleVisible) initializeRef.current?.();
  }, [battleVisible, attempt, retryKey]);

  return (
    <section
      className={`${styles.board} ${tabletop ? styles.tabletopBoard : ""}`}
      aria-label="포켓몬 마블 게임판"
    >
      <div
        className={`${styles.surface} ${battle ? styles.battleSurface : ""}`}
      >
        {!hideHud && (
          <div className={styles.badges} aria-hidden="true">
            <span className={styles.worldBadge}>
              <span /> {battle ? "PARTNER BATTLE" : "POKÉMON MARBLE"}
            </span>
            <span className={styles.tileBadge}>
              {battle ? "1 VS 1" : `${TILE_NAMES.length}칸의 모험`}
            </span>
          </div>
        )}
        {!battle && (
          <Board2D
            tokens={tokens}
            guardians={guardians}
            activePlayerId={activePlayerId}
            dice={dice}
            rolling={rolling}
            presentation={presentation}
            paused={paused}
            reducedMotion={reducedMotion}
            onTileSelect={selectTile}
            selectedTile={selectedTile}
          />
        )}
        <div
          ref={hostRef}
          className={styles.canvas}
          hidden={!battle}
          role="img"
          aria-label="포켓몬 3D 배틀 무대. 체력과 기술은 화면의 배틀 정보에서 확인할 수 있습니다."
        />
        {battle && <div className={styles.sceneFade} aria-hidden="true" />}
        {!hideHud && status === "ready" && battle && (
          <BattleHud battle={battle} presentation={presentation} />
        )}
        {!hideHud && (!battle || status === "ready") && (
          <EventCaption presentation={presentation} />
        )}
        {battle && status === "loading" && (
          <div className={styles.overlay}>
            <span className={styles.loader} />
            <p>배틀 무대를 준비하는 중…</p>
          </div>
        )}
        {battle && status === "failed" && (
          <div className={styles.overlay} role="alert">
            <span className={styles.errorIcon}>◇</span>
            <strong>배틀 무대를 표시할 수 없어요</strong>
            <p>
              브라우저의 그래픽 가속 설정을 확인한 뒤 다시 시도해 주세요.
              <br />
              배틀 정보와 행동 버튼으로 계속 플레이할 수 있습니다.
            </p>
            <button
              type="button"
              className={styles.retry}
              onClick={() => {
                setStatus("loading");
                setAttempt((value) => value + 1);
              }}
            >
              배틀 무대 다시 불러오기
            </button>
          </div>
        )}
        {!hideHud && !battle && !presentation && (
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
      {!tabletop && (
        <>
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
              {describeTile(selectedTile, tokens, guardians)}
            </p>
          )}
          <BoardTileList
            tokens={tokens}
            guardians={guardians}
            selectedTile={selectedTile}
            onTileSelect={selectTile}
          />
        </>
      )}
    </section>
  );
}
