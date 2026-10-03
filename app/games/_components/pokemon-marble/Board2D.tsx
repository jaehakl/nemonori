"use client";

import { BOARD_TILES, getTilePosition } from "./board";
import type { BoardGuardian, BoardToken } from "./board-view";
import { speciesById } from "./pokemon-data";
import SvgPokemon from "./SvgPokemon";
import type { PresentationEvent } from "./presentation-events";
import styles from "./Board2D.module.css";

type Props = {
  tokens: BoardToken[];
  guardians: BoardGuardian[];
  activePlayerId: number;
  presentation?: { event: PresentationEvent; progress: number } | null;
  paused?: boolean;
  reducedMotion?: boolean;
  selectedTile?: number | null;
  onTileSelect?: (tile: number) => void;
};

const TILE_NAMES = { center: "포켓몬센터", grass: "풀숲", road: "도로" };
const TILE_FILLS = { center: "#f5d9ca", grass: "#b9d09b", road: "#fff3d6" };

function tileCenter(tile: number) {
  const { x, z } = getTilePosition(tile);
  return { x: (x + 5.5) * 100, y: (z + 5.5) * 100 };
}

function tokenLayout(
  token: BoardToken,
  tile: number,
  tokens: BoardToken[],
  guardians: BoardGuardian[],
) {
  const occupants = tokens.filter(
    (entry) => entry.id === token.id || entry.position === tile,
  );
  const index = occupants.findIndex((entry) => entry.id === token.id);
  const guarded = guardians.some((guardian) => guardian.tile === tile);
  if (occupants.length === 1)
    return guarded
      ? { x: 50, y: 74, size: 44 }
      : { x: 50, y: 45, size: 76 };
  if (occupants.length === 2)
    return { x: index ? 75 : 25, y: guarded ? 74 : 51, size: 44 };
  return {
    x: index % 2 ? 75 : 25,
    y: guarded ? (index < 2 ? 50 : 83) : (index < 2 ? 24 : 74),
    size: guarded ? 30 : 44,
  };
}


