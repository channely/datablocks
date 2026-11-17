/**
 * In-memory cache for node values. Nodes keep only ids (`data.current`), which keeps React Flow
 * state small and avoids remounting nodes when large datasets change. Values are sanitized and
 * type-detected on insertion.
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
    this.store.set(id, { data: sanitized, type: dataType });
    return id;
  }

  /** @param {string} id */
  get(id) {
    return this.store.get(id);
  }

  /** @param {string} id */
  remove(id) {
    return this.store.delete(id);
  }
}

const dataStore = new DataStore();
export default dataStore;
