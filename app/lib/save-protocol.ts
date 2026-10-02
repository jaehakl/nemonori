export const SAVE_PROTOCOL = "nemonori.save.v1" as const;

const GAME_SAVE_KEY_PREFIX = "nemonori.arcade:game:";
const GAME_SAVE_KEY_SUFFIX = ":save";
const saveChangeListeners = new Set<(change: SaveChange) => void>();

export type SaveErrorCode = "storage-unavailable" | "quota-exceeded" | "invalid-data" | "storage-error";
export type SaveError = { code: SaveErrorCode; message: string };
export type SaveResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: SaveError; partial?: T };

export type GameSaveEnvelope<T = unknown> = {
  protocol: typeof SAVE_PROTOCOL;
  gameSlug: string;
  gameTitle: string;
  updatedAt: string;
  data: T;
};

export type GameSaveSummary = {
  kind: "valid";
  gameSlug: string;
  gameTitle: string;
  storageKey: string;
  updatedAt: string;
  byteSize: number;
  data: unknown;
};

export type CorruptGameSave = {
  kind: "corrupt";
  gameSlug: string;
  storageKey: string;
  byteSize: number;
  raw: string;
  error: SaveError;
};

export type GameSaveEntry = GameSaveSummary | CorruptGameSave;
export type SaveDeleteSummary = { deletedKeys: string[]; failedKeys: string[] };
export type SaveDataGuard<T> = (data: unknown) => data is T;
export type SaveChange = { deletedKeys: readonly string[] };

function invalidData<T>(message: string): SaveResult<T> {
  return { ok: false, error: { code: "invalid-data", message } };
}

function storageError(error: unknown): SaveError {
  const name = error instanceof Error ? error.name : "";
  if (name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED") {
    return { code: "quota-exceeded", message: "브라우저 저장 공간이 부족합니다." };
  }
  if (name === "SecurityError") {
    return { code: "storage-unavailable", message: "브라우저가 저장소 접근을 차단했습니다." };
  }
  return { code: "storage-error", message: "브라우저 저장소 작업을 완료하지 못했습니다." };
}

function getStorage(): SaveResult<Storage> {
  if (typeof window === "undefined") {
    return { ok: false, error: { code: "storage-unavailable", message: "브라우저 저장소를 사용할 수 없습니다." } };
  }
  try {
    const storage = window.localStorage;
    if (!storage) {
      return { ok: false, error: { code: "storage-unavailable", message: "브라우저 저장소를 사용할 수 없습니다." } };
    }
    return { ok: true, value: storage };
  } catch (error) {
    return { ok: false, error: storageError(error) };
  }
}

function isGameSlug(slug: unknown): slug is string {
  return typeof slug === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

function buildStorageKey(gameSlug: string) {
  return `${GAME_SAVE_KEY_PREFIX}${gameSlug}${GAME_SAVE_KEY_SUFFIX}`;
}

export function isGameSaveStorageKey(key: string) {
  return key.startsWith(GAME_SAVE_KEY_PREFIX) && key.endsWith(GAME_SAVE_KEY_SUFFIX);
}

function slugFromStorageKey(key: string) {
  return key.slice(GAME_SAVE_KEY_PREFIX.length, -GAME_SAVE_KEY_SUFFIX.length);
}

// Reject values JSON would drop or silently convert, including cycles and sparse arrays.
function isJsonData(value: unknown, ancestors = new Set<object>()): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || ancestors.has(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) return false;
  ancestors.add(value);
  try {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Array.isArray(value)) {
      if (Reflect.ownKeys(value).length !== value.length + 1) return false;
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = descriptors[index];
        if (!descriptor || !("value" in descriptor) || !isJsonData(descriptor.value, ancestors)) return false;
      }
      return true;
    }
    return Reflect.ownKeys(descriptors).every((key) => {
      if (typeof key !== "string") return false;
      const descriptor = descriptors[key];
      return descriptor.enumerable && "value" in descriptor && isJsonData(descriptor.value, ancestors);
    });
  } finally {
    ancestors.delete(value);
  }
}

function parseEnvelope(raw: string, storageKey: string): SaveResult<GameSaveEnvelope> {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return invalidData("세이브 형식이 올바르지 않습니다.");
    const envelope = parsed as Record<string, unknown>;
    if (
      envelope.protocol !== SAVE_PROTOCOL || !isGameSlug(envelope.gameSlug) ||
      typeof envelope.gameTitle !== "string" || !envelope.gameTitle.trim() ||
      typeof envelope.updatedAt !== "string" || !Object.hasOwn(envelope, "data")
    ) return invalidData("세이브의 필수 정보가 올바르지 않습니다.");
    if (buildStorageKey(envelope.gameSlug) !== storageKey) return invalidData("세이브의 게임 정보와 저장 키가 일치하지 않습니다.");
    const date = new Date(envelope.updatedAt);
    if (!Number.isFinite(date.getTime()) || date.toISOString() !== envelope.updatedAt) return invalidData("세이브의 저장 시각이 올바르지 않습니다.");
    if (!isJsonData(envelope.data)) return invalidData("세이브 데이터가 JSON 형식이 아닙니다.");
    return { ok: true, value: parsed as GameSaveEnvelope };
  } catch {
    return invalidData("세이브 데이터를 읽을 수 없습니다.");
  }
}

export function subscribeSaveChanges(listener: (change: SaveChange) => void) {
  saveChangeListeners.add(listener);
  return () => { saveChangeListeners.delete(listener); };
}

