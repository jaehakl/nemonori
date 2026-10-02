import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { clearAllGameSaves, deleteGameSave, saveGameSave } from "../app/lib/save-protocol.ts";
import { getGameSavesServerSnapshot, getGameSavesSnapshot, refreshGameSaves, subscribeGameSaves } from "../app/lib/save-store.ts";
import { BrowserWindow, MemoryStorage, installWindow, legacySave, saveKey } from "./helpers/storage.mjs";

let storage;
let browser;
let restore;
let subscriptions;
beforeEach(() => {
  storage = new MemoryStorage();
  browser = new BrowserWindow(storage);
  restore = installWindow(browser);
  subscriptions = [];
});
afterEach(() => {
  for (const unsubscribe of subscriptions) unsubscribe();
  restore();
});
function subscribe(listener = () => {}) {
  const unsubscribe = subscribeGameSaves(listener);
  subscriptions.push(unsubscribe);
  return unsubscribe;
}

test("SSR loading and repeated client snapshots have stable identity", () => {
  const server = getGameSavesServerSnapshot();
  assert.equal(server.status, "loading");
  assert.strictEqual(server, getGameSavesServerSnapshot());
  storage.records.set(saveKey("old-game"), legacySave("old-game"));
  subscribe();
  const client = getGameSavesSnapshot();
  assert.equal(client.status, "ready");
  assert.equal(client.entries.length, 1);
  assert.strictEqual(client, getGameSavesSnapshot());
  refreshGameSaves();
  assert.strictEqual(client, getGameSavesSnapshot());
  assert.strictEqual(server, getGameSavesServerSnapshot());
});

test("same-tab save and delete update subscribers while failed writes do not", () => {
  let changes = 0;
  subscribe(() => { changes += 1; });
  const before = changes;
  assert.equal(saveGameSave("test-game", "게임", { score: 1 }).ok, true);
  assert.equal(getGameSavesSnapshot().entries[0].gameSlug, "test-game");
  assert.equal(changes, before + 1);
  const saved = getGameSavesSnapshot();
  storage.writeError = new DOMException("Full", "QuotaExceededError");
  assert.equal(saveGameSave("test-game", "게임", { score: 2 }).ok, false);
  assert.strictEqual(getGameSavesSnapshot(), saved);
  assert.equal(changes, before + 1);
  assert.equal(deleteGameSave("test-game").ok, true);
  assert.equal(getGameSavesSnapshot().entries.length, 0);
  assert.equal(changes, before + 2);
});

test("cross-tab storage changes and clears refresh; unrelated and session keys are ignored", () => {
  subscribe();
  const empty = getGameSavesSnapshot();
  storage.records.set(saveKey("cross-tab"), legacySave("cross-tab"));
  browser.emitStorage("another-app:settings");
  assert.strictEqual(getGameSavesSnapshot(), empty);
  browser.emitStorage(saveKey("cross-tab"), new MemoryStorage());
  assert.strictEqual(getGameSavesSnapshot(), empty);
  browser.emitStorage(saveKey("cross-tab"));
  assert.equal(getGameSavesSnapshot().entries[0].gameSlug, "cross-tab");
  storage.records.clear();
  browser.emitStorage(null);
  assert.equal(getGameSavesSnapshot().entries.length, 0);
});

test("subscription cleanup removes listeners and remount refreshes changes made while idle", () => {
  const unsubscribe = subscribe();
  assert.equal(browser.activeStorageListeners, 1);
  unsubscribe();
  assert.equal(browser.activeStorageListeners, 0);
  subscriptions = [];
  storage.records.set(saveKey("idle-game"), legacySave("idle-game"));
  subscribe();
  assert.equal(browser.activeStorageListeners, 1);
  assert.equal(getGameSavesSnapshot().entries[0].gameSlug, "idle-game");
});

test("storage failures are stable snapshots and an explicit refresh can recover", () => {
  browser.accessError = new DOMException("Blocked", "SecurityError");
  subscribe();
  const blocked = getGameSavesSnapshot();
  assert.equal(blocked.status, "error");
  assert.equal(blocked.error.code, "storage-unavailable");
  refreshGameSaves();
  assert.strictEqual(getGameSavesSnapshot(), blocked);
  browser.accessError = null;
  refreshGameSaves();
  assert.equal(getGameSavesSnapshot().status, "ready");
});

test("partial clear-all immediately exposes only remaining saves", () => {
  storage.records.set(saveKey("removed"), legacySave("removed"));
  storage.records.set(saveKey("blocked"), legacySave("blocked"));
  storage.failedDeleteKeys.add(saveKey("blocked"));
  subscribe();
  const result = clearAllGameSaves();
  assert.equal(result.ok, false);
  assert.deepEqual(result.partial.deletedKeys, [saveKey("removed")]);
  assert.deepEqual(getGameSavesSnapshot().entries.map((entry) => entry.gameSlug), ["blocked"]);
});

test("successful partial deletions stay reflected when a subsequent list read fails", () => {
  storage.records.set(saveKey("removed"), legacySave("removed"));
  storage.records.set(saveKey("blocked"), legacySave("blocked"));
  storage.failedDeleteKeys.add(saveKey("blocked"));
  subscribe();
  const remove = storage.removeItem.bind(storage);
  storage.removeItem = (key) => {
    remove(key);
    storage.readError = new Error("Read unavailable after mutation");
  };
  const result = clearAllGameSaves();
  assert.equal(result.ok, false);
  assert.deepEqual(result.partial.deletedKeys, [saveKey("removed")]);
  assert.equal(getGameSavesSnapshot().status, "error");
  assert.deepEqual(getGameSavesSnapshot().entries.map((entry) => entry.gameSlug), ["blocked"]);
});

test("a throwing store subscriber cannot stop healthy subscribers from seeing new snapshots", (context) => {
  const logged = context.mock.method(console, "error", () => {});
  subscribe(() => { throw new Error("Broken subscriber"); });
  let healthyChanges = 0;
  subscribe(() => { healthyChanges += 1; });
  assert.equal(saveGameSave("observed-game", "게임", { score: 1 }).ok, true);
  assert.equal(healthyChanges, 1);
  assert.equal(getGameSavesSnapshot().entries[0].gameSlug, "observed-game");
  assert.equal(deleteGameSave("observed-game").ok, true);
  assert.equal(healthyChanges, 2);
  assert.equal(getGameSavesSnapshot().entries.length, 0);
  assert.ok(logged.mock.callCount() >= 2);
});
