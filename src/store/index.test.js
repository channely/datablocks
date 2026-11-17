import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import useStore, { flowStorage, initPersistence } from "./index";
import dataStore from "../lib/dataStore";
import { TYPES } from "../lib/types";
import { FLOW_VERSION } from "../lib/flowSerialization";

const readJson = (relative) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8"));

const get = () => useStore.getState();

/** Let the coalesced dataStore GC (`setTimeout(0)`) run. */
const flushGc = () => new Promise((resolve) => setTimeout(resolve, 0));
/** Wait past `afterNodesMount` (one animation frame, then a macrotask). */
const flushMount = () =>
  new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

const referencedIds = () =>
  new Set(
    get()
      .nodes.map((node) => node.data?.current)
      .filter((id) => typeof id === "string"),
  );

const valueOf = (nodeId) => {
  const node = get().nodes.find((n) => n.id === nodeId);
  return node ? dataStore.get(node.data.current)?.data : undefined;
};

const addNode = (id, data = {}, type = "file") => get().addNode({ id, type, data });
const pastLength = () => get().history.past.length;
const futureLength = () => get().history.future.length;

/** Two connected nodes with data, history cleared. */
const seedGraph = () => {
  const rows = [{ a: 1 }, { a: 2 }];
  addNode("src", { label: "Source", current: rows });
  addNode("dst", { label: "Filter" }, "filter");
  get().addEdge({
    id: "e1",
    source: "src",
    target: "dst",
    sourceHandle: "src",
    targetHandle: "dst",
  });
  get().clearHistory();
  return rows;
};

beforeEach(async () => {
  await flushMount();
  useStore.setState({
    flowInstance: null,
    demoMode: false,
    logs: [],
    codeEditorFocus: false,
    dependencies: [],
    modal: null,
  });
  get().newFlow();
  get().clearHistory();
  await flowStorage.clear();
  localStorage.clear();
  await flushGc();
});

afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete navigator.storage;
  await flushGc();
});

describe("UI slice", () => {
  it("manages simple UI flags", () => {
    get().setDemoMode(true);
    get().setDropDownOpen(true);
    get().setModal("library");
    const callback = () => {};
    get().setOnFlowSaveCallback(callback);
    expect(get()).toMatchObject({
      demoMode: true,
      dropDownOpen: true,
      modal: "library",
      onFlowSaveCallback: callback,
    });
  });

  it("appends logs with increasing ids and clears them", () => {
    get().addLogs({ method: "log", data: ["a"] });
    get().addLogs([
      { method: "warn", data: ["b"] },
      { method: "error", data: ["c"] },
    ]);
    const logs = get().logs;
    expect(logs.map((log) => log.data[0])).toEqual(["a", "b", "c"]);
    expect(logs[1].id).toBe(logs[0].id + 1);
    expect(logs[2].id).toBe(logs[1].id + 1);
    get().clearLogs();
    expect(get().logs).toEqual([]);
  });

  it("adds unique dependencies and removes them", () => {
    get().addDependency({ name: "d3@7.8.5" });
    get().addDependency({ name: "d3@7.8.5" });
    get().addDependency({ name: "lodash@4.17.21" });
    expect(get().dependencies.map((d) => d.name)).toEqual(["d3@7.8.5", "lodash@4.17.21"]);
    get().removeDependency({ name: "d3@7.8.5" });
    expect(get().dependencies.map((d) => d.name)).toEqual(["lodash@4.17.21"]);
  });
});

