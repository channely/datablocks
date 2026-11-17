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
    rollupOptions: {
      output: {
        // Split the two heaviest, lazily used map/chart stacks into long-lived chunks.
        manualChunks: {
          "vendor-vega": ["vega", "react-vega"],
          "vendor-mapbox": ["mapbox-gl", "react-map-gl"],
        },
      },
    },
  },
}));
