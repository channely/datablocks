/**
 * Global application store (zustand v3).
 *
 * Two logical slices share one store:
 * - UI state: modal, demo mode, logs, and the dependency list used by the JS sandbox.
 * - Flow state: nodes, edges, selection, viewport, local persistence, and flow metadata.
 *
 * Important: node payloads never contain raw datasets. `data.current` is an id pointing into
 * `lib/dataStore`; `addNode`/`updateNodeData` convert values to ids, and saved flows are
 * serialized through `lib/flowSerialization` (which re-inserts them on the way back in).
 * See docs/ARCHITECTURE.md.
 *
 * Local storage keys (localforage database `datablocks`, store `flows`):
 * - `flow__settings`   preference blob (reserved for future settings)
 * - `flow__index`      library metadata: `[{ id, title, createdAt, updatedAt, nodeCount }]`
 * - `flow__<id>`       one flow document per saved flow
 * - `flow__autosave`   latest session snapshot; restored on reload, never listed in the library
 */
import create from "zustand";
import cloneDeep from "lodash-es/cloneDeep";
import localforage from "localforage";
import { nanoid } from "nanoid";
import { applyEdgeChanges, applyNodeChanges, isEdge, isNode } from "react-flow-renderer";
import execution from "../lib/execution";
import dataStore from "../lib/dataStore";
import { getFlowRect } from "../lib/download";
import {
  DEFAULT_TITLE,
  FLOW_VERSION,
  deserializeFlow,
  serializeFlow,
} from "../lib/flowSerialization";

let logId = 0;

const SETTINGS_KEY = "flow__settings";
const INDEX_KEY = "flow__index";
const AUTOSAVE_KEY = "flow__autosave";
const FLOW_PREFIX = "flow__";
const DEFAULT_SETTINGS = { settingKey: false };

/** Base-aware path to the static flow files in `public/data/flows`. */
const FLOWS_BASE = `${import.meta.env.BASE_URL}data/flows`;

const storage = localforage.createInstance({ name: "datablocks", storeName: "flows" });
export const flowStorage = storage;

/** Slim library record derived from a full flow document. */
const toMeta = (flow) => ({
  id: flow.id,
  title: flow.title || DEFAULT_TITLE,
  createdAt: flow.createdAt || null,
  updatedAt: flow.updatedAt || null,
  nodeCount: (flow.elements || []).filter(isNode).length,
});

/**
 * Rebuild `flow__index` by scanning stored flows. Used when the index is missing or damaged so
 * a failed index write cannot permanently hide saved work.
 */
const rebuildIndex = async () => {
  const keys = await storage.keys();
  const entries = [];
  for (const key of keys) {
    if (
      !key.startsWith(FLOW_PREFIX) ||
      key === SETTINGS_KEY ||
      key === INDEX_KEY ||
      key === AUTOSAVE_KEY
    ) {
      continue;
    }
    const flow = await storage.getItem(key);
    if (flow?.elements) entries.push(toMeta(flow));
  }
  entries.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  await storage.setItem(INDEX_KEY, entries);
  return entries;
};

const readIndex = async () => {
  const stored = await storage.getItem(INDEX_KEY);
  return Array.isArray(stored) ? stored : rebuildIndex();
};

const upsertIndex = async (meta) => {
  const index = await readIndex();
  const next = [meta, ...index.filter((entry) => entry.id !== meta.id)];
  await storage.setItem(INDEX_KEY, next);
  return next;
};

const removeFromIndex = async (id) => {
  const index = await readIndex();
  await storage.setItem(
    INDEX_KEY,
    index.filter((entry) => entry.id !== id),
  );
};

const splitFlow = (flow) => ({
  nodes: (flow.elements || []).filter(isNode),
  edges: (flow.elements || []).filter(isEdge),
});

/** Serialize live editor state (or the React Flow instance snapshot) into a flow document. */
const snapshot = (state, overrides = {}) => {
  const instance = state.flowInstance;
  const { nodes, edges, viewport } = instance
    ? instance.toObject()
    : { nodes: state.nodes, edges: state.edges, viewport: { x: 0, y: 0, zoom: 1 } };
  const id = Object.prototype.hasOwnProperty.call(overrides, "id") ? overrides.id : state.id;
  return serializeFlow({
    nodes,
    edges,
    viewport,
    id,
    title: overrides.title ?? state.title,
    createdAt: overrides.createdAt ?? state.createdAt,
    updatedAt: overrides.updatedAt,
  });
};

