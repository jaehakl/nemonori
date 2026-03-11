import type { DashboardViewModel } from "../types";
import styles from "../BaseballManagerGame.module.css";

type DashboardPanelProps = {
  view: DashboardViewModel;
};

export function DashboardPanel({ view }: DashboardPanelProps) {
  return (
    <section className={styles.card}>
      <p className={styles.eyebrow}>{view.currentDayLabel}</p>
      <h2 className={styles.sectionTitle}>{view.teamName}</h2>
      <p className={styles.metaLine}>팀 성적 {view.teamRecord}</p>
      <p className={styles.metaLine}>{view.nextOpponent}</p>
      <p className={styles.metaLine}>{view.saveStatus}</p>
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
