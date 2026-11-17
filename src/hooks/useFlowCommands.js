/**
 * Editor commands shared by the header menus, keyboard shortcuts, and the flow library:
 * save / save-as, new flow, open the library, import, export, clear, automatic dagre layout,
 * and loading every block at the origin.
 */
import { useCallback } from "react";
import { isNode, useReactFlow, useStoreApi } from "react-flow-renderer";
import dagre from "dagre";
import cloneDeep from "lodash-es/cloneDeep";
import useStore from "../store";
import { BLOCKS } from "../blocks/registry";
import { flowFileName } from "../lib/flowSerialization";
import { download } from "../lib/download";

export const useFlowCommands = () => {
  const setElements = useStore((state) => state.setElements);
  const clearLogs = useStore((state) => state.clearLogs);
  const onFlowSaveCallback = useStore((state) => state.onFlowSaveCallback);
  const saveFlow = useStore((state) => state.saveFlow);
  const exportFlow = useStore((state) => state.exportFlow);
  const importFlow = useStore((state) => state.importFlow);
  const startNewFlow = useStore((state) => state.newFlow);
  const setModal = useStore((state) => state.setModal);
  const addLogs = useStore((state) => state.addLogs);
  const recordHistory = useStore((state) => state.recordHistory);
  const flowId = useStore((state) => state.id);
  const flowTitle = useStore((state) => state.title);
  const store = useStoreApi();
  const { setViewport, viewportInitialized } = useReactFlow();

  const clear = useCallback(() => {
    if (viewportInitialized && window.confirm("Are you sure?")) {
      recordHistory();
      setElements([]);
      setViewport({ x: 0, y: 0, zoom: 1 });
      clearLogs();
    }
  }, [viewportInitialized, recordHistory, setElements, setViewport, clearLogs]);

  /**
   * Embedders may still provide `onFlowSaveCallback`; in that case the canvas is handed to them
   * unchanged. The standalone app falls back to the local flow library.
   */
  const save = useCallback(async () => {
    const state = store.getState();
    const nodes = Array.from(state.nodeInternals.values());
    const { edges, transform } = state;
    if (onFlowSaveCallback) {
      onFlowSaveCallback({
        nodes,
        edges,
        x: transform[0],
        y: transform[1],
        zoom: transform[2],
      });
      return null;
    }
    try {
      const meta = await saveFlow({ id: flowId, title: flowTitle });
      addLogs({ method: "info", data: [`Saved "${meta.title}".`] });
      return meta;
    } catch {
      // The store already logged the failure with a recovery hint.
      return null;
    }
  }, [store, onFlowSaveCallback, saveFlow, flowId, flowTitle, addLogs]);

  const saveAs = useCallback(async () => {
    const suggested = flowTitle === "Untitled flow" ? "My flow" : flowTitle;
    const name = window.prompt("Save flow as", suggested);
    if (!name || !name.trim()) return null;
    try {
      const meta = await saveFlow({ id: null, title: name.trim() });
      addLogs({ method: "info", data: [`Saved a copy as "${meta.title}".`] });
      return meta;
    } catch {
      return null;
    }
  }, [saveFlow, flowTitle, addLogs]);

  const openFlows = useCallback(() => setModal({ type: "flows" }), [setModal]);

  const newFlow = useCallback(() => {
    const state = useStore.getState();
    const hasContent = state.nodes.length > 0 || state.edges.length > 0;
    if (hasContent && !window.confirm("Start a new flow? The current canvas will be cleared.")) {
      return;
    }
    startNewFlow();
    addLogs({ method: "info", data: ["Started a new flow."] });
  }, [startNewFlow, addLogs]);

  const exportFlowCommand = useCallback(
    async (id = flowId, name = flowTitle) => {
      try {
        const json = await exportFlow(id);
        download(json, "application/json", flowFileName(name));
        addLogs({ method: "info", data: [`Exported "${name || "flow"}".`] });
      } catch (error) {
        addLogs({ method: "error", data: ["Exporting the flow failed.", error.message] });
      }
    },
    [exportFlow, flowId, flowTitle, addLogs],
  );

  const importFlowFile = useCallback(
    async (file) => {
      if (!file) return null;
      try {
        const text = await file.text();
        const meta = await importFlow(text);
        setModal(null);
        addLogs({
          method: "info",
          data: [`Imported "${meta.title}" (${meta.nodeCount} nodes).`],
        });
        return meta;
      } catch (error) {
        addLogs({ method: "error", data: ["Importing the flow failed.", error.message] });
        return null;
      }
    },
    [importFlow, setModal, addLogs],
  );

  return { clear, save, saveAs, openFlows, newFlow, exportFlow: exportFlowCommand, importFlowFile };
};

const layoutElements = (elements) => {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: "LR", ranksep: 100 });
  elements.forEach((element) => {
    if (isNode(element)) {
      graph.setNode(element.id, {
        width: element.width,
        height: element.height,
      });
    } else {
      graph.setEdge(element.source, element.target);
    }
  });
  dagre.layout(graph);
  return elements.map((element) => {
    const copy = cloneDeep(element);
    if (isNode(copy)) {
      const node = graph.node(copy.id);
      // The tiny random x offset mirrors the reference demo's layout output.
      return {
        ...copy,
        position: { x: node.x + Math.random() / 1000, y: node.y },
      };
    }
    return copy;
  });
};

export const useAutoLayout = () => {
  const setElements = useStore((state) => state.setElements);
  const recordHistory = useStore((state) => state.recordHistory);
  const store = useStoreApi();
  return useCallback(() => {
    const { nodeInternals, edges } = store.getState();
    recordHistory();
    setElements(layoutElements([...Array.from(nodeInternals.values()), ...edges]));
  }, [recordHistory, setElements, store]);
};

export const useLoadAllNodes = () => {
  const setElements = useStore((state) => state.setElements);
  const recordHistory = useStore((state) => state.recordHistory);
  const { setViewport, viewportInitialized } = useReactFlow();
  return useCallback(() => {
    if (!viewportInitialized) return;
    const nodes = BLOCKS.map((block) => ({
      id: block.type,
      data: block.data,
      type: block.type,
      position: { x: 0, y: 0 },
    }));
    recordHistory();
    setElements(nodes);
    setViewport({ x: 0, y: 0, zoom: 1 });
  }, [viewportInitialized, recordHistory, setElements, setViewport]);
};
