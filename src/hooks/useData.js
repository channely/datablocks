/**
 * Resolves a DataStore id into `[value, type]`. Returns `[]` when the id is missing, which
 * blocks use to render their disconnected state.
 */
import { useMemo } from "react";
import dataStore from "../lib/dataStore";

const useData = (id) => {
  const entry = dataStore.get(id);
  return useMemo(() => (entry ? [entry.data, entry.type] : []), [entry]);
};

export default useData;