/** Flat vector tiles remain sharp at every tablet size; the board never rotates. */
export default function Board2D({
  tokens,
  guardians,
  activePlayerId,
  presentation = null,
  paused = false,
  reducedMotion = false,
  selectedTile = null,
  onTileSelect,
}: Props) {
  return (
    <svg
      className={styles.board}
      viewBox="0 0 1100 1100"
      role="group"
      aria-label="포켓몬 마블 40칸 게임판"
      preserveAspectRatio="xMidYMid meet"
    >
      <rect width="1100" height="1100" rx="12" fill="#513629" />
      <rect x="100" y="100" width="900" height="900" fill="#173f35" />
      <rect x="108" y="108" width="884" height="884" rx="12" fill="none" stroke="#d7b46a" strokeWidth="2" opacity="0.6" />
      <path d="M119 151v-32h32M949 119h32v32M981 949v32h-32M151 981h-32v-32" fill="none" stroke="#d7b46a" strokeWidth="5" />
      {BOARD_TILES.map((kind, tile) => {
        const center = tileCenter(tile);
        const guardian = guardians.find((entry) => entry.tile === tile);
        const owner = tokens.find((token) => token.id === guardian?.ownerId);
        const occupants = tokens.filter((token) => token.position === tile);
        const description = [
          `${tile + 1}번 ${TILE_NAMES[kind]}`,
          ...occupants.map((token) => `${token.name}${token.restTurnsRemaining ? ` · 휴식 ${token.restTurnsRemaining}턴` : ""}`),
          guardian ? `${owner?.name ?? "플레이어"}의 ${speciesById[guardian.speciesId]?.name ?? "포켓몬"} 수비` : "",
        ].filter(Boolean).join(" · ");
        return (
          <g
            key={tile}
            className={styles.tile}
            transform={`translate(${center.x - 50} ${center.y - 50})`}
            data-tile={tile}
            data-kind={kind}
            role="button"
            tabIndex={paused ? -1 : 0}
            aria-label={description}
            aria-pressed={selectedTile === tile}
            aria-disabled={paused}
            onClick={() => { if (!paused) onTileSelect?.(tile); }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                if (!paused) onTileSelect?.(tile);
              }
            }}
          >
            <rect
              className={styles.tileFace}
              x="1.5" y="1.5" width="97" height="97" rx="5"
              fill={TILE_FILLS[kind]}
              stroke={selectedTile === tile ? "#f7c65e" : "#927044"}
              strokeWidth={selectedTile === tile ? 4 : 2}
            />
            {guardian && (
              <rect x="5" y="3" width="90" height="5" rx="2" fill={owner?.color ?? "#637467"} />
            )}
            <text x="8" y="17" className={styles.tileNumber}>{tile + 1}</text>
            {kind === "center" && (
              <path d="M84 5h7v6h6v7h-6v6h-7v-6h-6v-7h6z" fill="#d84646" />
            )}
            {kind === "grass" && (
              <path d="M79 23c-1-9 3-14 15-17 2 10-2 17-15 17Zm1-1 10-11" fill="#3d8b45" stroke="#246333" strokeWidth="2" />
            )}
            <title>{description}</title>
          </g>
        );
      })}
      <g className={styles.pieces} aria-hidden="true">
        {guardians.map((guardian) => {
          const center = tileCenter(guardian.tile);
          const occupantCount = tokens.filter((token) => token.position === guardian.tile).length;
          const crowded = occupantCount >= 3;
          const size = occupantCount === 0 ? 76 : crowded ? 30 : 44;
          return (
            <g key={guardian.tile} data-guardian={guardian.tile} data-species={guardian.speciesId} data-guardian-size={size}>
              <SvgPokemon
                speciesId={guardian.speciesId}
                x={center.x}
                y={center.y - 50 + (occupantCount === 0 ? 50 : crowded ? 17 : 26)}
                size={size}
                color={tokens.find((token) => token.id === guardian.ownerId)?.color}
              />
            </g>
          );
        })}
        {tokens.map((token) => {
          const center = tileCenter(token.position);
          const layout = tokenLayout(token, token.position, tokens, guardians);
          let x = center.x - 50 + layout.x;
          let y = center.y - 50 + layout.y;
          let size = layout.size;
          const event = presentation?.event;
          if (event?.kind === "move" && event.playerId === token.id && event.fromTile !== undefined) {
            const fromCenter = tileCenter(event.fromTile);
            const from = tokenLayout(token, event.fromTile, tokens, guardians);
            const progress = reducedMotion ? 1 : Math.max(0, Math.min(1, presentation!.progress));
            const eased = progress * progress * (3 - 2 * progress);
            x = fromCenter.x - 50 + from.x + (x - (fromCenter.x - 50 + from.x)) * eased;
            y = fromCenter.y - 50 + from.y + (y - (fromCenter.y - 50 + from.y)) * eased;
            size = from.size + (size - from.size) * eased;
          }
          const resting = token.restTurnsRemaining > 0;
          const label = `P${token.id + 1}${resting ? ` · ${token.restTurnsRemaining}` : ""}`;
          const tagWidth = Math.max(resting ? 28 : 18, size * (resting ? 0.6 : 0.4));
          const tagHeight = Math.max(6, size * 0.22);
          const tagX = size * 0.16 - tagWidth / 2;
          const tagY = size * 0.34;
          return (
            <g
              key={token.id}
              transform={`translate(${x} ${y})`}
              data-token={token.id}
              data-token-size={size}
              data-starter={token.starterSpeciesId}
              data-leader={token.leaderSpeciesId}
              data-active={token.id === activePlayerId}
            >
              <circle
                r={size / 2}
                fill="#fff"
                stroke={token.color}
                strokeWidth={size <= 32 ? (token.id === activePlayerId ? 4 : 2) : (token.id === activePlayerId ? 5 : 3)}
                strokeDasharray={resting ? "5 3" : undefined}
              />
              <SvgPokemon speciesId={token.leaderSpeciesId} x={0} y={-size * 0.08} size={size * 0.8} color={token.color} />
              <rect x={tagX} y={tagY} width={tagWidth} height={tagHeight} rx={tagHeight / 3} fill={token.color} />
              <text
                x={tagX + tagWidth / 2}
                y={tagY + tagHeight * 0.74}
                fontSize={Math.max(6, size * 0.16)}
                className={styles.playerLabel}
              >{label}</text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
