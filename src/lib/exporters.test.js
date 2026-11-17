import { describe, it, expect, vi, beforeEach } from "vitest";
import { getExportFormats } from "./exporters";
import { download } from "./download";
import { TYPES } from "./types";
import { geoToTopology } from "./geo";

vi.mock("./download", () => ({ download: vi.fn() }));

const geo = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { name: "p" },
      geometry: { type: "Point", coordinates: [1, 2] },
    },
  ],
};

const filetypes = (type) => getExportFormats(type).map((format) => format.filetype);

beforeEach(() => {
  download.mockClear();
});

describe("getExportFormats", () => {
  it("lists formats per type", () => {
    expect(filetypes(TYPES.DATASET)).toEqual(["csv", "json"]);
    expect(filetypes(TYPES.OBJECT)).toEqual(["json"]);
    expect(filetypes(TYPES.ARRAY)).toEqual(["json"]);
    expect(filetypes(TYPES.GEOJSON)).toEqual(["geojson", "topo.json", "csv", "json"]);
    expect(filetypes(TYPES.TOPOJSON)).toEqual(["geojson", "topo.json", "csv", "json"]);
    expect(filetypes(TYPES.STRING)).toEqual(["txt"]);
    expect(filetypes(TYPES.NUMBER)).toEqual(["txt"]);
    expect(filetypes(TYPES.DATE)).toEqual(["txt"]);
    expect(filetypes(TYPES.NULL)).toEqual([]);
    expect(filetypes(TYPES.BOOLEAN)).toEqual([]);
    expect(filetypes("nope")).toEqual([]);
  });

  it("dataset handlers download CSV and JSON", () => {
    const [csv, json] = getExportFormats(TYPES.DATASET);
    csv.handler([{ a: 1, b: "x" }]);
    expect(download).toHaveBeenLastCalledWith('"a","b"\r\n"1","x"', "text/csv", "data.csv");
    json.handler([{ a: 1 }]);
    expect(download).toHaveBeenLastCalledWith(
      JSON.stringify([{ a: 1 }], null, 2),
      "application/json",
      "data.json",
    );
  });

  it("text handler stringifies scalars", () => {
    getExportFormats(TYPES.NUMBER)[0].handler(42);
    expect(download).toHaveBeenLastCalledWith("42", "text/plain", "data.txt");
  });

  it("GeoJSON handlers export native, topo and row formats", () => {
    const calls = getExportFormats(TYPES.GEOJSON).map((format) => {
      format.handler(geo);
      return download.mock.calls.at(-1);
    });
    expect(calls.map((call) => [call[1], call[2]])).toEqual([
      ["application/geo+json", "data.geojson"],
      ["application/json", "data.topo.json"],
      ["text/csv", "data.csv"],
      ["application/json", "data.json"],
    ]);
    expect(JSON.parse(calls[0][0])).toEqual(geo);
    expect(calls[2][0]).toContain('"name","__geometry","__type"');
    expect(JSON.parse(calls[3][0])[0]).toMatchObject({ name: "p", __type: "Feature" });
  });

  it("TopoJSON handlers convert the first object", () => {
    const topology = geoToTopology(geo);
    const calls = getExportFormats(TYPES.TOPOJSON).map((format) => {
      format.handler(topology);
      return download.mock.calls.at(-1);
    });
    expect(calls.map((call) => call[2])).toEqual([
      "data.geojson",
      "data.topo.json",
      "data.csv",
      "data.json",
    ]);
    const asGeo = JSON.parse(calls[0][0]);
    expect(asGeo.type).toBe("FeatureCollection");
    expect(asGeo.features[0].properties).toEqual({ name: "p" });
    expect(JSON.parse(calls[1][0])).toEqual(topology);
    expect(calls[2][0]).toContain('"p"');
    expect(JSON.parse(calls[3][0])[0].name).toBe("p");
  });
});
