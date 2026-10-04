import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import ts from "typescript";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const requirePackage = createRequire(import.meta.url);

// Compile source in memory so tests need no emitted files or additional runner.
export function loadGameSource(relativePath, overrides = {}) {
  const cache = new Map();
  const replacements = new Map(Object.entries(overrides).map(([path, value]) => [resolve(projectRoot, path), value]));

  const load = (path) => {
    if (replacements.has(path)) return replacements.get(path);
    if (cache.has(path)) return cache.get(path).exports;

    if (path.endsWith(".json")) return JSON.parse(readFileSync(path, "utf8"));

    const compiledModule = { exports: {} };
    cache.set(path, compiledModule);
    const source = readFileSync(path, "utf8");
    const { outputText } = ts.transpileModule(source, {
      fileName: path,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    });

    const requireSource = (specifier) => {
      if (specifier.endsWith(".css")) {
        return new Proxy({}, { get: (_, key) => key === "__esModule" ? false : String(key) });
      }
      if (specifier === "next/link") {
        return function TestLink(props) { return React.createElement("a", props); };
      }
      if (!specifier.startsWith(".") && !specifier.startsWith("@/")) {
        return requirePackage(specifier);
      }

      const basePath = specifier.startsWith("@/")
        ? resolve(projectRoot, specifier.slice(2))
        : resolve(dirname(path), specifier);
      const sourcePath = extname(basePath) ? basePath : [".ts", ".tsx"].map((extension) => basePath + extension).find(existsSync);
      if (!sourcePath) throw new Error(`Cannot resolve test source: ${specifier}`);
      return load(sourcePath);
    };

    new Function("require", "module", "exports", outputText)(requireSource, compiledModule, compiledModule.exports);
    return compiledModule.exports;
  };

  return load(resolve(projectRoot, relativePath));
}

export function fixtureGame(overrides = {}) {
  return {
    slug: "test-game",
    title: "테스트 게임",
    summary: "A puzzle for testing",
    tags: ["puzzle", "test"],
    difficulty: "Easy",
    estPlayMinutes: 3,
    accent: "#0f766e",
    load: async () => ({ default: () => null }),
    ...overrides,
  };
}

export function deferred() {
  let resolvePromise;
  let rejectPromise;
  const promise = new Promise((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

export const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

let pokemonEngine;
let pokemonBattle;
/** Integration scenarios select a real legal move instead of relying on the removed move 0. */
export function pokemonBattleAction(state) {
  pokemonEngine ??= loadGameSource("app/games/_components/pokemon-marble/engine.ts");
  pokemonBattle ??= loadGameSource("app/games/_components/pokemon-marble/battle.ts");
  if (pokemonEngine.hasForcedBattleAction(state)) return { type: "CONTINUE_BATTLE" };
  const side = state.battle.turn;
  const source = pokemonEngine.getBattlePokemon(state, side);
  const target = pokemonEngine.getBattlePokemon(state, side === "attacker" ? "defender" : "attacker");
  const context = pokemonEngine.getBattleContext(state);
  const options = pokemonEngine.getBattleCommands(state).filter(move => !pokemonBattle.getMoveUnavailableReason(source, target, move, context));
  const cost = (move) => (move.effects.selfDamage ? 1000 : 0) + (move.effects.charge ? 500 : 0) +
    (move.effects.lock ? 200 : 0) + (move.effects.recharge ? 100 : 0) + (move.effects.secondary ? 40 : 0) +
    (move.effects.rule === "delayed" ? 300 : 0) + (100 - (move.accuracy ?? 100));
  options.sort((a, b) => cost(a) - cost(b) || b.power - a.power);
  if (!options.length) throw new Error("No usable move in integration fixture");
  return { type: "ATTACK", moveId: options[0].id };
}

/** Older battle/evolution scenarios decline new moves; learning has dedicated tests. */
export function declineNewMoves(state) {
  pokemonEngine ??= loadGameSource("app/games/_components/pokemon-marble/engine.ts");
  while (state.phase === "learn-move") {
    const next = pokemonEngine.transition(state, { type: "CHOOSE_MOVE", replaceMoveId: null });
    if (next === state) throw new Error("Move learning did not advance");
    state = next;
  }
  return state;
}
