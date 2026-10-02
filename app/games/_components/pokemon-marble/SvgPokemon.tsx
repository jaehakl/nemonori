"use client";

import { useId } from "react";
import { speciesById, spriteUrl } from "./pokemon-data";
import { useSpriteArtwork } from "./sprite-artwork";

export default function SvgPokemon({
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
          style={{ pointerEvents: "none", imageRendering: "pixelated" }}
          aria-label={name}
        />
      )}
    </g>
  );
}

