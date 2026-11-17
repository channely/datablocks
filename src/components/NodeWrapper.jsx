/**
 * Shared node chrome: header, remove button, input/output handles, type summary, and an error
 * boundary so one failing block cannot crash the canvas. `withNodeWrapper` resolves the node's
 * DataStore pointer (`data.current`) and injects the detected type before rendering.
 */
import React, { memo, useMemo } from "react";
import { cn } from "@/lib/utils";
import useStore from "../store";
import { colors } from "../lib/themeTokens";
import useData from "../hooks/useData";
import { formatValue, TYPES, getColumnNames } from "../lib/types";
import { DragIndicatorIcon, XIcon } from "./icons";
import { SourceHandle, TargetHandle } from "./Handles";

const Summary = memo(({ data }) => {
  const summary = (() => {
    if (!data) return null;
    switch (data.type) {
      case TYPES.DATASET:
        return `${data.current.length} rows | ${getColumnNames(data.current).length} columns`;
      case TYPES.ARRAY:
        return `${data.current.length} items`;
      case TYPES.NUMBER:
      case TYPES.DATE:
      case TYPES.STRING:
      case TYPES.BOOLEAN:
        return formatValue({ data: data.current, type: data.type });
      case TYPES.GEOJSON:
        return data.current.type;
      case TYPES.TOPOJSON:
        return `objects: ${Object.keys(data.current.objects).length}`;
      default:
        return null;
    }
  })();
  if (!summary) return null;
  const text = summary.length > 64 ? `${summary.substr(0, 64)}…` : summary;
  return (
    <div className="absolute top-auto -bottom-[8px] left-0 translate-y-full text-[11px] whitespace-nowrap text-silver-darken15">
      [{data.type}] {text}
    </div>
  );
});
Summary.displayName = "Summary";

class NodeErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    useStore.getState().addLogs({ method: "error", data: [error.name, error.message] });
  }

  render() {
    const { children, nodeId } = this.props;
    if (this.state.hasError) {
      return (
        <div className="p-2">
          <div className="mb-2 text-[red]">Something went wrong.</div>
          <button
            type="button"
            onClick={() => useStore.getState().removeElements([{ id: nodeId }])}
            className="bg-bg-light px-2 py-1 hover:bg-bg-lighter"
          >
            Remove Node
          </button>
        </div>
      );
    }
    return children;
  }
}

export const NodeWrapper = memo(
  ({
    data = {},
    type = "default",
    id,
    children,
    targetHandle = true,
    sourceHandle = true,
    color,
  }) => {
    const selectedNodeId = useStore((state) => state.selectedNodeId);
    const removeElements = useStore((state) => state.removeElements);
    const selected = selectedNodeId === id;
    const remove = () => removeElements([{ id }]);
    return (
      <div
        className={cn(
          "relative min-w-0 rounded-[1px] border border-solid bg-bg-grey p-0",
          !selected && "border-bg-light",
        )}
        style={selected ? { borderColor: color } : undefined}
        data-testid={`node-${type}`}
      >
        <NodeErrorBoundary nodeId={id}>
          <div className="flex items-center justify-between border-b border-solid border-bg-light p-2">
            <div className="flex items-center text-[12px]">
              <DragIndicatorIcon /> {data.label}
            </div>
            <div
              className="cursor-pointer text-silver opacity-25 hover:opacity-100"
              onClick={remove}
              data-testid="node__remove"
            >
              <XIcon />
            </div>
          </div>
          <Summary data={data} />
          {targetHandle && <TargetHandle color={color} position="left" id={id} />}
          {sourceHandle && <SourceHandle color={color} position="right" id={id} />}
          <div>{children}</div>
        </NodeErrorBoundary>
      </div>
    );
  },
);
NodeWrapper.displayName = "NodeWrapper";

export const withNodeWrapper = (Component, props = {}) => {
  const Inner = memo((innerProps) => <Component {...innerProps} />);
  return memo((nodeProps) => {
    const { data, type, id } = nodeProps;
    const [current, currentType] = useData(data?.current);
    // Stable unless the node's own data or value changes, so the memoized children skip drags.
    const nodeData = useMemo(
      () => ({ ...data, current, type: currentType }),
      [data, current, currentType],
    );
    return (
      <NodeWrapper id={id} data={nodeData} type={type} color={colors.block} {...props}>
        <Inner id={id} data={nodeData} color={colors.block} />
      </NodeWrapper>
    );
  });
};

export default NodeWrapper;
