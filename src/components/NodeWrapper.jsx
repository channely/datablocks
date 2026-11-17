/**
 * Shared node chrome: header, remove button, input/output handles, type summary, and an error
 * boundary so one failing block cannot crash the canvas. `withNodeWrapper` resolves the node's
 * DataStore pointer (`data.current`) and injects the detected type before rendering.
 */
import React, { memo } from "react";
import { Box, Flex, useTheme } from "@chakra-ui/react";
import useStore from "../store";
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
    <Box
      fontSize="11px"
      color="silverDarken15"
      position="absolute"
      bottom="-8px"
      top="auto"
      left={0}
      transform="translateY(100%)"
      whiteSpace="nowrap"
    >
      [{data.type}] {text}
    </Box>
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
        <Box p={2}>
          <Box color="red" mb={2}>
            Something went wrong.
          </Box>
          <Box
            as="button"
            onClick={() => useStore.getState().removeElements([{ id: nodeId }])}
            bg="bg.light"
            _hover={{ bg: "bg.lighter" }}
            px={2}
            py={1}
          >
            Remove Node
          </Box>
        </Box>
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
      <Box
        px={0}
        py={0}
        bg="bg.grey"
        borderRadius={1}
        borderColor={selected ? color : "bg.light"}
        borderWidth="1px"
        borderStyle="solid"
        data-testid={`node-${type}`}
        position="relative"
        minWidth="0"
      >
        <NodeErrorBoundary nodeId={id}>
          <Flex
            alignItems="center"
            justifyContent="space-between"
            p={2}
            borderBottomColor="bg.light"
            borderBottomWidth="1px"
            borderBottomStyle="solid"
          >
            <Flex alignItems="center" fontSize="12px">
              <DragIndicatorIcon /> {data.label}
            </Flex>
            <Box
              color="silver"
              cursor="pointer"
              opacity={0.25}
              _hover={{ opacity: 1 }}
              onClick={remove}
              data-testid="node__remove"
            >
              <XIcon />
            </Box>
          </Flex>
          <Summary data={data} />
          {targetHandle && <TargetHandle color={color} position="left" id={id} />}
          {sourceHandle && <SourceHandle color={color} position="right" id={id} />}
          <Box>{children}</Box>
          <Summary data={data} />
        </NodeErrorBoundary>
      </Box>
    );
  },
);
NodeWrapper.displayName = "NodeWrapper";

export const withNodeWrapper = (Component, props = {}) => {
  const Inner = memo((innerProps) => <Component {...innerProps} />);
  return memo((nodeProps) => {
    const { data, type, id } = nodeProps;
    const [current, currentType] = useData(data?.current);
    const theme = useTheme();
    const nodeData = { ...data, current, type: currentType };
    return (
      <NodeWrapper id={id} data={nodeData} type={type} color={theme.colors.block} {...props}>
        <Inner id={id} data={nodeData} color={theme.colors.block} />
      </NodeWrapper>
    );
  });
};

export default NodeWrapper;
