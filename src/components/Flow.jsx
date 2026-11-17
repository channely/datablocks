/**
 * React Flow canvas. All node/edge state lives in the zustand store; this component only
 * forwards changes, selection, and canvas interactions (context-menu library, minimap, layout).
 */
import React, { memo, useCallback, useMemo } from "react";
import { Box, Flex, useTheme } from "@chakra-ui/react";
import ReactFlow, {
  Background,
  ControlButton,
  Controls,
  MiniMap,
  isNode,
} from "react-flow-renderer";
import useStore from "../store";
import { getNodeTypes } from "../blocks/registry";
import { getFlowRect } from "../lib/download";
import { useAutoLayout } from "../hooks/useFlowCommands";
import Edge from "./Edge";
import { LayoutIcon } from "./icons";

const edgeTypes = { default: Edge };

export const Flow = memo(() => {
  const theme = useTheme();
  const nodes = useStore((state) => state.nodes);
  const edges = useStore((state) => state.edges);
  const onNodesChange = useStore((state) => state.onNodesChange);
  const onEdgesChange = useStore((state) => state.onEdgesChange);
  const addEdge = useStore((state) => state.addEdge);
  const setFlowInstance = useStore((state) => state.setFlowInstance);
  const selectNode = useStore((state) => state.selectNode);
  const setModal = useStore((state) => state.setModal);
  const autoLayout = useAutoLayout();

  const nodeTypes = useMemo(() => getNodeTypes(), []);

  const onSelectionChange = useCallback(
    (selection) => {
      const selected = selection?.nodes;
      if (selected && selected.length !== 0) {
        if (selected.length === 1 && isNode(selected[0])) {
          selectNode(selected[0]);
        }
      } else {
        selectNode(null);
      }
    },
    [selectNode],
  );

  const onInit = useCallback((instance) => setFlowInstance(instance), [setFlowInstance]);

  const onPaneContextMenu = useCallback(
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      const rect = getFlowRect() || { top: 100, left: 20 };
      setModal({
        type: "library",
        data: {
          position: {
            x: event.pageX - rect.left - 100,
            y: event.pageY - rect.top - 20,
          },
        },
      });
    },
    [setModal],
  );

  const minimapStyle = useMemo(() => ({ background: theme.colors.bg.dark, height: 100 }), [theme]);

  return (
    <Box
      width="100%"
      height="100%"
      sx={{
        ".react-flow__controls-button": {
          width: "12px",
          height: "12px",
          background: theme.colors.bg.grey,
          borderBottomColor: "rgba(226, 232, 240, 0.2)",
          "&:last-child": { border: "none" },
          path: { fill: theme.colors.text },
        },
        ".react-flow__grid path": { fill: "#777" },
        ".react-flow__edge .react-flow__edge-path": { strokeWidth: 2 },
        ".react-flow__edge.selected .react-flow__edge-path, .react-flow__edge:hover .react-flow__edge-path":
          {
            stroke: "white",
          },
        ".react-flow__edge .react-flow__edge-label": { cursor: "pointer" },
        ".react-flow__edge .react-flow__edge-text": {
          fontSize: "20px",
          textAnchor: "middle",
          fill: "#fff",
          pointerEvents: "none",
        },
        ".react-flow__edge.animated .react-flow__edge-label": { display: "none" },
        ".react-flow__edge.animated.selected .react-flow__edge-label": { display: "block" },
        ".react-flow__edge .react-flow__edge-label circle": {
          fill: theme.colors.violetLighten15,
        },
        ".react-flow__edge .react-flow__edge-label:hover circle": {
          fill: theme.colors.violetLighten30,
        },
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={addEdge}
        onSelectionChange={onSelectionChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onInit={onInit}
        onlyRenderVisibleElements={false}
        minZoom={0.5}
        maxZoom={2}
        onPaneContextMenu={onPaneContextMenu}
        id="reactflow"
      >
        <Controls showInteractive={false}>
          <ControlButton
            id="react-flow__controls-layout"
            onClick={() => autoLayout && autoLayout()}
            title="layout nodes"
            aria-label="layout nodes"
          >
            <LayoutIcon />
          </ControlButton>
        </Controls>
        <MiniMap
          maskColor="rgba(34,33,56,0.7)"
          style={minimapStyle}
          nodeColor={theme.colors.bg.light}
        />
        <Background color="#343C43" />
      </ReactFlow>
    </Box>
  );
});
Flow.displayName = "Flow";

const FlowView = () => {
  const dropDownOpen = useStore((state) => state.dropDownOpen);
  return (
    <Flex flex={1} width="100%" position="relative" bg="bg.dark" className="flowrapper">
      <Box width="100%" height="100%" position="relative">
        {dropDownOpen && (
          <Box width="100%" height="100%" opacity={0} zIndex={999} position="absolute" />
        )}
        <Flow />
      </Box>
    </Flex>
  );
};
FlowView.displayName = "FlowView";

export default FlowView;
