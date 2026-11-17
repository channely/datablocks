/**
 * Flow (de)serialization and validation.
 *
 * A saved flow is a self-contained JSON document (version 2):
 *
 * {
 *   version: 2,
 *   id: "flow__<nanoid>",
 *   title: "Untitled flow",
 *   createdAt: "<ISO>",
 *   updatedAt: "<ISO>",
 *   elements: [node | edge, ...],      // node.data.current = { ref: <payload index>, type }
 *   payloads: [{ data }, ...],         // each distinct value once, deduplicated by reference
 *   viewport: { x, y, zoom }
 * }
 *
 * Nodes never store raw datasets; `data.current` is a DataStore id at runtime. On the way out it
 * becomes a reference into `payloads`, so pass-through blocks that forward the same dataset do
 * not duplicate it. `deserializeFlow` re-inserts each payload once through `dataStore.set`.
 *
 * Older documents are still read: version 1 stored `current: { data, type }` inline, and files
 * produced by the reference demo use the `{ elements, x, y, zoom }` shape with raw values.
 */
import cloneDeep from "lodash-es/cloneDeep";
import dataStore from "./dataStore";

/** Element discriminators for legacy `elements` arrays: edges carry `source` and `target`. */
export const isEdge = (element) =>
  Boolean(element) && typeof element === "object" && "source" in element && "target" in element;
export const isNode = (element) =>
  Boolean(element) && typeof element === "object" && "id" in element && !isEdge(element);

export const FLOW_VERSION = 2;

/**
 * Fields older Merge nodes wrote into node data (raw input rows and a derived result). Merge now
 * derives everything from its inputs, so these are dropped on load.
 */
const LEGACY_MERGE_FIELDS = ["baseData", "insertData", "data", "count", "mergeCount"];
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

/**
 * Collects payloads by object identity. Returns the index for `value`, adding it on first sight.
 */
const createPayloadTable = () => {
  const payloads = [];
  const indexByValue = new Map();
  return {
    payloads,
    add(value) {
      if (indexByValue.has(value)) return indexByValue.get(value);
      const index = payloads.length;
      payloads.push({ data: value });
      indexByValue.set(value, index);
      return index;
    },
  };
};

/** Convert runtime node data into its serialized form (pointers become `{ ref, type }`). */
const serializeNodeData = (data = {}, table) => {
  const { current, ...rest } = data;
  if (typeof current === "string") {
    const stored = dataStore.get(current);
    if (stored) rest.current = { ref: table.add(stored.data), type: stored.type };
  }
  return rest;
};

/**
 * Keep only portable fields. React Flow adds `width`, `height`, `selected`, `dragging`,
 * `handleBounds`, and internal positions on every node; persisting those makes files brittle.
 */
const serializeNode = (node, table) => ({
  id: node.id,
  type: node.type,
  position: { x: node.position?.x || 0, y: node.position?.y || 0 },
  data: serializeNodeData(node.data, table),
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
}) => {
  const table = createPayloadTable();
  const elements = [
    ...nodes.filter(isNode).map((node) => serializeNode(node, table)),
    ...edges.filter(isEdge).map(serializeEdge),
  ];
  return {
    version: FLOW_VERSION,
    id,
    title: (title || DEFAULT_TITLE).trim() || DEFAULT_TITLE,
    createdAt,
    updatedAt: updatedAt || new Date().toISOString(),
    elements,
    payloads: table.payloads,
    viewport: readViewport(viewport),
  };
};

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
  if (flow.payloads !== undefined && !Array.isArray(flow.payloads)) {
    throw new Error("Flow file has an invalid `payloads` list.");
  }
  const payloadCount = Array.isArray(flow.payloads) ? flow.payloads.length : 0;
  const nodeIds = new Set();
  flow.elements.forEach((element) => {
    if (isNode(element)) {
      if (!element.id || !element.type || !element.data) {
        throw new Error("A node is missing `id`, `type`, or `data`.");
      }
      if (nodeIds.has(element.id)) {
        throw new Error(`Duplicate node id "${element.id}".`);
      }
      const current = element.data.current;
      if (current && typeof current === "object" && "ref" in current) {
        const ref = current.ref;
        if (!Number.isInteger(ref) || ref < 0 || ref >= payloadCount) {
          throw new Error(`Node "${element.id}" references a missing payload.`);
        }
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

/** Copy an element's structure. Payloads are not part of it and are never copied. */
const copyNode = (node) => {
  const { current, ...rest } = node.data || {};
  const data = cloneDeep(rest);
  if (current !== undefined) data.current = current;
  if (node.type === "merge") LEGACY_MERGE_FIELDS.forEach((field) => delete data[field]);
  return { ...node, position: { ...node.position }, data };
};

const copyEdge = (edge) => (edge.style ? { ...edge, style: { ...edge.style } } : { ...edge });

/**
 * Validate and rehydrate a serialized flow. Structure (elements, node data) is copied so callers
 * may mutate it; payloads are reused by reference and registered once each through
 * `dataStore.set` with their recorded type, so undo and load do not deep-copy or re-detect
 * datasets. Node data pointers become DataStore ids again.
 *
 * Accepts version 2 (`payloads` + `{ ref, type }`), version 1 (`{ data, type }` inline), and the
 * legacy `{ elements, x, y, zoom }` shape used by `public/data/flows/*.json`.
 */
export const deserializeFlow = (input) => {
  validateFlow(input);
  const payloads = Array.isArray(input.payloads) ? input.payloads : [];
  const idByRef = new Map();
  const idFor = (ref, type) => {
    const key = `${ref}:${type || ""}`;
    if (!idByRef.has(key)) idByRef.set(key, dataStore.set(payloads[ref]?.data, type));
    return idByRef.get(key);
  };
  const elements = input.elements.map((element) => {
    if (!isNode(element)) return copyEdge(element);
    const node = copyNode(element);
    const current = node.data.current;
    if (current && typeof current === "object" && "ref" in current) {
      node.data.current = idFor(current.ref, current.type);
    } else if (current && typeof current === "object" && "data" in current) {
      node.data.current = dataStore.set(current.data, current.type);
    } else if (current !== undefined && typeof current !== "string") {
      // Tolerate legacy files that stored the raw value instead of a { data, type } wrapper.
      node.data.current = dataStore.set(current);
    }
    return node;
  });
  const { payloads: _payloads, ...rest } = input;
  return {
    ...rest,
    elements,
    id: input.id || null,
    title: input.title || DEFAULT_TITLE,
    createdAt: input.createdAt || null,
    updatedAt: input.updatedAt || null,
    viewport: readViewport(input),
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
