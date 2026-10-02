import Image from "next/image";
import { speciesById, spriteUrl, typeColors, typeNames } from "./pokemon-data";
import styles from "./PokemonMarble.module.css";

export function PokemonSprite({
  speciesId,
  size = 80,
}: {
  speciesId: number;
  size?: number;
}) {
  return (
    <Image
      className={styles.sprite}
      src={spriteUrl(speciesId)}
      alt={speciesById[speciesId]?.name ?? "포켓몬"}
      width={size}
      height={size}
      unoptimized
      draggable={false}
    />
  );
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
