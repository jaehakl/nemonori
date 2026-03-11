import type { DashboardViewModel } from "../types";
import styles from "../BaseballManagerGame.module.css";

type DashboardPanelProps = {
  view: DashboardViewModel;
  saveStatus: string;
};

export function DashboardPanel({ view, saveStatus }: DashboardPanelProps) {
  return (
    <section className={styles.card}>
      <p className={styles.eyebrow}>{view.currentDayLabel}</p>
      <h2 className={styles.sectionTitle}>{view.teamName}</h2>
      <p className={styles.metaLine}>Record {view.teamRecord}</p>
      <p className={styles.metaLine}>{view.nextOpponent}</p>
      <p className={styles.metaLine}>{view.matchStatus}</p>
      <p className={styles.metaLine}>{saveStatus}</p>
      <div className={styles.feedList}>
        {view.feedItems.map((item) => (
          <p key={item} className={styles.feedItem}>
            {item}
          </p>
        ))}
      </div>
    </section>
  );
}
