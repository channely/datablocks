# AGENTS.md

Guidance for coding agents (and humans) working on this repository. Read this before changing
the editor internals; the data-flow invariants are easy to break and hard to debug.

## Commands

```bash
npm install            # install dependencies
npm run dev            # Vite dev server on :3000
npm run build          # production build (base /datablocks/)
npm run preview        # serve the production build
npm run lint           # ESLint (flat config)
npm run format         # Prettier write
npm run format:check   # Prettier check (CI)
npm test               # Vitest unit tests (src/**/*.test.js)
npm run test:coverage  # unit tests + coverage gate (src/lib, src/store lines >= 80%)
npm run e2e            # Playwright end-to-end tests against build + preview (:4173)
npm run check:lockfile # every package-lock.json URL must point at registry.npmjs.org
```

Node 24 is used in CI (`.nvmrc`); `engines` requires Node >= 22.12 (Vite 8).

## Where things live

- `src/App.jsx` — layout, session restore, autosave, drag-and-drop, hotkeys.
- `src/components/Flow.jsx` — React Flow canvas, selection, context menu, minimap.
- `src/components/NodeWrapper.jsx` — node chrome, error boundary, summary, handle placement.
- `src/components/FlowLibrary.jsx` — local flow library modal (open/rename/duplicate/export/delete).
- `src/components/ui/` — shadcn/ui primitives (Radix + Tailwind); `src/lib/utils.js` holds `cn`.
- `src/index.css` / `src/lib/themeTokens.js` — design tokens (CSS variables and raw values).
- `src/blocks/` — one file per block group plus `registry.js` (the single source of truth for
  available blocks, labels, groups, input/output types, and default node data).
- `src/store/index.js` — zustand store. `nodes`/`edges` mirror React Flow elements; persistence
  actions (`saveFlow`, `autosave`, `restoreSession`, `listFlows`, …) live here.
- `src/lib/flowSerialization.js` — flow schema, validation, (de)serialization, export filename.
- `src/lib/dataStore.js` — in-memory data cache. Node payloads hold **IDs**, not data.
- `src/lib/execution.js` — iframe execution engine for the Javascript block.
- `src/lib/types.js` / `geo.js` / `exporters.js` — pure helpers.
- `public/data/` — example datasets and the introduction flow.
- `docs/ARCHITECTURE.md` — deeper design notes and diagrams.

## Invariants (do not break)

1. **Data pointers.** A node stores `data.current` as an ID returned by
   `dataStore.set(...)`. Resolve it with `useData(id)` (or `dataStore.get`). Never store raw
   datasets in the store, including in other node data fields (no exceptions; Merge derives its
   result from its inputs). `addNode` and `updateNodeData` already convert `current` values to
   IDs; use them instead of mutating nodes directly. Datasets are immutable: derive new
   arrays/rows instead of editing inputs in place (`.sort()` on a copy, spread rows). Reference
   identity drives three mechanisms: `updateNodeData` skips a `current` that is the same value
   the node already holds (`dataStore.isSameValue`), column/geo-row caches in `lib/types.js` are
   `WeakMap`s keyed by the dataset, and unreferenced DataStore entries are released by the
   store's coalesced GC (`scheduleDataGc` → `dataStore.retainOnly`). A block that mutates and
   republishes the same array will therefore not propagate; publish a copy.
2. **Node wrappers.** Blocks are wrapped with `withNodeWrapper`; it resolves `current`, computes
   the detected type, and renders handles, summary, and the remove button. Keep the `type`
   passed to React Flow identical to the registry key.
3. **Handle IDs.** Single-target blocks use the node id itself as target handle id. Multi-input
   blocks use fixed suffixes: `${id}-base`, `${id}-insert` (Merge), `${id}-sort` (Sort),
   `${id}-geocode` (Geocode), `${id}_a`, `${id}_b` (Javascript). `useInputData` finds the
   incoming edge by `target` or `targetHandle`; changing suffixes breaks saved flows.
