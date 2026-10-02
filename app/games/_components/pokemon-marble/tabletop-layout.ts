import type { SeatSide } from "./types";

export type TabletopRectangle = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export const SEAT_ROTATION: Readonly<Record<SeatSide, number>> = {
  bottom: 0,
  left: 90,
  top: 180,
  right: 270,
};

const PANEL_RATIO = 0.7;
const BATTLE_MODAL_DEPTH = 260;
const BATTLE_MODAL_WIDTH = 620;
const MODAL_MARGIN = 16;

/** CSS rotates only the controls; the board and battle stage stay upright. */
export function getTabletopLayout(
  width: number,
  height: number,
  battle: boolean,
  seat: SeatSide,
) {
  const boardSize = Math.min(width, height);
  const boardLeft = (width - boardSize) / 2;
  const boardTop = (height - boardSize) / 2;
  const panelSize = boardSize * PANEL_RATIO;
  const sideways = seat === "left" || seat === "right";
  let stage: TabletopRectangle = {
    left: boardLeft,
    top: boardTop,
    width: boardSize,
    height: boardSize,
  };
  let panel: TabletopRectangle = {
    left: (width - panelSize) / 2,
    top: (height - panelSize) / 2,
    width: panelSize,
    height: panelSize,
  };

  if (battle) {
    // The floating action modal sits over the backdrop, clear of the fighters.
    const depth = Math.min(
      BATTLE_MODAL_DEPTH,
      (sideways ? width : height) * 0.4,
    );
    const reserved = Math.min(
      depth + MODAL_MARGIN * 2,
      sideways ? width : height,
    );
    stage = { left: 0, top: 0, width, height };
    if (sideways) {
      const length = Math.max(
        0,
        Math.min(BATTLE_MODAL_WIDTH, height - MODAL_MARGIN * 2),
      );
      stage.width -= reserved;
      stage.left = seat === "left" ? reserved : 0;
      panel = {
        left: seat === "left" ? MODAL_MARGIN : width - depth - MODAL_MARGIN,
        top: (height - length) / 2,
        width: depth,
        height: length,
      };
    } else {
      const length = Math.max(
        0,
        Math.min(BATTLE_MODAL_WIDTH, width - MODAL_MARGIN * 2),
      );
      stage.height -= reserved;
      stage.top = seat === "top" ? reserved : 0;
      panel = {
        left: (width - length) / 2,
        top: seat === "top" ? MODAL_MARGIN : height - depth - MODAL_MARGIN,
        width: length,
        height: depth,
      };
    }
  }

  return {
    stage,
    panel,
    rotation: SEAT_ROTATION[seat],
    contentWidth: sideways ? panel.height : panel.width,
    contentHeight: sideways ? panel.width : panel.height,
  };
}
