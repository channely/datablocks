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
every layout or selection change. IDs are created in `addNode` and `updateNodeData`;
`deserializeFlow` in `src/lib/flowSerialization.js` rehydrates IDs (through `dataStore.set`) when
a flow is loaded from JSON.

### Data lifecycle

Datasets are treated as **immutable**: blocks derive new arrays/objects instead of editing their
input in place. That makes reference identity meaningful and enables three mechanisms:

1. **Same-reference skip.** `updateNodeData` compares an incoming `current` with the value the
   node already points to (`dataStore.isSameValue`, which checks the original reference passed
   to `set` as well as the sanitized copy). A pass-through block that republishes the same
   dataset creates no new id and no store write, so downstream blocks do not recompute.
2. **Reference caches.** `getColumns`, `getColumnNames`, and `geoToRows` (`src/lib/types.js`)
   memoize by object identity in `WeakMap`s, so the column scan of a large dataset happens once
   no matter how many components ask. `stats` → `counters.columnScan` counts cache misses.
3. **Garbage collection.** The store schedules `collectData` (coalesced with `setTimeout(0)`)
   after `updateNodeData` replaces a pointer and after load, new flow, `setElements`, removal,
   and undo/redo. It keeps the ids referenced by `nodes[].data.current` and releases everything
   else with `dataStore.retainOnly`. Undo history stores payloads by reference (not ids), so
   collected entries are re-registered on restore.

The `stats` terminal command prints node/edge counts, DataStore size, history depth, the last
timing of `import`/`serialize`/`autosave`/`undo`/`redo`/`export` (`performance.measure` entries
named `db:<name>`, see `src/lib/perf.js`), and the counters above. `scripts/bench.mjs` uses it
to benchmark a generated 28-node / 20k-row flow (`scripts/make-bench-flow.mjs`).

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

Blocks that only compute when the user clicks **Run** (Filter, Slice, Rename Columns) call
`updateNodeData` in their handlers instead; their result still propagates the same way. Merge
derives its join from its two inputs and the selected columns and stores only the column names.

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

## UI layer and styling

UI primitives are shadcn/ui components in `src/components/ui/` (Radix + Tailwind CSS 4, class
merging through `cn` in `src/lib/utils.js`). Design tokens (colors, the 12px root font size,
IBM Plex / Source Code Pro) are declared once in `src/index.css` under `@theme` and mirrored for
JavaScript consumers (Vega chart configs, React Flow minimap and handles, the terminal) in `src/lib/themeTokens.js`; a unit test keeps
the two in sync. Cascade layers are declared in `src/layers.css`
(`theme, base, xyflow, components, utilities`), and React Flow overrides live in the unlayered
part of `index.css` so they win over library styles. Selects inside canvas nodes use the native
select (no portal) so they behave under zoom, and interactive controls inside nodes keep the
`nodrag` class. Charts render through `VegaChart` (react-vega, canvas renderer), lazily loaded
with the Vega chunk.

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

Flows are saved locally with `localforage` (database `datablocks`, store `flows`); there is no
backend. `src/lib/flowSerialization.js` is the single schema boundary:

```js
{
  version: 2,
  id: "flow__<nanoid>",
  title: "Untitled flow",
  createdAt, updatedAt,          // ISO strings
  elements: [node | edge, ...],  // nodes keep id/type/position/data, edges keep connection fields
  payloads: [{ data }, ...],     // each distinct dataset once
  viewport: { x, y, zoom },
}
```

Serialization strips transient React Flow fields (`width`, `height`, `selected`, …) and replaces
each node's `data.current` id with `{ ref, type }`, where `ref` indexes `payloads`. Payloads are
deduplicated by object identity, so a chain of pass-through blocks stores its dataset once.
`deserializeFlow` validates the document (elements array, node/edge shape, edge endpoints,
payload references), copies the element structure, and registers each payload once through
`dataStore.set(data, type)` without deep-cloning it or re-detecting its type. Merge nodes lose
the raw-row fields older versions stored (`baseData`, `insertData`, `data`, `mergeCount`).

Accepted inputs: version 2; version 1 (`current: { data, type }` inline); and legacy documents
with top-level `x`/`y`/`zoom` (the introduction flow) that may store raw values. Versions newer
than `FLOW_VERSION` are rejected. Autosave, library entries, export, and undo history all use
this format; exporting an older library entry upgrades it to version 2.

Storage keys:

| Key              | Content                                                                  |
| ---------------- | ------------------------------------------------------------------------ |
| `flow__settings` | UI settings (unchanged)                                                  |
| `flow__index`    | Flow-library metadata `[{ id, title, createdAt, updatedAt, nodeCount }]` |
| `flow__<id>`     | One flow document                                                        |
| `flow__autosave` | Latest session snapshot; not listed in the flow library                  |

The index is rebuilt from `storage.keys()` if missing or corrupt. `saveFlow` writes the document
and upserts the index; `autosave` only writes the session snapshot. `App` restores the session
once the React Flow viewport is initialized, and `useAutosave` debounces store changes into
`autosave()` (skipped while restoring, in demo mode, or when an embedder supplies a flow). Write
failures (for example quota exhaustion) are logged to the terminal and never interrupt editing.
Import/export use the same schema; exported files are downloaded through `download()`.

Hardening (`src/lib/storageHealth.js`, `src/hooks/useAutosave.js`):

- A pending autosave is flushed on `pagehide` and `visibilitychange` → `hidden`.
- After the first successful write the app calls `navigator.storage.persist()` once.
- After each write it reads `navigator.storage.estimate()` and logs one terminal warning per
  session once usage exceeds 80% of quota; the flow library footer shows the same estimate.
- Every autosave is announced on the `datablocks-editor` BroadcastChannel. All tabs share
  `flow__autosave`, so a tab that hears another tab editing warns once that the last write wins.

### Embedding

`onFlowSaveCallback` is still honored: when an embedder passes it, Save hands the canvas to the
host instead of writing to local storage. Without it, Save uses the local flow library.

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
