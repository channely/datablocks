/**
 * Vega chart blocks. Each chart consumes a dataset, keeps its column selection in node data,
 * and forwards the input dataset downstream unchanged.
 */
import React, { useCallback, useEffect, useMemo } from "react";
import { Box, Checkbox, Flex, FormLabel, useTheme } from "@chakra-ui/react";
import { Vega } from "react-vega";
import useStore from "../store";
import useInputData from "../hooks/useInputData";
import useUpdateNodeCurrent from "../hooks/useUpdateNodeCurrent";
import { TYPES, getColumnNames } from "../lib/types";
import ColumnSelect from "../components/ColumnSelect";
import { withNodeWrapper } from "../components/NodeWrapper";

const axisConfig = (theme) => ({
  domainColor: theme.colors.bg.light,
  gridColor: theme.colors.bg.light,
  tickColor: theme.colors.bg.light,
  labelColor: theme.colors.text,
  labelFontSize: 12,
  titleColor: theme.colors.text,
});

const baseConfig = (theme) => ({
  background: theme.colors.bg.grey,
  font: theme.fonts.body,
  axis: axisConfig(theme),
  view: { stroke: "transparent" },
});

const useColumnSync = ({ id, current, valid, xColumn, yColumn, updateNodeData }) => {
  useEffect(() => {
    if (valid) {
      const columns = getColumnNames(current);
      const nextX = !columns.includes(xColumn) && columns[0];
      const nextY = !columns.includes(yColumn) && columns[0];
      if (nextX || nextY) {
        updateNodeData({
          id,
          data: { xColumn: nextX || xColumn, yColumn: nextY || yColumn },
          transient: true,
        });
      }
    }
  }, [valid, xColumn, yColumn, current, updateNodeData, id]);
};

/* --------------------------------- Barchart -------------------------------- */

const BarChartComponent = ({ id, data, color }) => {
  const theme = useTheme();
  const updateNodeData = useStore((state) => state.updateNodeData);
  const addLogs = useStore((state) => state.addLogs);
  const [current, , valid] = useInputData(id, [TYPES.DATASET]);
  const { isHorizontal, xColumn, yColumn } = data;

  const spec = useMemo(() => {
    if (!valid || !xColumn || !yColumn) return null;
    return {
      width: isHorizontal ? 300 : 150,
      height: isHorizontal ? 150 : 300,
      mark: { type: "bar", color },
      config: baseConfig(theme),
      encoding: {
        x: {
          field: xColumn,
          type: isHorizontal ? "ordinal" : "quantitative",
          axis: { labelAngle: 0 },
        },
        y: { field: yColumn, type: isHorizontal ? "quantitative" : "ordinal" },
      },
      data: { name: "data" },
    };
  }, [color, valid, isHorizontal, xColumn, yColumn, theme]);

  useEffect(() => {
    if (spec && !valid) {
      addLogs({ method: "error", data: ["Barchart: Input needs to be tabular data."] });
    }
  }, [spec, valid, addLogs]);

  const vegaData = useMemo(() => ({ data: current }), [current]);

  const onHorizontalChange = useCallback(
    (event) => updateNodeData({ id, data: { isHorizontal: event.target.checked } }),
    [id, updateNodeData],
  );
  const onXChange = useCallback(
    (value) => updateNodeData({ id, data: { xColumn: value } }),
    [id, updateNodeData],
  );
  const onYChange = useCallback(
    (value) => updateNodeData({ id, data: { yColumn: value } }),
    [id, updateNodeData],
  );

  useColumnSync({ id, current, valid, xColumn, yColumn, updateNodeData });
  useUpdateNodeCurrent(id, current);

  return (
    <Box p={2} minWidth={200}>
      {valid ? (
        <>
          <Flex mb={2} width="100%" alignItems="center">
            <Box marginRight="5px" flexShrink={0}>
              x-axis
            </Box>
            <ColumnSelect
              fromHandle={id}
              onChange={onXChange}
              value={xColumn}
              inputData={current}
              inputValid={valid}
            />
          </Flex>
          <Flex mb={2} width="100%" alignItems="center">
            <Box marginRight="5px" flexShrink={0}>
              y-axis
            </Box>
            <ColumnSelect
              fromHandle={id}
              onChange={onYChange}
              value={yColumn}
              inputData={current}
              inputValid={valid}
            />
          </Flex>
          <FormLabel alignItems="center">
            <Checkbox checked={isHorizontal} onChange={onHorizontalChange} />
            horizontal
          </FormLabel>
        </>
      ) : (
        "← connect dataset"
      )}
      <Box>{spec && <Vega spec={spec} data={vegaData} />}</Box>
    </Box>
  );
};
BarChartComponent.displayName = "Barchart";
export const BarChart = withNodeWrapper(BarChartComponent);

