/**
 * Flow (de)serialization and validation.
 *
 * A saved flow is a self-contained JSON document:
 *
 * {
 *   version: 1,
 *   id: "flow__<nanoid>",
 *   title: "Untitled flow",
 *   createdAt: "<ISO>",
 *   updatedAt: "<ISO>",
 *   elements: [node | edge, ...],
 *   viewport: { x, y, zoom }
 * }
 *
 * Nodes never store raw datasets; `data.current` is a DataStore id at runtime. On the way out it
 * is replaced with `{ data, type }`, and `deserializeFlow` re-inserts that payload through
 * `dataStore.set`, which returns a fresh id. Files produced by the reference demo use the older
 * `{ elements, x, y, zoom }` shape; both are accepted here.
 */
import { isEdge, isNode } from "react-flow-renderer";
import cloneDeep from "lodash-es/cloneDeep";
import dataStore from "./dataStore";

export const FLOW_VERSION = 1;
export const DEFAULT_TITLE = "Untitled flow";

/** Read a viewport from either the current (`viewport`) or legacy (`x/y/zoom`) shape. */
export const readViewport = (flow) => {
  const source = flow?.viewport || flow || {};
  const x = Number(source.x);
  const y = Number(source.y);
  const zoom = Number(source.zoom);
  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
    zoom: Number.isFinite(zoom) && zoom > 0 ? zoom : 1,
  };
};

/** Convert runtime node data into its serialized form (pointers become `{ data, type }`). */
const serializeNodeData = (data = {}) => {
  const { current, ...rest } = data;
  if (typeof current === "string") {
    const stored = dataStore.get(current);
    if (stored) rest.current = { data: stored.data, type: stored.type };
  }
  return rest;
};

/**
 * Keep only portable fields. React Flow adds `width`, `height`, `selected`, `dragging`,
 * `handleBounds`, and internal positions on every node; persisting those makes files brittle.
 */
const serializeNode = (node) => ({
  id: node.id,
  type: node.type,
  position: { x: node.position?.x || 0, y: node.position?.y || 0 },
  data: serializeNodeData(node.data),
});

const serializeEdge = (edge) => {
  const result = {
    id: edge.id,
    type: edge.type,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle,
    animated: Boolean(edge.animated),
    label: edge.label ?? null,
  };
  if (edge.style) result.style = edge.style;
  return result;
};

/**
 * Build a serialized flow document from live editor state.
 *
 * @param {object} params
 * @param {Array} params.nodes React Flow nodes (runtime shape).
 * @param {Array} params.edges React Flow edges.
 * @param {{x:number,y:number,zoom:number}} params.viewport
 * @param {string|null} [params.id]
 * @param {string} [params.title]
 * @param {string|null} [params.createdAt]
 * @param {string|null} [params.updatedAt]
 */
export const serializeFlow = ({
  nodes = [],
  edges = [],
  viewport,
  id = null,
  title,
  createdAt = null,
  updatedAt = null,
}) => ({
  version: FLOW_VERSION,
  id,
  title: (title || DEFAULT_TITLE).trim() || DEFAULT_TITLE,
  createdAt,
  updatedAt: updatedAt || new Date().toISOString(),
  elements: [
    ...nodes.filter(isNode).map(serializeNode),
    ...edges.filter(isEdge).map(serializeEdge),
  ],
  viewport: readViewport(viewport),
});

/**
 * Structural validation. Throws an `Error` with a human-readable message so the caller can log
 * it to the terminal and leave the canvas untouched.
 */
export const validateFlow = (flow) => {
  if (!flow || typeof flow !== "object" || Array.isArray(flow)) {
    throw new Error("Flow file must be a JSON object.");
  }
  if (!Array.isArray(flow.elements)) {
    throw new Error("Flow file is missing an `elements` array.");
  }
  if (Number(flow.version) > FLOW_VERSION) {
    throw new Error(
      `Flow version ${flow.version} is newer than this app supports (version ${FLOW_VERSION}).`,
    );
  }
  const nodeIds = new Set();
  flow.elements.forEach((element) => {
    if (isNode(element)) {
      if (!element.id || !element.type || !element.data) {
        throw new Error("A node is missing `id`, `type`, or `data`.");
      }
      nodeIds.add(element.id);
    }
  });
  flow.elements.forEach((element) => {
    if (isEdge(element)) {
      if (!element.source || !element.target) {
        throw new Error("An edge is missing `source` or `target`.");
      }
      if (!nodeIds.has(element.source) || !nodeIds.has(element.target)) {
        throw new Error("An edge references a node that is not in the flow.");
      }
    }
  });
  return flow;
};

/**
 * Validate and rehydrate a serialized flow. The returned object is a deep copy, so callers may
 * mutate it freely. Node data pointers become DataStore ids again.
 *
 * Accepts both the current document shape and the legacy `{ elements, x, y, zoom }` shape used
 * by `public/data/flows/*.json`.
 */
export const deserializeFlow = (input) => {
  validateFlow(input);
  const flow = cloneDeep(input);
  flow.elements = flow.elements.map((element) => {
    if (!isNode(element)) return element;
    const current = element.data?.current;
    if (current && typeof current === "object" && "data" in current) {
      element.data.current = dataStore.set(current.data, current.type);
    } else if (current !== undefined && typeof current !== "string") {
      // Tolerate legacy files that stored the raw value instead of a { data, type } wrapper.
      element.data.current = dataStore.set(current);
    }
    return element;
  });
  return {
    ...flow,
    id: flow.id || null,
    title: flow.title || DEFAULT_TITLE,
    createdAt: flow.createdAt || null,
    updatedAt: flow.updatedAt || null,
    viewport: readViewport(flow),
  };
};

/** Stable, filesystem-safe name for an exported flow. */
export const flowFileName = (title) => {
  const base = (title || DEFAULT_TITLE)
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 80);
  return `${base || "flow"}.datablocks.json`;
};
