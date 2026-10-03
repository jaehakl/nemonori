import { mkdir, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const input = join(root, "app/games/_components/pokemon-marble/bgm");
const output = join(root, "public/pokemon-marble/bgm");
const tracks = [
  ["opening", "Pokemon Blue Red - Opening"],
  ["gym", "Pokemon Black and White - Gym"],
  ["route-2", "Pokemon Black and White - Route 2 - Spring"],
  ["route-6", "Pokemon Black and White - Route 6 - Spring"],
  ["pokemon-center", "Pokemon Black and White - Pokemon Center"],
  ["wild-battle", "Pokemon Black and White - Wild Pokemon Battle"],
  ["rival-battle", "Pokemon Black and White - Rival Battle"],
  ["last-pokemon", "Pokemon Black and White - Gym Leader - Last Pokemon"],
  ["wild-victory", "Pokemon Platinum - Victory Against Wild Pokemon"],
  ["trainer-victory", "Pokemon Platinum - Victory Against Trainer"],
];
// Add a track ID with "80k" here if listening reveals compression artifacts.
const bitrateOverrides = {};
await mkdir(output, { recursive: true });
let originalBytes = 0;
let encodedBytes = 0;
for (const [id, name] of tracks) {
  const source = join(input, `${name}.mp3`);
  const destination = join(output, `${id}.m4a`);
  const original = await stat(source);
  const result = spawnSync(process.env.FFMPEG_PATH || "ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y", "-i", source,
    "-map", "0:a:0", "-vn", "-map_metadata", "-1", "-map_chapters", "-1",
    "-c:a", "aac", "-profile:a", "aac_low", "-b:a", bitrateOverrides[id] || "64k",
    "-ac", "2", "-ar", "44100", "-movflags", "+faststart", destination,
  ], { encoding: "utf8" });
  if (result.error || result.status !== 0) {
    throw new Error(`Cannot encode ${id}: ${result.error?.message || result.stderr}`);
  }
  const encoded = await stat(destination);
  originalBytes += original.size;
  encodedBytes += encoded.size;
  console.log(`${id}: ${original.size} → ${encoded.size} bytes`);
}
console.log(`Total: ${originalBytes} → ${encodedBytes} bytes (${(100 * (1 - encodedBytes / originalBytes)).toFixed(1)}% smaller)`);