describe("flow state basics", () => {
  it("sets title only when non-empty", () => {
    get().setTitle("  Report  ");
    expect(get().title).toBe("Report");
    get().setTitle("   ");
    get().setTitle(undefined);
    expect(get().title).toBe("Report");
  });

  it("addNode stores `current` as a dataStore id and drops `data.type`", () => {
    const rows = [{ a: 1 }];
    addNode("n1", { label: "File", type: "ignored", current: rows });
    const [node] = get().nodes;
    expect(node.id).toBe("n1");
    expect(node.type).toBe("file");
    expect(node.position).toEqual({ x: 0, y: 0 });
    expect("type" in node.data).toBe(false);
    expect(typeof node.data.current).toBe("string");
    expect(dataStore.get(node.data.current)).toMatchObject({ data: rows, type: TYPES.DATASET });
  });

  it("addNode generates ids/types and projects positions through the flow instance", () => {
    useStore.setState({
      flowInstance: { project: ({ x, y }) => ({ x: x - 10, y: y - 20 }) },
    });
    get().addNode({ position: { x: 100, y: 200 } });
    const [node] = get().nodes;
    expect(typeof node.id).toBe("string");
    expect(node.type).toBe("default");
    expect(node.data).toEqual({});
    expect(node.position).toEqual({ x: 90, y: 180 });
  });

  it("addNode centers on the canvas rect when there is no drop position", () => {
    const el = document.createElement("div");
    el.id = "reactflow";
    document.body.appendChild(el);
    vi.spyOn(el, "getBoundingClientRect").mockReturnValue({ width: 1000, height: 600 });
    try {
      get().addNode({ id: "c" });
      expect(get().nodes[0].position).toEqual({ x: 350, y: 260 });
    } finally {
      el.remove();
    }
  });

  it("addEdge validates endpoints and replaces an existing edge on the same target handle", () => {
    addNode("a");
    addNode("b");
    addNode("c");
    expect(get().addEdge({ source: "a" })).toBe(false);
    expect(get().addEdge({ source: "a", target: "a" })).toBe(false);
    get().addEdge({ id: "e1", source: "a", target: "c", targetHandle: "c" });
    expect(get().edges).toEqual([
      expect.objectContaining({ id: "e1", type: "default", animated: true, source: "a" }),
    ]);
    get().addEdge({ id: "e2", source: "b", target: "c", targetHandle: "c" });
    expect(get().edges.map((e) => e.id)).toEqual(["e2"]);
    get().addEdge({ id: "e3", source: "a", target: "c", targetHandle: "c-insert" });
    expect(get().edges.map((e) => e.id)).toEqual(["e2", "e3"]);
  });

  it("setConnectionValid marks edges and is a no-op when unchanged", () => {
    seedGraph();
    const initial = get().edges;
    // Edges start animated with no label, so marking them valid sets the "×" label once.
    get().setConnectionValid({ source: "src", target: "dst", isValid: true });
    const valid = get().edges;
    expect(valid).not.toBe(initial);
    expect(valid[0]).toMatchObject({ animated: true, label: "×" });
    get().setConnectionValid({ source: "src", target: "dst", isValid: true });
    expect(get().edges).toBe(valid);

    get().setConnectionValid({ source: "src", target: "dst", isValid: false });
    expect(get().edges[0]).toMatchObject({ animated: false, label: "⚠" });
    const invalid = get().edges;
    get().setConnectionValid({ source: "src", target: "dst", isValid: false });
    expect(get().edges).toBe(invalid);

    // Unrelated endpoints do not touch anything.
    get().setConnectionValid({ source: "x", target: "y", isValid: true });
    expect(get().edges).toBe(invalid);
  });

  it("setConnectionValid matches handles as well as node ids", () => {
    addNode("a");
    addNode("m", {}, "merge");
    get().addEdge({ id: "e", source: "a", target: "m", sourceHandle: "a", targetHandle: "m-base" });
    get().setConnectionValid({ source: "a", target: "m-base", isValid: false });
    expect(get().edges[0].label).toBe("⚠");
  });

  it("selects nodes and toggles misc flags", () => {
    const node = { id: "x" };
    get().selectNode(node);
    expect(get()).toMatchObject({ selectedNode: node, selectedNodeId: "x" });
    get().selectNode(null);
    expect(get()).toMatchObject({ selectedNode: null, selectedNodeId: null });
    get().setCodeEditorFocused(true);
    expect(get().codeEditorFocus).toBe(true);
    get().setInputNodeModalData({ a: 1 });
    expect(get().inputNodeModalData).toEqual({ a: 1 });
    get().closeInputNodeModal();
    expect(get().inputNodeModalData).toBeNull();
    get().setId("flow__z");
    expect(get().id).toBe("flow__z");
    get().addNodes([{ id: "n", type: "file", data: {}, position: { x: 0, y: 0 } }]);
    expect(get().nodes.map((n) => n.id)).toEqual(["n"]);
  });
});

describe("updateNodeData", () => {
  it("ignores unknown nodes and empty or unchanged patches", () => {
    addNode("n", { label: "A" });
    get().clearHistory();
    const nodes = get().nodes;
    get().updateNodeData({ id: "missing", data: { label: "B" } });
    get().updateNodeData({ id: "n" });
    get().updateNodeData({ id: "n", data: { label: "A" } });
    expect(get().nodes).toBe(nodes);
    expect(pastLength()).toBe(0);
  });

  it("skips republishing the same reference (no new id, no state change)", () => {
    const rows = [{ a: 1 }];
    addNode("n", { current: rows });
    const nodes = get().nodes;
    const id = nodes[0].data.current;
    const size = dataStore.size;
    get().updateNodeData({ id: "n", data: { current: rows } });
    expect(get().nodes).toBe(nodes);
    expect(dataStore.size).toBe(size);
    expect(get().nodes[0].data.current).toBe(id);
  });

  it("treats the sanitized GeoJSON copy as the same value", () => {
    const geo = {
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [0, 0] } },
        { type: "Feature", properties: {}, geometry: null },
      ],
    };
    addNode("g", { current: geo });
    const nodes = get().nodes;
    const sanitized = dataStore.get(nodes[0].data.current).data;
    expect(sanitized).not.toBe(geo);
    get().updateNodeData({ id: "g", data: { current: sanitized } });
    expect(get().nodes).toBe(nodes);
  });

  it("stores new values as new ids and releases the old one on the next GC pass", async () => {
    addNode("n", { current: [{ a: 1 }] });
    const oldId = get().nodes[0].data.current;
    const next = [{ a: 2 }];
    get().updateNodeData({ id: "n", data: { current: next } });
    const newId = get().nodes[0].data.current;
    expect(newId).not.toBe(oldId);
    expect(dataStore.get(newId).data).toBe(next);
    await flushGc();
    expect(dataStore.get(oldId)).toBeUndefined();
    expect(dataStore.size).toBe(referencedIds().size);
  });

  it("combines `current` with other keys in one patch", () => {
    addNode("n", { label: "A", current: 1 });
    get().clearHistory();
    get().updateNodeData({ id: "n", data: { label: "B", current: 2 } });
    expect(get().nodes[0].data.label).toBe("B");
    expect(valueOf("n")).toBe(2);
    expect(pastLength()).toBe(1);
  });
});

