/**
 * Publishes a block's computed result to its node data so downstream blocks and the output
 * panel update. Must be called during render-side effects, not conditionally.
 */
import { useEffect } from "react";
import useStore from "../store";

// Mirrors the original behaviour: whenever the computed data changes,
// write it back to the node so downstream nodes are updated.
const useUpdateNodeCurrent = (id, current) => {
  const updateNodeData = useStore((state) => state.updateNodeData);
  useEffect(() => {
    updateNodeData({ id, data: { current } });
  }, [id, current, updateNodeData]);
  return current;
};

export default useUpdateNodeCurrent;
