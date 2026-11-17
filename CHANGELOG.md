# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions use
[Semantic Versioning](https://semver.org/).

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
