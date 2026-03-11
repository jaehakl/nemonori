import type { MatchViewModel } from "../types";
import styles from "../BaseballManagerGame.module.css";

type FieldViewProps = {
  view: MatchViewModel;
};

export function FieldView({ view }: FieldViewProps) {
  return (
    <section className={styles.matchLayout}>
      <div className={styles.scoreboard}>
        <p className={styles.eyebrow}>Match</p>
        <h2 className={styles.sectionTitle}>{view.header}</h2>
        <p className={styles.metaLine}>{view.inningLine}</p>
        <p className={styles.metaLine}>{view.countLine}</p>
        <p className={styles.metaLine}>{view.basesLine}</p>
      </div>

      <div className={styles.fieldCard}>
        <svg viewBox="0 0 100 100" className={styles.fieldSvg} role="img" aria-label="Baseball field overview">
          <polygon points="50,12 88,50 50,88 12,50" className={styles.infieldDiamond} />
          <circle cx="50" cy="50" r="34" className={styles.outfieldArc} />
          {view.fieldMarkers.map((marker) => (
            <g key={marker.key} transform={`translate(${marker.x} ${marker.y})`}>
              <circle r="5.5" className={marker.active ? styles.fieldMarkerActive : styles.fieldMarkerIdle} />
              <text y="1.5" textAnchor="middle" className={styles.fieldMarkerText}>
                {marker.label}
              </text>
            </g>
          ))}
        </svg>
      </div>

      <div className={styles.logCard}>
        <p className={styles.eyebrow}>Broadcast</p>
        {view.eventLog.map((item, index) => (
          <p key={`${index}-${item}`} className={styles.feedItem}>
            {item}
          </p>
        ))}
      </div>
    </section>
  );
}
