type Rectangle = { left: number; top: number; width: number; height: number };

/** Position next to the tile, preferring the board's interior and keeping a viewport margin. */
export function guardianPopupPosition(anchor: Rectangle, popup: { width: number; height: number }, viewport: { width: number; height: number }) {
  const margin = 8;
  const centerX = anchor.left + anchor.width / 2;
  const centerY = anchor.top + anchor.height / 2;
  const left = centerX < viewport.width / 2 ? anchor.left + anchor.width + margin : anchor.left - popup.width - margin;
  const top = centerY - popup.height / 2;
  return {
    left: Math.max(margin, Math.min(left, viewport.width - popup.width - margin)),
    top: Math.max(margin, Math.min(top, viewport.height - popup.height - margin)),
  };
}
