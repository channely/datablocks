/**
 * Debounced session autosave.
 *
 * Watches the graph contents and title and writes the `flow__autosave` snapshot after edits
 * settle. Selection-only changes (which replace the React Flow node array) must not trigger a
 * write, so the effect depends on a compact content signature rather than array identity. The
 * store action catches storage errors (for example quota exhaustion) and logs them to the
 * terminal, so editing is never blocked. Enable this only after a session restore has finished,
 * otherwise an empty canvas could overwrite the snapshot being restored.
 */
import { useEffect } from "react";
import useStore from "../store";

const DEFAULT_DELAY = 800;

const contentSignature = (state) =>
  JSON.stringify({
    title: state.title,
    nodes: state.nodes.map((node) => [node.id, node.type, node.position, node.data]),
    edges: state.edges.map((edge) => [
      edge.id,
      edge.source,
      edge.target,
      edge.sourceHandle,
      edge.targetHandle,
      edge.animated,
      edge.label,
    ]),
  });

export default function useAutosave({ enabled = true, delay = DEFAULT_DELAY } = {}) {
  const signature = useStore(contentSignature);
  const autosave = useStore((state) => state.autosave);

  useEffect(() => {
    if (!enabled) return undefined;
    const timer = setTimeout(() => {
      autosave().catch(() => {});
    }, delay);
    return () => clearTimeout(timer);
  }, [autosave, delay, enabled, signature]);
}
