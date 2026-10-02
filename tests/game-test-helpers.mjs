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
