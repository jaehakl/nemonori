import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import {
  clearAllGameSaves,
  deleteGameSave,
  deleteGameSaveByKey,
  getAllGameSaves,
  loadGameSave,
  saveGameSave,
  subscribeSaveChanges,
} from "../app/lib/save-protocol.ts";
import { BrowserWindow, MemoryStorage, installWindow, legacySave, saveKey } from "./helpers/storage.mjs";

let storage;
let browser;
let restore;
beforeEach(() => {
  storage = new MemoryStorage();
  browser = new BrowserWindow(storage);
  restore = installWindow(browser);
});
afterEach(() => restore());

test("SSR does not read browser storage or report an empty successful list", () => {
  delete globalThis.window;
  for (const result of [loadGameSave("old-game"), saveGameSave("old-game", "게임", {}), getAllGameSaves(), deleteGameSave("old-game"), clearAllGameSaves()]) {
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "storage-unavailable");
  }
});

test("legacy v1 saves remain readable and round-trip Korean JSON without rewriting reads", () => {
  const raw = legacySave("old-game");
  storage.records.set(saveKey("old-game"), raw);
  const guard = (data) => data !== null && typeof data === "object" && typeof data.score === "number";
  const loaded = loadGameSave("old-game", guard);
  assert.equal(loaded.ok, true);
  assert.equal(loaded.value.data.text, "한글");
  assert.equal(loadGameSave("missing-game").value, null);
  const entries = getAllGameSaves();
  assert.equal(entries.ok, true);
  assert.equal(entries.value[0].kind, "valid");
  assert.equal(entries.value[0].byteSize, Buffer.byteLength(raw, "utf8"));
  assert.equal(storage.writes, 0);
  assert.equal(storage.getItem(saveKey("old-game")), raw);
  const saved = saveGameSave("old-game", "새 제목", { score: 7, nested: [false, null] });
  assert.equal(saved.ok, true);
  assert.equal(saved.value.protocol, "nemonori.save.v1");
  assert.deepEqual(loadGameSave("old-game").value, saved.value);
});

test("unsupported JSON values cannot overwrite an existing save", () => {
  storage.records.set(saveKey("old-game"), legacySave("old-game"));
  const original = storage.getItem(saveKey("old-game"));
  const cycle = {};
  cycle.self = cycle;
  const getter = Object.defineProperty({}, "value", { enumerable: true, get() { throw new Error("Do not execute getters"); } });
  const values = [undefined, { value: undefined }, () => 1, Symbol("x"), 1n, NaN, Infinity, cycle, new Date(), Array(2), getter, { [Symbol("field")]: 1 }];
  for (const value of values) {
    const result = saveGameSave("old-game", "기존 게임", value);
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "invalid-data");
  }
  assert.equal(saveGameSave("../other", "게임", {}).error.code, "invalid-data");
  assert.equal(saveGameSave("old-game", " ", {}).error.code, "invalid-data");
  assert.equal(storage.getItem(saveKey("old-game")), original);
  assert.equal(storage.writes, 0);
  const shared = { value: 1 };
  assert.equal(saveGameSave("old-game", "게임", { left: shared, right: shared }).ok, true);
});

test("malformed records are listed as corrupt and remain untouched", () => {
  const malformed = ["", "null", "[]", "{", legacySave("other-game"), legacySave("broken-5", { updatedAt: "yesterday" }), legacySave("broken-6", { updatedAt: "2026-02-30T00:00:00.000Z" }), legacySave("broken-7", { protocol: "another.save.v1" }), legacySave("broken-8", { data: undefined })];
  malformed.forEach((raw, index) => storage.records.set(saveKey(`broken-${index}`), raw));
  const before = new Map(storage.records);
  const result = getAllGameSaves();
  assert.equal(result.ok, true);
  assert.equal(result.value.length, malformed.length);
  assert.ok(result.value.every((row) => row.kind === "corrupt" && row.error.code === "invalid-data"));
  assert.equal(loadGameSave("broken-4").error.code, "invalid-data");
  assert.deepEqual(storage.records, before);
  assert.equal(storage.writes, 0);
});

test("typed data validation rejects incompatible or throwing guards", () => {
  storage.records.set(saveKey("old-game"), legacySave("old-game"));
  assert.equal(loadGameSave("old-game", () => false).error.code, "invalid-data");
  assert.equal(loadGameSave("old-game", () => { throw new Error("Invalid payload"); }).error.code, "invalid-data");
  assert.equal(storage.writes, 0);
});

