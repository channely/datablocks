# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions use
[Semantic Versioning](https://semver.org/).

## [1.4.0] — 2026-11-17

Automated tests as a safety net for the upcoming stack upgrade.

### Added

- Vitest unit tests for `src/lib` (types, dataStore, flowSerialization, exporters, geo, dataIO,
  download, execution, perf, storageHealth) and the store (history merging, transient writes,
  limits, persistence, autosave, session restore, quota errors, dataStore GC). Coverage gate:
  80% lines for `src/lib` and `src/store`.
- Playwright E2E suites (`e2e/`): smoke, blocks, undo/redo, persistence, import/export, and
  `@perf` budgets on the benchmark flow. Selectors are `data-testid`/role only.
- `ci.yml` for pull requests (format, lint, unit + coverage, build, E2E, report upload on
  failure); the Pages deploy is now gated on unit and E2E tests.
- `npm run check:lockfile` guard that rejects non-npmjs `resolved` URLs in the lockfile.
- `data-testid` hooks for edges, handles, menu items, flow library rows, and column selects.

### Fixed

- The edge remove button (the circle at the midpoint) did not receive clicks because edges
  only take pointer events on their stroke.
- The flow library's Import button overlapped the modal close button.
- Closing or reloading the tab right after an edit could lose it: the unload-time IndexedDB
  write often never committed. A synchronous `localStorage` copy is now written and preferred
  on restore when newer.
- Flows passed in by an embedder (`setFlowData`) were not rehydrated through
  `deserializeFlow`, and a missing flow crashed.
- Starting a new flow while a previous load was still mounting could attach its stale edges.
- Dropping a file without an extension threw instead of reporting an unsupported file.

## [1.3.0] — 2026-11-17

Performance and data reliability for large flows (measured on a generated 28-node flow with a
20k-row dataset, `scripts/bench.mjs`).

### Changed

- Flow documents are now **version 2**: datasets are stored once in a top-level `payloads` table
  and nodes reference them, so pass-through chains no longer duplicate data (benchmark export
  97.9 MB → 20.1 MB). Version 1 and legacy files still open; datablocks v1.2 and earlier cannot
  open version 2 files.
- First load only ships the editor: Vega, Mapbox, Prettier, Showdown, and Turf buffer load on
  demand, and highlight.js registers JavaScript only (empty canvas 5.1 MB → 1.45 MB of JS,
  1.56 MB → 0.47 MB gzip).
- Blocks re-render only when their own upstream changes; dragging no longer rescans datasets.
  Column detection is cached per dataset, and Stats, Filter, Grid, Geo view, and Simplify
  memoize their work.
- Loading a flow connects edges as soon as nodes have mounted instead of after a fixed 250 ms,
  and chart nodes start loading the Vega runtime when they mount (benchmark import-to-settled
  1085 ms → ~480 ms).
- Undo/redo reuses payloads by reference instead of deep-cloning them (`db:undo` 73 ms → <1 ms).
- Merge derives its join from its inputs and stores only the selected columns; the raw
  `baseData`/`insertData` copies older versions kept in node data are dropped on load.
- Geocode publishes progress every 50 rows instead of once per row.

### Added

- DataStore garbage collection: entries no node references are released, and republishing the
  same dataset creates no new entry (benchmark: 432 → 20 entries after 20 Filter edits).
- `stats` terminal command with node/edge/DataStore counts, history depth, timings, and cache
  counters.
- Storage hardening: pending autosaves flush when the tab is hidden or closed, persistent storage
  is requested after the first save, the flow library shows storage usage and the terminal warns
  above 80% of quota, and a warning appears when another tab edits at the same time.
- Benchmark tooling: `scripts/make-bench-flow.mjs` and `scripts/bench.mjs`.

### Fixed

- Merge's row count was never updated; it now reflects the joined rows.
- Rename Columns edited its settings array in place.

## [1.2.0] — 2026-11-17

### Added

- Undo/redo for canvas edits (`Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z`, and **View → Undo/Redo**),
  covering node/edge creation and deletion, moving nodes, and block settings.
- History entries reuse the flow serialization format, so deleted payloads are restored intact;
  the stack keeps the last 100 steps and is cleared when a flow is loaded, created, or imported.

### Fixed

- Repeated edits on one node (typing, sliders) coalesce into a single undo step.
- Deleting a node removes it and its connections in one undo step.
- Derived data updates and the column auto-selection effect no longer create phantom history
  entries when a flow loads.

## [1.1.0] — 2026-11-17

### Added

- Local workspace: Save, Save as, Open, New flow, and Clear in the File menu and hotkeys
  (`Ctrl/Cmd+S`, `Ctrl/Cmd+Shift+S`, `Ctrl/Cmd+O`).
- Autosave plus session restore: reloading the page brings back the last canvas, node data, and
  viewport.
- Flow library modal with open, rename, duplicate, export, and delete, backed by a rebuilt
  localforage index.
- Self-contained flow export (`.datablocks.json`) and import, with schema validation and
  compatibility for the legacy `{ elements, x, y, zoom }` layout.
- Save status indicator in the header; storage failures are reported in the terminal without
  interrupting editing.

### Changed

- The standalone build no longer runs in demo mode by default, so File actions and title editing
  are available out of the box. `demoMode` remains as an opt-in prop for embedders.
- `File → Save` now falls back to local storage when no `onFlowSaveCallback` is supplied.
- Removed the dead Login / Sign up links; the header links to the GitHub repository instead.

### Fixed

- Saving previously did nothing in the standalone app because no save callback was provided.
- Removed a duplicated node summary render in `NodeWrapper`.

## [1.0.0] — 2026-11-16

- First open-source release: reverse-engineered reference demo, React 17 + Vite build, local
  data-flow engine, geo and chart blocks, documentation, and GitHub Pages deployment.
