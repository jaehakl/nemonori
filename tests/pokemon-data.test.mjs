import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  dataRevision,
  evolutionLevel,
  parseCsv,
  spriteRevision,
} from "../scripts/import-pokemon-data.mjs";
import { loadGameSource } from "./game-test-helpers.mjs";
import { mechanicsRevision, buildMoveEffects } from "../scripts/pokemon-move-effects.mjs";

const data = loadGameSource(
  "app/games/_components/pokemon-marble/pokemon-data.ts",
);
const root = fileURLToPath(new URL("..", import.meta.url));
const generated = resolve(
  root,
  "app/games/_components/pokemon-marble/generated",
);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

test("all 1,025 default species have localized names, stats and valid references", () => {
  assert.deepEqual(
    data.speciesList.map((species) => species.id),
    Array.from({ length: 1025 }, (_, index) => index + 1),
  );
  for (const species of data.speciesList) {
    assert.match(species.name, /[가-힣]/, `Korean name for ${species.id}`);
    assert.ok(species.englishName.length > 0);
    assert.ok(species.generation >= 1 && species.generation <= 9);
    assert.ok(species.types.length >= 1 && species.types.length <= 2);
    assert.equal(new Set(species.types).size, species.types.length);
    for (const type of species.types)
      assert.ok(data.typeNames[type] && data.typeColors[type]);
    assert.equal(Object.keys(species.stats).length, 6);
    for (const stat of Object.values(species.stats))
      assert.ok(Number.isInteger(stat) && stat > 0 && stat <= 255);
    if (species.evolvesFrom !== null)
      assert.ok(data.speciesById[species.evolvesFrom]);
    assert.equal(
      new Set(species.evolutions.map((evolution) => evolution.speciesId)).size,
      species.evolutions.length,
    );
    for (const evolution of species.evolutions) {
      assert.equal(
        data.speciesById[evolution.speciesId].evolvesFrom,
        species.id,
      );
      assert.ok(evolution.level >= 1 && evolution.level <= 100);
    }
    assert.equal(
      new Set(species.learnset.map((move) => move.moveId)).size,
      species.learnset.length,
    );
    for (const learned of species.learnset) {
      const move = data.movesById[learned.moveId];
      assert.ok(move && (move.power > 0 || [877, 894].includes(move.id)));
      assert.match(move.name, /[가-힣]/);
      assert.ok(["physical", "special"].includes(move.category));
      assert.ok(
        Number.isInteger(learned.level) &&
          learned.level >= 0 &&
          learned.level <= 100,
      );
    }
  }
  assert.equal(data.speciesById[1].name, "이상해씨");
  assert.equal(data.speciesById[1025].name, "복숭악동");
});

test("starter filtering permits unevolved ordinary and single-stage species only", () => {
  assert.equal(data.isStarter(data.speciesById[1]), true);
  assert.equal(data.isStarter(data.speciesById[2]), false);
  assert.equal(data.isStarter(data.speciesById[25]), false); // Pichu precedes Pikachu.
  assert.equal(data.isStarter(data.speciesById[132]), true);
  assert.equal(data.isStarter(data.speciesById[150]), false);
  assert.equal(data.isStarter(data.speciesById[151]), false);
  assert.equal(data.isStarter(data.speciesById[906]), true);
});

test("move selection keeps the latest four eligible moves in stable learning order", () => {
  for (const species of data.speciesList) {
    for (const level of [1, 20, 100]) {
      const selected = data.getAvailableMoves(species.id, level);
      assert.ok(selected.length >= 0 && selected.length <= 4);
      assert.equal(
        new Set(selected.map((move) => move.id)).size,
        selected.length,
      );
      const attacks = selected;
      for (const move of attacks)
        assert.ok(
          species.learnset.some(
            (learned) => learned.moveId === move.id && learned.level <= level,
          ),
        );
      const learned = species.learnset
        .filter((move) => move.level <= level)
        .toSorted((left, right) => left.level - right.level || left.moveId - right.moveId)
        .map((move) => data.movesById[move.moveId]).filter(move => move.effects.support !== "excluded");
      assert.equal(attacks.length, Math.min(4, learned.length));
      assert.deepEqual(attacks.map(move => move.id), learned.slice(-4).map(move => move.id));
    }
  }
  assert.deepEqual(data.getAvailableMoves(132, 1), []);
  assert.deepEqual(
    data.getAvailableMoves(1, 1).map((move) => move.id),
    [33],
  );
  assert.equal(data.movesById[165].type, null);
  assert.equal(data.movesById[165].power, 50);
  assert.equal(data.movesById[165].category, "physical");
});