describe("history", () => {
  it("addNode records an undo step; undo/redo restore nodes and payloads", () => {
    const rows = [{ a: 1 }];
    addNode("n", { current: rows });
    expect(pastLength()).toBe(1);
    expect(get().history.past[0].elements).toEqual([]);

    expect(get().undo()).toBe(true);
    expect(get().nodes).toEqual([]);
    expect(futureLength()).toBe(1);

    expect(get().redo()).toBe(true);
    expect(get().nodes.map((n) => n.id)).toEqual(["n"]);
    expect(valueOf("n")).toBe(rows);
    expect(pastLength()).toBe(1);
    expect(futureLength()).toBe(0);
  });

  it("undo/redo return false when there is nothing to do", () => {
    expect(get().undo()).toBe(false);
    expect(get().redo()).toBe(false);
  });

  it("a new edit clears the redo stack", () => {
    addNode("a");
    get().undo();
    expect(futureLength()).toBe(1);
    addNode("b");
    expect(futureLength()).toBe(0);
  });

  it("undo restores a removed node with its edges and payload, even after GC", async () => {
    const rows = seedGraph();
    const oldId = get().nodes[0].data.current;
    get().selectNode(get().nodes[0]);
    get().removeElements([{ id: "src" }]);
    expect(get().nodes.map((n) => n.id)).toEqual(["dst"]);
    expect(get().edges).toEqual([]);
    expect(get().selectedNodeId).toBeNull();
    expect(pastLength()).toBe(1);

    await flushGc();
    expect(dataStore.get(oldId)).toBeUndefined();

    get().undo();
    expect(get().nodes.map((n) => n.id)).toEqual(["src", "dst"]);
    expect(get().edges.map((e) => e.id)).toEqual(["e1"]);
    expect(valueOf("src")).toBe(rows);
    expect(get().nodes[0].data.label).toBe("Source");

    get().redo();
    expect(get().nodes.map((n) => n.id)).toEqual(["dst"]);
    expect(get().edges).toEqual([]);
    await flushGc();
    expect(dataStore.size).toBe(referencedIds().size);
  });

  it("removing a node keeps the selection when another node was selected", () => {
    seedGraph();
    get().selectNode(get().nodes[1]);
    get().removeElements([{ id: "src" }]);
    expect(get().selectedNodeId).toBe("dst");
  });

  it("removing an edge only removes that edge", () => {
    seedGraph();
    get().removeElements([{ id: "e1" }]);
    expect(get().nodes).toHaveLength(2);
    expect(get().edges).toEqual([]);
  });

  it("coalesces edits on the same node within 600ms", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(10_000);
    addNode("a", { label: "A" });
    addNode("b", { label: "B" });
    get().clearHistory();

    get().updateNodeData({ id: "a", data: { label: "A1" } });
    expect(pastLength()).toBe(1);
    vi.setSystemTime(10_500);
    get().updateNodeData({ id: "a", data: { label: "A2" } });
    expect(pastLength()).toBe(1);
    // The window slides with each coalesced edit.
    vi.setSystemTime(11_000);
    get().updateNodeData({ id: "a", data: { label: "A3" } });
    expect(pastLength()).toBe(1);
    vi.setSystemTime(11_600);
    get().updateNodeData({ id: "a", data: { label: "A4" } });
    expect(pastLength()).toBe(2);

    // Another node breaks the run immediately.
    get().updateNodeData({ id: "b", data: { label: "B1" } });
    expect(pastLength()).toBe(3);
    get().updateNodeData({ id: "a", data: { label: "A5" } });
    expect(pastLength()).toBe(4);

    get().undo();
    expect(get().nodes[0].data.label).toBe("A4");
    get().undo();
    get().undo();
    expect(get().nodes[0].data.label).toBe("A3");
    get().undo();
    expect(get().nodes.map((n) => n.data.label)).toEqual(["A", "B"]);
  });

  it("recordHistory reports whether it pushed", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(1_000);
    expect(get().recordHistory("k")).toBe(true);
    vi.setSystemTime(1_599);
    expect(get().recordHistory("k")).toBe(false);
    vi.setSystemTime(2_198);
    expect(get().recordHistory("k")).toBe(false);
    // Exactly 600ms after the last coalesced edit starts a new step.
    vi.setSystemTime(2_798);
    expect(get().recordHistory("k")).toBe(true);
    expect(get().recordHistory()).toBe(true);
    expect(get().recordHistory()).toBe(true);
    expect(pastLength()).toBe(4);
  });

  it("does not record derived `current` writes or transient writes", () => {
    addNode("n", { label: "A", current: 1 });
    get().clearHistory();
    get().updateNodeData({ id: "n", data: { current: 2 } });
    get().updateNodeData({ id: "n", data: { column: "x" }, transient: true });
    expect(valueOf("n")).toBe(2);
    expect(get().nodes[0].data.column).toBe("x");
    expect(pastLength()).toBe(0);
  });

  it("coalesces edge and node removals of one delete gesture within 150ms", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(50_000);
    seedGraph();
    addNode("third");
    get().clearHistory();

    get().onEdgesChange([{ id: "e1", type: "remove" }]);
    vi.setSystemTime(50_100);
    get().onNodesChange([{ id: "src", type: "remove" }]);
    expect(pastLength()).toBe(1);
    expect(get().nodes.map((n) => n.id)).toEqual(["dst", "third"]);

    vi.setSystemTime(50_300);
    get().removeElements([{ id: "third" }]);
    expect(pastLength()).toBe(2);

    get().undo();
    expect(get().nodes.map((n) => n.id)).toEqual(["dst", "third"]);
    get().undo();
    expect(get().nodes.map((n) => n.id)).toEqual(["src", "dst", "third"]);
    expect(get().edges.map((e) => e.id)).toEqual(["e1"]);
  });

  it("a removal resets same-node coalescing", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(5_000);
    addNode("a", { label: "A" });
    addNode("b", { label: "B" });
    get().clearHistory();
    get().updateNodeData({ id: "a", data: { label: "A1" } });
    get().removeElements([{ id: "b" }]);
    get().updateNodeData({ id: "a", data: { label: "A2" } });
    expect(pastLength()).toBe(3);
  });

  it("onEdgesChange without removals does not record", () => {
    seedGraph();
    get().onEdgesChange([{ id: "e1", type: "select", selected: true }]);
    expect(get().edges[0].selected).toBe(true);
    expect(pastLength()).toBe(0);
  });

  it("caps history at 100 entries (including via redo)", () => {
    for (let i = 0; i < 105; i += 1) get().recordHistory();
    expect(pastLength()).toBe(100);
    get().undo();
    expect(pastLength()).toBe(99);
    get().recordHistory();
    get().recordHistory();
    expect(pastLength()).toBe(100);
    get().undo();
    get().redo();
    expect(pastLength()).toBe(100);
  });

  it("records a drag once, on drag end, only when a node moved", () => {
    addNode("a");
    addNode("b");
    get().clearHistory();
    const at = (x, y, dragging) => [{ id: "a", type: "position", position: { x, y }, dragging }];

    get().onNodesChange(at(5, 5, true));
    get().onNodesChange(at(10, 10, true));
    expect(pastLength()).toBe(0);
    get().onNodesChange([{ id: "a", type: "position", dragging: false }]);
    expect(pastLength()).toBe(1);
    expect(get().nodes[0].position).toEqual({ x: 10, y: 10 });

    // Drag that ends where it started.
    get().onNodesChange(at(20, 20, true));
    get().onNodesChange(at(10, 10, true));
    get().onNodesChange([{ id: "a", type: "position", dragging: false }]);
    expect(pastLength()).toBe(1);

    get().undo();
    expect(get().nodes[0].position).toEqual({ x: 0, y: 0 });
  });

  it("ignores node changes while the code editor has focus and applies other changes", () => {
    addNode("a");
    get().setCodeEditorFocused(true);
    const nodes = get().nodes;
    get().onNodesChange([{ id: "a", type: "remove" }]);
    expect(get().nodes).toBe(nodes);
    get().setCodeEditorFocused(false);

    get().onNodesChange([{ id: "a", type: "select", selected: true }]);
    expect(get().nodes[0].selected).toBe(true);
    expect(pastLength()).toBe(1);
  });

  it("routes removals from onNodesChange through removeElements and applies the rest", async () => {
    seedGraph();
    const id = get().nodes[0].data.current;
    get().onNodesChange([
      { id: "src", type: "remove" },
      { id: "dst", type: "select", selected: true },
    ]);
    expect(get().nodes).toEqual([expect.objectContaining({ id: "dst", selected: true })]);
    expect(get().edges).toEqual([]);
    expect(pastLength()).toBe(1);
    await flushGc();
    expect(dataStore.get(id)).toBeUndefined();
  });

  it("loads clear history: importFlow, newFlow, loadFlowById, restoreSession", async () => {
    seedGraph();
    const doc = JSON.parse(await get().exportFlow());

    addNode("x");
    expect(pastLength()).toBe(1);
    await get().importFlow(doc);
    expect(pastLength()).toBe(0);

    addNode("x");
    get().newFlow();
    expect(pastLength()).toBe(0);

    seedGraph();
    const meta = await get().saveFlow({ title: "Saved" });
    await get().autosave();
    addNode("y");
    await get().loadFlowById(meta.id);
    expect(pastLength()).toBe(0);

    addNode("z");
    get().undo();
    expect(futureLength()).toBe(1);
    await get().restoreSession();
    expect(get().history).toEqual({ past: [], future: [] });
  });
});

