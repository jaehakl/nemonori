export type TileKind = "center" | "grass" | "road";
export const BOARD_SIZE = 32;
const side: TileKind[] = [
  "center",
  "grass",
  "road",
  "grass",
  "road",
  "grass",
  "road",
  "road",
];
export const BOARD_TILES: TileKind[] = Array.from(
  { length: BOARD_SIZE },
  (_, index) => side[index % 8],
);
export const PLAYER_COLORS = ["#ef6559", "#3988e5", "#e8b840", "#9b6ad9"];

/** Clockwise path viewed from above. Adjacent corners are eight steps apart. */
export function getTilePosition(index: number): { x: number; z: number } {
  const offset = index % 8;
  switch (Math.floor(index / 8)) {
    case 0:
      return { x: -4 + offset, z: 4 };
    case 1:
      return { x: 4, z: 4 - offset };
    case 2:
      return { x: 4 - offset, z: -4 };
    default:
      return { x: -4, z: -4 + offset };
  }
}
