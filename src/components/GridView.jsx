/**
 * Virtualized dataset table. The first row is a sortable header; a `color` column is rendered
 * as a swatch so Colorize results are visible in the grid.
 */
import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Flex } from "@chakra-ui/react";
import { AutoSizer, MultiGrid } from "react-virtualized";
import sortBy from "lodash-es/sortBy";
import { getColumns } from "../lib/types";
import { ChevronDownIcon, ChevronUpIcon } from "./icons";

const CELL_BORDER = "#333154";

const GridView = memo(({ data = [], dataId }) => {
  const [columns, setColumns] = useState([]);
  const [rows, setRows] = useState([]);
  const [sortState, setSortState] = useState([]);
  const [sortIndex, setSortIndex] = useState(null);

  useEffect(() => {
    const nextColumns = getColumns(data);
    setRows(data);
    setColumns(nextColumns);
    setSortState(nextColumns.map(() => null));
  }, [dataId, data]);

  const gridData = useMemo(
    () =>
      [
        columns.reduce((acc, column) => {
          acc[column.name] = column.name;
          return acc;
        }, {}),
      ].concat(rows),
    [columns, rows],
  );

  const onSort = useCallback(
    (index) => {
      const name = columns[index].name;
      const state = sortState[index];
      const sorted = sortBy(rows, [name]);
      if (state === "asc") sorted.reverse();
      setSortState((previous) =>
        previous.map((value, i) => (index === i ? (value === "asc" ? "desc" : "asc") : value)),
      );
      setSortIndex(index);
      setRows(sorted);
    },
    [rows, columns, sortState],
  );

  const cellRenderer = useCallback(
    ({ columnIndex, key, rowIndex, style }) => {
      const isHeader = rowIndex === 0;
      const name = columns[columnIndex].name;
      const value = gridData[rowIndex][name];
      const base = {
        ...style,
        borderBottom: `1px solid ${CELL_BORDER}`,
        borderRight: `1px solid ${CELL_BORDER}`,
        paddingTop: 5,
        paddingBottom: 3,
        overflow: "hidden",
      };
      const cellStyle =
        name === "color" ? { ...base, backgroundColor: gridData[rowIndex][name] } : base;
      if (isHeader) {
        return (
          <Flex
            key={key}
            px={1}
            style={{
              ...cellStyle,
              background: "#222138",
              fontWeight: 700,
              userSelect: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              paddingTop: 0,
              paddingBottom: 0,
            }}
            onClick={() => onSort(columnIndex)}
            _hover={{ opacity: 0.8 }}
          >
            {value}
            <Flex
              ml="auto"
              mr="3px"
              style={{ opacity: sortState[columnIndex] && sortIndex === columnIndex ? 1 : 0.25 }}
            >
              {sortState[columnIndex] === "desc" ? (
                <ChevronDownIcon style={{ width: 12, height: 12, verticalAlign: "middle" }} />
              ) : (
                <ChevronUpIcon style={{ width: 12, height: 12, verticalAlign: "middle" }} />
              )}
            </Flex>
          </Flex>
        );
      }
      return (
        <Flex key={key} px={1} style={cellStyle} alignItems="center">
          {value}
        </Flex>
      );
    },
    [columns, gridData, sortState, sortIndex, onSort],
  );

  return (
    <Flex
      height="100%"
      sx={{
        ".ReactVirtualized__Grid": {
          fontSize: "12px",
          outline: "none",
        },
      }}
    >
      <AutoSizer>
        {({ height, width }) => (
          <MultiGrid
            cellRenderer={cellRenderer}
            fixedRowCount={1}
            columnCount={columns.length}
            columnWidth={200}
            height={height}
            rowCount={gridData.length}
            rowHeight={25}
            width={width}
          />
        )}
      </AutoSizer>
    </Flex>
  );
});
GridView.displayName = "GridView";

export default GridView;
