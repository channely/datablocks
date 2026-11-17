import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import dataStore from "./dataStore";
import { TYPES } from "./types";
import {
  DEFAULT_TITLE,
  FLOW_VERSION,
  deserializeFlow,
  flowFileName,
  readViewport,
  serializeFlow,
  validateFlow,
} from "./flowSerialization";

const readJson = (relative) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8"));

const node = (id, data = {}, extra = {}) => ({
  id,
  type: "file",
  position: { x: 10, y: 20 },
  data: { label: id, ...data },
  ...extra,
});

const edge = (id, source, target, extra = {}) => ({
  id,
  source,
  target,
  sourceHandle: source,
  targetHandle: target,
  ...extra,
});

const nodesOf = (flow) => flow.elements.filter((element) => !("source" in element));
const edgesOf = (flow) => flow.elements.filter((element) => "source" in element);

describe("readViewport", () => {
  it("reads current and legacy shapes and falls back to defaults", () => {
    expect(readViewport({ viewport: { x: 1, y: 2, zoom: 3 } })).toEqual({ x: 1, y: 2, zoom: 3 });
    expect(readViewport({ x: "4", y: 5, zoom: 0.5 })).toEqual({ x: 4, y: 5, zoom: 0.5 });
    expect(readViewport(undefined)).toEqual({ x: 0, y: 0, zoom: 1 });
    expect(readViewport({ x: "a", y: NaN, zoom: 0 })).toEqual({ x: 0, y: 0, zoom: 1 });
    expect(readViewport({ zoom: -2 })).toEqual({ x: 0, y: 0, zoom: 1 });
  });
});

