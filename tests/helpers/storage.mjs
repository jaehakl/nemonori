export const saveKey = (slug) => `nemonori.arcade:game:${slug}:save`;

export function legacySave(slug, overrides = {}) {
  return JSON.stringify({
    protocol: "nemonori.save.v1",
    gameSlug: slug,
    gameTitle: "기존 게임",
    updatedAt: "2026-03-01T10:00:00.000Z",
    data: { score: 42, text: "한글", list: [null, false, 1] },
    ...overrides,
  });
}

export class MemoryStorage {
  records = new Map();
  readError = null;
  writeError = null;
  enumerationError = null;
  failedDeleteKeys = new Set();
  writes = 0;

  get length() {
    if (this.enumerationError) throw this.enumerationError;
    return this.records.size;
  }

  key(index) {
    return [...this.records.keys()][index] ?? null;
  }

  getItem(key) {
    if (this.readError) throw this.readError;
    return this.records.get(key) ?? null;
  }

  setItem(key, value) {
    if (this.writeError) throw this.writeError;
    this.writes += 1;
    this.records.set(key, String(value));
  }

  removeItem(key) {
    if (this.failedDeleteKeys.has(key)) throw new Error("Removal failed");
    this.writes += 1;
    this.records.delete(key);
  }
}

export class BrowserWindow extends EventTarget {
  storage;
  accessError = null;
  activeStorageListeners = 0;

  constructor(storage = new MemoryStorage()) {
    super();
    this.storage = storage;
  }

  get localStorage() {
    if (this.accessError) throw this.accessError;
    return this.storage;
  }

  addEventListener(type, listener, options) {
    if (type === "storage") this.activeStorageListeners += 1;
    super.addEventListener(type, listener, options);
  }

  removeEventListener(type, listener, options) {
    if (type === "storage") this.activeStorageListeners -= 1;
    super.removeEventListener(type, listener, options);
  }

  emitStorage(key, storageArea = this.storage) {
    const event = new Event("storage");
    Object.defineProperties(event, { key: { value: key }, storageArea: { value: storageArea } });
    this.dispatchEvent(event);
  }
}

export function installWindow(browser) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  if (browser) Object.defineProperty(globalThis, "window", { configurable: true, value: browser });
  else delete globalThis.window;
  return () => {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else delete globalThis.window;
  };
}
