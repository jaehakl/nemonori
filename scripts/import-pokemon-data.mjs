import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mechanicsRevision, readMechanics, buildMoveEffects } from "./pokemon-move-effects.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const generatedDirectory = join(
  projectRoot,
  "app/games/_components/pokemon-marble/generated",
);
const spriteDirectory = join(projectRoot, "public/pokemon-marble/sprites");
export const dataRevision = "bc92d3b6029ef1abe9e7ad424c400b338f3c11fe";
export const spriteRevision = "bfb75391935310368065096fa08c51e8970bc43e";
const csvBase = `https://raw.githubusercontent.com/PokeAPI/pokeapi/${dataRevision}/data/v2/csv/`;
const spriteBase = `https://raw.githubusercontent.com/PokeAPI/sprites/${spriteRevision}/sprites/pokemon/`;
const sha256 = (data) => createHash("sha256").update(data).digest("hex");

/** CSV quoting is required for localized names and evolution expressions. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(field);
      field = "";
    } else if (char === "\n" && !quoted) {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  if (quoted) throw new Error("Unclosed CSV quote");
  const headers = rows.shift();
  return rows
    .filter((entry) => entry.some(Boolean))
    .map((entry) =>
      Object.fromEntries(
        headers.map((header, index) => [header, entry[index] ?? ""]),
      ),
    );
}

async function fetchPinned(url, cachePath) {
  try {
    return await readFile(cachePath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) throw new Error(`${response.status}: ${url}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      await mkdir(dirname(cachePath), { recursive: true });
      await writeFile(cachePath, bytes);
      return bytes;
    } catch (error) {
      if (attempt === 3) throw error;
      await new Promise((done) => setTimeout(done, 500 * (attempt + 1)));
    }
  }
}

async function mapConcurrent(items, count, work) {
  let next = 0;
  const results = new Array(items.length);
  await Promise.all(
    Array.from({ length: count }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await work(items[index], index);
      }
    }),
  );
  return results;
}

function localizedNames(rows, idKey, languageId) {
  return new Map(
    rows
      .filter((row) => Number(row.local_language_id) === languageId)
      .map((row) => [Number(row[idKey]), row.name]),
  );
}

const extraEvolutionConditions = [
  "trigger_item_id",
  "gender_id",
  "location_id",
  "held_item_id",
  "time_of_day",
  "known_move_id",
  "known_move_type_id",
  "minimum_happiness",
  "minimum_beauty",
  "minimum_affection",
  "relative_physical_stats",
  "party_species_id",
  "party_type_id",
  "trade_species_id",
  "region_id",
  "used_move_id",
  "minimum_move_count",
  "minimum_steps",
  "minimum_damage_taken",
  "nature_bitmask",
  "condition_expression",
  "percentage_chance",
];
const evolutionFlags = [
  "needs_overworld_rain",
  "turn_upside_down",
  "needs_multiplayer",
  "near_special_rock",
];

export function evolutionLevel(row) {
  const ordinary =
    row.evolution_trigger_id === "1" &&
    Number(row.minimum_level) > 0 &&
    extraEvolutionConditions.every((key) => !row[key]) &&
    evolutionFlags.every((key) => !Number(row[key]));
  return ordinary ? Number(row.minimum_level) : 20;
}

export async function importPokemonData() {
  const csvFiles = [
    "pokemon_species",
    "pokemon_species_names",
    "pokemon",
    "pokemon_forms",
    "pokemon_stats",
    "pokemon_types",
    "pokemon_evolution",
    "version_groups",
    "moves",
    "move_names",
    "move_meta",
    "move_meta_stat_changes",
    "pokemon_moves",
    "type_efficacy",
    "type_names",
  ];
  const cacheDirectory = join(tmpdir(), "nemonori-pokemon-import");
  const sources = await mapConcurrent(csvFiles, 4, async (name) => {
    const bytes = await fetchPinned(
      `${csvBase}${name}.csv`,
      join(cacheDirectory, dataRevision, `${name}.csv`),
    );
    return { name, bytes, rows: parseCsv(bytes.toString("utf8")) };
  });
  const csv = Object.fromEntries(sources.map(({ name, rows }) => [name, rows]));
  const mechanicsBytes = await fetchPinned(
    `https://raw.githubusercontent.com/smogon/pokemon-showdown/${mechanicsRevision}/data/moves.ts`,
    join(cacheDirectory, mechanicsRevision, "moves.ts"),
  );
  const mechanics = readMechanics(mechanicsBytes.toString("utf8"));
  const metadata = new Map(csv.move_meta.map(row => [Number(row.move_id), row]));
  const koreanSpecies = localizedNames(
    csv.pokemon_species_names,
    "pokemon_species_id",
    3,
  );
  const englishSpecies = localizedNames(
    csv.pokemon_species_names,
    "pokemon_species_id",
    9,
  );
  const koreanMoves = localizedNames(csv.move_names, "move_id", 3);
  const englishMoves = localizedNames(csv.move_names, "move_id", 9);
  const defaultPokemon = new Map(
    csv.pokemon
      .filter((row) => row.is_default === "1")
      .map((row) => [Number(row.species_id), Number(row.id)]),
  );
  const defaultPokemonIds = new Set(defaultPokemon.values());
  const defaultForms = new Set(
    csv.pokemon_forms
      .filter(
        (row) =>
          row.is_default === "1" &&
          defaultPokemonIds.has(Number(row.pokemon_id)),
      )
      .map((row) => Number(row.id)),
  );
  const versionOrder = new Map(
    csv.version_groups.map((row) => [Number(row.id), Number(row.order)]),
  );
  const stats = new Map();
  for (const row of csv.pokemon_stats) {
    const id = Number(row.pokemon_id);
    if (!stats.has(id)) stats.set(id, {});
    stats.get(id)[Number(row.stat_id)] = Number(row.base_stat);
  }
  const pokemonTypes = new Map();
  for (const row of csv.pokemon_types) {
    const id = Number(row.pokemon_id);
    if (!pokemonTypes.has(id)) pokemonTypes.set(id, []);
    pokemonTypes.get(id)[Number(row.slot) - 1] = Number(row.type_id);
  }
  const moves = Object.fromEntries(
    csv.moves
      .filter(
        (row) =>
          Number(row.power) > 0 && ["2", "3"].includes(row.damage_class_id),
      )
      .map((row) => [
        Number(row.id),
        {
          id: Number(row.id),
          name:
            koreanMoves.get(Number(row.id)) ??
            englishMoves.get(Number(row.id)) ??
            row.identifier,
          type: Number(row.type_id),
          power: Number(row.power),
          category: row.damage_class_id === "2" ? "physical" : "special",
          accuracy: row.accuracy ? Number(row.accuracy) : null,
        },
      ]),
  );

  // The latest version with any level-up records wins, including records for non-damaging moves.
  const latestLearnsets = new Map();
  for (const row of csv.pokemon_moves) {
    const id = Number(row.pokemon_id);
    if (row.pokemon_move_method_id !== "1" || !defaultPokemonIds.has(id))
      continue;
    const order = versionOrder.get(Number(row.version_group_id)) ?? -1;
    if (!latestLearnsets.has(id) || latestLearnsets.get(id).order < order)
      latestLearnsets.set(id, { order, records: [] });
    if (latestLearnsets.get(id).order === order)
      latestLearnsets.get(id).records.push(row);
  }

  const evolutionRows = csv.pokemon_evolution.filter(
    (row) =>
      row.is_default === "1" &&
      (!row.evolved_pokemon_form_id ||
        defaultForms.has(Number(row.evolved_pokemon_form_id))),
  );
  const speciesRows = csv.pokemon_species.filter(
    (row) => Number(row.id) <= 1025,
  );
  const species = speciesRows
    .map((row) => {
      const id = Number(row.id);
      const pokemonId = defaultPokemon.get(id);
      const values = stats.get(pokemonId);
      const learned = new Map();
      for (const record of latestLearnsets.get(pokemonId)?.records ?? []) {
        const moveId = Number(record.move_id);
        if (moves[moveId])
          learned.set(
            moveId,
            Math.min(learned.get(moveId) ?? 1000, Number(record.level)),
          );
      }
      const evolutions = speciesRows
        .filter((child) => Number(child.evolves_from_species_id) === id)
        .map((child) => {
          const candidates = evolutionRows.filter(
            (candidate) =>
              Number(candidate.evolved_species_id) === Number(child.id),
          );
          const latestOrder = Math.max(
            ...candidates.map(
              (candidate) =>
                versionOrder.get(Number(candidate.version_group_id)) ?? -1,
            ),
          );
          const levels = candidates
            .filter(
              (candidate) =>
                versionOrder.get(Number(candidate.version_group_id)) ===
                latestOrder,
            )
            .map(evolutionLevel);
          return {
            speciesId: Number(child.id),
            level: levels.length ? Math.min(...levels) : 20,
          };
        });
      if (!koreanSpecies.get(id) || !values || !pokemonTypes.get(pokemonId))
        throw new Error(`Incomplete species ${id}`);
      return {
        id,
        name: koreanSpecies.get(id),
        englishName: englishSpecies.get(id) ?? row.identifier,
        generation: Number(row.generation_id),
        types: pokemonTypes.get(pokemonId),
        stats: {
          hp: values[1],
          attack: values[2],
          defense: values[3],
          specialAttack: values[4],
          specialDefense: values[5],
          speed: values[6],
        },
        evolvesFrom: row.evolves_from_species_id
          ? Number(row.evolves_from_species_id)
          : null,
        legendary: row.is_legendary === "1",
        mythical: row.is_mythical === "1",
        evolutions,
        learnset: [...learned]
          .map(([moveId, level]) => ({ moveId, level }))
          .sort(
            (left, right) =>
              left.level - right.level || left.moveId - right.moveId,
          ),
      };
    })
    .sort((left, right) => left.id - right.id);
  if (species.length !== 1025)
    throw new Error(`Expected 1,025 species, received ${species.length}`);

  const usedMoveIds = new Set(
    species.flatMap((entry) => entry.learnset.map((move) => move.moveId)),
  );
  usedMoveIds.add(165); // Struggle is available only when no usable learned attack exists.
  const usedMoves = Object.fromEntries(
    Object.entries(moves).filter(([id]) => usedMoveIds.has(Number(id))).map(([id, move]) => {
      const source = mechanics.get(Number(id));
      const effects = buildMoveEffects(Number(id), source, metadata.get(Number(id)));
      return [id, { ...move,
        ...(Number(id) === 165 ? { type: null } : {}),
        ...([877, 894].includes(Number(id)) ? { power: 0 } : {}),
        effects,
      }];
    }),
  );
  const typeNames = Object.fromEntries(
    [...localizedNames(csv.type_names, "type_id", 3)].filter(
      ([id]) => id >= 1 && id <= 18,
    ),
  );
  const efficacy = {};
  for (const row of csv.type_efficacy) {
    const type = Number(row.damage_type_id);
    if (!efficacy[type]) efficacy[type] = {};
    efficacy[type][Number(row.target_type_id)] =
      Number(row.damage_factor) / 100;
  }
  await mkdir(generatedDirectory, { recursive: true });
  await mkdir(spriteDirectory, { recursive: true });
  const license = await fetchPinned(
    `https://raw.githubusercontent.com/PokeAPI/pokeapi/${dataRevision}/LICENSE.md`,
    join(cacheDirectory, dataRevision, "LICENSE.md"),
  );
  await writeFile(join(spriteDirectory, "../POKEAPI-LICENSE.txt"), license);
  const mechanicsLicense = await fetchPinned(
    `https://raw.githubusercontent.com/smogon/pokemon-showdown/${mechanicsRevision}/LICENSE`,
    join(cacheDirectory, mechanicsRevision, "LICENSE"),
  );
  await writeFile(join(spriteDirectory, "../POKEMON-SHOWDOWN-LICENSE.txt"), mechanicsLicense);
  const catalog = [
    "// Generated by scripts/import-pokemon-data.mjs. Do not edit by hand.",
    'import type { Move, Species } from "../data-types";',
    `export const importedSpecies: Species[] = [\n${species.map((entry) => JSON.stringify(entry)).join(",\n")}\n];`,
    `export const importedMoves: Record<number, Move> = ${JSON.stringify(usedMoves)};`,
    `export const importedTypeNames: Record<number, string> = ${JSON.stringify(typeNames)};`,
    `export const importedTypeEffectiveness: Record<number, Record<number, number>> = ${JSON.stringify(efficacy)};`,
    "",
  ].join("\n");
  await writeFile(join(generatedDirectory, "catalog.ts"), catalog, "utf8");
  console.log(
    `Imported ${species.length} species and ${usedMoveIds.size} damaging moves. Fetching local sprites…`,
  );

  const spriteHashes = await mapConcurrent(
    species,
    12,
    async (entry, index) => {
      const bytes = process.argv.includes("--reuse-sprites")
        ? await readFile(join(spriteDirectory, `${entry.id}.png`))
        : await fetchPinned(
        `${spriteBase}${defaultPokemon.get(entry.id)}.png`,
        join(cacheDirectory, spriteRevision, `${entry.id}.png`),
      );
      if (
        !bytes
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      )
        throw new Error(`Invalid PNG for ${entry.id}`);
      await writeFile(join(spriteDirectory, `${entry.id}.png`), bytes);
      if ((index + 1) % 200 === 0)
        console.log(`Sprites: ${index + 1}/${species.length}`);
      return [entry.id, sha256(bytes)];
    },
  );
  const manifest = {
    schemaVersion: 1,
    speciesCount: species.length,
    moveCount: usedMoveIds.size,
    data: {
      repository: "https://github.com/PokeAPI/pokeapi",
      revision: dataRevision,
      license: "BSD-3-Clause",
      licenseSha256: sha256(license),
      directory: "data/v2/csv",
      sha256: Object.fromEntries(
        sources.map(({ name, bytes }) => [`${name}.csv`, sha256(bytes)]),
      ),
    },
    sprites: {
      repository: "https://github.com/PokeAPI/sprites",
      revision: spriteRevision,
      directory: "sprites/pokemon",
      sha256: Object.fromEntries(spriteHashes),
    },
    catalogSha256: sha256(catalog),
    mechanics: { repository: "https://github.com/smogon/pokemon-showdown", revision: mechanicsRevision,
      file: "data/moves.ts", sha256: sha256(mechanicsBytes), license: "MIT", licenseSha256: sha256(mechanicsLicense) },
    transformations: {
      forms:
        "Species 1–1025, default Pokémon and default front sprites only. Alternate forms are excluded.",
      language: "Korean (language 3), English species names (language 9).",
      learnsets:
        "Latest version_groups.order containing level-up records for the default Pokémon; positive-power physical/special moves only; duplicate moves keep their earliest learning level.",
      evolutions:
        "Default target forms; most recent default evolution condition. Plain level-up keeps minimum_level; all other requirements become level 20. Source-form identity is ignored so regional-only species branches remain available. Branches use the species graph.",
      attacks:
        "Existing positive-power attacks plus Struggle. Ruination and Comeuppance use explicit fixed-damage rules. Move effects are classified using pinned metadata and mechanics; required unsupported systems exclude a move from selection. No synthetic basic attack.",
    },
  };
  await writeFile(
    join(generatedDirectory, "provenance.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  console.log("Finished. All game data and sprites are available offline.");
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await importPokemonData();
}
