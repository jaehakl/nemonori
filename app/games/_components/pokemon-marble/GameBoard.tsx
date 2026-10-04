"use client";

import { useState } from "react";
import { TILE_NAMES, type BoardGuardian, type BoardToken } from "./board-view";
import styles from "./GameBoard.module.css";
import Battle2D from "./Battle2D";
import type { BattleView, PresentationEvent } from "./presentation-events";
import { ExperienceBar, HealthBar, TypeBadge } from "./PokemonSprite";
import { movesById, speciesById } from "./pokemon-data";
import Board2D from "./Board2D";
import { getAttackFrame } from "./battle-visuals";
import { STATUS_NAMES } from "./battle-actions";

export type { BoardGuardian, BoardToken } from "./board-view";

type Props = {
  tokens: BoardToken[];
  guardians: BoardGuardian[];
  activePlayerId: number;
  battle?: BattleView | null;
  presentation?: { event: PresentationEvent; progress: number } | null;
  paused?: boolean;
  reducedMotion?: boolean;
  tabletop?: boolean;
  hideHud?: boolean;
  selectedTile?: number | null;
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
  const attacking = presentation?.event.kind === "attack" ? presentation.event.attack?.side : null;
  const activeSide = presentation ? attacking : battle.phase === "attack" ? battle.turn : null;
  const turnLabel = attacking ? "공격 중" : "공격 차례";
  return (
    <div className={`${styles.battleHud} ${inline ? styles.inlineHud : ""}`}>
      {(["attacker", "defender"] as const).map((side) => {
        const pokemon = battle[side];
        const attack = presentation?.event.attack;
        const receiving = attack && attack.side !== side;
        const frame = getAttackFrame(presentation ?? null);
        const effect = presentation?.event.effect;
        let hp = pokemon?.hp;
        if (receiving) hp = frame.hit ? (frame.progress < 0.45 ? frame.hit.beforeHp : frame.hit.afterHp) : presentation!.progress < 0.45 ? attack.beforeHp : attack.afterHp;
        else if (attack?.sourceBeforeHp !== undefined) hp = presentation!.progress < 0.85 ? attack.sourceBeforeHp : attack.sourceAfterHp;
        if (effect?.side === side) hp = presentation!.progress < 0.45 ? effect.beforeHp : effect.afterHp;
        const status = battle.combat?.[side].status;
        const trainerName =
          side === "attacker" ? battle.attackerName : battle.defenderName;
        const healthDescription = pokemon
          ? `${speciesById[pokemon.speciesId].name} · HP ${hp} / ${pokemon.maxHp}${hp === 0 ? " · 행동불능" : ""}`
          : "출전 대기";
        return (
          <div
            className={`${styles.fighterHud} ${activeSide === side ? styles.activeFighter : ""}`}
            key={side}
            role="group"
            aria-label={`${trainerName} · ${healthDescription}`}
          >
            <small>
              <span>{trainerName} · {side === "attacker" ? "후공" : "선공"}</span>
              {activeSide === side && <span className={styles.attackBadge} role="status">{turnLabel}</span>}
            </small>
            <strong>
              {pokemon ? speciesById[pokemon.speciesId].name : "파트너 선택 중"}
              {pokemon && <span>Lv. {pokemon.level}</span>}
              {status && <span aria-label={`상태이상 ${STATUS_NAMES[status]}`}>{STATUS_NAMES[status]}</span>}
            </strong>
            <div className={styles.fighterTypes} aria-label={`${pokemon ? speciesById[pokemon.speciesId].name : trainerName} 타입`}>
              {pokemon && speciesById[pokemon.speciesId].types.map((type) => <TypeBadge key={type} type={type} />)}
            </div>
            {pokemon && <HealthBar hp={hp!} max={pokemon.maxHp} />}
            {pokemon && <ExperienceBar xp={pokemon.xp} level={pokemon.level} />}
            {receiving && attack.outcome !== "miss" && frame.progress >= 0.45 && (
              <span
                className={styles.damage}
                key={`${presentation!.event.revision}-${presentation!.event.sequence}`}
              >
                −{frame.hit ? frame.hit.beforeHp - frame.hit.afterHp : attack.damage}
              </span>
            )}
            {attack?.side === side && presentation!.progress >= 0.85 && Boolean(attack.healing) && <span className={styles.healing}>+{attack.healing} 회복</span>}
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
          <strong>{attack.moveName ?? movesById[attack.moveId]?.name ?? "이전 버전 공격"}</strong>
          {presentation.progress >= 0.45 && (
            <small>
              {attack.outcome === "miss" ? "빗나갔다!" : attack.outcome && attack.outcome !== "hit" ? presentation.event.message : attack.critical ? "급소에 맞았다!" : attack.effectiveness > 1
                ? "효과가 굉장합니다!"
                : attack.effectiveness < 1
                  ? "효과가 약합니다"
                  : "명중!"}
            </small>
          )}
          {(attack.hits?.length ?? 0) > 1 && <small>{attack.hits!.length}회 공격 · 총 {attack.damage} 피해</small>}
        </>
      ) : (
        <strong>{presentation.event.message}</strong>
      )}
    </div>
  );
}

export default function GameBoard({
  tokens,
  guardians,
  activePlayerId,
  battle = null,
  presentation = null,
  paused = false,
  reducedMotion = false,
  tabletop = false,
  hideHud = false,
  selectedTile: controlledSelectedTile,
  onTileSelect,
}: Props) {
  const [internalSelectedTile, setSelectedTile] = useState<number | null>(null);
  const selectedTile = controlledSelectedTile === undefined
    ? internalSelectedTile : controlledSelectedTile;
  function selectTile(tile: number) {
    setSelectedTile(tile);
    onTileSelect?.(tile);
  }

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
            presentation={presentation}
            paused={paused}
            reducedMotion={reducedMotion}
            onTileSelect={selectTile}
            selectedTile={selectedTile}
          />
        )}
        {battle && (
          <Battle2D battle={battle} presentation={presentation} reducedMotion={reducedMotion} />
        )}
        {!hideHud && battle && <BattleHud battle={battle} presentation={presentation} />}
        {!hideHud && <EventCaption presentation={presentation} />}
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

        </>
      )}
    </section>
  );
}
