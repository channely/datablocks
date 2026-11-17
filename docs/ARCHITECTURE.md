# Architecture

This document describes how the editor works internally: the data model, the node graph, the
reactive data flow, and the constraints that keep the implementation aligned with the reference
demo.

## Overview

```
┌─────────────────────────────── App ───────────────────────────────┐
│ Header (menus, title)                                             │
│ ┌────────────────────────── Flow canvas ────────────────────────┐ │
│ │ React Flow + block nodes + custom edges                      │ │
│ └──────────────────────────────────────────────────────────────┘ │
│ ┌──────────── Data output ────────────┬──────── Logs ────────────┐ │
│ │ Grid / JSON / Map / Chart / Value   │ console-feed + commands  │ │
│ └─────────────────────────────────────┴──────────────────────────┘ │
└───────────────────────────────────────────────────────────────────┘
```

State lives in one zustand store (`src/store/index.js`). React Flow renders `nodes` and `edges`
from that store and reports changes back into it. Blocks read their inputs from connected
upstream nodes and write computed results back into their own node data, which triggers
downstream blocks and the data output panel.

## Data model

### Nodes

A node is a React Flow element with a stable `id`, a `type` matching a key in the block registry,
and a `data` object:

```js
{
  id: "V1StGXR8_Z5jdHi6B-myT",
  type: "filter",
  position: { x: 0, y: 0 },
  data: {
    label: "Filter",
    group: "transform",
    column: "country",
    conditionId: "2",
    conditionValue: "Germany",
    current: "kL9m...", // DataStore id, NOT the data itself
  },
}
```

`data.current` is an opaque ID. The actual value lives in an in-memory `Map` inside
`src/lib/dataStore.js`. This keeps React Flow state small and avoids cloning large datasets on
every layout or selection change. IDs are created in `addNode` and `updateNodeData`; the
`restoreElements` helper rehydrates IDs when loading a flow from JSON.

### Edges

Edges connect a source node to a target node. Most blocks have a single input, so the target
handle id equals the target node id. Blocks with several inputs use explicit handle ids:

| Block      | Target handles             |
| ---------- | -------------------------- |
| Merge      | `<id>-base`, `<id>-insert` |
| Sort       | `<id>-sort`                |
| Geocode    | `<id>-geocode`             |
| Javascript | `<id>_a`, `<id>_b`         |

These suffixes are part of the saved-flow format. `useInputData` locates the incoming edge by
`edge.target === id || edge.targetHandle === id`.

An edge is animated and unlabeled when the upstream type is accepted. `setConnectionValid`
switches it to a static ⚠ edge when the type is invalid; the validation happens inside the
consuming block, not in the canvas.

### Types

`src/lib/types.js` detects and normalizes values:

`DATASET`, `ARRAY`, `OBJECT`, `GEOJSON`, `TOPOJSON`, `STRING`, `NUMBER`, `DATE`, `BOOLEAN`,
`UNDEFINED`, `NULL`, `UNKNOWN`.

- A **dataset** is a non-empty array of flat objects (dates allowed, nested objects not).
- **GeoJSON** is any object with a known GeoJSON `type`; feature collections with null
  geometries are filtered during sanitization.
- **TopoJSON** is an object with `type: "Topology"`.

Blocks declare accepted input and produced output types in the registry. Charts and tables
consume datasets; geo blocks consume GeoJSON/TopoJSON; the data output view chooses a renderer
from the selected value's detected type.

## Reactive data flow

1. An input block parses data (`dataIO.js`) and calls
   `updateNodeData({ id, data: { current } })`. The store writes the value into the DataStore
   and saves the returned ID on the node.
2. A downstream block calls `useInputData(id, types)`, which finds the incoming edge, resolves
   the upstream `data.current`, and returns `[value, type, valid]`.
3. The block computes a derived value (usually in `useMemo`) and publishes it with
   `useUpdateNodeCurrent(id, value)` or `updateNodeData` inside an effect.
4. React re-renders the affected node, downstream consumers, and the output panel if the node
   is selected.

Blocks that only compute when the user clicks **Run** (Filter, Slice, Merge, Rename Columns)
call `updateNodeData` in their handlers instead; their result still propagates the same way.

## Rendering the output

`DataView` resolves the selected node's `data.current` through `useData` and lazily loads one of:

| Type               | View                                                                               |
| ------------------ | ---------------------------------------------------------------------------------- |
| DATASET            | `GridView` — react-virtualized `MultiGrid`, sortable headers, color column preview |
| GEOJSON / TOPOJSON | `GeoView` — Mapbox GL map with a table toggle; TopoJSON is converted first         |
| ARRAY / OBJECT     | `JsonTreeView` — react-json-tree with the Solarized palette                        |
| Primitive          | `SimpleTypeView` — large value or read-only textarea                               |
| null               | empty                                                                              |

Export formats are derived from the same type (`exporters.js`).

## Javascript execution

`src/lib/execution.js` creates a hidden same-origin iframe and loads dependencies from a CDN.
The user's code is wrapped in an async function and evaluated in the iframe, with `a` and `b`
injected as globals. `console` calls are forwarded to the terminal with console-feed. This is a
convenience sandbox, not a security boundary: see [SECURITY.md](../SECURITY.md).

## Geo pipeline

- `geo.js` implements bbox, centroid, spherical area, buffering (Turf), and TopoJSON
  simplification.
- `Data to Points` converts rows with numeric latitude/longitude columns into a feature
  collection.
- `Colorize` appends a `color` property using a sequential scale, which the map and grid use for
  styling.

## Persistence

`localforage` stores flows under the `datablocks` database (`saveFlow`/`restoreFlow`). The demo
build exposes save through the File menu callback and does not upload data. The introduction
flow is a static file under `public/data/flows`.

## URL base and deployment

The app is hosted under `/datablocks/` on GitHub Pages. Vite's `base` is set at build time and
every runtime asset URL is built from `import.meta.env.BASE_URL`. This includes the introduction
flow, example datasets, and the self-hosted fonts in `index.html` (via `%BASE_URL%`). Any new
`public/` asset must follow the same rule.

## Extension points

To add a block:

1. Implement the component and wrap it with `withNodeWrapper`.
2. Accept inputs with `useInputData`, publish results with `useUpdateNodeCurrent` or
   `updateNodeData`.
3. Add an entry to `src/blocks/registry.js` (type, component, group, description, input/output
   types, default data).
4. Use an existing handle-id convention if the block has multiple inputs.
5. Test connected, disconnected, and invalid connections, and the output panel.
