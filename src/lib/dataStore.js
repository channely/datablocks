/**
 * In-memory cache for node values. Nodes keep only ids (`data.current`), which keeps React Flow
 * state small and avoids remounting nodes when large datasets change. Values are sanitized and
 * type-detected on insertion.
 *
 * Lifecycle: the store calls `retainOnly(<ids referenced by nodes>)` after every mutation that can
 * orphan an entry (see `scheduleDataGc` in `src/store`). Each entry also keeps the `source` value
 * it was created from, so `isSameValue` can recognise a pass-through block republishing the same
 * reference and skip creating a new id (which would otherwise re-render every downstream block).
 */
import { nanoid } from "nanoid";
import { detect, sanitize } from "./types";

class DataStore {
  constructor() {
    this.store = new Map();
  }

  /**
   * Stores a value and returns its id.
   * @param {unknown} data Value to cache.
   * @param {string} [type] Optional pre-detected type; detected when omitted.
   */
  set(data, type) {
    const id = nanoid();
    const dataType = type || detect(data);
    const sanitized = sanitize(dataType)(data);
    this.store.set(id, { data: sanitized, type: dataType, source: data });
    return id;
  }

  /** True when `value` is (by reference) the value already cached under `id`. */
  isSameValue(id, value) {
    const entry = typeof id === "string" ? this.store.get(id) : undefined;
    if (!entry) return false;
    return entry.source === value || entry.data === value;
  }

  /**
   * Drops every entry whose id is not in `ids`.
   * @param {Iterable<string>} ids Ids that are still referenced.
   * @returns {number} Number of released entries.
   */
  retainOnly(ids) {
    const keep = ids instanceof Set ? ids : new Set(ids);
    let released = 0;
    for (const id of this.store.keys()) {
      if (!keep.has(id)) {
        this.store.delete(id);
        released += 1;
      }
    }
    return released;
  }

  /** @param {string} id */
  get(id) {
    return this.store.get(id);
  }

  /** Number of cached entries. */
  get size() {
    return this.store.size;
  }

  /** @param {string} id */
  remove(id) {
    return this.store.delete(id);
  }
}

const dataStore = new DataStore();
export default dataStore;
