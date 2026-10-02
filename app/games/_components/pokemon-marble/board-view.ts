import { BOARD_TILES } from "./board";

export type BoardToken = {
  id: number;
  name: string;
  color: string;
  position: number;
  starterSpeciesId: number;
  restTurnsRemaining: number;
};

export type BoardGuardian = {
  tile: number;
  ownerId: number;
  speciesId: number;
};

const TILE_LABELS = { center: "포켓몬센터", grass: "풀숲", road: "도로" };
export const TILE_NAMES = BOARD_TILES.map((kind) => TILE_LABELS[kind]);
