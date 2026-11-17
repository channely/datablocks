/**
 * Vega chart blocks. Each chart consumes a dataset, keeps its column selection in node data,
 * and forwards the input dataset downstream unchanged.
 */
import { Suspense, lazy, useCallback, useEffect, useMemo } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { colors, fonts } from "@/lib/themeTokens";
import useStore from "../store";
import useInputData from "../hooks/useInputData";
import useUpdateNodeCurrent from "../hooks/useUpdateNodeCurrent";
import { TYPES, getColumnNames } from "../lib/types";
import ColumnSelect from "../components/ColumnSelect";
import { withNodeWrapper } from "../components/NodeWrapper";

const loadVegaChart = () => import("../components/VegaChart");
const VegaChart = lazy(loadVegaChart);

/**
 * Mounting any chart node starts fetching the Vega runtime, so on flow load the chunk downloads
 * and parses while edges are still being connected instead of after the first dataset arrives.
 */
const usePreloadVegaChart = () => {
  useEffect(() => {
    loadVegaChart();
  }, []);
};

/** Reserves the chart's footprint while the Vega runtime loads so the node does not jump. */
const Chart = ({ spec, data }) => (
  <Suspense
    fallback={
      <div
        style={{
          width: `${(spec.width || 300) + 60}px`,
          height: `${(spec.height || 150) + 50}px`,
        }}
        data-testid="chart-loading"
      />
    }
  >
    <VegaChart spec={spec} data={data} />
  </Suspense>
);

const axisConfig = () => ({
  domainColor: colors.bg.light,
  gridColor: colors.bg.light,
  tickColor: colors.bg.light,
  labelColor: colors.text,
  labelFontSize: 12,
  titleColor: colors.text,
});

const baseConfig = () => ({
  background: colors.bg.grey,
  font: fonts.body,
  axis: axisConfig(),
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
  usePreloadVegaChart();
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
      config: baseConfig(),
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
  }, [color, valid, isHorizontal, xColumn, yColumn]);

  useEffect(() => {
    if (spec && !valid) {
      addLogs({ method: "error", data: ["Barchart: Input needs to be tabular data."] });
    }
  }, [spec, valid, addLogs]);

  const vegaData = useMemo(() => ({ data: current }), [current]);

  const onHorizontalChange = useCallback(
    (checked) => updateNodeData({ id, data: { isHorizontal: checked } }),
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
    <div className="min-w-[200px] p-2">
      {valid ? (
        <>
          <div className="mb-2 flex w-full items-center">
            <div className="mr-[5px] shrink-0">x-axis</div>
            <ColumnSelect
              fromHandle={id}
              onChange={onXChange}
              value={xColumn}
              inputData={current}
              inputValid={valid}
            />
          </div>
          <div className="mb-2 flex w-full items-center">
            <div className="mr-[5px] shrink-0">y-axis</div>
            <ColumnSelect
              fromHandle={id}
              onChange={onYChange}
              value={yColumn}
              inputData={current}
              inputValid={valid}
            />
          </div>
          <Label className="flex items-center">
            <Checkbox checked={isHorizontal} onCheckedChange={onHorizontalChange} />
            horizontal
          </Label>
        </>
      ) : (
        "← connect dataset"
      )}
      <div>{spec && <Chart spec={spec} data={vegaData} />}</div>
    </div>
  );
};
BarChartComponent.displayName = "Barchart";
export const BarChart = withNodeWrapper(BarChartComponent);

/* -------------------------------- Histogram -------------------------------- */

const HistogramComponent = ({ id, data, color }) => {
  usePreloadVegaChart();
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
      config: { ...baseConfig(), countTitle: `count of ${column}` },
      encoding: {
        x: { bin: { maxbins: 20 }, field: column, type: "quantitative" },
        y: { aggregate: "count", type: "quantitative" },
      },
      data: { name: "data" },
    };
  }, [color, column, valid, current]);

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
    <div className="relative min-w-[200px] p-2 text-left">
      <ColumnSelect
        onChange={onChange}
        onChangeData={onChangeData}
        fromHandle={id}
        color={color}
        className="mb-1"
        value={column}
        inputData={current}
        inputValid={valid}
      />
      {spec && <Chart spec={spec} data={vegaData} />}
    </div>
  );
};
HistogramComponent.displayName = "Histogram";
export const Histogram = withNodeWrapper(HistogramComponent);

/* -------------------------------- Scatterplot ------------------------------ */

const ScatterplotComponent = ({ id, data, color }) => {
  usePreloadVegaChart();
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
      config: baseConfig(),
      encoding: {
        x: { field: xColumn, type: "quantitative" },
        y: { field: yColumn, type: "quantitative" },
      },
      data: { name: "data" },
    };
  }, [color, valid, xColumn, yColumn]);

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
    <div className="min-w-[200px] p-2">
      {valid ? (
        <>
          <div className="mb-2 flex w-full items-center">
            <div className="mr-[5px] shrink-0">x-axis</div>
            <ColumnSelect
              fromHandle={id}
              onChange={onXChange}
              value={xColumn}
              inputData={current}
              inputValid={valid}
            />
          </div>
          <div className="mb-2 flex w-full items-center">
            <div className="mr-[5px] shrink-0">y-axis</div>
            <ColumnSelect
              fromHandle={id}
              onChange={onYChange}
              value={yColumn}
              inputData={current}
              inputValid={valid}
            />
          </div>
          <div>{spec && <Chart spec={spec} data={vegaData} />}</div>
        </>
      ) : (
        "← connect dataset"
      )}
    </div>
  );
};
ScatterplotComponent.displayName = "Scatterplot";
export const Scatterplot = withNodeWrapper(ScatterplotComponent);

/* -------------------------------- Timeseries ------------------------------- */

const TimeseriesComponent = ({ id, data, color }) => {
  usePreloadVegaChart();
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
      config: baseConfig(),
      transform: [xColumn && { as: "xcol", calculate: `toDate(toString(datum.${xColumn}))` }],
      encoding: {
        x: { field: "xcol", type: "temporal" },
        y: { field: yColumn, type: "quantitative" },
      },
      data: { name: "data" },
    };
  }, [color, valid, xColumn, yColumn]);

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
    <div className="min-w-[200px] p-2">
      {valid ? (
        <>
          <div className="mb-2 flex w-full items-center">
            <div className="mr-[5px] shrink-0">x-axis</div>
            <ColumnSelect
              fromHandle={id}
              onChange={onXChange}
              value={xColumn}
              inputData={current}
              inputValid={valid}
            />
          </div>
          <div className="mb-2 flex w-full items-center">
            <div className="mr-[5px] shrink-0">y-axis</div>
            <ColumnSelect
              fromHandle={id}
              onChange={onYChange}
              value={yColumn}
              inputData={current}
              inputValid={valid}
            />
          </div>
          <div>{spec && <Chart spec={spec} data={vegaData} />}</div>
        </>
      ) : (
        "← connect dataset"
      )}
    </div>
  );
};
TimeseriesComponent.displayName = "Timeseries";
export const Timeseries = withNodeWrapper(TimeseriesComponent);