describe("data GC", () => {
  it("releases payloads after removing a node", async () => {
    seedGraph();
    const id = get().nodes[0].data.current;
    expect(dataStore.get(id)).toBeDefined();
    get().removeElements([{ id: "src" }]);
    expect(dataStore.get(id)).toBeDefined();
    await flushGc();
    expect(dataStore.get(id)).toBeUndefined();
    expect(dataStore.size).toBe(0);
  });

  it("releases the previous flow's payloads when another flow is loaded", async () => {
    addNode("a", { current: [{ a: 1 }] });
    addNode("b", { current: "text" });
    const oldIds = [...referencedIds()];
    await flushGc();
    expect(dataStore.size).toBe(2);

    await get().importFlow({
      version: FLOW_VERSION,
      elements: [
        {
          id: "n",
          type: "file",
          position: { x: 0, y: 0 },
          data: { current: { ref: 0, type: TYPES.DATASET } },
        },
      ],
      payloads: [{ data: [{ z: 1 }] }],
    });
    await flushGc();
    oldIds.forEach((id) => expect(dataStore.get(id)).toBeUndefined());
    expect(dataStore.size).toBe(1);
    expect(valueOf("n")).toEqual([{ z: 1 }]);
  });

  it("newFlow releases everything", async () => {
    seedGraph();
    get().newFlow();
    await flushGc();
    expect(dataStore.size).toBe(0);
    expect(get()).toMatchObject({ nodes: [], edges: [], id: null, title: "Untitled flow" });
    expect(get().flowTransform).toEqual({ x: 0, y: 0, zoom: 1 });
  });
});

