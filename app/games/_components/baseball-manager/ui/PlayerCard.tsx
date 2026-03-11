import type { PlayerCardViewModel } from "../types";
import styles from "../BaseballManagerGame.module.css";

type PlayerCardProps = {
  card: PlayerCardViewModel;
  selected?: boolean;
  onClick?: () => void;
};

export function PlayerCard({ card, selected = false, onClick }: PlayerCardProps) {
  return (
    <button type="button" className={`${styles.playerCard} ${selected ? styles.playerCardSelected : ""}`} onClick={onClick}>
      <div className={styles.playerHeader}>
        <strong>{card.name}</strong>
        <span>{card.badge}</span>
      </div>
      <p>{card.profileLine}</p>
      <p>{card.seasonLine}</p>
      <p>{card.recentUsage}</p>
      <p>{card.interview}</p>
      <p>{card.reportSummary}</p>
      <p className={styles.reportMeta}>{card.reportMeta}</p>
    </button>
  );
}
