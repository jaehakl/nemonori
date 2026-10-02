import type { SeatSide } from "./types";

export type TileKind = "center" | "grass" | "road";
export const BOARD_SIZE = 40;
export const BOARD_SIDE_LENGTH = 10;
export const BOARD_HALF_EXTENT = 5;
const grassTiles = new Set([1, 5, 9, 14, 18, 23, 27, 32, 36]);
export const BOARD_TILES: TileKind[] = Array.from(
  { length: BOARD_SIZE },
  (_, index) =>
    index % BOARD_SIDE_LENGTH === 0
      ? "center"
      : grassTiles.has(index)
        ? "grass"
        : "road",
);
export const PLAYER_COLORS = ["#ef6559", "#3988e5", "#e8b840", "#9b6ad9"];

export function getDefaultSeatSides(playerCount: number): SeatSide[] {
  if (playerCount === 2) return ["bottom", "top"];
  if (playerCount === 3) return ["bottom", "left", "right"];
  return ["bottom", "left", "top", "right"];
}

/** The shared clockwise board path starts at the bottom-left corner. */
export function getTilePosition(index: number): { x: number; z: number } {
  const offset = index % BOARD_SIDE_LENGTH;
  const edge = BOARD_HALF_EXTENT;
  switch (Math.floor(index / BOARD_SIDE_LENGTH)) {
    case 0:
      return { x: -edge, z: edge - offset };
    case 1:
      return { x: -edge + offset, z: -edge };
    case 2:
      return { x: edge, z: -edge + offset };
    default:
      return { x: edge - offset, z: edge };
  }
}
