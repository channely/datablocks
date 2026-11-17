import { describe, it, expect } from "vitest";
import {
  TYPES,
  titlecase,
  isDataset,
  isGeo,
  isFeatureCollection,
  isTopology,
  detect,
  geoToRows,
  rowsToGeo,
  columnValue,
  getColumns,
  getColumnNames,
  getColumnType,
  formatValue,
  sanitize,
} from "./types";
import { getPerfSnapshot } from "./perf";

const scans = () => getPerfSnapshot().counters.columnScan || 0;

const fc = (features) => ({ type: "FeatureCollection", features });
const pointFeature = (coords, properties = {}) => ({
  type: "Feature",
  properties,
  geometry: { type: "Point", coordinates: coords },
});

describe("detect", () => {
  it("detects primitive types", () => {
    expect(detect("a")).toBe(TYPES.STRING);
    expect(detect(1.5)).toBe(TYPES.NUMBER);
    expect(detect(true)).toBe(TYPES.BOOLEAN);
    expect(detect(new Date())).toBe(TYPES.DATE);
    expect(detect(undefined)).toBe(TYPES.UNDEFINED);
    expect(detect(null)).toBe(TYPES.NULL);
  });

  it("detects datasets of flat rows", () => {
    expect(detect([{ a: 1, b: "x" }])).toBe(TYPES.DATASET);
    expect(detect([{ a: 1, when: new Date() }])).toBe(TYPES.DATASET);
    expect(detect([{ a: 1, nested: [1, 2] }])).toBe(TYPES.DATASET);
  });

  it("falls back to ARRAY for empty arrays, primitive arrays and nested rows", () => {
    expect(detect([])).toBe(TYPES.ARRAY);
    expect(detect([1, 2, 3])).toBe(TYPES.ARRAY);
    expect(detect([{ a: { b: 1 } }])).toBe(TYPES.ARRAY);
  });

  it("detects GeoJSON and TopoJSON", () => {
    expect(detect(fc([]))).toBe(TYPES.GEOJSON);
    expect(detect(pointFeature([0, 0]))).toBe(TYPES.GEOJSON);
    expect(detect({ type: "Polygon", coordinates: [] })).toBe(TYPES.GEOJSON);
    expect(detect({ type: "Topology", objects: {}, arcs: [] })).toBe(TYPES.TOPOJSON);
  });

  it("detects plain objects and unknown values", () => {
    expect(detect({ a: 1 })).toBe(TYPES.OBJECT);
    expect(detect({ type: "NotGeo" })).toBe(TYPES.OBJECT);
    expect(detect(() => {})).toBe(TYPES.UNKNOWN);
    expect(detect(Symbol("s"))).toBe(TYPES.UNKNOWN);
  });

  it("exposes the type guards", () => {
    expect(isDataset([{ a: 1 }])).toBe(true);
    expect(isDataset([])).toBe(false);
    expect(isGeo(null)).toBe(false);
    expect(isGeo([])).toBe(false);
    expect(isFeatureCollection(fc([]))).toBe(true);
    expect(isFeatureCollection(pointFeature([0, 0]))).toBe(false);
    expect(isTopology({ type: "Topology" })).toBe(true);
    expect(isTopology(fc([]))).toBe(false);
  });
});

describe("titlecase", () => {
  it("title-cases known types and passes through unknown strings", () => {
    expect(titlecase("DATASET")).toBe("Dataset");
    expect(titlecase("GEOJSON")).toBe("Geojson");
    expect(titlecase("whatever")).toBe("whatever");
  });
});

