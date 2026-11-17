import { describe, it, expect, vi } from "vitest";
import { count, getPerfSnapshot, timed } from "./perf";

describe("perf", () => {
  it("counts by name with optional amount", () => {
    const before = getPerfSnapshot().counters.testCounter || 0;
    count("testCounter");
    count("testCounter", 4);
    expect(getPerfSnapshot().counters.testCounter).toBe(before + 5);
  });

  it("times synchronous functions and returns their result", () => {
    const measure = vi.spyOn(performance, "measure");
    expect(timed("syncOp", () => 7)).toBe(7);
    const value = getPerfSnapshot().timings.syncOp;
    expect(typeof value).toBe("number");
    expect(value).toBeGreaterThanOrEqual(0);
    expect(measure).toHaveBeenCalledWith("db:syncOp", expect.any(Object));
  });

  it("records the timing and rethrows when the function throws", () => {
    const error = new Error("boom");
    expect(() =>
      timed("throwingOp", () => {
        throw error;
      }),
    ).toThrow(error);
    expect(getPerfSnapshot().timings).toHaveProperty("throwingOp");
  });

  it("times promises until they settle", async () => {
    let resolve;
    const promise = timed("asyncOp", () => new Promise((r) => (resolve = r)));
    expect(getPerfSnapshot().timings).not.toHaveProperty("asyncOp");
    resolve("done");
    await expect(promise).resolves.toBe("done");
    expect(getPerfSnapshot().timings).toHaveProperty("asyncOp");

    await expect(timed("asyncFail", () => Promise.reject(new Error("no")))).rejects.toThrow("no");
    expect(getPerfSnapshot().timings).toHaveProperty("asyncFail");
  });

  it("tolerates environments without User Timing level 3", () => {
    vi.spyOn(performance, "measure").mockImplementation(() => {
      throw new TypeError("unsupported");
    });
    expect(timed("noMeasure", () => 1)).toBe(1);
    expect(getPerfSnapshot().timings).toHaveProperty("noMeasure");
  });

  it("returns plain-object snapshots", () => {
    const snapshot = getPerfSnapshot();
    expect(Object.getPrototypeOf(snapshot.timings)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(snapshot.counters)).toBe(Object.prototype);
  });
});
