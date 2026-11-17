import { describe, it, expect } from "vitest";
import dataStore from "./dataStore";
import { TYPES } from "./types";

describe("dataStore", () => {
  it("stores values under fresh ids and detects their type", () => {
    const rows = [{ a: 1 }];
    const id = dataStore.set(rows);
    expect(typeof id).toBe("string");
    const entry = dataStore.get(id);
    expect(entry.type).toBe(TYPES.DATASET);
    expect(entry.data).toBe(rows);
    expect(entry.source).toBe(rows);
    expect(dataStore.set(rows)).not.toBe(id);
  });

  it("uses an explicit type instead of detecting", () => {
    const id = dataStore.set("[1,2]", TYPES.OBJECT);
    expect(dataStore.get(id).type).toBe(TYPES.OBJECT);
  });

  it("sanitizes GeoJSON but keeps the original as source", () => {
    const geo = {
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [0, 0] } },
        { type: "Feature", properties: {}, geometry: null },
      ],
    };
    const id = dataStore.set(geo);
    const entry = dataStore.get(id);
    expect(entry.type).toBe(TYPES.GEOJSON);
    expect(entry.data).not.toBe(geo);
    expect(entry.data.features).toHaveLength(1);
    expect(entry.source).toBe(geo);
    expect(dataStore.isSameValue(id, geo)).toBe(true);
    expect(dataStore.isSameValue(id, entry.data)).toBe(true);
    expect(dataStore.isSameValue(id, { ...geo })).toBe(false);
  });

  it("isSameValue is false for unknown or non-string ids", () => {
    const value = [1];
    expect(dataStore.isSameValue("nope", value)).toBe(false);
    expect(dataStore.isSameValue(undefined, value)).toBe(false);
    expect(dataStore.isSameValue({ data: value }, value)).toBe(false);
  });

  it("removes entries and tracks size", () => {
    const before = dataStore.size;
    const id = dataStore.set(1);
    expect(dataStore.size).toBe(before + 1);
    expect(dataStore.remove(id)).toBe(true);
    expect(dataStore.remove(id)).toBe(false);
    expect(dataStore.get(id)).toBeUndefined();
    expect(dataStore.size).toBe(before);
  });

  it("retainOnly drops unreferenced entries and returns the released count", () => {
    dataStore.retainOnly([]);
    expect(dataStore.size).toBe(0);
    const a = dataStore.set("a");
    const b = dataStore.set("b");
    const c = dataStore.set("c");
    expect(dataStore.retainOnly([a])).toBe(2);
    expect(dataStore.size).toBe(1);
    expect(dataStore.get(a).data).toBe("a");
    expect(dataStore.get(b)).toBeUndefined();
    expect(dataStore.get(c)).toBeUndefined();
    expect(dataStore.retainOnly(new Set([a]))).toBe(0);
    expect(dataStore.retainOnly(new Set())).toBe(1);
    expect(dataStore.size).toBe(0);
  });
});
