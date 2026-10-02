"use client";

import { BOARD_TILES, getTilePosition } from "./board";
import { useId } from "react";
import type { BoardGuardian, BoardToken } from "./board-renderer";
import { speciesById, spriteUrl } from "./pokemon-data";
import { useSpriteArtwork } from "./sprite-artwork";
import type { PresentationEvent } from "./presentation-events";
import styles from "./Board2D.module.css";

type Props = {
  tokens: BoardToken[];
  guardians: BoardGuardian[];
  activePlayerId: number;
  dice: [number, number] | null;
  rolling: boolean;
  presentation?: { event: PresentationEvent; progress: number } | null;
  paused?: boolean;
  reducedMotion?: boolean;
  selectedTile?: number | null;
  onTileSelect?: (tile: number) => void;
};

const TILE_NAMES = { center: "포켓몬센터", grass: "풀숲", road: "도로" };
const TILE_FILLS = { center: "#fff0ed", grass: "#d7edc6", road: "#fffdf5" };

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

function Portrait({
  speciesId,
  x,
  y,
  size,
  color = "#627365",
}: {
  speciesId: number;
  x: number;
  y: number;
  size: number;
  color?: string;
}) {
  const { bounds, status } = useSpriteArtwork(speciesId);
  const clipId = useId();
  const imageSize = size * (bounds?.scale ?? 1);
  const name = speciesById[speciesId]?.name ?? "포켓몬";
  return (
    <g>
      <defs>
        <clipPath id={clipId}>
          <rect x={x - size / 2} y={y - size / 2} width={size} height={size} />
        </clipPath>
      </defs>
      {status === "failed" ? (
        <g>
          <rect x={x - size / 2} y={y - size / 2} width={size} height={size} rx="4" fill="#fff" stroke={color} strokeWidth="2" />
          <text
            x={x} y={y}
            fontSize={Math.max(6, size * 0.17)}
            textAnchor="middle" dominantBaseline="middle"
            textLength={size * 0.88} lengthAdjust="spacingAndGlyphs"
            fill={color}
          >{name}</text>
        </g>
      ) : (
        <image
          href={spriteUrl(speciesId)}
          x={x - imageSize * (bounds?.centerX ?? 0.5)}
          y={y - imageSize * (bounds?.centerY ?? 0.5)}
          width={imageSize}
          height={imageSize}
          clipPath={`url(#${clipId})`}
          className={styles.portrait}
          aria-label={name}
        />
      )}
    </g>
  );
}

function Die({
  value,
  index,
  progress,
  reducedMotion,
}: {
  value: number;
  index: number;
  progress: number;
  reducedMotion: boolean;
}) {
  // Match the 1.8s audio cue: shake, slowing tumbles, two landings, final hold.
  const moving = !reducedMotion && progress < 0.86;
  const tumble = Math.max(0, Math.min(1, (progress - 0.145) / 0.605));
  const settle = Math.max(0, Math.min(1, (progress - 0.75) / 0.11));
  const deceleration = 1 - (1 - tumble) ** 3;
  const shake = progress < 0.145 ? Math.sin(progress * 180 + index) * 7 : 0;
  const angle = moving ? shake + (index ? -1 : 1) * deceleration * 1080 : 0;
  const scale = !moving ? 1 : progress < 0.145 ? 0.9 : 0.62 + settle * 0.38;
  const travel = moving ? Math.sin(progress * 34 + index * 2) * 16 * (1 - progress / 0.86) : 0;
  const hop = moving && progress >= 0.145 && progress < 0.75
    ? Math.sin(tumble * Math.PI * 5 + index) * 4 * (1 - tumble)
    : 0;
  const faceTick = Math.floor((1 - (1 - Math.min(1, progress / 0.75)) ** 2) * 26);
  const face = !reducedMotion && progress < 0.75
    ? 1 + (faceTick * 5 + index * 3 + value) % 6
    : value;
  const impactTime = (progress - (index ? 0.81 : 0.75)) / 0.1;
  const impact = !reducedMotion && impactTime > 0 && impactTime < 1
    ? Math.sin(impactTime * Math.PI)
    : 0;
  const pips: [number, number][] = [];
  if (face % 2) pips.push([0, 0]);
  if (face >= 2) pips.push([-15, -15], [15, 15]);
  if (face >= 4) pips.push([15, -15], [-15, 15]);
  if (face === 6) pips.push([-15, 0], [15, 0]);
  return (
    <g
      transform={`translate(${500 + index * 100 + travel} ${132.5 + hop})`}
      data-die={index}
      data-face={face}
      data-result={value}
    >
      <ellipse cx="0" cy="21" rx="29" ry="7" fill="#294c35" opacity={moving ? 0.1 : 0.16} />
      {impact > 0 && (
        <ellipse
          cx="0" cy="20"
          rx={32 + impact * 8} ry={5 + impact * 3}
          fill="none" stroke="#718e61" strokeWidth="2"
          opacity={impact * 0.6}
        />
      )}
      <g transform={`rotate(${angle}) scale(${scale})`}>
        <rect x="-30" y="-30" width="60" height="60" rx="10" fill="#fff" stroke="#344639" strokeWidth="2.5" />
        {pips.map(([px, py], pip) => (
          <circle key={pip} cx={px} cy={py} r="4.3" fill={face === 1 ? "#cf534c" : "#26382b"} />
        ))}
      </g>
    </g>
  );
}

/** Flat vector tiles remain sharp at every tablet size; the board never rotates. */
export default function Board2D({
  tokens,
  guardians,
  activePlayerId,
  dice,
  rolling,
  presentation = null,
  paused = false,
  reducedMotion = false,
  selectedTile = null,
  onTileSelect,
}: Props) {
  const rollProgress = presentation?.event.kind === "roll"
    ? Math.max(0, Math.min(1, presentation.progress))
    : rolling ? 0 : 1;
  return (
    <svg
      className={styles.board}
      viewBox="0 0 1100 1100"
      role="group"
      aria-label="포켓몬 마블 40칸 게임판"
      preserveAspectRatio="xMidYMid meet"
    >
      <rect x="100" y="100" width="900" height="900" fill="#f5f7ee" />
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
              stroke={selectedTile === tile ? "#142e27" : "#889989"}
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
              <Portrait
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
              data-active={token.id === activePlayerId}
            >
              <circle
                r={size / 2}
                fill="#fff"
                stroke={token.color}
                strokeWidth={size <= 32 ? (token.id === activePlayerId ? 4 : 2) : (token.id === activePlayerId ? 5 : 3)}
                strokeDasharray={resting ? "5 3" : undefined}
              />
              <Portrait speciesId={token.starterSpeciesId} x={0} y={-size * 0.08} size={size * 0.8} color={token.color} />
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
      {dice && (
        <g role="img" aria-label={rolling ? "주사위를 굴리는 중" : `주사위 ${dice[0]} + ${dice[1]}`}>
          <Die value={dice[0]} index={0} progress={rollProgress} reducedMotion={reducedMotion} />
          <Die value={dice[1]} index={1} progress={rollProgress} reducedMotion={reducedMotion} />
        </g>
      )}
    </svg>
  );
}
