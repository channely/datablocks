/**
 * Debounced session autosave.
 *
 * Watches the graph contents and title and writes the `flow__autosave` snapshot after edits
 * settle. Selection-only changes (which replace the React Flow node array) must not trigger a
 * write, so the effect depends on a compact content signature rather than array identity. The
 * store action catches storage errors (for example quota exhaustion) and logs them to the
 * terminal, so editing is never blocked. Enable this only after a session restore has finished,
 * otherwise an empty canvas could overwrite the snapshot being restored.
 *
 * A pending write is flushed immediately when the page is hidden or unloaded (`pagehide`,
 * `visibilitychange`), so closing the tab right after an edit does not lose it. Because an
 * IndexedDB write started during unload may never commit, the flush also stores a synchronous
 * `localStorage` copy (`flow__autosave_pending`) that `restoreSession` prefers when newer. Each write is
 * announced to other tabs; since every tab shares the one autosave slot, a tab that hears
 * another tab editing warns once in the terminal that the last write wins.
 */
import { useEffect, useRef } from "react";
import useStore from "../store";
import { createTabChannel } from "../lib/storageHealth";

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
  const flushAutosave = useStore((state) => state.flushAutosave);
  const addLogs = useStore((state) => state.addLogs);
  const pending = useRef(null);
  const channel = useRef(null);

  useEffect(() => {
    if (!enabled) return undefined;
    channel.current = createTabChannel(() =>
      addLogs({
        method: "warn",
        data: [
          "This flow editor is also open in another tab. Both tabs share one autosave, so the last write wins; close one of them to avoid losing edits.",
        ],
      }),
    );
    return () => {
      channel.current?.close();
      channel.current = null;
    };
  }, [enabled, addLogs]);

  useEffect(() => {
    if (!enabled) return undefined;
    const write = () => {
      pending.current = null;
      autosave()
        .then((flow) => {
          if (flow) channel.current?.announce();
        })
        .catch(() => {});
    };
    pending.current = setTimeout(write, delay);
    // IndexedDB may not commit during unload, so the flush also writes a synchronous copy.
    const flush = () => {
      if (pending.current === null) return;
      clearTimeout(pending.current);
      pending.current = null;
      if (flushAutosave()) channel.current?.announce();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearTimeout(pending.current);
      pending.current = null;
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [autosave, flushAutosave, delay, enabled, signature]);
}