function notifySaveChanges(deletedKeys: readonly string[] = []) {
  for (const listener of saveChangeListeners) {
    try {
      listener({ deletedKeys });
    } catch (error) {
      // The storage mutation already succeeded. An observer must not change its result.
      console.error("세이브 변경 알림을 처리하지 못했습니다.", error);
    }
  }
}

export function loadGameSave(gameSlug: string): SaveResult<GameSaveEnvelope | null>;
export function loadGameSave<T>(gameSlug: string, isData: SaveDataGuard<T>): SaveResult<GameSaveEnvelope<T> | null>;
export function loadGameSave(gameSlug: string, isData?: (data: unknown) => boolean): SaveResult<GameSaveEnvelope | null> {
  if (!isGameSlug(gameSlug)) return invalidData("게임 식별자가 올바르지 않습니다.");
  const storage = getStorage();
  if (!storage.ok) return { ok: false, error: storage.error };
  const key = buildStorageKey(gameSlug);
  let raw: string | null;
  try {
    raw = storage.value.getItem(key);
  } catch (error) {
    return { ok: false, error: storageError(error) };
  }
  if (raw === null) return { ok: true, value: null };
  const result = parseEnvelope(raw, key);
  if (!result.ok) return result;
  try {
    if (isData && !isData(result.value.data)) return invalidData("세이브 데이터가 이 게임의 형식과 일치하지 않습니다.");
  } catch {
    return invalidData("세이브 데이터의 형식을 확인하지 못했습니다.");
  }
  return result;
}

export function saveGameSave<T>(gameSlug: string, gameTitle: string, data: T): SaveResult<GameSaveEnvelope<T>> {
  if (!isGameSlug(gameSlug) || typeof gameTitle !== "string" || !gameTitle.trim()) return invalidData("게임 식별자와 이름을 확인해 주세요.");
  let raw: string;
  let envelope: GameSaveEnvelope<T>;
  try {
    if (!isJsonData(data)) return invalidData("세이브에는 JSON으로 보존할 수 있는 데이터만 저장할 수 있습니다.");
    raw = JSON.stringify({ protocol: SAVE_PROTOCOL, gameSlug, gameTitle, updatedAt: new Date().toISOString(), data });
    envelope = JSON.parse(raw) as GameSaveEnvelope<T>;
  } catch {
    return invalidData("세이브 데이터를 JSON으로 변환하지 못했습니다.");
  }
  const storage = getStorage();
  if (!storage.ok) return { ok: false, error: storage.error };
  try {
    storage.value.setItem(buildStorageKey(gameSlug), raw);
  } catch (error) {
    return { ok: false, error: storageError(error) };
  }
  notifySaveChanges();
  return { ok: true, value: envelope };
}

export function deleteGameSaveByKey(storageKey: string): SaveResult<SaveDeleteSummary> {
  if (!isGameSaveStorageKey(storageKey)) return invalidData("이 앱의 게임 세이브만 삭제할 수 있습니다.");
  const storage = getStorage();
  if (!storage.ok) return { ok: false, error: storage.error };
  try {
    storage.value.removeItem(storageKey);
  } catch (error) {
    return { ok: false, error: storageError(error), partial: { deletedKeys: [], failedKeys: [storageKey] } };
  }
  notifySaveChanges([storageKey]);
  return { ok: true, value: { deletedKeys: [storageKey], failedKeys: [] } };
}

export function deleteGameSave(gameSlug: string): SaveResult<SaveDeleteSummary> {
  return isGameSlug(gameSlug) ? deleteGameSaveByKey(buildStorageKey(gameSlug)) : invalidData("게임 식별자가 올바르지 않습니다.");
}

function getScopedKeys(storage: Storage) {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key !== null && isGameSaveStorageKey(key)) keys.push(key);
  }
  return keys;
}

export function clearAllGameSaves(): SaveResult<SaveDeleteSummary> {
  const storage = getStorage();
  if (!storage.ok) return { ok: false, error: storage.error };
  let keys: string[];
  try {
    keys = getScopedKeys(storage.value);
  } catch (error) {
    return { ok: false, error: storageError(error) };
  }
  const summary: SaveDeleteSummary = { deletedKeys: [], failedKeys: [] };
  let firstError: SaveError | null = null;
  for (const key of keys) {
    try {
      storage.value.removeItem(key);
      summary.deletedKeys.push(key);
    } catch (error) {
      firstError ??= storageError(error);
      summary.failedKeys.push(key);
    }
  }
  if (summary.deletedKeys.length > 0) notifySaveChanges(summary.deletedKeys);
  return firstError ? { ok: false, error: firstError, partial: summary } : { ok: true, value: summary };
}

export function getAllGameSaves(): SaveResult<GameSaveEntry[]> {
  const storage = getStorage();
  if (!storage.ok) return { ok: false, error: storage.error };
  const rows: GameSaveEntry[] = [];
  try {
    for (const key of getScopedKeys(storage.value)) {
      const raw = storage.value.getItem(key);
      if (raw === null) continue;
      const byteSize = new TextEncoder().encode(raw).byteLength;
      const result = parseEnvelope(raw, key);
      if (result.ok) {
        rows.push({ ...result.value, kind: "valid", storageKey: key, byteSize });
      } else {
        rows.push({ kind: "corrupt", gameSlug: slugFromStorageKey(key), storageKey: key, byteSize, raw, error: result.error });
      }
    }
  } catch (error) {
    return { ok: false, error: storageError(error), partial: rows };
  }
  rows.sort((left, right) => {
    if (left.kind === "valid" && right.kind === "valid") return right.updatedAt.localeCompare(left.updatedAt);
    if (left.kind !== right.kind) return left.kind === "valid" ? -1 : 1;
    return left.storageKey.localeCompare(right.storageKey);
  });
  return { ok: true, value: rows };
}
