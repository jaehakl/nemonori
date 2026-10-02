import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function isEnvironmentFile(filename) {
  const basename = path.posix.basename(filename.replaceAll("\\", "/"));
  return /^\.env(?:\..+)?$/i.test(basename) || /\.env$/i.test(basename);
}

export function findTrackedEnvironmentFiles(filenames) {
  return filenames.filter((filename) => {
    const basename = path.posix.basename(filename.replaceAll("\\", "/"));
    return isEnvironmentFile(filename) && basename !== ".env.example";
  });
}

export function isEmptyEnvironmentExample(content) {
  return content.split(/\r?\n/).every((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return true;
    return /^(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*\s*=\s*(?:""|'')?\s*(?:#.*)?$/.test(trimmed);
  });
}

export function checkTrackedEnvironment() {
  const filenames = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
  const blocked = findTrackedEnvironmentFiles(filenames);
  const invalidExamples = filenames.filter((filename) => {
    if (path.posix.basename(filename) !== ".env.example") return false;
    return !isEmptyEnvironmentExample(readFileSync(filename, "utf8"));
  });

  if (blocked.length || invalidExamples.length) {
    // Report filenames only; never print environment values or file contents.
    for (const filename of blocked) console.error(`추적 중인 환경 파일: ${filename}`);
    for (const filename of invalidExamples) console.error(`비어 있지 않은 환경 예제: ${filename}`);
    return false;
  }
  console.log("환경 파일 추적 검사 통과");
  return true;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = checkTrackedEnvironment() ? 0 : 1;
}
