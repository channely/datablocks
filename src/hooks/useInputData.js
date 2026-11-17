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

const findSource = (state, id) =>
  state.edges.find((e) => e.target === id || e.targetHandle === id)?.source;

const useInputData = (id, types) => {
  // Narrow selectors return primitives, so a block re-renders only when its own upstream edge or
  // upstream value id changes — not on every drag frame or unrelated node edit.
  const source = useStore((state) => findSource(state, id));
  const sourceCurrent = useStore((state) => {
    const sourceId = findSource(state, id);
    if (!sourceId) return undefined;
    return state.nodes.find((node) => node.id === sourceId)?.data?.current;
  });
  const setConnectionValid = useStore((state) => state.setConnectionValid);
  const addLogs = useStore((state) => state.addLogs);

  const [data, type] = useData(sourceCurrent);

  const validTypes = types || Object.values(TYPES);
  const valid = validTypes.includes(type);

  useEffect(() => {
    setConnectionValid({ source, target: id, isValid: valid });
    if (sourceCurrent && !valid) {
      addLogs({
        method: "error",
        data: [`Data input is not valid. Accepted types are: ${validTypes.join(",")}.`],
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, type, valid, source, sourceCurrent]);

  return [valid ? data : null, type, valid];
};

export default useInputData;