/**
 * Monotonic token for flow loads. Edge insertion is deferred until nodes have mounted, so a
 * later load must invalidate an earlier timer; otherwise stale edges land on the new canvas.
 */
let loadGeneration = 0;

const HISTORY_LIMIT = 100;
/** A burst of edits on the same node (typing, slider) becomes a single undo step. */
const HISTORY_COALESCE_MS = 600;

let lastHistoryKey = null;
let lastHistoryAt = 0;
/** React Flow reports edge removals before node removals for one delete gesture. */
const REMOVAL_COALESCE_MS = 150;
let lastRemovalAt = 0;
/** Pre-drag snapshot; committed on drag end only when a node actually moved. */
let dragBaseline = null;

const resetHistoryTracking = () => {
  lastHistoryKey = null;
  lastHistoryAt = 0;
  lastRemovalAt = 0;
  dragBaseline = null;
};

/**
 * History entries reuse the flow serialization format, so `data.current` payloads are pinned by
 * reference while editing and re-inserted through `dataStore.set` on restore.
 */
const captureHistory = (state) =>
  serializeFlow({ nodes: state.nodes, edges: state.edges }).elements;

const pushHistoryEntry = (elements) => {
  useStore.setState((state) => ({
    history: {
      past: state.history.past.concat([elements]).slice(-HISTORY_LIMIT),
      future: [],
    },
  }));
};

/**
 * A single delete gesture can arrive as two change batches (connected edges, then nodes).
 * Record the pre-gesture state once so undo restores node and edges together.
 */
const recordRemovalHistory = (state) => {
  const now = Date.now();
  if (now - lastRemovalAt < REMOVAL_COALESCE_MS) return;
  lastRemovalAt = now;
  lastHistoryKey = null;
  lastHistoryAt = 0;
  pushHistoryEntry(captureHistory(state));
};

/**
 * Swap the canvas for a historical snapshot. Payloads that only the replaced state referenced are
 * released; snapshots keep their own references, so undoing a delete restores the data.
 */
const applyHistorySnapshot = (elements) => {
  const flow = deserializeFlow({ version: FLOW_VERSION, elements });
  const { nodes, edges } = splitFlow(flow);
  const state = useStore.getState();
  const used = new Set(
    nodes.map((node) => node.data?.current).filter((current) => typeof current === "string"),
  );
  state.nodes
    .map((node) => node.data?.current)
    .filter((current) => typeof current === "string")
    .forEach((current) => {
      if (!used.has(current)) dataStore.remove(current);
    });
  useStore.setState({ nodes, edges, selectedNode: null, selectedNodeId: null });
};

/** Replace editor contents from a deserialized flow (edges are deferred like React Flow expects). */
const applyFlow = (flow, meta = {}) => {
  const { nodes, edges } = splitFlow(flow);
  const state = useStore.getState();
  state.setMeta({
    id: flow.id || null,
    title: flow.title || DEFAULT_TITLE,
    created_at: flow.createdAt || null,
    updated_at: flow.updatedAt || null,
  });
  state.setElements(nodes);
  state.setFlowTransform(flow.viewport);
  state.selectNode(null);
  state.clearHistory();
  const generation = ++loadGeneration;
  // Edges are added after the nodes have mounted; mirrors the reference loading behavior.
  setTimeout(() => {
    if (generation !== loadGeneration) return;
    useStore.getState().addEdges(edges);
  }, 250);
  useStore.setState({
    saveStatus: meta.saveStatus || "idle",
    lastSavedAt: meta.lastSavedAt || null,
  });
};