describe("serializeFlow", () => {
  it("writes a v2 document with portable node/edge fields only", () => {
    const rows = [{ a: 1 }];
    const id = dataStore.set(rows);
    const doc = serializeFlow({
      nodes: [
        node("n1", { current: id }, { selected: true, width: 100, height: 50, dragging: false }),
        node("n2", {}, { position: undefined }),
      ],
      edges: [edge("e1", "n1", "n2", { style: { stroke: "red" } }), edge("e2", "n2", "n1")],
      viewport: { x: 5, y: 6, zoom: 2 },
      id: "flow__x",
      title: "  My flow  ",
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-02T00:00:00.000Z",
    });
    expect(doc.version).toBe(FLOW_VERSION);
    expect(doc.id).toBe("flow__x");
    expect(doc.title).toBe("My flow");
    expect(doc.createdAt).toBe("2024-01-01T00:00:00.000Z");
    expect(doc.updatedAt).toBe("2024-01-02T00:00:00.000Z");
    expect(doc.viewport).toEqual({ x: 5, y: 6, zoom: 2 });
    const [n1, n2] = nodesOf(doc);
    expect(n1).toEqual({
      id: "n1",
      type: "file",
      position: { x: 10, y: 20 },
      data: { label: "n1", current: { ref: 0, type: TYPES.DATASET } },
    });
    expect(n2.position).toEqual({ x: 0, y: 0 });
    expect(n2.data).toEqual({ label: "n2" });
    expect(doc.payloads).toEqual([{ data: rows }]);
    expect(doc.payloads[0].data).toBe(rows);
    const [e1, e2] = edgesOf(doc);
    expect(e1).toEqual({
      id: "e1",
      type: undefined,
      source: "n1",
      target: "n2",
      sourceHandle: "n1",
      targetHandle: "n2",
      animated: false,
      label: null,
      style: { stroke: "red" },
    });
    expect("style" in e2).toBe(false);
  });

  it("defaults title, updatedAt and viewport", () => {
    const doc = serializeFlow({});
    expect(doc.title).toBe(DEFAULT_TITLE);
    expect(serializeFlow({ title: "   " }).title).toBe(DEFAULT_TITLE);
    expect(doc.id).toBeNull();
    expect(doc.createdAt).toBeNull();
    expect(Number.isNaN(Date.parse(doc.updatedAt))).toBe(false);
    expect(doc.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
    expect(doc.elements).toEqual([]);
    expect(doc.payloads).toEqual([]);
  });

  it("drops pointers to ids that are no longer in the dataStore", () => {
    const doc = serializeFlow({ nodes: [node("n1", { current: "missing-id" })] });
    expect(nodesOf(doc)[0].data).toEqual({ label: "n1" });
    expect(doc.payloads).toEqual([]);
  });

  it("deduplicates payloads by reference across nodes", () => {
    const rows = [{ a: 1 }, { a: 2 }];
    const other = [{ a: 1 }, { a: 2 }];
    const doc = serializeFlow({
      nodes: [
        node("a", { current: dataStore.set(rows) }),
        node("b", { current: dataStore.set(rows) }),
        node("c", { current: dataStore.set(other) }),
      ],
    });
    expect(doc.payloads).toHaveLength(2);
    expect(doc.payloads[0].data).toBe(rows);
    expect(doc.payloads[1].data).toBe(other);
    const [a, b, c] = nodesOf(doc);
    expect(a.data.current.ref).toBe(0);
    expect(b.data.current.ref).toBe(0);
    expect(c.data.current.ref).toBe(1);
  });
});

describe("serializeFlow → deserializeFlow (v2)", () => {
  it("round-trips nodes, edges, metadata and rehydrates ids through the dataStore", () => {
    const rows = [{ a: 1 }];
    const geo = {
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [1, 2] } },
      ],
    };
    const doc = serializeFlow({
      nodes: [
        node("a", { current: dataStore.set(rows), column: "a" }),
        node("b", { current: dataStore.set(rows) }),
        node("g", { current: dataStore.set(geo) }),
        node("empty"),
      ],
      edges: [edge("e1", "a", "b")],
      viewport: { x: 1, y: 2, zoom: 3 },
      id: "flow__1",
      title: "T",
      createdAt: "c",
      updatedAt: "u",
    });
    // Survive a JSON round trip like a real file would.
    const parsed = JSON.parse(JSON.stringify(doc));
    const flow = deserializeFlow(parsed);
    expect(flow.id).toBe("flow__1");
    expect(flow.title).toBe("T");
    expect(flow.createdAt).toBe("c");
    expect(flow.updatedAt).toBe("u");
    expect(flow.viewport).toEqual({ x: 1, y: 2, zoom: 3 });
    expect("payloads" in flow).toBe(false);

    const [a, b, g, empty] = nodesOf(flow);
    expect(typeof a.data.current).toBe("string");
    expect(a.data.column).toBe("a");
    expect(dataStore.get(a.data.current)).toMatchObject({ data: rows, type: TYPES.DATASET });
    // Same payload ref + type → one dataStore entry shared by both nodes.
    expect(b.data.current).toBe(a.data.current);
    expect(dataStore.get(a.data.current).data).toBe(parsed.payloads[0].data);
    expect(dataStore.get(g.data.current)).toMatchObject({ data: geo, type: TYPES.GEOJSON });
    expect("current" in empty.data).toBe(false);
    expect(edgesOf(flow)).toEqual(edgesOf(parsed));
  });

  it("does not deep-clone payloads but copies node and edge structure", () => {
    const rows = [{ a: 1 }];
    const input = {
      version: 2,
      elements: [
        node("a", { current: { ref: 0, type: TYPES.DATASET }, nested: { deep: [1] } }),
        node("b"),
        edge("e1", "a", "b", { style: { stroke: "red" } }),
        edge("e2", "b", "a"),
      ],
      payloads: [{ data: rows }],
    };
    const snapshot = JSON.parse(JSON.stringify(input));
    const flow = deserializeFlow(input);
    const [a] = nodesOf(flow);
    expect(dataStore.get(a.data.current).data).toBe(rows);

    a.data.nested.deep.push(2);
    a.position.x = 999;
    a.data.label = "changed";
    const [e1, e2] = edgesOf(flow);
    e1.style.stroke = "blue";
    e2.label = "x";
    expect(JSON.parse(JSON.stringify(input))).toEqual(snapshot);
    expect(input.elements[0].data.current).toEqual({ ref: 0, type: TYPES.DATASET });
  });

  it("registers a payload referenced with different types once per type", () => {
    const flow = deserializeFlow({
      version: 2,
      elements: [
        node("a", { current: { ref: 0, type: TYPES.DATASET } }),
        node("b", { current: { ref: 0, type: TYPES.ARRAY } }),
        node("c", { current: { ref: 0 } }),
      ],
      payloads: [{ data: [{ x: 1 }] }],
    });
    const [a, b, c] = nodesOf(flow);
    expect(a.data.current).not.toBe(b.data.current);
    expect(dataStore.get(b.data.current).type).toBe(TYPES.ARRAY);
    expect(dataStore.get(c.data.current).type).toBe(TYPES.DATASET);
  });
});