/* -------------------------------- Histogram -------------------------------- */

const HistogramComponent = ({ id, data, color }) => {
  const theme = useTheme();
  const updateNodeData = useStore((state) => state.updateNodeData);
  const addLogs = useStore((state) => state.addLogs);
  const [current, , valid] = useInputData(id, [TYPES.DATASET]);
  const { column } = data;

  const spec = useMemo(() => {
    if (!valid || !current) return null;
    return {
      width: 300,
      height: 150,
      mark: { type: "bar", color },
      config: { ...baseConfig(theme), countTitle: `count of ${column}` },
      encoding: {
        x: { bin: { maxbins: 20 }, field: column, type: "quantitative" },
        y: { aggregate: "count", type: "quantitative" },
      },
      data: { name: "data" },
    };
  }, [color, column, valid, current, theme]);

  useEffect(() => {
    if (!valid && current) {
      addLogs({ method: "error", data: ["Histogram: Input needs to be tabular data."] });
    }
  }, [valid, current, addLogs]);

  const vegaData = useMemo(() => ({ data: current }), [current]);

  const onChange = useCallback(
    (value) => updateNodeData({ id, data: { column: value.column || value } }),
    [id, updateNodeData],
  );
  const onChangeData = useCallback(
    ({ column }) => updateNodeData({ id, data: { column }, transient: true }),
    [id, updateNodeData],
  );

  useUpdateNodeCurrent(id, current);

  return (
    <Box p={2} minWidth={200} position="relative" textAlign="left">
      <ColumnSelect
        onChange={onChange}
        onChangeData={onChangeData}
        fromHandle={id}
        color={color}
        sx={{ mb: 1 }}
        value={column}
        inputData={current}
        inputValid={valid}
      />
      {spec && <Vega spec={spec} data={vegaData} />}
    </Box>
  );
};
HistogramComponent.displayName = "Histogram";
export const Histogram = withNodeWrapper(HistogramComponent);

/* -------------------------------- Scatterplot ------------------------------ */

