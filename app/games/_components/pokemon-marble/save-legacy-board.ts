import type { TileKind } from "./board";

/** Versions 2?4 used this fixed layout. Never validate them against a new board. */
export const BOARD_SIZE = 40;
const grassTiles = new Set([1, 5, 9, 14, 18, 23, 27, 32, 36]);
export const BOARD_TILES: TileKind[] = Array.from({ length: BOARD_SIZE }, (_, tile) =>
  tile % 10 === 0 ? "center" : grassTiles.has(tile) ? "grass" : "road",
);