describe("deserializeFlow (older documents)", () => {
  it("reads v1 inline `{ data, type }` values and strips legacy Merge fields", () => {
    const fixture = readJson("../../e2e/fixtures/v1-legacy-merge.datablocks.json");
    const flow = deserializeFlow(fixture);
    const byId = Object.fromEntries(nodesOf(flow).map((n) => [n.id, n]));
    expect(flow.id).toBe("flow__legacy-merge");
    expect(flow.title).toBe("Legacy v1 merge");

    const base = byId.base;
    expect(typeof base.data.current).toBe("string");
    expect(dataStore.get(base.data.current)).toMatchObject({
      type: TYPES.DATASET,
      data: [
        { key: "a", x: 1 },
        { key: "b", x: 2 },
        { key: "c", x: 3 },
      ],
    });
    // Inline values are reused as-is, not copied.
    const fixtureBase = fixture.elements.find((e) => e.id === "base");
    expect(dataStore.get(base.data.current).data).toBe(fixtureBase.data.current.data);

    const merge = byId.merge;
    for (const field of ["baseData", "insertData", "data", "count", "mergeCount"]) {
      expect(field in merge.data).toBe(false);
    }
    expect(merge.data.baseColumn).toBe("key");
    expect(merge.data.insertColumn).toBe("key");
    expect(typeof merge.data.current).toBe("string");
    // Source fixture is untouched.
    const fixtureMerge = fixture.elements.find((e) => e.id === "merge");
    expect(fixtureMerge.data.baseData).toBeDefined();

    expect("current" in byId.chart.data).toBe(false);
    expect(edgesOf(flow).map((e) => e.id)).toEqual(["e1", "e2", "e3"]);
  });

  it("keeps Merge-like fields on non-merge nodes", () => {
    const flow = deserializeFlow({
      elements: [node("f", { data: [1], count: 3, baseData: [2] })],
    });
    expect(nodesOf(flow)[0].data).toMatchObject({ data: [1], count: 3, baseData: [2] });
  });

  it("reads the legacy `{ elements, x, y, zoom }` introduction flow", () => {
    const intro = readJson("../../public/data/flows/introduction.json");
    const flow = deserializeFlow(intro);
    expect(flow.viewport).toEqual(readViewport(intro));
    expect(flow.id).toBeNull();
    expect(flow.title).toBe(DEFAULT_TITLE);
    expect(flow.createdAt).toBeNull();
    expect(flow.updatedAt).toBeNull();
    const nodes = nodesOf(flow);
    expect(nodes).toHaveLength(intro.elements.filter((e) => !("source" in e)).length);
    const example = nodes.find((n) => n.type === "exampledata");
    expect(dataStore.get(example.data.current).type).toBe(TYPES.DATASET);
    expect(dataStore.get(example.data.current).data.length).toBeGreaterThan(0);
    for (const n of nodes) {
      if ("current" in n.data) expect(typeof n.data.current).toBe("string");
    }
    expect(edgesOf(flow)).toHaveLength(3);
  });

  it("tolerates raw values stored directly in `current`", () => {
    const rows = [{ a: 1 }];
    const flow = deserializeFlow({
      elements: [
        node("rows", { current: rows }),
        node("num", { current: 42 }),
        node("zero", { current: 0 }),
        node("nil", { current: null }),
        node("id", { current: "already-an-id" }),
      ],
      x: 1,
      y: 2,
      zoom: 3,
    });
    const byId = Object.fromEntries(nodesOf(flow).map((n) => [n.id, n]));
    expect(dataStore.get(byId.rows.data.current)).toMatchObject({
      data: rows,
      type: TYPES.DATASET,
    });
    expect(dataStore.get(byId.num.data.current)).toMatchObject({ data: 42, type: TYPES.NUMBER });
    expect(dataStore.get(byId.zero.data.current)).toMatchObject({ data: 0, type: TYPES.NUMBER });
    expect(dataStore.get(byId.nil.data.current)).toMatchObject({ data: null, type: TYPES.NULL });
    // Strings are treated as existing DataStore ids and left alone.
    expect(byId.id.data.current).toBe("already-an-id");
    expect(flow.viewport).toEqual({ x: 1, y: 2, zoom: 3 });
  });
});

