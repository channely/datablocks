/**
 * Column picker shared by most blocks. Optionally renders its own target handle (`fromHandle`)
 * and reports dropped connections through `onChangeData` so blocks can recompute immediately.
 */
import { memo, useCallback, useEffect, useMemo } from "react";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import { Handle, Position } from "@xyflow/react";
import { getColumnNames } from "../lib/types";
import { colors } from "../lib/themeTokens";

const ColumnSelect = ({
  onChange = () => {},
  onChangeData = null,
  fromHandle = false,
  color,
  className,
  inputData = null,
  inputValid = false,
  value = "",
  handleId = null,
  noConnectionLabel = "← connect dataset…",
}) => {
  const columns = useMemo(() => getColumnNames(inputData), [inputData]);
  const hasData = inputData && inputValid;
  const renderSelect = !fromHandle || hasData;

  useEffect(() => {
    if (columns.length && onChangeData) {
      const column = columns.includes(value) ? value : columns[0];
      onChangeData({ data: inputData, column });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputData, columns, onChangeData]);

  const handleChange = useCallback(
    (event) => {
      onChange(event.target.value ? event.target.value : "");
    },
    [onChange],
  );

  const colored = color || colors.block;

  return (
    <div className={cn("relative flex-[1_1_100%]", className)}>
      {!fromHandle && (
        <Handle
          type="target"
          position={Position.Left}
          id={handleId}
          data-testid="target-handle"
          style={{
            left: -24,
            height: 18,
            width: 15,
            borderRadius: "8px 0 0 8px",
            border: "none",
            top: "50%",
            transform: "translateY(-50%)",
            background: colored,
          }}
        />
      )}
      {renderSelect ? (
        <NativeSelect onChange={handleChange} value={value}>
          {hasData ? (
            columns.map((column) => (
              <option value={column} key={column}>
                {column}
              </option>
            ))
          ) : (
            <option disabled value="">
              {noConnectionLabel}
            </option>
          )}
        </NativeSelect>
      ) : (
        noConnectionLabel
      )}
    </div>
  );
};

export default memo(ColumnSelect);
