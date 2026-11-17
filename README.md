# datablocks

A node-based editor for data processing, geo analysis, and visualization — in the browser.

[![Deploy to GitHub Pages](https://github.com/channely/datablocks/actions/workflows/deploy.yml/badge.svg)](https://github.com/channely/datablocks/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Live demo:** https://channely.github.io/datablocks/

---

## What is datablocks?

datablocks is a visual programming environment for data. You drag blocks onto a canvas,
wire them together, and data flows from input blocks (files, pasted text, HTTP requests)
through transform, geo, and visualization blocks to an output panel. Every block exposes
its current result, so you can inspect a dataset, a chart, or a GeoJSON map at any point in
the graph.

The UI is split into four areas:

| Area              | Purpose                                                                                                                                                  |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Block library** | Searchable catalog, grouped into Input, Transform, Visualization, Geo Data, and Misc. Open it with the `+ block` button or by right-clicking the canvas. |
| **Editor pane**   | The React Flow canvas. Connect blocks by dragging from a right-side handle to a left-side handle. Click an edge to reveal its remove button.             |
| **Data output**   | Shows the currently selected node's result as a virtualized table, JSON tree, map, or chart. Export the result as CSV/JSON/GeoJSON from the header.      |
| **Terminal**      | Shows application logs and `console.log` output from Javascript blocks. Commands: `help`, `intro`, `clear`.                                              |

### Block catalog

| Group         | Blocks                                                                              |
| ------------- | ----------------------------------------------------------------------------------- |
| Input         | File, Paste, HTTP Request, Sheets, Example Data                                     |
| Transform     | Filter, Merge, Group, Slice, Sort, Rename Columns, Javascript, Geocode, Colorize    |
| Visualization | Barchart, Histogram, Scatterplot, Time Series                                       |
| Geo Data      | Bounding Box, Centroid, Area, Buffer, Simplify, Data to Points, Topojson to Geojson |
| Misc          | Stats, Markdown, Export                                                             |

The **Javascript** block is the escape hatch: it receives up to two inputs (`a`, `b`) and runs
async user code inside a hidden iframe, with lodash available. Its `console.log` calls are
mirrored into the terminal.

### Try it

1. Open the live demo or run the app locally.
2. Open **Help → Introduction Flow** (or type `intro` in the terminal).
3. Select any node to inspect its output; connect new blocks to explore.

### Saving and sharing flows

This build is a standalone workspace, not a hosted demo: **everything is saved in your browser**,
with no account and no backend.

- **Autosave** — edits are written to a local session snapshot after a short pause. Reloading the
  page restores the last canvas, viewport, and node data.
- **Save / Save as** — `Ctrl/Cmd+S` stores the current flow in the local flow library.
  `File → Open…` (`Ctrl/Cmd+O`) lists saved flows with open, rename, duplicate, export, and delete.
- **Export / Import** — `File → Export flow` downloads a self-contained `.datablocks.json`
  document with every node result embedded; `File → Import flow…` loads such a file (v1 and the
  legacy layout used by the introduction flow). Invalid files are rejected with an error in the
  terminal and leave the canvas untouched.
- **Storage limits** — the browser origin has a finite storage quota. Datasets and map outputs are
  embedded in saved and exported flows, so large inputs grow the document quickly; export a flow
  to keep a copy and remove old library entries when storage fills up.
- **One tab at a time** — concurrent tabs do not merge changes; the last write wins.

Unlike the reference demo, nothing is uploaded and login/sign-up are not required.

---

## Getting started

Requirements: Node.js 22+ and npm.

```bash
npm install
npm run dev        # http://localhost:3000
```

Other scripts:

```bash
npm run build         # production build into dist/
npm run preview       # serve dist/ locally
npm run format        # Prettier
npm run format:check  # verify formatting
npm run lint          # ESLint
```

### Configuration

Copy `.env.example` to `.env` to override optional settings:

| Variable                  | Purpose                                                                        |
| ------------------------- | ------------------------------------------------------------------------------ |
| `VITE_MAPBOX_TOKEN`       | Public Mapbox token for the GeoJSON map view.                                  |
| `VITE_MAPBOX_STYLE`       | Mapbox style URL.                                                              |
| `VITE_DEPENDENCY_CDN`     | CDN used to load Javascript-block dependencies (default `https://unpkg.com/`). |
| `VITE_FUNCTIONS_ENDPOINT` | Backend endpoint for the Google Sheets block.                                  |

The Sheets block needs a backend that exposes `GET /spreadsheet?id=<sheet-id>`; without it the
request fails and an error is logged. Geocoding needs a Google Maps or HERE API key supplied by
the user in the node itself.

---

## Deployment

The repository deploys automatically to GitHub Pages via
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) on every push to `main`.

Vite is configured with a production `base` of `/datablocks/`, and all runtime asset URLs
(fonts, example data, introduction flow) are resolved through `import.meta.env.BASE_URL`, so
the build works under a repository sub-path. To host the app at a different path, set
`VITE_BASE` (for example `VITE_BASE=/my-folder/`) at build time.

---

## Tech stack

- **React 17** + **Vite** — application shell and build tooling
- **React Flow** (`react-flow-renderer` 10) — node graph canvas
- **Chakra UI** 1 — dark theme and components
- **zustand** — application state
- **Vega** — charts; **react-map-gl** + Mapbox GL — maps
- **Papa Parse** — CSV; **Turf**, **topojson** — geo processing
- **react-virtualized** — data grid; **react-json-tree** — object inspector
- **CodeJar** + **highlight.js** + **Prettier** — in-node code editor
- **localforage** — local flow persistence

Dependency majors are intentionally held at versions that preserve behavior and visual parity
with the reference demo. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full design.

## Project structure

```
src/
  blocks/        # Block implementations and the block registry
  components/    # Shell, canvas, data views, terminal, shared UI
  hooks/         # Data-flow and editor hooks
  lib/           # DataStore, type detection, geo helpers, execution sandbox
  store/         # zustand store (UI + flow state + persistence)
  App.jsx        # Layout and editor wiring
public/
  data/          # Example datasets and the introduction flow
  fonts/         # Self-hosted IBM Plex Sans / Source Code Pro
```

---

## Security notes

- Markdown blocks render user-authored Markdown after sanitizing the resulting HTML with
  DOMPurify.
- The Javascript block executes user code by design. Code runs inside a hidden iframe,
  but it is **not** a security boundary against a malicious flow author: treat shared flows as
  untrusted code. Dependencies are loaded from a CDN; use `VITE_DEPENDENCY_CDN` if you need to
  pin or self-host them.
- Geocoding keys typed into a node are sent to the selected provider as query parameters, as
  required by those APIs; restrict keys by HTTP referrer and quota.
- See [SECURITY.md](SECURITY.md) for the reporting process.

---

## Background and attribution

datablocks was originally created by **webkid GmbH** (Moritz Klack) and introduced in the post
[“datablocks – A Node-based Editor for Data Processing and Visualization”](https://webkid.io/blog/datablocks-node-based-editor-data-processing-visualization/)
(March 2021). The post describes the motivation: data work often means juggling scripts, CSV
files, and one-off charts, so datablocks puts reusable processing steps on a canvas and makes
every intermediate result visible. It also walks through the four-part UI and the block
groups used here, including the Javascript block that injects lodash for quick transformations.

This repository is an **independent reimplementation** of the public demo, written from the
outside in for study and interoperability. It is not affiliated with or endorsed by webkid
GmbH. The name and original design remain the property of their owners — see [NOTICE](NOTICE).

## License

[MIT](LICENSE)
