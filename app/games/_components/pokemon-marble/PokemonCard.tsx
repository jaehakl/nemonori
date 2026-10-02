import { getStats } from "./battle";
import { speciesById, typeColors } from "./pokemon-data";
import { HealthBar, PokemonSprite, TypeBadge } from "./PokemonSprite";
import type { Pokemon } from "./types";
import styles from "./PokemonMarble.module.css";

export default function PokemonCard({ pokemon, onClick, destination }: {
  pokemon: Pokemon;
  onClick?: () => void;
  destination?: string;
}) {
  const species = speciesById[pokemon.speciesId];
  const Tag = onClick ? "button" : "article";
  return (
    <Tag className={`${styles.tradingCard} ${pokemon.hp === 0 ? styles.fainted : ""}`}
      style={{ "--type-color": typeColors[species.types[0]] } as React.CSSProperties}
      onClick={onClick} type={onClick ? "button" : undefined}
      aria-label={`${species.name}, 레벨 ${pokemon.level}${pokemon.hp === 0 ? ", 행동불능" : ""}${onClick ? `, ${destination}` : ""}`}>
      <div className={styles.cardHeading}><strong>{species.name}</strong><span>Lv. {pokemon.level}</span></div>
      <div className={styles.cardArtwork}><PokemonSprite speciesId={pokemon.speciesId} size={144} fit /></div>
      <div className={styles.typeRow}>{species.types.map((type) => <TypeBadge type={type} key={type} />)}</div>
      <HealthBar hp={pokemon.hp} max={getStats(pokemon).hp} />
    </Tag>
  );
}