4. **Type validation.** `useInputData(id, types)` returns `[data, type, valid]` and marks the
   incoming edge invalid (⚠) when the type is not accepted. Blocks must render a clear
   disconnected/invalid state and must not compute on invalid input.
5. **Downstream propagation.** Blocks derive their result during render and call
   `useUpdateNodeCurrent(id, result)` (or `updateNodeData` in an effect). Removing that call
   silently disconnects downstream nodes.
6. **Sub-path hosting.** Never hard-code root-absolute asset URLs. Use
   `import.meta.env.BASE_URL` for files in `public/` (`store.loadFlow`, example data, fonts in
   `index.html` via `%BASE_URL%`). The app is deployed at `/datablocks/`.
7. **Visual parity.** Colors, fonts and the 12px base size are design tokens declared in
   `src/index.css` (`@theme`) and mirrored in `src/lib/themeTokens.js` for raw-value consumers
   (Vega configs, minimap, handles); a unit test keeps the two in sync. shadcn components live
   in `src/components/ui/`, and React Flow overrides sit in the unlayered part of
   `src/index.css` (layer order in `src/layers.css`). Literal pixel sizes use arbitrary values
   (`py-[12px]`) because the root font size is 12px. Avoid restyling shared primitives unless
   the task explicitly asks for it.
8. **Persistence schema.** Flow documents are versioned (`FLOW_VERSION` = 2 in
   `src/lib/flowSerialization.js`) and must go through `serializeFlow` / `deserializeFlow`.
   Datasets live in the top-level `payloads: [{ data }]` table, deduplicated by reference; node
   data holds `current: { ref, type }`. Loading registers each payload once through
   `dataStore.set(data, type)`; never write raw datasets into serialized node data.
   localforage keys: `flow__settings`, `flow__index`, `flow__<id>`, `flow__autosave`. A
   synchronous `localStorage` copy, `flow__autosave_pending`, is written when the page is hidden
   or unloaded (IndexedDB writes during unload may never commit); `restoreSession` prefers it
   when newer, moves it into IndexedDB, and clears it. Bump the
   version when the document shape changes and keep the v1 (`current: { data, type }`) and
   legacy `{ elements, x, y, zoom }` readers working.
9. **Undo history.** History entries are `{ elements, payloads }` taken from `serializeFlow(...)`
   and applied through `deserializeFlow`, so payloads are pinned by reference and re-registered
   with `dataStore.set` on restore. Record before every user-visible mutation (`addElement`, `updateNodeData`,
   `removeElements`, drag end, layout commands). Writes derived from upstream data or from
   `ColumnSelect`'s auto-selection effect must pass `transient: true`, or loading a flow will
   create a phantom history step. `applyFlow`, `newFlow`, and import clear the history.

## Security

- Markdown HTML must be sanitized (`sanitizeHtml` in `miscBlocks.jsx`) before
  `dangerouslySetInnerHTML`.
- The Javascript block executes arbitrary user code. Do not claim it is sandboxed in docs or
  UI. Keep dependency loading behind `VITE_DEPENDENCY_CDN` and use pinned package names.
- Never commit `.env` files or real API keys. Public Mapbox tokens may be overridden via
  `VITE_MAPBOX_TOKEN`.

## Verification checklist

For any UI/block change:

1. `npm run lint && npm test && npm run build && npm run e2e`. E2E selectors use only
   `data-testid` and roles; keep existing test ids stable and add new ones instead of
   matching on text or library class names.
2. Load the introduction flow (`Help → Introduction Flow` or terminal `intro`). The terminal
   `stats` command prints node/edge/DataStore counts, history depth, timings, and cache
   counters; for performance work run `node scripts/make-bench-flow.mjs` once, then
   `npm run build && node scripts/bench.mjs <label>` and compare `tmp/bench-<label>.json`.
3. Select the affected node; confirm the data output (table/JSON/map/chart) renders.
4. Exercise the disconnected state and an invalid connection.
5. Save/restore or reload once to ensure no crash from missing `data.current`.

If you cannot verify in a browser, say so explicitly in the pull request.
