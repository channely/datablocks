# Contributing

Thanks for your interest in datablocks. This is a small, intentionally focused project; the
best contributions are bug fixes, documentation improvements, accessibility fixes, and small,
well-scoped features.

## Workflow

1. Fork the repository and create a topic branch from `main`.
2. Install dependencies with `npm install`.
3. Make your change. Keep the existing visual and behavioral parity with the reference demo
   in mind — see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [AGENTS.md](AGENTS.md).
4. Run the checks:
   ```bash
   npm run format
   npm run lint
   npm run build
   ```
5. Test the app manually (`npm run dev`): add the affected block, connect data, and verify the
   data output. For geo blocks, use **Example Data → Berlin Geojson**.
6. Open a pull request describing the behavior change and how you verified it.

## Code style

- Prettier and ESLint define formatting and lint rules; both run in CI.
- Prefer function components and hooks. Keep state in the zustand store; do not introduce a
  second state manager.
- Reuse `withNodeWrapper`, `useInputData`, `useUpdateNodeCurrent`, and `ColumnSelect` when
  building blocks instead of re-implementing node chrome or data wiring.
- Comments should explain _why_, not _what_. Document non-obvious invariants (for example the
  `data.current` pointer into the DataStore) when you touch them.

## Adding a block

1. Implement the component in `src/blocks/*Blocks.jsx` and wrap it with `withNodeWrapper`.
2. Read inputs with `useInputData(id, [allowedTypes])`; write results with
   `updateNodeData({ id, data: { current } })` or `useUpdateNodeCurrent`.
3. Register the block in `src/blocks/registry.js` with label, group, description, input/output
   types, and default data.
4. Add a fallback UI for the unconnected state (`"← connect dataset…"`).
5. Verify the block in the library, on the canvas, and in the data output panel.

## Reporting bugs

Use the issue templates. Include browser, steps to reproduce, expected vs. actual behavior, and
a minimal flow description. For security issues, follow [SECURITY.md](SECURITY.md) instead of
opening a public issue.

## License

By contributing you agree that your contributions are licensed under the MIT License.