describe("validateFlow", () => {
  it("returns valid input unchanged", () => {
    const flow = { elements: [node("a"), node("b"), edge("e", "a", "b")] };
    expect(validateFlow(flow)).toBe(flow);
  });

  it.each([
    ["null", null, /JSON object/],
    ["array", [], /JSON object/],
    ["string", "flow", /JSON object/],
    ["missing elements", {}, /missing an `elements` array/],
    ["elements not array", { elements: {} }, /missing an `elements` array/],
    ["newer version", { version: FLOW_VERSION + 1, elements: [] }, /newer than this app supports/],
    ["payloads not array", { elements: [], payloads: {} }, /invalid `payloads`/],
    ["node with empty id", { elements: [{ id: "", type: "x", data: {} }] }, /missing `id`/],
    ["node missing type", { elements: [{ id: "a", data: {} }] }, /missing `id`, `type`/],
    ["node missing data", { elements: [{ id: "a", type: "x" }] }, /or `data`/],
    ["duplicate node ids", { elements: [node("a"), node("a")] }, /Duplicate node id "a"/],
    [
      "edge without source value",
      { elements: [node("a"), edge("e", "", "a")] },
      /missing `source` or `target`/,
    ],
    [
      "edge to unknown node",
      { elements: [node("a"), edge("e", "a", "ghost")] },
      /references a node that is not in the flow/,
    ],
    [
      "payload ref out of range",
      { version: 2, elements: [node("a", { current: { ref: 1 } })], payloads: [{ data: 1 }] },
      /references a missing payload/,
    ],
    [
      "negative payload ref",
      { version: 2, elements: [node("a", { current: { ref: -1 } })], payloads: [{ data: 1 }] },
      /references a missing payload/,
    ],
    [
      "non-integer payload ref",
      { version: 2, elements: [node("a", { current: { ref: "0" } })], payloads: [{ data: 1 }] },
      /references a missing payload/,
    ],
    [
      "ref without payloads",
      { version: 2, elements: [node("a", { current: { ref: 0 } })] },
      /references a missing payload/,
    ],
  ])("rejects %s", (_label, input, message) => {
    expect(() => validateFlow(input)).toThrow(message);
    expect(() => deserializeFlow(input)).toThrow(message);
  });

  it("accepts the current version", () => {
    expect(() => validateFlow({ version: FLOW_VERSION, elements: [] })).not.toThrow();
  });

  it("ignores elements that are neither nodes nor edges (no `id` key)", () => {
    // Documented current behavior: such elements pass validation and are copied through.
    const flow = deserializeFlow({ elements: [{ type: "file", data: {} }] });
    expect(flow.elements).toEqual([{ type: "file", data: {} }]);
  });
});

describe("flowFileName", () => {
  it("builds a filesystem-safe name", () => {
    expect(flowFileName("My flow")).toBe("My flow.datablocks.json");
    expect(flowFileName('a/b\\c:d*e?f"g<h>i|j')).toBe("a-b-c-d-e-f-g-h-i-j.datablocks.json");
    expect(flowFileName("  many   spaces\there ")).toBe("many spaces here.datablocks.json");
    expect(flowFileName()).toBe(`${DEFAULT_TITLE}.datablocks.json`);
    expect(flowFileName("   ")).toBe("flow.datablocks.json");
    expect(flowFileName("x".repeat(200))).toBe(`${"x".repeat(80)}.datablocks.json`);
  });
});