describe("columns", () => {
  it("lists columns ordered by frequency with the type of the first non-null value", () => {
    const rows = [{ a: null, b: "x" }, { a: 2, b: "y", c: true }, { a: 3 }, {}];
    const columns = getColumns(rows);
    expect(columns).toEqual([
      { name: "a", type: TYPES.NUMBER },
      { name: "b", type: TYPES.STRING },
      { name: "c", type: TYPES.BOOLEAN },
    ]);
  });

  it("handles holes in a dataset and columns that are always null", () => {
    const rows = [{ a: null }, null, { a: undefined }];
    expect(getColumns(rows)).toEqual([{ name: "a", type: TYPES.UNDEFINED }]);
  });

  it("returns [] for non-tabular input", () => {
    expect(getColumns("text")).toEqual([]);
    expect(getColumns([])).toEqual([]);
    expect(getColumns({ a: 1 })).toEqual([]);
    expect(getColumnNames(42)).toEqual([]);
    expect(getColumnType(42, "a")).toBeNull();
  });

  it("flattens feature collections into property + geometry columns", () => {
    const geo = fc([pointFeature([1, 2], { name: "p" })]);
    expect(getColumnNames(geo)).toEqual(["name", "__geometry", "__type"]);
    expect(getColumnType(geo, "name")).toBe(TYPES.STRING);
    expect(getColumnType(geo, "__geometry")).toBe(TYPES.STRING);
  });

  it("getColumnType returns null for missing columns", () => {
    expect(getColumnType([{ a: 1 }], "missing")).toBeNull();
    expect(getColumnType([{ a: 1 }], "a")).toBe(TYPES.NUMBER);
  });

  it("caches scans by reference and counts only cache misses", () => {
    const rows = [{ a: 1, b: 2 }];
    const before = scans();
    const first = getColumns(rows);
    expect(scans()).toBe(before + 1);
    const second = getColumns(rows);
    expect(second).toBe(first);
    expect(scans()).toBe(before + 1);

    const names1 = getColumnNames(rows);
    const names2 = getColumnNames(rows);
    expect(names1).toBe(names2);
    expect(names1).toEqual(["a", "b"]);
    expect(scans()).toBe(before + 1);

    // An equal but distinct array is a cache miss.
    const copy = rows.map((row) => ({ ...row }));
    const third = getColumns(copy);
    expect(third).not.toBe(first);
    expect(third).toEqual(first);
    expect(scans()).toBe(before + 2);
  });

  it("columnValue reads a cell safely", () => {
    expect(columnValue({ a: 1 }, "a")).toBe(1);
    expect(columnValue(null, "a")).toBeUndefined();
  });
});

describe("geoToRows / rowsToGeo", () => {
  it("round-trips a feature collection", () => {
    const geo = fc([
      pointFeature([1, 2], { name: "a", v: 1 }),
      {
        type: "Feature",
        properties: { name: "b", v: 2 },
        geometry: {
          type: "LineString",
          coordinates: [
            [0, 0],
            [1, 1],
          ],
        },
      },
    ]);
    const rows = geoToRows(geo);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      name: "a",
      v: 1,
      __geometry: JSON.stringify(geo.features[0].geometry),
      __type: "Feature",
    });
    expect(geoToRows(geo)).toBe(rows);
    expect(rowsToGeo(rows)).toEqual(geo);
  });

  it("returns [] for non-feature-collections and passes through rows without geometry", () => {
    expect(geoToRows(pointFeature([0, 0]))).toEqual([]);
    expect(geoToRows([{ a: 1 }])).toEqual([]);
    const rows = [{ a: 1 }];
    expect(rowsToGeo(rows)).toBe(rows);
    expect(rowsToGeo("x")).toBe("x");
  });
});

describe("formatValue", () => {
  it("formats structured values as pretty JSON", () => {
    for (const type of [TYPES.DATASET, TYPES.ARRAY, TYPES.OBJECT, TYPES.GEOJSON, TYPES.TOPOJSON]) {
      expect(formatValue({ data: { a: 1 }, type })).toBe('{\n  "a": 1\n}');
    }
  });

  it("formats scalars", () => {
    expect(formatValue({ data: true, type: TYPES.BOOLEAN })).toBe("true");
    expect(formatValue({ data: 0, type: TYPES.BOOLEAN })).toBe("false");
    const date = new Date(2020, 0, 1);
    expect(formatValue({ data: date, type: TYPES.DATE })).toBe(date.toLocaleString());
    expect(formatValue({ data: undefined, type: TYPES.UNDEFINED })).toBe("undefined");
    expect(formatValue({ data: null, type: TYPES.NULL })).toBe("null");
    expect(formatValue({ data: 12, type: TYPES.NUMBER })).toBe("12");
    expect(formatValue({ data: "s", type: TYPES.STRING })).toBe("s");
  });
});

describe("sanitize", () => {
  it("drops features without geometry from GeoJSON feature collections", () => {
    const geo = fc([pointFeature([0, 0]), { type: "Feature", properties: {}, geometry: null }]);
    const result = sanitize(TYPES.GEOJSON)(geo);
    expect(result).not.toBe(geo);
    expect(result.features).toHaveLength(1);
    expect(geo.features).toHaveLength(2);
  });

  it("returns other values unchanged (same reference)", () => {
    const rows = [{ a: 1 }];
    expect(sanitize(TYPES.DATASET)(rows)).toBe(rows);
    const feature = pointFeature([0, 0]);
    expect(sanitize(TYPES.GEOJSON)(feature)).toBe(feature);
    expect(sanitize(TYPES.GEOJSON)(null)).toBeNull();
  });
});
