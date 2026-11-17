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
import { create } from "zustand";
import cloneDeep from "lodash-es/cloneDeep";
import localforage from "localforage";
import { nanoid } from "nanoid";
import { EdgeChangeset, NodeChangeset } from "@xyflow/react";
import execution from "../lib/execution";
import dataStore from "../lib/dataStore";
import { count, timed } from "../lib/perf";
import {
  STORAGE_WARN_RATIO,
  formatBytes,
  getStorageEstimate,
  requestPersistentStorage,
} from "../lib/storageHealth";
import { getFlowRect } from "../lib/download";
import {
  DEFAULT_TITLE,
  FLOW_VERSION,
  deserializeFlow,
  isEdge,
  isNode,
  serializeFlow,
} from "../lib/flowSerialization";

let logId = 0;

const SETTINGS_KEY = "flow__settings";
const INDEX_KEY = "flow__index";
const AUTOSAVE_KEY = "flow__autosave";
/**
 * Synchronous `localStorage` copy of the autosave, written when the page is hidden. IndexedDB
 * transactions started during unload are not guaranteed to commit, so a reload right after an
 * edit could otherwise restore an older session.
 */
const PENDING_AUTOSAVE_KEY = "flow__autosave_pending";
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

const pendingStore = () => {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
};

const readPendingAutosave = () => {
  try {
    const raw = pendingStore()?.getItem(PENDING_AUTOSAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const clearPendingAutosave = () => {
  try {
    pendingStore()?.removeItem(PENDING_AUTOSAVE_KEY);
  } catch {
    // Storage access can throw in locked-down browsers; the pending copy is best effort.
  }
};

// @xyflow/react 13 hands `onNodesChange`/`onEdgesChange` an iterable changeset; plain arrays
// (tests, internal callers) are accepted too.
const toChangeList = (changes) => (Array.isArray(changes) ? changes : [...changes]);
const applyNodeChanges = (changes, nodes) => new NodeChangeset(changes).applyTo(nodes);
const applyEdgeChanges = (changes, edges) => new EdgeChangeset(changes).applyTo(edges);

const isNewer = (a, b) => !b || String(a?.updatedAt || "") >= String(b.updatedAt || "");

/** Serialize live editor state (or the React Flow instance snapshot) into a flow document. */
const snapshot = (state, overrides = {}) => {
  const instance = state.flowInstance;
  const { nodes, edges, viewport } = instance
    ? instance.toObject()
    : { nodes: state.nodes, edges: state.edges, viewport: { x: 0, y: 0, zoom: 1 } };
  const id = Object.prototype.hasOwnProperty.call(overrides, "id") ? overrides.id : state.id;
  return timed("serialize", () =>
    serializeFlow({
      nodes,
      edges,
      viewport,
      id,
      title: overrides.title ?? state.title,
      createdAt: overrides.createdAt ?? state.createdAt,
      updatedAt: overrides.updatedAt,
    }),
  );
};

/**
 * Monotonic token for flow loads. Edge insertion is deferred until nodes have mounted, so a
 * later load must invalidate an earlier timer; otherwise stale edges land on the new canvas.
 */
let loadGeneration = 0;

/**
 * Run `fn` once freshly set nodes have committed and painted (one frame, then a macrotask), so
 * React Flow has measured their handles before edges reference them. This replaces a fixed
 * 250ms delay that left the canvas idle on every load.
 */
const afterNodesMount = (fn) => {
  if (typeof requestAnimationFrame === "undefined") {
    setTimeout(fn, 0);
    return;
  }
  requestAnimationFrame(() => setTimeout(fn, 0));
};

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
 * Releases DataStore entries no node references any more. Calls within one tick are coalesced.
 * History snapshots hold payloads by reference (not by id), so collecting here never breaks undo.
 */
let gcTimer = null;
let storageWarned = false;
/**
 * After a successful write: ask for persistent storage once, and warn (once per session) when
 * usage passes STORAGE_WARN_RATIO of the quota, before writes start failing.
 */
const afterStorageWrite = async () => {
  requestPersistentStorage();
  if (storageWarned) return;
  const estimate = await getStorageEstimate();
  if (!estimate || estimate.ratio < STORAGE_WARN_RATIO) return;
  storageWarned = true;
  useStore.getState().addLogs({
    method: "warn",
    data: [
      `Browser storage is ${Math.round(estimate.ratio * 100)}% full (${formatBytes(estimate.usage)} of ${formatBytes(estimate.quota)}). Export and delete old flows to keep saving.`,
    ],
  });
};
const collectData = () => {
  gcTimer = null;
  const ids = new Set();
  useStore.getState().nodes.forEach((node) => {
    const current = node.data?.current;
    if (typeof current === "string") ids.add(current);
  });
  const released = dataStore.retainOnly(ids);
  if (released) count("dataGcReleased", released);
};
const scheduleDataGc = () => {
  if (gcTimer === null) gcTimer = setTimeout(collectData, 0);
};

/**
 * History entries reuse the flow serialization format (`{ elements, payloads }`), so payloads are
 * pinned by reference while editing and re-inserted through `dataStore.set` on restore.
 */
const captureHistory = (state) => {
  const { elements, payloads } = serializeFlow({ nodes: state.nodes, edges: state.edges });
  return { elements, payloads };
};

const pushHistoryEntry = (entry) => {
  useStore.setState((state) => ({
    history: {
      past: state.history.past.concat([entry]).slice(-HISTORY_LIMIT),
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
const applyHistorySnapshot = (entry) => {
  const flow = deserializeFlow({ version: FLOW_VERSION, ...entry });
  const { nodes, edges } = splitFlow(flow);
  useStore.setState({ nodes, edges, selectedNode: null, selectedNodeId: null });
  scheduleDataGc();
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
  afterNodesMount(() => {
    if (generation !== loadGeneration) return;
    useStore.getState().addEdges(edges);
  });
  useStore.setState({
    saveStatus: meta.saveStatus || "idle",
    lastSavedAt: meta.lastSavedAt || null,
  });
  scheduleDataGc();
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
  undo: () =>
    timed("undo", () => {
      const { history } = get();
      if (!history.past.length) return false;
      const past = history.past.slice();
      const entry = past.pop();
      const future = [captureHistory(get()), ...history.future];
      resetHistoryTracking();
      applyHistorySnapshot(entry);
      set({ history: { past, future } });
      return true;
    }),
  redo: () =>
    timed("redo", () => {
      const { history } = get();
      if (!history.future.length) return false;
      const [entry, ...future] = history.future;
      const past = history.past.concat([captureHistory(get())]).slice(-HISTORY_LIMIT);
      resetHistoryTracking();
      applyHistorySnapshot(entry);
      set({ history: { past, future } });
      return true;
    }),
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
    // `payload.position` is relative to the canvas element (see Flow's context menu); convert it
    // with the current viewport, as react-flow-renderer's `project` did.
    const viewport = flowInstance?.getViewport?.();
    const position =
      viewport && payload.position
        ? {
            x: (payload.position.x - viewport.x) / viewport.zoom,
            y: (payload.position.y - viewport.y) / viewport.zoom,
          }
        : center;
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
    const target = get().nodes.find((node) => node.id === id);
    if (!target) return;
    const patch = { ...data };
    let replacedCurrent = false;
    if (Object.prototype.hasOwnProperty.call(patch, "current")) {
      if (dataStore.isSameValue(target.data?.current, patch.current)) {
        // A pass-through republishing the same reference: keep the id so nothing downstream
        // re-renders or recomputes.
        delete patch.current;
      } else {
        patch.current = dataStore.set(patch.current);
        replacedCurrent = true;
      }
    }
    const keys = Object.keys(patch);
    if (!keys.length || keys.every((key) => Object.is(target.data?.[key], patch[key]))) return;
    if (!transient && keys.some((key) => key !== "current")) {
      get().recordHistory(`update:${id}`);
    }
    const nextData = { ...target.data, ...patch };
    set({
      nodes: get().nodes.map((node) => (node.id === id ? { ...node, data: nextData } : node)),
    });
    if (replacedCurrent) scheduleDataGc();
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
    const label = isValid ? "×" : "⚠";
    let changed = false;
    const edges = get().edges.map((e) => {
      if (
        (e.source === source || e.sourceHandle === source) &&
        (e.target === target || e.targetHandle === target) &&
        (e.animated !== isValid || e.label !== label)
      ) {
        changed = true;
        return { ...e, animated: isValid, label };
      }
      return e;
    });
    // Unchanged validity must not produce a new edges array (that re-renders every edge).
    if (changed) set({ edges });
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
  /**
   * Embedder entry point (`<App data={{ flow: [doc] }} />`). Accepts the same documents as
   * import (v2, v1, legacy) and rehydrates every `current` through the dataStore.
   */
  setFlowData: async (flow) => {
    if (!flow) return;
    let doc;
    try {
      doc = deserializeFlow({ elements: [], ...flow });
    } catch (error) {
      get().addLogs({ method: "error", data: ["The provided flow is invalid.", error.message] });
      return;
    }
    const { nodes, edges } = splitFlow(doc);
    const state = get();
    state.setMeta(flow);
    state.setElements(nodes);
    state.setFlowTransform(doc.viewport);
    state.selectNode(null);
    state.clearHistory();
    const generation = ++loadGeneration;
    afterNodesMount(() => {
      if (generation !== loadGeneration) return;
      useStore.getState().addEdges(edges);
    });
    scheduleDataGc();
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
      afterStorageWrite();
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
      await timed("autosave", () => storage.setItem(AUTOSAVE_KEY, flow));
      clearPendingAutosave();
      afterStorageWrite();
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
  /**
   * Page-hide flush: synchronously copies the snapshot to `localStorage` (best effort, it may
   * exceed the quota for large flows) and starts the regular IndexedDB write.
   */
  flushAutosave: () => {
    const state = get();
    if (state.demoMode) return null;
    const flow = snapshot(state, { updatedAt: new Date().toISOString() });
    try {
      pendingStore()?.setItem(PENDING_AUTOSAVE_KEY, JSON.stringify(flow));
    } catch {
      // Quota exceeded or storage unavailable: fall back to the asynchronous write alone.
    }
    storage.setItem(AUTOSAVE_KEY, flow).catch(() => {});
    return flow;
  },
  /** Restore the last session after a reload. Returns the restored flow or null. */
  restoreSession: async () => {
    let stored;
    const pending = readPendingAutosave();
    try {
      stored = await storage.getItem(AUTOSAVE_KEY);
    } catch (error) {
      if (!pending) {
        get().addLogs({
          method: "error",
          data: ["Reading the saved session failed.", error.message],
        });
        return null;
      }
    }
    if (pending) {
      if (isNewer(pending, stored)) {
        stored = pending;
        // Move the page-hide copy into IndexedDB, then drop it.
        storage
          .setItem(AUTOSAVE_KEY, pending)
          .then(clearPendingAutosave)
          .catch(() => {});
      } else {
        clearPendingAutosave();
      }
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
      clearPendingAutosave();
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
    // Drop edges still waiting for a previous load's nodes to mount.
    loadGeneration += 1;
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
    scheduleDataGc();
  },
  /**
   * Serialize a flow for download. Without an id (or for the flow currently open) the live
   * canvas is used, so unsaved edits are included. Otherwise the stored document is returned.
   */
  exportFlow: async (id) => {
    const state = get();
    if (!id || id === state.id) {
      return timed("export", () => JSON.stringify(snapshot(state)));
    }
    const stored = await storage.getItem(id);
    if (!stored) throw new Error(`Flow "${id}" was not found.`);
    // Library entries may predate v2; re-serializing upgrades them and deduplicates payloads.
    const { nodes, edges } = splitFlow(deserializeFlow(stored));
    const flow = serializeFlow({ ...stored, nodes, edges });
    scheduleDataGc();
    return JSON.stringify(flow);
  },
  /** Parse, validate, and load a flow document. Throws on invalid input. */
  importFlow: async (input) => {
    return timed("import", () => {
      const parsed = typeof input === "string" ? JSON.parse(input) : input;
      const flow = deserializeFlow(parsed);
      applyFlow(flow, { saveStatus: "idle" });
      return toMeta(flow);
    });
  },
  removeElements: (elements) => {
    const ids = elements.map((e) => e.id);
    recordRemovalHistory(get());
    dragBaseline = null;
    const { nodes, edges, selectedNodeId } = get();
    const remaining = nodes.filter((n) => !ids.includes(n.id));
    // Cached payloads that no surviving node references are released by the next GC pass.
    scheduleDataGc();
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
    scheduleDataGc();
  },
  addNodes: (nodes) => set({ nodes: get().nodes.concat(nodes) }),
  addEdges: (edges) => set({ edges: get().edges.concat(edges) }),
  onNodesChange: (changeset) => {
    const changes = toChangeList(changeset);
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
        entry: captureHistory(get()),
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
        pushHistoryEntry(baseline.entry);
        lastHistoryKey = null;
        lastHistoryAt = 0;
      }
    }
  },
  onEdgesChange: (changeset) => {
    const changes = toChangeList(changeset);
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
