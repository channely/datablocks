/**
 * Editor commands shared by the header menus and keyboard shortcuts:
 * clear/save, automatic dagre layout, and loading every block at the origin.
 */
import { useCallback } from "react";
import { isNode, useReactFlow, useStore as useFlowStore } from "react-flow-renderer";
import dagre from "dagre";
import cloneDeep from "lodash-es/cloneDeep";
import useStore from "../store";
import { BLOCKS } from "../blocks/registry";

export const useFlowCommands = () => {
  const setElements = useStore((state) => state.setElements);
  const clearLogs = useStore((state) => state.clearLogs);
  const onFlowSaveCallback = useStore((state) => state.onFlowSaveCallback);
  const store = useFlowStore();
  const { setViewport, viewportInitialized } = useReactFlow();

  const clear = useCallback(() => {
    if (viewportInitialized && window.confirm("Are you sure?")) {
      setElements([]);
      setViewport({ x: 0, y: 0, zoom: 1 });
      clearLogs();
    }
  }, [viewportInitialized, setElements, setViewport, clearLogs]);

  const save = useCallback(() => {
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
    }
  }, [store, onFlowSaveCallback]);

  return { clear, save };
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
  const store = useFlowStore();
  return useCallback(() => {
    const { nodeInternals, edges } = store.getState();
    setElements(layoutElements([...Array.from(nodeInternals.values()), ...edges]));
  }, [setElements, store]);
};

export const useLoadAllNodes = () => {
  const setElements = useStore((state) => state.setElements);
  const { setViewport, viewportInitialized } = useReactFlow();
  return useCallback(() => {
    if (!viewportInitialized) return;
    const nodes = BLOCKS.map((block) => ({
      id: block.type,
      data: block.data,
      type: block.type,
      position: { x: 0, y: 0 },
    }));
    setElements(nodes);
    setViewport({ x: 0, y: 0, zoom: 1 });
  }, [viewportInitialized, setElements, setViewport]);
};