const ScatterplotComponent = ({ id, data, color }) => {
  const theme = useTheme();
  const updateNodeData = useStore((state) => state.updateNodeData);
  const addLogs = useStore((state) => state.addLogs);
  const [current, , valid] = useInputData(id, [TYPES.DATASET]);
  const { xColumn, yColumn } = data;

  const spec = useMemo(() => {
    if (!valid || !xColumn || !yColumn) return null;
    return {
      width: 300,
      height: 150,
      mark: { type: "circle", color },
      config: baseConfig(theme),
      encoding: {
        x: { field: xColumn, type: "quantitative" },
        y: { field: yColumn, type: "quantitative" },
      },
      data: { name: "data" },
    };
  }, [color, valid, xColumn, yColumn, theme]);

  useEffect(() => {
    if (!valid && current) {
      addLogs({ method: "error", data: ["Barchart: Input needs to be tabular data."] });
    }
  }, [valid, current, addLogs]);

  const vegaData = useMemo(() => ({ data: current }), [current]);

  const onXChange = useCallback(
    (value) => updateNodeData({ id, data: { xColumn: value } }),
    [id, updateNodeData],
  );
  const onYChange = useCallback(
    (value) => updateNodeData({ id, data: { yColumn: value } }),
    [id, updateNodeData],
  );

  useColumnSync({ id, current, valid, xColumn, yColumn, updateNodeData });
  useUpdateNodeCurrent(id, current);

  return (
    <Box p={2} minWidth={200}>
      {valid ? (
        <>
          <Flex mb={2} width="100%" alignItems="center">
            <Box marginRight="5px" flexShrink={0}>
              x-axis
            </Box>
            <ColumnSelect
              fromHandle={id}
              onChange={onXChange}
              value={xColumn}
              inputData={current}
              inputValid={valid}
            />
          </Flex>
          <Flex mb={2} width="100%" alignItems="center">
            <Box marginRight="5px" flexShrink={0}>
              y-axis
            </Box>
            <ColumnSelect
              fromHandle={id}
              onChange={onYChange}
              value={yColumn}
              inputData={current}
              inputValid={valid}
            />
          </Flex>
          <Box>{spec && <Vega spec={spec} data={vegaData} />}</Box>
        </>
      ) : (
        "← connect dataset"
      )}
    </Box>
  );
};
ScatterplotComponent.displayName = "Scatterplot";
export const Scatterplot = withNodeWrapper(ScatterplotComponent);

/* -------------------------------- Timeseries ------------------------------- */

const TimeseriesComponent = ({ id, data, color }) => {
  const theme = useTheme();
  const updateNodeData = useStore((state) => state.updateNodeData);
  const addLogs = useStore((state) => state.addLogs);
  const [current, , valid] = useInputData(id, [TYPES.DATASET]);
  const { xColumn, yColumn } = data;

  const spec = useMemo(() => {
    if (!valid || !xColumn || !yColumn) return null;
    return {
      width: 300,
      height: 150,
      mark: { type: "line", color },
      config: baseConfig(theme),
      transform: [xColumn && { as: "xcol", calculate: `toDate(toString(datum.${xColumn}))` }],
      encoding: {
        x: { field: "xcol", type: "temporal" },
        y: { field: yColumn, type: "quantitative" },
      },
      data: { name: "data" },
    };
  }, [color, valid, xColumn, yColumn, theme]);

  useEffect(() => {
    if (!valid && current) {
      addLogs({ method: "error", data: ["Timeseries: Input needs to be tabular data."] });
    }
  }, [valid, current, addLogs]);

  const vegaData = useMemo(() => ({ data: current }), [current]);

  const onXChange = useCallback(
    (value) => updateNodeData({ id, data: { xColumn: value } }),
    [id, updateNodeData],
  );
  const onYChange = useCallback(
    (value) => updateNodeData({ id, data: { yColumn: value } }),
    [id, updateNodeData],
  );

  useColumnSync({ id, current, valid, xColumn, yColumn, updateNodeData });
  useUpdateNodeCurrent(id, current);

  return (
    <Box p={2} minWidth={200}>
      {valid ? (
        <>
          <Flex mb={2} width="100%" alignItems="center">
            <Box marginRight="5px" flexShrink={0}>
              x-axis
            </Box>
            <ColumnSelect
              fromHandle={id}
              onChange={onXChange}
              value={xColumn}
              inputData={current}
              inputValid={valid}
            />
          </Flex>
          <Flex mb={2} width="100%" alignItems="center">
            <Box marginRight="5px" flexShrink={0}>
              y-axis
            </Box>
            <ColumnSelect
              fromHandle={id}
              onChange={onYChange}
              value={yColumn}
              inputData={current}
              inputValid={valid}
            />
          </Flex>
          <Box>{spec && <Vega spec={spec} data={vegaData} />}</Box>
        </>
      ) : (
        "← connect dataset"
      )}
    </Box>
  );
};
TimeseriesComponent.displayName = "Timeseries";
export const Timeseries = withNodeWrapper(TimeseriesComponent);
