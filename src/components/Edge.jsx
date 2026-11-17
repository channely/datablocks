/**
 * Custom bezier edge with a wider invisible hit area and a circular label/remove button at the
 * midpoint. Animated edges render no label; invalid edges show ⚠.
 */
import { useCallback } from "react";
import { getBezierPath } from "@xyflow/react";
import useStore from "../store";

const Edge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  label,
}) => {
  const removeElements = useStore((state) => state.removeElements);
  // For left/right handles the bezier midpoint equals the straight-line center the label used
  // with react-flow-renderer's `getEdgeCenter`.
  const [edgePath, edgeCenterX, edgeCenterY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  const remove = useCallback(() => removeElements([{ id }]), [id, removeElements]);

  return (
    <>
      <path
        id={id}
        style={style}
        className="react-flow__edge-path"
        d={edgePath}
        markerEnd={markerEnd}
      />
      <path
        strokeWidth={16}
        fill="none"
        strokeOpacity={0}
        d={edgePath}
        data-testid="edge-path"
        data-edge-id={id}
      />
      <g
        transform={`translate(${edgeCenterX} ${edgeCenterY})`}
        className="react-flow__edge-label"
        data-testid="edge"
        data-edge-id={id}
      >
        <circle
          width={26}
          cx={0}
          cy={0}
          r={13}
          className="react-flow__edge-textbg"
          onClick={remove}
          data-testid="edge-remove"
        />
        <text x={0} y={0} className="react-flow__edge-text" dy="0.3em" data-testid="edge-label">
          {label}
        </text>
      </g>
    </>
  );
};

export default Edge;
