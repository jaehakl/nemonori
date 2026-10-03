import { loadGameSave, type GameSaveEnvelope, type SaveResult } from "@/app/lib/save-protocol";
import { parseGameSave } from "./save";
import type { GameState } from "./types";

/** Inspect the version without modifying an older save in browser storage. */
export function loadPokemonSave(): SaveResult<GameSaveEnvelope<GameState> | null> {
  const result = loadGameSave("pokemon-marble");
  if (!result.ok) return { ok: false, error: result.error };
  if (result.value === null) return { ok: true, value: null };
  const data = result.value.data;
  if (data && typeof data === "object" && "version" in data && data.version === 1) {
    return {
      ok: false,
      error: {
        code: "invalid-data",
        message: "이전 32칸 버전의 저장입니다. 40칸 보드와 새 규칙으로 플레이하려면 새 모험을 시작해 주세요.",
      },
    };
  }
  const parsed = parseGameSave(data);
  if (!parsed) {
    return { ok: false, error: { code: "invalid-data", message: "세이브 데이터가 이 게임의 형식과 일치하지 않습니다." } };
  }
  return { ok: true, value: { ...result.value, data: parsed } };
}
