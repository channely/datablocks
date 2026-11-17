/**
 * Virtualized dataset table. The first row is a sortable header; a `color` column is rendered
 * as a swatch so Colorize results are visible in the grid.
 */
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { MultiGrid } from "react-virtualized";
import { AutoSizer } from "react-virtualized-auto-sizer";
import sortBy from "lodash-es/sortBy";
import { getColumns } from "../lib/types";
import { ChevronDownIcon, ChevronUpIcon } from "./icons";

const CELL_BORDER = "#333154";

const GridView = memo(({ data = [], dataId }) => {
  // Column scans are cached per dataset (see getColumns), so deriving them here is cheap.
  const columns = useMemo(() => getColumns(data), [data]);
  // Per-column sort direction ("asc" | "desc" | null) plus the active column, reset per dataset.
  const [sort, setSort] = useState({ data: null, states: [], index: null });
  const current = sort.data === data;
  const sortState = useMemo(() => (current ? sort.states : []), [current, sort.states]);
  const sortIndex = current ? sort.index : null;

  useEffect(() => {
    setSort({ data, states: columns.map(() => null), index: null });
  }, [dataId, data, columns]);

  // Rows are read by index from the (possibly sorted) dataset; no header row is prepended.
  const rows = useMemo(() => {
    if (sortIndex === null || !columns[sortIndex]) return data;
    const sorted = sortBy(data, [columns[sortIndex].name]);
    return sortState[sortIndex] === "desc" ? sorted.reverse() : sorted;
  }, [data, columns, sortIndex, sortState]);

  const onSort = useCallback(
    (index) => {
      setSort((previous) => {
        const states = previous.data === data ? previous.states : columns.map(() => null);
        return {
          data,
          index,
          states: states.map((value, i) =>
            i === index ? (value === "asc" ? "desc" : "asc") : value,
          ),
        };
      });
    },
    [data, columns],
  );

  const cellRenderer = useCallback(
    ({ columnIndex, key, rowIndex, style }) => {
      const isHeader = rowIndex === 0;
      const name = columns[columnIndex].name;
      const value = isHeader ? name : rows[rowIndex - 1]?.[name];
      const base = {
        ...style,
        borderBottom: `1px solid ${CELL_BORDER}`,
        borderRight: `1px solid ${CELL_BORDER}`,
        paddingTop: 5,
        paddingBottom: 3,
        overflow: "hidden",
      };
      const cellStyle = name === "color" && !isHeader ? { ...base, backgroundColor: value } : base;
      if (isHeader) {
        return (
          <div
            key={key}
            className="flex px-1 hover:opacity-80"
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
          >
            {value}
            <div
              className="mr-[3px] ml-auto flex"
              style={{ opacity: sortState[columnIndex] && sortIndex === columnIndex ? 1 : 0.25 }}
            >
              {sortState[columnIndex] === "desc" ? (
                <ChevronDownIcon style={{ width: 12, height: 12, verticalAlign: "middle" }} />
              ) : (
                <ChevronUpIcon style={{ width: 12, height: 12, verticalAlign: "middle" }} />
              )}
            </div>
          </div>
        );
      }
      return (
        <div key={key} className="flex items-center px-1" style={cellStyle}>
          {value}
        </div>
      );
    },
    [columns, rows, sortState, sortIndex, onSort],
  );

  return (
    <div className="flex h-full">
      {/* react-virtualized 10 ships AutoSizer separately; the size is undefined on first render. */}
      <AutoSizer
        className="h-full min-w-0 flex-1"
        renderProp={({ height, width }) =>
          height && width ? (
            <MultiGrid
              cellRenderer={cellRenderer}
              fixedRowCount={1}
              columnCount={columns.length}
              columnWidth={200}
              height={height}
              rowCount={rows.length + 1}
              rowHeight={25}
              width={width}
            />
          ) : null
        }
      />
    </div>
  );
});
GridView.displayName = "GridView";

export default GridView;