test("blocked, quota, read, enumeration and delete errors are returned", () => {
  browser.accessError = new DOMException("Blocked", "SecurityError");
  assert.equal(getAllGameSaves().error.code, "storage-unavailable");
  assert.equal(loadGameSave("old-game").error.code, "storage-unavailable");
  browser.accessError = null;
  storage.writeError = new DOMException("Full", "QuotaExceededError");
  assert.equal(saveGameSave("old-game", "게임", {}).error.code, "quota-exceeded");
  storage.readError = new Error("Read failed");
  assert.equal(loadGameSave("old-game").error.code, "storage-error");
  storage.enumerationError = new Error("Enumeration failed");
  assert.equal(clearAllGameSaves().error.code, "storage-error");
  storage.enumerationError = null;
  storage.failedDeleteKeys.add(saveKey("old-game"));
  assert.equal(deleteGameSave("old-game").error.code, "storage-error");
});

test("delete uses the actual scoped key even when the envelope names another game", () => {
  storage.records.set(saveKey("alpha"), legacySave("beta"));
  storage.records.set(saveKey("beta"), legacySave("beta"));
  storage.records.set("another-app:game:alpha:save", "keep");
  assert.equal(deleteGameSaveByKey("another-app:game:alpha:save").error.code, "invalid-data");
  const corrupt = getAllGameSaves().value.find((entry) => entry.kind === "corrupt");
  assert.equal(deleteGameSaveByKey(corrupt.storageKey).ok, true);
  assert.equal(storage.getItem(saveKey("alpha")), null);
  assert.notEqual(storage.getItem(saveKey("beta")), null);
  assert.equal(storage.getItem("another-app:game:alpha:save"), "keep");
});

test("clear-all preserves other keys and reports partial deletions including corrupt entries", () => {
  storage.records.set(saveKey("valid"), legacySave("valid"));
  storage.records.set(saveKey("broken"), "not json");
  storage.records.set(saveKey("blocked"), legacySave("blocked"));
  storage.records.set("another-app:game:valid:save", "keep");
  storage.records.set("nemonori.arcade:settings", "keep settings");
  storage.failedDeleteKeys.add(saveKey("blocked"));
  let changes = 0;
  const unsubscribe = subscribeSaveChanges(() => { changes += 1; });
  try {
    const result = clearAllGameSaves();
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "storage-error");
    assert.deepEqual(result.partial.deletedKeys, [saveKey("valid"), saveKey("broken")]);
    assert.deepEqual(result.partial.failedKeys, [saveKey("blocked")]);
    assert.equal(changes, 1);
    assert.deepEqual(getAllGameSaves().value.map((entry) => entry.gameSlug), ["blocked"]);
    assert.equal(storage.getItem("another-app:game:valid:save"), "keep");
    assert.equal(storage.getItem("nemonori.arcade:settings"), "keep settings");
  } finally {
    unsubscribe();
  }
});

test("invalid scoped keys are visible and can be explicitly removed", () => {
  storage.records.set(saveKey("../unsafe"), legacySave("../unsafe"));
  storage.records.set(saveKey(""), "{}");
  const result = getAllGameSaves();
  assert.equal(result.value.length, 2);
  assert.ok(result.value.every((entry) => entry.kind === "corrupt"));
  assert.equal(clearAllGameSaves().ok, true);
  assert.equal(storage.records.size, 0);
});

test("throwing observers cannot invalidate committed mutations or stop other observers", (context) => {
  const logged = context.mock.method(console, "error", () => {});
  const stopBroken = subscribeSaveChanges(() => { throw new Error("Broken observer"); });
  let healthyChanges = 0;
  const stopHealthy = subscribeSaveChanges(() => { healthyChanges += 1; });
  try {
    const saved = saveGameSave("observed-game", "게임", { score: 10 });
    assert.equal(saved.ok, true);
    assert.deepEqual(loadGameSave("observed-game").value.data, { score: 10 });
    assert.equal(deleteGameSave("observed-game").ok, true);
    assert.equal(loadGameSave("observed-game").value, null);
    storage.records.set(saveKey("clear-game"), legacySave("clear-game"));
    assert.equal(clearAllGameSaves().ok, true);
    assert.equal(storage.records.size, 0);
    assert.equal(healthyChanges, 3);
    assert.equal(logged.mock.callCount(), 3);
  } finally {
    stopBroken();
    stopHealthy();
  }
});
