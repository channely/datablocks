import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Production builds are hosted under https://channely.github.io/datablocks/.
// Set VITE_BASE to deploy under a different repository or path.
export default defineConfig(({ command, isPreview }) => ({
  base: process.env.VITE_BASE || (command === "build" || isPreview ? "/datablocks/" : "/"),
  plugins: [react()],
  define: {
    // Some transitive browser dependencies still reference the Node global.
    global: "globalThis",
  },
  server: {
    port: 3000,
  },
  build: {
    // No manualChunks: Rollup pulls every dependency of a manual chunk into it (React included),
    // which forced the Vega and Mapbox chunks into the entry's modulepreload list. The lazy
    // VegaChart/GeoView imports already split those stacks into their own async chunks.
    chunkSizeWarningLimit: 1600,
  },
}));
