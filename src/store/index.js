/**
 * Global application store (zustand v3).
 *
 * Two logical slices share one store:
 * - UI state: modal, demo mode, logs, and the dependency list used by the JS sandbox.
 * - Flow state: nodes, edges, selection, viewport, persistence, and flow metadata.
 *
 * Important: node payloads never contain raw datasets. `data.current` is an id pointing into
 * `lib/dataStore`; `addNode`/`updateNodeData` convert values to ids and `restoreElements`
 * rehydrates them when a flow is loaded. See docs/ARCHITECTURE.md.
 */
import create from "zustand";
import cloneDeep from "lodash-es/cloneDeep";
import localforage from "localforage";
import { nanoid } from "nanoid";
import { applyEdgeChanges, applyNodeChanges, isEdge, isNode } from "react-flow-renderer";
import execution from "../lib/execution";
import dataStore from "../lib/dataStore";
import { getFlowRect } from "../lib/download";

let logId = 0;

const SETTINGS_KEY = "flow__settings";
const DEFAULT_SETTINGS = { settingKey: false };

/** Base-aware path to the static flow files in `public/data/flows`. */
const FLOWS_BASE = `${import.meta.env.BASE_URL}data/flows`;

const storage = localforage.createInstance({ name: "datablocks", storeName: "flows" });
export const flowStorage = storage;

/**
 * Replaces serialized `data.current` values with DataStore ids.
 * Mutates the passed flow; callers own the parsed object.
 */
const restoreElements = (flow) => {
  if (flow?.elements) {
    flow.elements = flow.elements.map((element) => {
      if (isNode(element) && element.data.current) {
        const { data, type } = element.data.current;
        element.data.current = dataStore.set(data, type);
      }
      return element;
    });
  }
  return flow;
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
  title: null,
  isPublic: false,
  updatedAt: null,
  createdAt: null,
  nodes: [],
  edges: [],
  inputNodeModalData: null,
  flowInstance: null,
  flowTransform: null,
  selectedNodeId: null,
  selectedNode: null,
  codeEditorFocus: false,
  setTitle: (title) => {
    if (title) set({ title });
  },
  addElement: (element) => {
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
  updateNodeData: ({ id, data = {} }) => {
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
      title,
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
      x: flow?.viewport?.x || 0,
      y: flow?.viewport?.y || 0,
      zoom: flow?.viewport?.zoom || 1,
    });
    setTimeout(() => {
      state.addEdges(edges);
    }, 250);
  },
  loadFlow: async (name) => {
    const response = await fetch(`${FLOWS_BASE}/${name}.json`);
    const flow = await response.json();
    restoreElements(flow);
    const state = get();
    const nodes = (flow?.elements || []).filter(isNode);
    const edges = (flow?.elements || []).filter(isEdge);
    state.setElements(nodes);
    state.setFlowTransform({
      x: flow?.x || 0,
      y: flow?.y || 0,
      zoom: flow?.zoom || 1,
    });
    setTimeout(() => state.addEdges(edges), 250);
  },
  saveFlow: async (name = "flow__default") => {
    const state = get();
    const instance = state.flowInstance;
    const { nodes, edges, viewport } = instance
      ? instance.toObject()
      : { nodes: state.nodes, edges: state.edges, viewport: { x: 0, y: 0, zoom: 1 } };
    const elements = cloneDeep([...nodes, ...edges]).map((element) => {
      if (isNode(element)) {
        if (element.data?.current) {
          element.data.current = dataStore.get(element.data.current);
        }
        delete element.handleBounds;
      }
      return element;
    });
    return storage.setItem(name, {
      elements,
      x: viewport.x,
      y: viewport.y,
      zoom: viewport.zoom,
      title: state.title,
    });
  },
  restoreFlow: async (name = "flow__default") => {
    const flow = await storage.getItem(name);
    restoreElements(flow);
    return flow;
  },
  removeElements: (elements) => {
    const ids = elements.map((e) => e.id);
    const { nodes, edges } = get();
    set({
      nodes: nodes.filter((n) => !ids.includes(n.id)),
      edges: edges.filter((e) => !ids.includes(e.id)),
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
    if (!codeEditorFocus) set({ nodes: applyNodeChanges(changes, nodes) });
  },
  onEdgesChange: (changes) => {
    const { edges } = get();
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
