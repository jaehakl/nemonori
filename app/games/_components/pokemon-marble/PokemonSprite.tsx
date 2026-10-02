import Image from "next/image";
import { useState } from "react";
import { speciesById, spriteUrl, typeColors, typeNames } from "./pokemon-data";
import { useSpriteArtwork } from "./sprite-artwork";
import styles from "./PokemonMarble.module.css";

export function PokemonSprite({
  speciesId,
  size = 80,
  fit = false,
}: {
  speciesId: number;
  size?: number;
  fit?: boolean;
}) {
  const { bounds, status } = useSpriteArtwork(speciesId, fit);
  const [failedSpeciesId, setFailedSpeciesId] = useState<number | null>(null);
  const species = speciesById[speciesId];
  const name = species?.name ?? "포켓몬";
  if (failedSpeciesId === speciesId || (fit && status === "failed")) {
    return (
      <span
        className={styles.spriteFallback}
        role="img"
        aria-label={name}
        title={`${name} 이미지를 불러오지 못했습니다`}
        style={{
          width: size,
          height: size,
          color: typeColors[species?.types[0]] ?? "#526c5c",
          fontSize: Math.max(10, Math.min(18, size * 0.17)),
        }}
      >
        {name}
      </span>
    );
  }
  const sprite = (
    <Image
      className={styles.sprite}
      src={spriteUrl(speciesId)}
      alt={name}
      width={size}
      height={size}
      unoptimized
      draggable={false}
      onError={() => setFailedSpeciesId(speciesId)}
      onLoad={() => setFailedSpeciesId(null)}
      style={fit && bounds ? {
        position: "absolute",
        left: "50%",
        top: "50%",
        width: size * bounds.scale,
        height: size * bounds.scale,
        maxWidth: "none",
        transform: `translate(${-bounds.centerX * 100}%, ${-bounds.centerY * 100}%)`,
      } : undefined}
    />
  );
  return fit ? <span className={styles.spriteFrame} style={{ width: size, height: size }}>{sprite}</span> : sprite;
}

export function TypeBadge({ type }: { type: number | null }) {
  return (
    <span
      className={styles.typeBadge}
      style={{ background: type === null ? "#617078" : typeColors[type] }}
    >
      {type === null ? "무상성" : typeNames[type]}
    </span>
  );
}

export function HealthBar({ hp, max }: { hp: number; max: number }) {
  return (
    <div className={styles.health}>
      <div
        className={styles.healthTrack}
        role="meter"
        aria-label="체력"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={hp}
      >
        <span
          style={{
            width: `${Math.max(0, Math.min(100, (hp / max) * 100))}%`,
            background:
              hp / max > 0.5
                ? "#19a888"
                : hp / max > 0.2
                  ? "#e9a72f"
                  : "#e65f65",
          }}
        />
      </div>
      <small>{hp === 0 ? "행동불능" : `${hp} / ${max}`}</small>
    </div>
  );
}
