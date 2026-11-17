/**
 * Browser storage health helpers.
 *
 * - `requestPersistentStorage` asks the browser not to evict IndexedDB under pressure. It is
 *   called once, after the first successful write, and is a no-op where unsupported.
 * - `getStorageEstimate` reports usage/quota so the library can show it and the store can warn
 *   before writes start failing.
 * - `createTabChannel` announces edits over BroadcastChannel. All tabs share one autosave slot
 *   (`flow__autosave`), so two editing tabs overwrite each other: last write wins.
 */
export const STORAGE_WARN_RATIO = 0.8;

let persistRequested = false;

export const requestPersistentStorage = async () => {
  if (persistRequested) return null;
  persistRequested = true;
  try {
    if (!navigator.storage?.persist) return null;
    if (await navigator.storage.persisted?.()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
};

/** `{ usage, quota, ratio }` in bytes, or null when the browser does not expose an estimate. */
export const getStorageEstimate = async () => {
  try {
    if (!navigator.storage?.estimate) return null;
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    return { usage, quota, ratio: quota ? usage / quota : 0 };
  } catch {
    return null;
  }
};

export const formatBytes = (bytes) => {
  if (!Number.isFinite(bytes)) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
};

const CHANNEL_NAME = "datablocks-editor";

/**
 * Open a channel that posts `{ type: "edit", tabId }` via `announce()` and calls `onOtherTab`
 * the first time a different tab announces an edit. Returns `{ announce, close }`.
 */
export const createTabChannel = (onOtherTab) => {
  if (typeof BroadcastChannel === "undefined") return { announce() {}, close() {} };
  const tabId = Math.random().toString(36).slice(2);
  const channel = new BroadcastChannel(CHANNEL_NAME);
  let warned = false;
  channel.onmessage = (event) => {
    const message = event.data || {};
    if (message.type !== "edit" || message.tabId === tabId || warned) return;
    warned = true;
    onOtherTab?.();
  };
  return {
    announce() {
      channel.postMessage({ type: "edit", tabId });
    },
    close() {
      channel.close();
    },
  };
};