test("learning remembers a move once and replaces the oldest slot rather than the weakest attack", () => {
  const previous = [76, 33, 22, 75];
  assert.deepEqual(data.learnMove(previous, 402), [33, 22, 75, 402]);
  assert.deepEqual(data.learnMove(previous, 33), previous);
  assert.deepEqual(previous, [76, 33, 22, 75]);
  assert.deepEqual(data.getAvailableMoves(52, 44).map(move => move.id), [372, 154, 163, 583]);
});

test("type multipliers cover double weaknesses, resistances, immunity and typeless attacks", () => {
  assert.equal(data.typeEffectiveness(10, [12, 7]), 4); // Fire against Grass/Bug.
  assert.equal(data.typeEffectiveness(10, [11, 16]), 0.25);
  assert.equal(data.typeEffectiveness(13, [5, 11]), 0);
  assert.equal(data.typeEffectiveness(1, [8]), 0);
  assert.equal(data.typeEffectiveness(null, [8, 9]), 1);
});

test("ordinary evolution levels remain while special conditions and branching use level 20", () => {
  assert.deepEqual(data.speciesById[1].evolutions, [
    { speciesId: 2, level: 16 },
  ]);
  assert.deepEqual(data.speciesById[2].evolutions, [
    { speciesId: 3, level: 32 },
  ]);
  assert.deepEqual(data.speciesById[25].evolutions, [
    { speciesId: 26, level: 20 },
  ]);
  assert.deepEqual(data.speciesById[64].evolutions, [
    { speciesId: 65, level: 20 },
  ]);
  assert.equal(data.speciesById[133].evolutions.length, 8);
  assert.ok(
    data.speciesById[133].evolutions.every((branch) => branch.level === 20),
  );
  assert.deepEqual(data.speciesById[122].evolutions, [
    { speciesId: 866, level: 42 },
  ]);
  assert.equal(
    evolutionLevel({ evolution_trigger_id: "1", minimum_level: "36" }),
    36,
  );
  assert.equal(
    evolutionLevel({
      evolution_trigger_id: "1",
      minimum_level: "36",
      time_of_day: "night",
    }),
    20,
  );
  assert.equal(
    evolutionLevel({
      evolution_trigger_id: "1",
      minimum_level: "20",
      relative_physical_stats: "0",
    }),
    20,
  );
});

test("pinned provenance matches the generated catalog and every bundled PNG", () => {
  const manifest = JSON.parse(
    readFileSync(resolve(generated, "provenance.json"), "utf8"),
  );
  assert.equal(manifest.data.revision, dataRevision);
  assert.equal(manifest.mechanics.revision, mechanicsRevision);
  assert.equal(manifest.mechanics.licenseSha256, sha256(readFileSync(resolve(root, "public/pokemon-marble/POKEMON-SHOWDOWN-LICENSE.txt"))));
  assert.equal(manifest.sprites.revision, spriteRevision);
  assert.equal(manifest.speciesCount, 1025);
  assert.equal(manifest.moveCount, Object.keys(data.movesById).length);
  assert.equal(
    manifest.catalogSha256,
    sha256(readFileSync(resolve(generated, "catalog.ts"))),
  );
  assert.equal(
    manifest.data.licenseSha256,
    sha256(
      readFileSync(resolve(root, "public/pokemon-marble/POKEAPI-LICENSE.txt")),
    ),
  );
  const spriteDirectory = resolve(root, "public/pokemon-marble/sprites");
  assert.equal(
    readdirSync(spriteDirectory).filter((name) => name.endsWith(".png")).length,
    1025,
  );
  for (const species of data.speciesList) {
    assert.equal(
      data.spriteUrl(species.id),
      `/pokemon-marble/sprites/${species.id}.png`,
    );
    const bytes = readFileSync(resolve(spriteDirectory, `${species.id}.png`));
    assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.ok(bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(20) > 0);
    assert.equal(sha256(bytes), manifest.sprites.sha256[species.id]);
  }
});

test("the effects importer refuses unclassified mechanics", () => {
  assert.throws(() => buildMoveEffects(99999, {key: "unknown", callbacks: ["onHit"]}), /Unclassified callbacks/);
  assert.throws(() => buildMoveEffects(99999, {key: "unknown", callbacks: [], unexpected: true}), /Unclassified field/);
});

test("the CSV importer preserves UTF-8, quoted commas, quotes and CRLF", () => {
  assert.deepEqual(
    parseCsv(
      'id,name,extra\r\n1,"이상해씨, test","say ""hi"""\r\n2,"multi\nline",\r\n',
    ),
    [
      { id: "1", name: "이상해씨, test", extra: 'say "hi"' },
      { id: "2", name: "multi\nline", extra: "" },
    ],
  );
  assert.throws(() => parseCsv('id\n"broken'), /Unclosed CSV quote/);
});