describe("loading flows", () => {
  it("importFlow accepts JSON strings, defers edges until nodes mount, and returns meta", async () => {
    const fixture = readJson("../../e2e/fixtures/v1-legacy-merge.datablocks.json");
    const meta = await get().importFlow(JSON.stringify(fixture));
    expect(meta).toEqual({
      id: "flow__legacy-merge",
      title: "Legacy v1 merge",
      createdAt: fixture.createdAt,
      updatedAt: fixture.updatedAt,
      nodeCount: 6,
    });
    expect(get()).toMatchObject({ id: "flow__legacy-merge", title: "Legacy v1 merge" });
    expect(get().saveStatus).toBe("idle");
    expect(get().nodes).toHaveLength(6);
    expect(get().edges).toEqual([]);
    await flushMount();
    expect(get().edges.map((e) => e.id)).toEqual(["e1", "e2", "e3"]);
    const merge = get().nodes.find((n) => n.id === "merge");
    expect(merge.data.baseData).toBeUndefined();
  });

  it("importFlow rejects invalid input and leaves state unchanged", async () => {
    seedGraph();
    addNode("extra");
    const before = {
      nodes: get().nodes,
      edges: get().edges,
      history: get().history,
      id: get().id,
      title: get().title,
    };
    await expect(get().importFlow("{not json")).rejects.toThrow(SyntaxError);
    await expect(get().importFlow({ elements: "nope" })).rejects.toThrow(/elements/);
    await expect(get().importFlow({ version: 99, elements: [] })).rejects.toThrow(/newer/);
    expect(get()).toMatchObject(before);
    expect(get().nodes).toBe(before.nodes);
    expect(get().history).toBe(before.history);
  });

  it("a later load cancels the pending edges of an earlier one", async () => {
    const fixture = readJson("../../e2e/fixtures/v1-legacy-merge.datablocks.json");
    await get().importFlow(fixture);
    await get().importFlow({
      elements: [{ id: "only", type: "file", position: { x: 0, y: 0 }, data: {} }],
    });
    await flushMount();
    expect(get().nodes.map((n) => n.id)).toEqual(["only"]);
    expect(get().edges).toEqual([]);
  });

  // BUG (suspected): `newFlow` does not bump `loadGeneration`, so edges deferred by a load that
  // happened less than a frame earlier still land on the new, empty canvas (dangling edges).
  it("newFlow right after a load does not receive the load's deferred edges", async () => {
    const fixture = readJson("../../e2e/fixtures/v1-legacy-merge.datablocks.json");
    await get().importFlow(fixture);
    get().newFlow();
    await flushMount();
    expect(get().edges).toEqual([]);
  });

  it("loadFlow fetches a base-aware static flow and titles it from the name", async () => {
    const intro = readJson("../../public/data/flows/introduction.json");
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => intro });
    vi.stubGlobal("fetch", fetch);
    get().setMeta({ id: "flow__open", title: "Open" });
    addNode("x");
    await get().loadFlow("introduction");
    expect(fetch).toHaveBeenCalledWith(`${import.meta.env.BASE_URL}data/flows/introduction.json`);
    expect(get()).toMatchObject({ id: null, title: "Introduction", saveStatus: "idle" });
    expect(get().flowTransform).toEqual({ x: intro.x, y: intro.y, zoom: intro.zoom });
    expect(get().nodes).toHaveLength(intro.elements.filter((e) => !("source" in e)).length);
    expect(pastLength()).toBe(0);
    const example = get().nodes.find((n) => n.type === "exampledata");
    expect(dataStore.get(example.data.current).type).toBe(TYPES.DATASET);
    await flushMount();
    expect(get().edges).toHaveLength(3);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => intro }));
    await get().loadFlow("my-example");
    expect(get().title).toBe("My example");
  });

  it("loadFlow throws when the file is missing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    await expect(get().loadFlow("nope")).rejects.toThrow('Could not load flow "nope".');
  });

  it("setFlowData loads raw elements and defers edges (legacy loader)", async () => {
    await get().setFlowData({
      id: "legacy",
      title: "Legacy",
      elements: [
        { id: "a", type: "file", position: { x: 0, y: 0 }, data: {} },
        { id: "b", type: "file", position: { x: 0, y: 0 }, data: {} },
        { id: "e", source: "a", target: "b" },
      ],
      x: 3,
      y: 4,
      zoom: 2,
    });
    expect(get()).toMatchObject({ id: "legacy", title: "Legacy" });
    expect(get().flowTransform).toEqual({ x: 3, y: 4, zoom: 2 });
    expect(get().edges).toEqual([]);
    await flushMount();
    expect(get().edges.map((e) => e.id)).toEqual(["e"]);
    expect(pastLength()).toBe(0);

    await get().setFlowData({ viewport: { x: 1, y: 2, zoom: 3 } });
    expect(get().nodes).toEqual([]);
    expect(get().title).toBe("Untitled flow");
    expect(get().flowTransform).toEqual({ x: 1, y: 2, zoom: 3 });
  });

  // BUG (suspected): `setFlowData` (used by App for embedded `data.flow[0]`) bypasses
  // `deserializeFlow`, so inline `{ data, type }` / v2 `{ ref, type }` values stay in node data
  // instead of becoming dataStore ids (AGENTS.md invariants 1 and 8). It also guards
  // `flow?.elements` but crashes in `setMeta` when `flow` is null/undefined.
  it("setFlowData rehydrates `current` through the dataStore", async () => {
    const rows = [{ a: 1 }];
    await get().setFlowData({
      elements: [
        {
          id: "a",
          type: "file",
          position: { x: 0, y: 0 },
          data: { current: { data: rows, type: TYPES.DATASET } },
        },
      ],
    });
    expect(typeof get().nodes[0].data.current).toBe("string");
    expect(valueOf("a")).toBe(rows);
  });

  it("setFlowData tolerates a missing flow", async () => {
    await expect(get().setFlowData(undefined)).resolves.toBeUndefined();
  });
});