const uiStore = (set, get) => ({
  dropDownOpen: false,
  demoMode: false,
  modal: null,
  sidebarTooltip: null,
  logs: [],
  dependencies: [],
  onFlowSaveCallback: null,
  setDemoMode: (demoMode) => set({ demoMode }),
  setDropDownOpen: (dropDownOpen) => set({ dropDownOpen }),
  setModal: (modal) => set({ modal }),
  setOnFlowSaveCallback: (onFlowSaveCallback) => set({ onFlowSaveCallback }),
  addDependency: (dependency) => {
    const dependencies = get().dependencies;
    if (!dependencies.some((d) => d.name === dependency.name)) {
      const next = dependencies.concat([dependency]);
      set({ dependencies: next });
      execution.updateDependencies(next.map((d) => d.name));
    }
  },
  removeDependency: (dependency) => {
    const next = get().dependencies.filter((d) => d.name !== dependency.name);
    set({ dependencies: next });
    execution.updateDependencies(next.map((d) => d.name));
  },
  addLogs: (logs) => {
    const current = get().logs;
    const list = (Array.isArray(logs) ? logs : [logs]).map((log) => ({
      id: logId++,
      ...log,
    }));
    set({ logs: current.concat(list) });
  },
  clearLogs: () => set({ logs: [] }),
});

