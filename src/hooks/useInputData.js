/**
 * Resolves the value arriving at a target handle.
 *
 * Looks up the incoming edge by node id or explicit handle id, resolves the upstream
 * `data.current`, and checks it against the accepted types. Also updates the edge's visual
 * validity (animated vs. ⚠) and logs a type error once per render pass.
 *
 * @param {string} id Node id or handle id used as the edge target.
 * @param {string[]} [types] Accepted TYPES values; all types when omitted.
 * @returns {[unknown, string|undefined, boolean]} `[value, type, valid]`.
 */
import { useEffect } from "react";
import useStore from "../store";
import { TYPES } from "../lib/types";
import useData from "./useData";

const useInputData = (id, types) => {
  const edges = useStore((state) => state.edges);
  const nodes = useStore((state) => state.nodes);
  const setConnectionValid = useStore((state) => state.setConnectionValid);
  const addLogs = useStore((state) => state.addLogs);

  const edge = edges.find((e) => e.target === id || e.targetHandle === id);
  const sourceNode = edge ? nodes.find((node) => node.id === edge.source) : undefined;
  const [data, type] = useData(sourceNode?.data?.current);

  const validTypes = types || Object.values(TYPES);
  const valid = validTypes.includes(type);

  useEffect(() => {
    setConnectionValid({ source: edge?.source, target: id, isValid: valid });
    if (sourceNode?.data?.current && !valid) {
      addLogs({
        method: "error",
        data: [`Data input is not valid. Accepted types are: ${validTypes.join(",")}.`],
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, type, valid, sourceNode?.data?.current]);

  return [valid ? data : null, type, valid];
};

export default useInputData;
