export type PokemonStats = {
  hp: number;
  attack: number;
  defense: number;
  specialAttack: number;
  specialDefense: number;
  speed: number;
};

export type Species = {
  id: number;
  name: string;
  englishName: string;
  generation: number;
  types: number[];
  stats: PokemonStats;
  evolvesFrom: number | null;
  legendary: boolean;
  mythical: boolean;
  evolutions: { speciesId: number; level: number }[];
  learnset: { moveId: number; level: number }[];
};

export type Move = {
  id: number;
  name: string;
  type: number | null;
  power: number;
  category: "physical" | "special";
};
