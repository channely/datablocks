/**
 * Custom bezier edge with a wider invisible hit area and a circular label/remove button at the
 * midpoint. Animated edges render no label; invalid edges show ⚠.
 */
import React, { useCallback } from "react";
import { getBezierPath, getEdgeCenter } from "react-flow-renderer";
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
  const edgePath = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  const [edgeCenterX, edgeCenterY] = getEdgeCenter({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
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
      <path strokeWidth={16} fill="none" strokeOpacity={0} d={edgePath} />
      <g transform={`translate(${edgeCenterX} ${edgeCenterY})`} className="react-flow__edge-label">
        <circle
          width={26}
          cx={0}
          cy={0}
          r={13}
          className="react-flow__edge-textbg"
          onClick={remove}
        />
        <text x={0} y={0} className="react-flow__edge-text" dy="0.3em">
          {label}
        </text>
      </g>
    </>
  );
};

export default Edge;
