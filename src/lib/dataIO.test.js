import { describe, it, expect, vi, afterEach } from "vitest";
import {
  FILE_TYPES,
  fetchData,
  getParserForFile,
  parseCsv,
  parseFile,
  parseJson,
  parseText,
  stringifyJson,
  unparseCsv,
} from "./dataIO";

afterEach(() => {
  vi.unstubAllGlobals();
});

const response = (body, contentType) => ({
  headers: { get: (name) => (name.toLowerCase() === "content-type" ? contentType : null) },
  text: async () => body,
});

describe("CSV", () => {
  it("parses with header and dynamic typing", () => {
    expect(parseCsv("a,b\n1,x\n2,true")).toEqual({
      data: [
        { a: 1, b: "x" },
        { a: 2, b: true },
      ],
      error: null,
    });
  });

  it("accepts parser options", () => {
    expect(parseCsv("a\tb\n1\t2", { delimiter: "\t" }).data).toEqual([{ a: 1, b: 2 }]);
    expect(parseCsv("a,b\n1,2", { header: false, dynamicTyping: false }).data).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("reports empty input as an error", () => {
    expect(parseCsv("")).toEqual({ error: "Parse Error." });
  });

  it("unparses with quotes by default and accepts overrides", () => {
    expect(unparseCsv([{ a: 1, b: "x" }])).toBe('"a","b"\r\n"1","x"');
    expect(unparseCsv([{ a: 1 }], { quotes: false })).toBe("a\r\n1");
  });
});

describe("JSON", () => {
  it("parses valid JSON and returns the error otherwise", () => {
    expect(parseJson('{"a":[1]}')).toEqual({ data: { a: [1] }, error: null });
    const result = parseJson("{nope");
    expect(result.data).toBeUndefined();
    expect(result.error).toBeInstanceOf(SyntaxError);
  });

  it("stringifies with two-space indentation", () => {
    expect(stringifyJson({ a: 1 })).toBe('{\n  "a": 1\n}');
  });
});

describe("parseText", () => {
  it("parses by declared type", async () => {
    expect(await parseText("[1]", "json")).toEqual({ data: [1], error: null });
    expect(await parseText("a\n1", "csv")).toEqual({ data: [{ a: 1 }], error: null });
    expect(await parseText(42, "text")).toEqual({ data: "42", error: null });
  });

  it("rejects unknown types", async () => {
    expect(await parseText("x", "xml")).toEqual({ error: "Couldn't parse text" });
  });

  it("reports parser exceptions", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    // Papa.parse throws for non-string, non-file input.
    expect(await parseText({}, "csv")).toEqual({ error: "Error while parsing text" });
    expect(log).toHaveBeenCalled();
  });
});

describe("getParserForFile", () => {
  it("matches by MIME type first, then extension", () => {
    expect(getParserForFile({ name: "a.bin", type: "text/csv" })).toBe(parseCsv);
    expect(getParserForFile({ name: "a.csv", type: "" })).toBe(parseCsv);
    expect(getParserForFile({ name: "a.TSV", type: "text/tab-separated-values" })).toBe(parseCsv);
    expect(getParserForFile({ name: "a.geojson", type: "" })).toBe(parseJson);
    expect(getParserForFile({ name: "a.topojson", type: "" })).toBe(parseJson);
    expect(getParserForFile({ name: "a.json", type: "application/json" })).toBe(parseJson);
    expect(getParserForFile({ name: "a.xlsx", type: "application/vnd.ms-excel" })).toBeNull();
    expect(FILE_TYPES.map((f) => f.id)).toEqual(["json", "csv", "tsv", "geojson", "topojson"]);
  });

  // BUG: a file without an extension makes `name.match(...)` return null and `[0]` throws a
  // TypeError (outside parseFile's try/catch), instead of returning null / "not supported".
  it("returns null for files without an extension", () => {
    expect(getParserForFile({ name: "README", type: "" })).toBeNull();
  });
});

describe("parseFile", () => {
  it("reads and parses a File", async () => {
    const file = new File(["a,b\n1,2"], "data.csv", { type: "text/csv" });
    expect(await parseFile(file)).toEqual({ data: [{ a: 1, b: 2 }], error: null });
    const json = new File(['{"x":1}'], "data.json", { type: "application/json" });
    expect(await parseFile(json)).toEqual({ data: { x: 1 }, error: null });
  });

  it("rejects unsupported files", async () => {
    const file = new File(["x"], "data.xyz", { type: "application/x-unknown" });
    expect(await parseFile(file)).toEqual({ error: "data.xyz: File type not supported." });
  });

  it("reports read failures", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    class FailingReader {
      readAsText() {
        setTimeout(() => this.onerror(new Error("read failed")), 0);
      }
    }
    vi.stubGlobal("FileReader", FailingReader);
    const file = new File(["x"], "data.csv", { type: "text/csv" });
    expect(await parseFile(file)).toEqual({ error: "Error while parsing file: data.csv" });
    expect(log).toHaveBeenCalled();
  });
});

describe("fetchData", () => {
  it("parses JSON and CSV responses by Content-Type", async () => {
    const fetch = vi.fn().mockResolvedValue(response('{"a":1}', "application/json; charset=utf-8"));
    vi.stubGlobal("fetch", fetch);
    expect(await fetchData("https://example.test/a.json")).toEqual({ data: { a: 1 }, error: null });
    expect(fetch).toHaveBeenCalledWith("https://example.test/a.json");

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response("a\n1", "text/csv")));
    expect(await fetchData("https://example.test/a.csv")).toEqual({
      data: [{ a: 1 }],
      error: null,
    });
  });

  it("rejects unsupported content types", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response("<html>", "text/html")));
    expect(await fetchData("https://example.test")).toEqual({
      error: "File type not supported: text/html",
    });
  });

  it("reports network errors", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    expect(await fetchData("https://example.test/x")).toEqual({
      error: "Error while fetching url: https://example.test/x",
    });
    expect(log).toHaveBeenCalled();
  });

  it("treats a missing Content-Type as a fetch error (current behavior)", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response("x", null)));
    expect(await fetchData("https://example.test/y")).toEqual({
      error: "Error while fetching url: https://example.test/y",
    });
  });
});
