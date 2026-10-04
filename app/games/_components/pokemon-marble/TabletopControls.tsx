"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { DisplayMode } from "./display-preferences";
import { getOverlayLayout, getTabletopLayout } from "./tabletop-layout";
import type { SeatSide } from "./types";
import styles from "./TabletopControls.module.css";

type Props = {
  battle: boolean;
  seatSide: SeatSide;
  mode: DisplayMode;
  board: ReactNode;
  systemControls?: ReactNode;
  overlay?: {
    seatSide: SeatSide;
    render: (size: { width: number; height: number }) => ReactNode;
  };
  children: ReactNode;
  compact?: boolean;
};

/** Rotate battle artwork and controls together without turning the normal board. */
export default function TabletopControls({
  battle,
  seatSide,
  mode,
  board,
  systemControls,
  overlay,
  children,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const seat = mode === "fixed" ? "bottom" : seatSide;
  const layout = getTabletopLayout(size.width, size.height, battle, seat);
  const overlayLayout = getOverlayLayout(size.width, size.height,
    mode === "fixed" ? "bottom" : overlay?.seatSide ?? seat);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const measure = () => {
      const width = host.clientWidth;
      const height = host.clientHeight;
      setSize((previous) =>
        previous.width === width && previous.height === height
          ? previous
          : { width, height },
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    const frame = requestAnimationFrame(measure);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return (
    <div
      ref={hostRef}
      className={styles.tabletop}
      data-mode={mode}
      data-seat={seat}
      data-battle={battle}
      data-overlay={Boolean(overlay)}
      data-ready={size.width > 0 && size.height > 0}
    >
      <div className={styles.stage} style={layout.stage} inert={Boolean(overlay)} aria-hidden={overlay ? true : undefined}>
        <div
          className={styles.orientedStage}
          style={{
            width: layout.stageContentWidth,
            height: layout.stageContentHeight,
            transform: `translate(-50%, -50%) rotate(${layout.stageRotation}deg)`,
          }}
        >
          {board}
          {systemControls}
        </div>
      </div>
      <div
        className={styles.panelBounds}
        style={layout.panel}
        inert={Boolean(overlay)}
        aria-hidden={overlay ? true : undefined}
        role={battle ? "dialog" : undefined}
        aria-modal={battle ? false : undefined}
        aria-label={battle ? "배틀 행동" : undefined}
      >
        <div
          className={styles.orientedPanel}
          style={{
            width: layout.contentWidth,
            height: layout.contentHeight,
            transform: `translate(-50%, -50%) rotate(${layout.rotation}deg)`,
          }}
        >
          <div className={styles.panelContent}>{children}</div>
        </div>
      </div>
      {overlay && (
        <div className={styles.overlay}>
          <div className={styles.orientedOverlay}
            style={{ width: overlayLayout.width, height: overlayLayout.height,
              transform: `translate(-50%, -50%) rotate(${overlayLayout.rotation}deg)` }}>
            {overlay.render(overlayLayout)}
          </div>
        </div>
      )}
    </div>
  );
}
