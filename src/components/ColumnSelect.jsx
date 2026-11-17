/**
 * Column picker shared by most blocks. Optionally renders its own target handle (`fromHandle`)
 * and reports dropped connections through `onChangeData` so blocks can recompute immediately.
 */
import { memo, useCallback, useEffect, useMemo } from "react";
import { Box, Select, useTheme } from "@chakra-ui/react";
import { Handle, Position } from "@xyflow/react";
import { getColumnNames } from "../lib/types";

const ColumnSelect = ({
  onChange = () => {},
  onChangeData = null,
  fromHandle = false,
  color,
  sx = {},
  inputData = null,
  inputValid = false,
  value = "",
  handleId = null,
  noConnectionLabel = "← connect dataset…",
}) => {
  const theme = useTheme();
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

  const colored = color || theme.colors?.block;

  return (
    <Box position="relative" flex="1 1 100%" sx={sx}>
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
        <Select onChange={handleChange} value={value}>
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
        </Select>
      ) : (
        noConnectionLabel
      )}
    </Box>
  );
};

export default memo(ColumnSelect);
