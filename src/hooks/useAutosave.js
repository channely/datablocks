/**
 * Debounced session autosave.
 *
 * Watches the graph and title and writes the `flow__autosave` snapshot after edits settle. The
 * store action catches storage errors (for example quota exhaustion) and logs them to the
 * terminal, so editing is never blocked. Enable this only after a session restore has finished,
 * otherwise an empty canvas could overwrite the snapshot being restored.
 */
import { useEffect } from "react";
import useStore from "../store";

const DEFAULT_DELAY = 800;

export default function useAutosave({ enabled = true, delay = DEFAULT_DELAY } = {}) {
  const nodes = useStore((state) => state.nodes);
  const edges = useStore((state) => state.edges);
  const title = useStore((state) => state.title);
  const autosave = useStore((state) => state.autosave);

  useEffect(() => {
    if (!enabled) return undefined;
    const timer = setTimeout(() => {
      autosave().catch(() => {});
    }, delay);
    return () => clearTimeout(timer);
  }, [autosave, delay, edges, enabled, nodes, title]);
}