describe("persistence", () => {
  it("saveFlow writes a v2 document and an index entry", async () => {
    const rows = seedGraph();
    const meta = await get().saveFlow({ title: "My flow" });
    expect(meta).toMatchObject({ title: "My flow", nodeCount: 2 });
    expect(meta.id).toMatch(/^flow__/);
    expect(get()).toMatchObject({ id: meta.id, title: "My flow", saveStatus: "saved" });
    expect(get().lastSavedAt).toBe(meta.updatedAt);
    expect(get().createdAt).toBe(meta.createdAt);

    const stored = await flowStorage.getItem(meta.id);
    expect(stored.version).toBe(FLOW_VERSION);
    expect(stored.payloads).toEqual([{ data: rows }]);
    expect(stored.elements.find((e) => e.id === "src").data.current).toEqual({
      ref: 0,
      type: TYPES.DATASET,
    });
    expect(await get().listFlows()).toEqual([meta]);
    expect(await flowStorage.getItem("flow__index")).toEqual([meta]);
  });

  it("saveFlow reuses the open id and createdAt; `id: null` saves as a new entry", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2024-01-01T00:00:00.000Z"));
    seedGraph();
    const first = await get().saveFlow({ title: "One" });
    vi.setSystemTime(new Date("2024-01-02T00:00:00.000Z"));
    const again = await get().saveFlow();
    expect(again.id).toBe(first.id);
    expect(again.title).toBe("One");
    expect(again.createdAt).toBe("2024-01-01T00:00:00.000Z");
    expect(again.updatedAt).toBe("2024-01-02T00:00:00.000Z");

    vi.setSystemTime(new Date("2024-01-03T00:00:00.000Z"));
    const copy = await get().saveFlow({ id: null, title: "Copy" });
    expect(copy.id).not.toBe(first.id);
    expect(copy.createdAt).toBe("2024-01-03T00:00:00.000Z");
    expect(get().id).toBe(copy.id);
    expect((await get().listFlows()).map((f) => f.title)).toEqual(["Copy", "One"]);

    const explicit = await get().saveFlow({ id: "flow__explicit" });
    expect(explicit.id).toBe("flow__explicit");
  });

  it("saveFlow uses the flow instance snapshot (viewport) when available", async () => {
    addNode("a");
    useStore.setState({
      flowInstance: {
        toObject: () => ({
          nodes: get().nodes,
          edges: get().edges,
          viewport: { x: 7, y: 8, zoom: 1.5 },
        }),
      },
    });
    const meta = await get().saveFlow();
    expect((await flowStorage.getItem(meta.id)).viewport).toEqual({ x: 7, y: 8, zoom: 1.5 });
  });

  it("saveFlow reports storage errors (quota) and rethrows", async () => {
    seedGraph();
    vi.spyOn(flowStorage, "setItem").mockRejectedValue(new Error("QuotaExceededError"));
    await expect(get().saveFlow({ title: "X" })).rejects.toThrow("QuotaExceededError");
    expect(get().saveStatus).toBe("error");
    expect(get().id).toBeNull();
    const log = get().logs.at(-1);
    expect(log.method).toBe("error");
    expect(log.data[0]).toMatch(/Saving the flow failed/);
    expect(log.data[1]).toBe("QuotaExceededError");
  });

  it("warns once when storage usage passes the warning ratio", async () => {
    Object.defineProperty(navigator, "storage", {
      configurable: true,
      value: { estimate: vi.fn().mockResolvedValue({ usage: 90, quota: 100 }) },
    });
    addNode("a");
    await get().saveFlow();
    await vi.waitFor(() => expect(get().logs).toHaveLength(1));
    expect(get().logs[0].method).toBe("warn");
    expect(get().logs[0].data[0]).toMatch(/90% full \(90 B of 100 B\)/);
    await get().autosave();
    await flushGc();
    expect(get().logs).toHaveLength(1);
  });

  it("listFlows rebuilds a missing or damaged index from stored flows", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2024-01-01T00:00:00.000Z"));
    addNode("a");
    const older = await get().saveFlow({ id: null, title: "Older" });
    vi.setSystemTime(new Date("2024-02-01T00:00:00.000Z"));
    const newer = await get().saveFlow({ id: null, title: "Newer" });
    await get().autosave();
    await initPersistence();
    await flowStorage.setItem("unrelated", { elements: [] });
    await flowStorage.setItem("flow__broken", { nope: true });

    await flowStorage.removeItem("flow__index");
    expect((await get().listFlows()).map((f) => f.id)).toEqual([newer.id, older.id]);
    expect(await flowStorage.getItem("flow__index")).toHaveLength(2);

    await flowStorage.setItem("flow__index", "garbage");
    expect((await get().listFlows()).map((f) => f.id)).toEqual([newer.id, older.id]);
  });

  it("renameFlow updates storage, index and the open flow", async () => {
    addNode("a");
    const meta = await get().saveFlow({ title: "Before" });
    const renamed = await get().renameFlow(meta.id, "  After  ");
    expect(renamed.title).toBe("After");
    expect(get().title).toBe("After");
    expect((await flowStorage.getItem(meta.id)).title).toBe("After");
    expect((await get().listFlows())[0].title).toBe("After");

    await expect(get().renameFlow(meta.id, "  ")).rejects.toThrow("A flow name is required.");
    await expect(get().renameFlow("flow__missing", "X")).rejects.toThrow(/was not found/);
  });

  it("renameFlow of another flow leaves the open title alone", async () => {
    addNode("a");
    const other = await get().saveFlow({ title: "Other" });
    await get().saveFlow({ id: null, title: "Open" });
    await get().renameFlow(other.id, "Renamed");
    expect(get().title).toBe("Open");
  });

  it("duplicateFlow copies a stored flow under a new id", async () => {
    seedGraph();
    const meta = await get().saveFlow({ title: "Base" });
    const copy = await get().duplicateFlow(meta.id);
    expect(copy.id).not.toBe(meta.id);
    expect(copy.title).toBe("Base copy");
    expect(copy.nodeCount).toBe(2);
    const stored = await flowStorage.getItem(copy.id);
    expect(stored.id).toBe(copy.id);
    expect(stored.elements).toEqual((await flowStorage.getItem(meta.id)).elements);
    expect((await get().listFlows()).map((f) => f.id).sort()).toEqual([copy.id, meta.id].sort());
    await expect(get().duplicateFlow("flow__missing")).rejects.toThrow(/was not found/);
  });

  it("deleteFlow removes the entry and resets metadata of the open flow", async () => {
    addNode("a");
    const other = await get().saveFlow({ title: "Other" });
    const open = await get().saveFlow({ id: null, title: "Open" });

    await get().deleteFlow(other.id);
    expect(await flowStorage.getItem(other.id)).toBeNull();
    expect(get().id).toBe(open.id);

    await get().deleteFlow(open.id);
    expect(await get().listFlows()).toEqual([]);
    expect(get()).toMatchObject({ id: null, title: "Untitled flow", saveStatus: "idle" });
    // The canvas itself is kept.
    expect(get().nodes).toHaveLength(1);
  });

  it("loadFlowById loads a stored flow and returns its meta", async () => {
    const rows = seedGraph();
    const meta = await get().saveFlow({ title: "Stored" });
    get().newFlow();
    await flushGc();
    expect(dataStore.size).toBe(0);

    const loaded = await get().loadFlowById(meta.id);
    expect(loaded).toEqual(meta);
    expect(get()).toMatchObject({
      id: meta.id,
      title: "Stored",
      saveStatus: "saved",
      lastSavedAt: meta.updatedAt,
    });
    expect(valueOf("src")).toEqual(rows);
    await flushMount();
    expect(get().edges.map((e) => e.id)).toEqual(["e1"]);
    await expect(get().loadFlowById("flow__missing")).rejects.toThrow(/was not found/);
  });

  it("autosave writes the session slot without touching the library", async () => {
    seedGraph();
    get().setTitle("Session");
    const flow = await get().autosave();
    expect(flow.title).toBe("Session");
    expect(get().saveStatus).toBe("saved");
    expect(get().lastSavedAt).toBe(flow.updatedAt);
    expect(await flowStorage.getItem("flow__autosave")).toEqual(flow);
    expect(await get().listFlows()).toEqual([]);
  });

  it("autosave is a no-op in demo mode", async () => {
    addNode("a");
    get().setDemoMode(true);
    expect(await get().autosave()).toBeNull();
    expect(await flowStorage.getItem("flow__autosave")).toBeNull();
    expect(get().saveStatus).toBe("idle");
  });

  it("autosave reports storage errors without throwing", async () => {
    addNode("a");
    vi.spyOn(flowStorage, "setItem").mockRejectedValue(new Error("QuotaExceededError"));
    expect(await get().autosave()).toBeNull();
    expect(get().saveStatus).toBe("error");
    expect(get().logs.at(-1)).toMatchObject({
      method: "error",
      data: [expect.stringMatching(/Autosave failed/), "QuotaExceededError"],
    });
  });

  it("restoreSession restores the autosaved canvas with data", async () => {
    expect(await get().restoreSession()).toBeNull();

    const rows = seedGraph();
    get().setMeta({ id: "flow__abc", title: "Restored", created_at: "2024-01-01" });
    const saved = await get().autosave();
    get().newFlow();
    await flushGc();

    const flow = await get().restoreSession();
    expect(flow.title).toBe("Restored");
    expect(get()).toMatchObject({
      id: "flow__abc",
      title: "Restored",
      saveStatus: "saved",
      lastSavedAt: saved.updatedAt,
      createdAt: "2024-01-01",
    });
    expect(valueOf("src")).toEqual(rows);
    await flushMount();
    expect(get().edges).toHaveLength(1);
  });

  it("restoreSession drops an unreadable snapshot and logs", async () => {
    await flowStorage.setItem("flow__autosave", { elements: "broken" });
    expect(await get().restoreSession()).toBeNull();
    expect(await flowStorage.getItem("flow__autosave")).toBeNull();
    expect(get().logs.at(-1)).toMatchObject({
      method: "error",
      data: ["The saved session could not be restored.", expect.any(String)],
    });
  });

  it("flushAutosave writes a synchronous localStorage copy that restoreSession prefers", async () => {
    const rows = seedGraph();
    get().setTitle("Flushed");
    const flow = get().flushAutosave();
    expect(flow.title).toBe("Flushed");
    expect(JSON.parse(localStorage.getItem("flow__autosave_pending")).title).toBe("Flushed");

    // Simulate an IndexedDB write that never committed: storage holds an older session.
    await flowStorage.setItem("flow__autosave", {
      ...flow,
      title: "Older",
      updatedAt: "2000-01-01",
    });
    get().newFlow();
    const restored = await get().restoreSession();
    expect(restored.title).toBe("Flushed");
    expect(valueOf("src")).toEqual(rows);
    await vi.waitFor(() => expect(localStorage.getItem("flow__autosave_pending")).toBeNull());
    expect((await flowStorage.getItem("flow__autosave")).title).toBe("Flushed");
  });

  it("restoreSession ignores a pending copy older than the stored session", async () => {
    seedGraph();
    const flow = get().flushAutosave();
    localStorage.setItem(
      "flow__autosave_pending",
      JSON.stringify({ ...flow, title: "Stale", updatedAt: "2000-01-01" }),
    );
    await flowStorage.setItem("flow__autosave", { ...flow, title: "Fresh" });
    expect((await get().restoreSession()).title).toBe("Fresh");
    expect(localStorage.getItem("flow__autosave_pending")).toBeNull();
  });

  it("autosave clears the pending copy and flushAutosave tolerates a full localStorage", async () => {
    seedGraph();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(get().flushAutosave()).not.toBeNull();
    vi.restoreAllMocks();
    localStorage.setItem("flow__autosave_pending", "{}");
    await get().autosave();
    expect(localStorage.getItem("flow__autosave_pending")).toBeNull();
  });

  it("restoreSession logs read failures", async () => {
    vi.spyOn(flowStorage, "getItem").mockRejectedValue(new Error("IDB closed"));
    expect(await get().restoreSession()).toBeNull();
    expect(get().logs.at(-1)).toMatchObject({
      method: "error",
      data: ["Reading the saved session failed.", "IDB closed"],
    });
  });

  it("exportFlow serializes the live canvas as v2 JSON with payloads", async () => {
    const rows = seedGraph();
    get().setTitle("Live");
    const json = await get().exportFlow();
    const doc = JSON.parse(json);
    expect(doc.version).toBe(FLOW_VERSION);
    expect(doc.title).toBe("Live");
    expect(doc.payloads).toEqual([{ data: rows }]);
    expect(doc.elements.map((e) => e.id)).toEqual(["src", "dst", "e1"]);

    // Round trip back through import.
    get().newFlow();
    await get().importFlow(json);
    expect(valueOf("src")).toEqual(rows);
  });

  it("exportFlow of the open flow id uses unsaved live edits", async () => {
    addNode("a");
    const meta = await get().saveFlow();
    addNode("b");
    const doc = JSON.parse(await get().exportFlow(meta.id));
    expect(doc.elements.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("exportFlow of another stored flow upgrades it to v2 and releases its payloads", async () => {
    const fixture = readJson("../../e2e/fixtures/v1-legacy-merge.datablocks.json");
    await flowStorage.setItem(fixture.id, fixture);
    addNode("open", { current: [{ q: 1 }] });
    await flushGc();
    const size = dataStore.size;

    const doc = JSON.parse(await get().exportFlow(fixture.id));
    expect(doc.version).toBe(FLOW_VERSION);
    expect(doc.id).toBe(fixture.id);
    expect(doc.title).toBe(fixture.title);
    expect(doc.createdAt).toBe(fixture.createdAt);
    expect(Array.isArray(doc.payloads)).toBe(true);
    const merge = doc.elements.find((e) => e.id === "merge");
    expect(merge.data.current).toEqual({ ref: expect.any(Number), type: TYPES.DATASET });
    expect(merge.data.baseData).toBeUndefined();
    expect(doc.payloads[merge.data.current.ref].data).toEqual([
      { key: "a", x: 1 },
      { key: "b", x: 2 },
      { key: "c", x: 3 },
    ]);
    // Exporting does not touch the open canvas.
    expect(get().nodes.map((n) => n.id)).toEqual(["open"]);
    await flushGc();
    expect(dataStore.size).toBe(size);

    await expect(get().exportFlow("flow__missing")).rejects.toThrow(/was not found/);
  });

  it("initPersistence writes default settings once", async () => {
    await initPersistence();
    expect(await flowStorage.getItem("flow__settings")).toEqual({ settingKey: false });
    await flowStorage.setItem("flow__settings", { settingKey: true });
    await initPersistence();
    expect(await flowStorage.getItem("flow__settings")).toEqual({ settingKey: true });
  });
});
