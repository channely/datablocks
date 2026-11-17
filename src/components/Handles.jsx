/**
 * Node connection handles. Connection validity is decided by the consuming block, so handles
 * always accept a connection; `useInputData` then marks the edge as invalid when needed.
 * Connected handles use the hover color.
 */
import React from "react";
import { Handle, Position } from "react-flow-renderer";
import { useTheme } from "@chakra-ui/react";
import useStore from "../store";

const baseStyle = {
  height: "calc(100% + 2px)",
  width: 25,
  borderRadius: 0,
  border: "none",
  top: 0,
};

const ConnectedHandle = ({ id, type, className, style, ...rest }) => {
  const theme = useTheme();
  const connected = useStore((state) => state.edges).some(
    (edge) => edge[type] === id || edge[`${type}Handle`] === id,
  );
  const sideStyle =
    type === "source"
      ? {
          top: -1,
          right: -26,
          left: "auto",
          transform: "translateY(0)",
          borderRadius: "0 10px 10px 0",
        }
      : {
          top: -1,
          right: "auto",
          left: -26,
          transform: "translateY(0)",
          borderRadius: "10px 0 0 10px",
        };
  return (
    <Handle
      id={id}
      type={type}
      position={type === "source" ? Position.Right : Position.Left}
      className={className}
      isValidConnection={() => true}
      style={{
        ...baseStyle,
        ...sideStyle,
        background: connected ? theme.colors.handleHover : theme.colors.handle,
        ...style,
      }}
      {...rest}
    />
  );
};

export const SourceHandle = (props) => <ConnectedHandle {...props} type="source" />;
export const TargetHandle = (props) => <ConnectedHandle {...props} type="target" />;
export const NodeHandle = ConnectedHandle;

export default ConnectedHandle;