const flowStore = (set, get) => ({
  id: null,
  title: DEFAULT_TITLE,
  isPublic: false,
  updatedAt: null,
  createdAt: null,
  saveStatus: "idle",
  lastSavedAt: null,
  nodes: [],
  edges: [],
  inputNodeModalData: null,
  flowInstance: null,
  flowTransform: null,
  selectedNodeId: null,
  selectedNode: null,
  codeEditorFocus: false,
  history: { past: [], future: [] },
  setTitle: (title) => {
    const next = (title || "").trim();
    if (next) set({ title: next });
  },
  /** Record the canvas before an edit. Repeated edits on one node coalesce into one step. */
  recordHistory: (actionKey = null) => {
    const now = Date.now();
    if (actionKey && actionKey === lastHistoryKey && now - lastHistoryAt < HISTORY_COALESCE_MS) {
      lastHistoryAt = now;
      return false;
    }
    pushHistoryEntry(captureHistory(get()));
    lastHistoryKey = actionKey;
    lastHistoryAt = now;
    return true;
  },
  undo: () => {
    const { history } = get();
    if (!history.past.length) return false;
    const past = history.past.slice();
    const elements = past.pop();
    const future = [captureHistory(get()), ...history.future];
    resetHistoryTracking();
    applyHistorySnapshot(elements);
    set({ history: { past, future } });
    return true;
  },
  redo: () => {
    const { history } = get();
    if (!history.future.length) return false;
    const [elements, ...future] = history.future;
    const past = history.past.concat([captureHistory(get())]).slice(-HISTORY_LIMIT);
    resetHistoryTracking();
    applyHistorySnapshot(elements);
    set({ history: { past, future } });
    return true;
  },
  clearHistory: () => {
    resetHistoryTracking();
    set({ history: { past: [], future: [] } });
  },
  addElement: (element) => {
    get().recordHistory();
    if (element.target) {
      const edges = get().edges.filter(
        (e) => !(e.target === element.target && e.targetHandle === element.targetHandle),
      );
      set({ edges: edges.concat([element]) });
    } else {
      const nodes = get().nodes;
      set({ nodes: nodes.concat([element]) });
    }
  },
  addNode: (payload = {}) => {
    const state = get();
    const flowInstance = state.flowInstance;
    const addElement = state.addElement;
    const data = payload.data || {};
    const { type: _type, current, ...rest } = data;
    const rect = getFlowRect();
    const center = rect ? { x: rect.width / 2 - 150, y: rect.height / 2 - 40 } : { x: 0, y: 0 };
    const position =
      flowInstance && payload.position ? flowInstance.project(payload.position) : center;
    if (current) rest.current = dataStore.set(current);
    const node = {
      id: payload.id || nanoid(),
      type: payload.type || "default",
      data: rest,
      position,
    };
    return addElement(node);
  },
  /**
   * Patch node data. Derived results (`current` only) are excluded from history; `transient`
   * marks effect-driven writes, such as auto-fills when an upstream dataset changes.
   */
  updateNodeData: ({ id, data = {}, transient = false }) => {
    if (!transient && Object.keys(data).some((key) => key !== "current")) {
      get().recordHistory(`update:${id}`);
    }
    const nodes = get().nodes.map((node) => {
      if (node.id === id) {
        if (Object.prototype.hasOwnProperty.call(data, "current")) {
          const current = dataStore.set(data.current);
          node.data = { ...node.data, ...data, current };
        } else {
          node.data = { ...node.data, ...data };
        }
      }
      return node;
    });
    set({ nodes });
  },
  addEdge: (edge = {}) => {
    const addElement = get().addElement;
    if (!edge.source || !edge.target || edge.target === edge.source) return false;
    const newEdge = {
      id: edge.id || nanoid(),
      type: edge.type || "default",
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      animated: true,
      style: edge.style,
    };
    return addElement(newEdge);
  },
  setConnectionValid: ({ source, target, isValid }) => {
    const edges = get().edges.map((e) => {
      if (
        (e.source === source || e.sourceHandle === source) &&
        (e.target === target || e.targetHandle === target)
      ) {
        return { ...e, animated: isValid, label: isValid ? "×" : "⚠" };
      }
      return e;
    });
    set({ edges });
  },
  setId: (id) => set({ id }),
  setMeta: ({ id, title, is_public, updated_at, created_at }) =>
    set({
      id,
      title: title || DEFAULT_TITLE,
      isPublic: is_public,
      createdAt: created_at,
      updatedAt: updated_at,
    }),
  setFlowData: async (flow) => {
    const nodes = (flow?.elements || []).filter(isNode);
    const edges = (flow?.elements || []).filter(isEdge);
    const state = get();
    state.setMeta(flow);
    state.setElements(nodes);
    state.setFlowTransform({
      x: flow?.viewport?.x || flow?.x || 0,
      y: flow?.viewport?.y || flow?.y || 0,
      zoom: flow?.viewport?.zoom || flow?.zoom || 1,
    });
    state.selectNode(null);
    state.clearHistory();
    const generation = ++loadGeneration;
    setTimeout(() => {
      if (generation !== loadGeneration) return;
      state.addEdges(edges);
    }, 250);
  },
  /** Load a static reference flow (for example `introduction`) from `public/data/flows`. */
  loadFlow: async (name) => {
    const response = await fetch(`${FLOWS_BASE}/${name}.json`);
    if (!response.ok) throw new Error(`Could not load flow "${name}".`);
    const flow = deserializeFlow(await response.json());
    const title = name.charAt(0).toUpperCase() + name.slice(1).replace(/-/g, " ");
    applyFlow({ ...flow, id: null, title }, { saveStatus: "idle" });
  },
  /** Persist the current canvas into the library (creating an entry when `id` is new). */
  saveFlow: async ({ id, title } = {}) => {
    const state = get();
    const now = new Date().toISOString();
    // Explicit `null` means "create a new entry" (Save as…); `undefined` reuses the open flow.
    const flowId = id === null ? `flow__${nanoid()}` : id || state.id || `flow__${nanoid()}`;
    set({ saveStatus: "saving" });
    try {
      const flow = snapshot(state, {
        id: flowId,
        title: title || state.title,
        createdAt: state.id === flowId && state.createdAt ? state.createdAt : now,
        updatedAt: now,
      });
      await storage.setItem(flowId, flow);
      const meta = toMeta(flow);
      await upsertIndex(meta);
      set({
        id: flowId,
        title: flow.title,
        createdAt: flow.createdAt,
        updatedAt: now,
        saveStatus: "saved",
        lastSavedAt: now,
      });
      return meta;
    } catch (error) {
      set({ saveStatus: "error" });
      get().addLogs({
        method: "error",
        data: [
          "Saving the flow failed. Browser storage may be full; export the flow and remove old entries.",
          error.message,
        ],
      });
      throw error;
    }
  },
  /** Write the session snapshot without creating/updating a library entry. */
  autosave: async () => {
    if (get().demoMode) return null;
    const state = get();
    const now = new Date().toISOString();
    try {
      const flow = snapshot(state, { updatedAt: now });
      await storage.setItem(AUTOSAVE_KEY, flow);
      set({ saveStatus: "saved", lastSavedAt: now });
      return flow;
    } catch (error) {
      set({ saveStatus: "error" });
      get().addLogs({
        method: "error",
        data: [
          "Autosave failed. Browser storage may be full; export the flow and remove old entries.",
          error.message,
        ],
      });
      return null;
    }
  },
  /** Restore the last session after a reload. Returns the restored flow or null. */
  restoreSession: async () => {
    let stored;
    try {
      stored = await storage.getItem(AUTOSAVE_KEY);
    } catch (error) {
      get().addLogs({
        method: "error",
        data: ["Reading the saved session failed.", error.message],
      });
      return null;
    }
    if (!stored) return null;
    try {
      const flow = deserializeFlow(stored);
      applyFlow(flow, {
        saveStatus: "saved",
        lastSavedAt: flow.updatedAt || null,
      });
      return flow;
    } catch (error) {
      // Drop the unreadable snapshot so the next reload starts clean instead of failing again.
      await storage.removeItem(AUTOSAVE_KEY).catch(() => {});
      get().addLogs({
        method: "error",
        data: ["The saved session could not be restored.", error.message],
      });
      return null;
    }
  },
  listFlows: async () => {
    const index = await readIndex();
    return [...index].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  },
  loadFlowById: async (id) => {
    const stored = await storage.getItem(id);
    if (!stored) throw new Error(`Flow "${id}" was not found.`);
    const flow = deserializeFlow(stored);
    applyFlow({ ...flow, id }, { saveStatus: "saved", lastSavedAt: flow.updatedAt });
    return toMeta(flow);
  },
  renameFlow: async (id, title) => {
    const nextTitle = (title || "").trim();
    if (!nextTitle) throw new Error("A flow name is required.");
    const flow = await storage.getItem(id);
    if (!flow) throw new Error(`Flow "${id}" was not found.`);
    const now = new Date().toISOString();
    const updated = { ...flow, title: nextTitle, updatedAt: now };
    await storage.setItem(id, updated);
    await upsertIndex(toMeta(updated));
    if (get().id === id) set({ title: nextTitle, updatedAt: now });
    return toMeta(updated);
  },
  duplicateFlow: async (id) => {
    const source = await storage.getItem(id);
    if (!source) throw new Error(`Flow "${id}" was not found.`);
    const now = new Date().toISOString();
    const copy = {
      ...cloneDeep(source),
      id: `flow__${nanoid()}`,
      title: `${source.title || DEFAULT_TITLE} copy`,
      createdAt: now,
      updatedAt: now,
    };
    await storage.setItem(copy.id, copy);
    await upsertIndex(toMeta(copy));
    return toMeta(copy);
  },
  deleteFlow: async (id) => {
    await storage.removeItem(id);
    await removeFromIndex(id);
    if (get().id === id) {
      set({
        id: null,
        title: DEFAULT_TITLE,
        createdAt: null,
        updatedAt: null,
        saveStatus: "idle",
        lastSavedAt: null,
      });
    }
  },
  /** Start an empty flow. The previous canvas remains in the autosave until overwritten. */
  newFlow: () => {
    set({
      id: null,
      title: DEFAULT_TITLE,
      createdAt: null,
      updatedAt: null,
      saveStatus: "idle",
      lastSavedAt: null,
      selectedNode: null,
      selectedNodeId: null,
    });
    get().setElements([]);
    get().setFlowTransform({ x: 0, y: 0, zoom: 1 });
    get().clearHistory();
  },
  /**
   * Serialize a flow for download. Without an id (or for the flow currently open) the live
   * canvas is used, so unsaved edits are included. Otherwise the stored document is returned.
   */
  exportFlow: async (id) => {
    const state = get();
    if (!id || id === state.id) {
      return JSON.stringify(snapshot(state), null, 2);
    }
    const stored = await storage.getItem(id);
    if (!stored) throw new Error(`Flow "${id}" was not found.`);
    return JSON.stringify(stored, null, 2);
  },
  /** Parse, validate, and load a flow document. Throws on invalid input. */
  importFlow: async (input) => {
    const parsed = typeof input === "string" ? JSON.parse(input) : input;
    const flow = deserializeFlow(parsed);
    applyFlow(flow, { saveStatus: "idle" });
    return toMeta(flow);
  },
  removeElements: (elements) => {
    const ids = elements.map((e) => e.id);
    recordRemovalHistory(get());
    dragBaseline = null;
    const { nodes, edges, selectedNodeId } = get();
    const remaining = nodes.filter((n) => !ids.includes(n.id));
    const removedCurrents = nodes
      .filter((n) => ids.includes(n.id))
      .map((n) => n.data?.current)
      .filter((current) => typeof current === "string");
    // Release cached payloads that no surviving node still references.
    const stillUsed = new Set(
      remaining.map((n) => n.data?.current).filter((current) => typeof current === "string"),
    );
    removedCurrents.forEach((current) => {
      if (!stillUsed.has(current)) dataStore.remove(current);
    });
    set({
      nodes: remaining,
      edges: edges.filter(
        (e) => !ids.includes(e.id) && !ids.includes(e.source) && !ids.includes(e.target),
      ),
      ...(ids.includes(selectedNodeId) ? { selectedNode: null, selectedNodeId: null } : {}),
    });
  },
  closeInputNodeModal: () => set({ inputNodeModalData: null }),
  setInputNodeModalData: (inputNodeModalData) => set({ inputNodeModalData }),
  setFlowInstance: (flowInstance) => set({ flowInstance }),
  setElements: (elements) => {
    set({ nodes: elements.filter(isNode), edges: elements.filter(isEdge) });
  },
  addNodes: (nodes) => set({ nodes: get().nodes.concat(nodes) }),
  addEdges: (edges) => set({ edges: get().edges.concat(edges) }),
  onNodesChange: (changes) => {
    const { codeEditorFocus, nodes } = get();
    if (codeEditorFocus) return;
    // React Flow removes nodes on Backspace; route those through removeElements so cached
    // payloads are released and a stale selection is cleared, like the node remove button.
    const removed = changes.filter((change) => change.type === "remove");
    if (removed.length) {
      get().removeElements(removed.map((change) => ({ id: change.id })));
      const rest = changes.filter((change) => change.type !== "remove");
      if (rest.length) set({ nodes: applyNodeChanges(rest, get().nodes) });
      return;
    }
    // A drag is recorded once, from the position map before the first move.
    const startDrag = changes.some((change) => change.type === "position" && change.dragging);
    const endDrag = changes.some(
      (change) => change.type === "position" && change.dragging === false,
    );
    if (startDrag && !dragBaseline) {
      dragBaseline = {
        elements: captureHistory(get()),
        positions: new Map(nodes.map((node) => [node.id, `${node.position.x},${node.position.y}`])),
      };
    }
    set({ nodes: applyNodeChanges(changes, nodes) });
    if (endDrag && dragBaseline) {
      const baseline = dragBaseline;
      dragBaseline = null;
      const moved = get().nodes.some(
        (node) => baseline.positions.get(node.id) !== `${node.position.x},${node.position.y}`,
      );
      if (moved) {
        pushHistoryEntry(baseline.elements);
        lastHistoryKey = null;
        lastHistoryAt = 0;
      }
    }
  },
  onEdgesChange: (changes) => {
    const { edges } = get();
    const removes = changes.filter((change) => change.type === "remove");
    // Node deletion reports its connected edges first; record here while the snapshot still
    // contains the nodes, then let removeElements coalesce into the same entry.
    if (removes.length) recordRemovalHistory(get());
    set({ edges: applyEdgeChanges(changes, edges) });
  },
  setFlowTransform: (flowTransform) => set({ flowTransform }),
  selectNode: (node) => {
    set({ selectedNode: node || null, selectedNodeId: node ? node.id : null });
  },
  setCodeEditorFocused: (codeEditorFocus) => set({ codeEditorFocus }),
});

const useStore = create((set, get) => ({
  ...uiStore(set, get),
  ...flowStore(set, get),
}));

export const initPersistence = async () => {
  const settings = await storage.getItem(SETTINGS_KEY);
  if (!settings) {
    await storage.setItem(SETTINGS_KEY, DEFAULT_SETTINGS);
  }
};

export default useStore;
