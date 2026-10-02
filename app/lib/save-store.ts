import {
  getAllGameSaves,
  isGameSaveStorageKey,
  subscribeSaveChanges,
  type GameSaveEntry,
  type SaveError,
} from "./save-protocol.ts";

export type GameSavesSnapshot =
  | { status: "loading"; entries: readonly GameSaveEntry[] }
  | { status: "ready"; entries: readonly GameSaveEntry[] }
  | { status: "error"; entries: readonly GameSaveEntry[]; error: SaveError };

const serverSnapshot: GameSavesSnapshot = { status: "loading", entries: [] };
const listeners = new Set<() => void>();
let snapshot: GameSavesSnapshot = serverSnapshot;
let snapshotSignature = JSON.stringify(snapshot);
let stopListening: (() => void) | null = null;

// Snapshot reads are cached: React can call this repeatedly without touching storage.
export function getGameSavesSnapshot() {
  return snapshot;
}

export function getGameSavesServerSnapshot() {
  return serverSnapshot;
}

export function refreshGameSaves(deletedKeys: readonly string[] = []) {
  const result = getAllGameSaves();
  const retainedEntries = snapshot.entries.filter((entry) => !deletedKeys.includes(entry.storageKey));
  // A failed scan cannot prove unread records are absent. Retain them, but never
  // restore records whose deletion already succeeded in this tab.
  const partialEntries = new Map(retainedEntries.map((entry) => [entry.storageKey, entry]));
  if (!result.ok) {
    for (const entry of result.partial ?? []) partialEntries.set(entry.storageKey, entry);
  }
  const nextSnapshot: GameSavesSnapshot = result.ok
    ? { status: "ready", entries: result.value }
    : { status: "error", entries: [...partialEntries.values()], error: result.error };
  const signature = JSON.stringify(nextSnapshot);
  if (signature === snapshotSignature) return;
  snapshot = nextSnapshot;
  snapshotSignature = signature;
  for (const listener of listeners) {
    try {
      listener();
    } catch (error) {
      console.error("세이브 목록 변경 알림을 처리하지 못했습니다.", error);
    }
  }
}

export function subscribeGameSaves(listener: () => void) {
  listeners.add(listener);
  if (!stopListening && typeof window !== "undefined") {
    const browser = window;
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && !isGameSaveStorageKey(event.key)) return;
      const deletedKeys = event.key === null
        ? snapshot.entries.map((entry) => entry.storageKey)
        : event.newValue === null ? [event.key] : [];
      try {
        if (event.storageArea !== null && event.storageArea !== browser.localStorage) return;
      } catch {
        refreshGameSaves(deletedKeys);
        return;
      }
      refreshGameSaves(deletedKeys);
    };
    browser.addEventListener("storage", onStorage);
    const unsubscribeChanges = subscribeSaveChanges(({ deletedKeys }) => refreshGameSaves(deletedKeys));
    stopListening = () => {
      browser.removeEventListener("storage", onStorage);
      unsubscribeChanges();
    };
  }
  if (typeof window !== "undefined") refreshGameSaves();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      stopListening?.();
      stopListening = null;
    }
  };
}
