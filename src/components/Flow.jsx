/**
 * React Flow canvas. All node/edge state lives in the zustand store; this component only
 * forwards changes, selection, and canvas interactions (context-menu library, minimap, layout).
 */
import { memo, useCallback, useMemo } from "react";
import { Background, ControlButton, Controls, MiniMap, ReactFlow } from "@xyflow/react";
import useStore from "../store";
import { getNodeTypes } from "../blocks/registry";
import { getFlowRect } from "../lib/download";
import { isNode } from "../lib/flowSerialization";
import { useAutoLayout } from "../hooks/useFlowCommands";
import Edge from "./Edge";
import { LayoutIcon } from "./icons";
import { colors } from "../lib/themeTokens";

const edgeTypes = { default: Edge };
const MINIMAP_STYLE = { background: colors.bg.dark, height: 100 };

export const Flow = memo(() => {
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

  return (
    <div className="relative h-full w-full">
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
        <MiniMap maskColor="rgba(34,33,56,0.7)" style={MINIMAP_STYLE} nodeColor={colors.bg.light} />
        <Background color="#343C43" />
      </ReactFlow>
    </div>
  );
});
Flow.displayName = "Flow";

const FlowView = () => {
  const dropDownOpen = useStore((state) => state.dropDownOpen);
  return (
    <div className="flowrapper relative flex w-full flex-1 bg-bg-dark">
      <div className="relative h-full w-full">
        {dropDownOpen && <div className="absolute z-[999] h-full w-full opacity-0" />}
        <Flow />
      </div>
    </div>
  );
};
FlowView.displayName = "FlowView";

export default FlowView;
