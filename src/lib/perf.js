/**
 * Lightweight performance probes.
 *
 * `timed(name, fn)` records the duration of `fn` as a `db:<name>` User Timing measure (visible in
 * the browser Performance panel) and keeps the latest value per name. `count(name)` increments a
 * counter, used for expensive operations such as full column scans. The terminal `stats` command
 * prints both, which is how benchmarks and end-to-end tests observe the editor without reaching
 * into the store from the outside.
 */
const timings = new Map();
const counters = new Map();

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

const record = (name, start) => {
  const end = now();
  timings.set(name, Math.round((end - start) * 10) / 10);
  try {
    performance.measure(`db:${name}`, { start, end });
  } catch {
    // User Timing Level 3 is unavailable (older browsers or test environments).
  }
};

/**
 * Run `fn` and record its duration. Promises are timed until they settle.
 * @template T
 * @param {string} name
 * @param {() => T} fn
 * @returns {T}
 */
export const timed = (name, fn) => {
  const start = now();
  let result;
  try {
    result = fn();
  } catch (error) {
    record(name, start);
    throw error;
  }
  if (result && typeof result.then === "function") {
    return result.finally(() => record(name, start));
  }
  record(name, start);
  return result;
};

/** Increment a named counter. */
export const count = (name, amount = 1) => {
  counters.set(name, (counters.get(name) || 0) + amount);
};

/** Latest timings (ms) and cumulative counters. */
export const getPerfSnapshot = () => ({
  timings: Object.fromEntries(timings),
  counters: Object.fromEntries(counters),
});
