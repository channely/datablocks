/**
 * Geo blocks. Most are thin wrappers around `lib/geo` that publish the transformed GeoJSON;
 * Buffer and Simplify also keep their parameters in node data.
 */
import { useCallback, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Slider } from "@/components/ui/slider";
import { feature as topojsonFeature } from "topojson-client";
import { scalePow } from "d3-scale";
import useStore from "../store";
import useInputData from "../hooks/useInputData";
import useUpdateNodeCurrent from "../hooks/useUpdateNodeCurrent";
import { TYPES, geoToRows } from "../lib/types";
import {
  area as getArea,
  bboxPolygon,
  bufferGeo,
  centroid as getCentroid,
  makeFeatureCollection,
  makePoint,
  presimplifyTopology,
  simplifyPresimplified,
} from "../lib/geo";
import ColumnSelect from "../components/ColumnSelect";
import { withNodeWrapper } from "../components/NodeWrapper";

/* --------------------------- shared geo transform --------------------------- */

const GeoTransform = ({
  id,
  nodeName,
  transformFunc,
  format = (value) => value,
  isJsonOutput = true,
}) => {
  const [input, inputType, valid] = useInputData(id, [TYPES.GEOJSON]);
  const addLogs = useStore((state) => state.addLogs);

  const result = useMemo(() => {
    if (!valid) {
      if (typeof inputType !== "undefined") {
        addLogs({
          method: "error",
          data: [`${nodeName}: ${inputType} is not a valid input type. Only Geojson is allowed.`],
        });
      }
      return null;
    }
    try {
      return transformFunc(input);
    } catch (error) {
      addLogs({ method: "error", data: [error.message] });
      return null;
    }
  }, [valid, input, inputType, transformFunc, addLogs, nodeName]);

  useUpdateNodeCurrent(id, result);

  return (
    <div className="min-w-[200px] p-2">
      {result !== null ? (
        <pre
          className="nodrag m-0 cursor-text select-all"
          style={{ margin: 0, userSelect: "all", cursor: "text" }}
        >
          {format(isJsonOutput ? JSON.stringify(result, null, 2) : result)}
        </pre>
      ) : (
        "← connect geojson…"
      )}
    </div>
  );
};

const BoundingBoxComponent = ({ id }) => (
  <GeoTransform
    id={id}
    nodeName="Bounding Box"
    transformFunc={(input) => bboxPolygon(input)}
    format={(result) => JSON.stringify(result?.bbox, null, 2)}
    isJsonOutput={false}
  />
);
BoundingBoxComponent.displayName = "BoundingBox";
export const BoundingBox = withNodeWrapper(BoundingBoxComponent);

const CentroidComponent = ({ id }) => (
  <GeoTransform
    id={id}
    nodeName="Centroid"
    transformFunc={(input) => getCentroid(input)}
    format={(result) => JSON.stringify(result?.geometry?.coordinates, null, 2)}
    isJsonOutput={false}
  />
);
CentroidComponent.displayName = "Centroid";
export const Centroid = withNodeWrapper(CentroidComponent);

const AreaComponent = ({ id }) => (
  <GeoTransform
    id={id}
    nodeName="Area"
    transformFunc={(input) => getArea(input)}
    format={(value) => (value ? `${value.toFixed(2)} square meters` : null)}
    isJsonOutput={false}
  />
);
AreaComponent.displayName = "Area";
export const Area = withNodeWrapper(AreaComponent);

/* ---------------------------------- Buffer --------------------------------- */

const BufferComponent = ({ id, data }) => {
  const [input, inputType, valid] = useInputData(id, [TYPES.GEOJSON]);
  const addLogs = useStore((state) => state.addLogs);
  const updateNodeData = useStore((state) => state.updateNodeData);
  const { distance } = data;

  useEffect(() => {
    if (!valid && typeof inputType !== "undefined") {
      addLogs({
        method: "error",
        data: [`Buffer: ${inputType} is not a valid input type. Only Geojson is allowed.`],
      });
    }
  }, [inputType, valid, addLogs]);

  const onDistanceChange = useCallback(
    (event) => updateNodeData({ id, data: { distance: event.target.value } }),
    [id, updateNodeData],
  );

  // The buffered geometry is derived from the input and distance, so it is written transiently.
  useEffect(() => {
    if (!valid) return undefined;
    let cancelled = false;
    bufferGeo(input, distance, { units: "kilometers" })
      .then((result) => {
        if (!cancelled) updateNodeData({ id, data: { current: result }, transient: true });
      })
      .catch((error) => {
        if (!cancelled) addLogs({ method: "error", data: ["Buffer failed.", error.message] });
      });
    return () => {
      cancelled = true;
    };
  }, [id, input, valid, distance, updateNodeData, addLogs]);

  return (
    <div className="min-w-[200px] p-2">
      {valid ? (
        <>
          <Label className="mb-1 text-silver-darken30">Distance in kilometers</Label>
          <Input
            value={distance}
            onChange={onDistanceChange}
            className="nodrag mb-2 w-[200px]"
            type="number"
          />
        </>
      ) : (
        "← connect geojson…"
      )}
    </div>
  );
};
BufferComponent.displayName = "Buffer";
export const Buffer = withNodeWrapper(BufferComponent);

/* --------------------------------- Simplify -------------------------------- */

const SimplifyComponent = ({ id, data }) => {
  const { sliderValue } = data;
  const [input, , valid] = useInputData(id, [TYPES.GEOJSON, TYPES.TOPOJSON]);
  const addLogs = useStore((state) => state.addLogs);
  const updateNodeData = useStore((state) => state.updateNodeData);

  const scale = scalePow().exponent(5).domain([1e-4, 1]).range([1e-4, 1]);
  const weight = sliderValue < 1e-4 ? 0 : scale(sliderValue);

  // Building the topology is the expensive step; it depends only on the input, so dragging the
  // slider reruns just the quantile + simplify pass.
  const presimplified = useMemo(() => {
    if (!valid || !input) return null;
    try {
      return presimplifyTopology(input);
    } catch (error) {
      addLogs({ method: "error", data: [error.message] });
      return null;
    }
  }, [input, valid, addLogs]);

  const result = useMemo(() => {
    if (!presimplified) return null;
    try {
      return simplifyPresimplified(presimplified, weight);
    } catch (error) {
      addLogs({ method: "error", data: [error.message] });
      return null;
    }
  }, [addLogs, presimplified, weight]);

  const onSliderChange = useCallback(
    ([value]) => updateNodeData({ id, data: { sliderValue: value } }),
    [id, updateNodeData],
  );

  useUpdateNodeCurrent(id, result);

  return (
    <div className="min-w-[200px] p-2">
      {result !== null ? (
        <div className="nodrag px-2">
          <Slider
            min={0}
            max={1}
            step={1e-4}
            value={[sliderValue ?? 1]}
            onValueChange={onSliderChange}
          />
          {(100 * weight).toFixed(3)}%
        </div>
      ) : (
        "← connect geojson…"
      )}
    </div>
  );
};
SimplifyComponent.displayName = "Simplify";
export const Simplify = withNodeWrapper(SimplifyComponent);

/* -------------------------------- Data2Points ------------------------------- */

const isNumber = (value) => typeof value === "number";

const DataToPointsComponent = ({ id, data }) => {
  const [input, , valid] = useInputData(id, [TYPES.DATASET]);
  const updateNodeData = useStore((state) => state.updateNodeData);
  const { latColumn, lngColumn } = data;

  const onLngChange = useCallback(
    (column) => updateNodeData({ id, data: { lngColumn: column } }),
    [id, updateNodeData],
  );
  const onLatChange = useCallback(
    (column) => updateNodeData({ id, data: { latColumn: column } }),
    [id, updateNodeData],
  );
  const onLngChangeData = useCallback(
    ({ column }) => updateNodeData({ id, data: { lngColumn: column }, transient: true }),
    [id, updateNodeData],
  );
  const onLatChangeData = useCallback(
    ({ column }) => updateNodeData({ id, data: { latColumn: column }, transient: true }),
    [id, updateNodeData],
  );

  const run = useCallback(() => {
    const features = input
      .filter((row) => isNumber(row[lngColumn]) && isNumber(row[latColumn]))
      .map((row) =>
        makePoint([Number.parseFloat(row[lngColumn]), Number.parseFloat(row[latColumn])], row),
      );
    const collection = makeFeatureCollection(features);
    updateNodeData({ id, data: { current: collection } });
  }, [input, updateNodeData, id, lngColumn, latColumn]);

  return (
    <div className="min-w-[200px] p-2">
      <Label className="mt-2 mb-1 text-silver-darken30">Longitude column:</Label>
      <ColumnSelect
        fromHandle={id}
        onChange={onLngChange}
        onChangeData={onLngChangeData}
        value={lngColumn}
        inputData={input}
        inputValid={valid}
      />
      <Label className="mt-2 mb-1 text-silver-darken30">Latitude column:</Label>
      <ColumnSelect
        fromHandle={id}
        onChange={onLatChange}
        onChangeData={onLatChangeData}
        value={latColumn}
        inputData={input}
        inputValid={valid}
      />
      <Button className="mt-2" onClick={run}>
        Run
      </Button>
    </div>
  );
};
DataToPointsComponent.displayName = "DataToPoints";
export const DataToPoints = withNodeWrapper(DataToPointsComponent);

/* ------------------------------ Topojson to Geo ----------------------------- */

const TopoToGeoComponent = ({ id, data }) => {
  const [input, inputType, valid] = useInputData(id, [TYPES.TOPOJSON]);
  const addLogs = useStore((state) => state.addLogs);
  const updateNodeData = useStore((state) => state.updateNodeData);
  const { layers, layer } = data;

  const result = useMemo(() => {
    if (!valid) {
      if (typeof inputType !== "undefined") {
        addLogs({
          method: "error",
          data: [
            `Toposjson to Geojson: ${inputType} is not a valid input type. Only Topojson is allowed.`,
          ],
        });
      }
      return null;
    }
    if (!layer) return null;
    try {
      return topojsonFeature(input, input.objects[layer]);
    } catch (error) {
      addLogs({ method: "error", data: [error.message] });
      return null;
    }
  }, [valid, inputType, addLogs, input, layer]);

  useEffect(() => {
    if (valid) {
      const nextLayers = Object.keys(input.objects);
      updateNodeData({
        id,
        data: { layers: nextLayers, layer: nextLayers[0] },
        transient: true,
      });
    }
  }, [id, input, valid, updateNodeData]);

  const onLayerChange = useCallback(
    (event) => updateNodeData({ id, data: { layer: event.target.value } }),
    [id, updateNodeData],
  );

  useUpdateNodeCurrent(id, result);

  return (
    <div className="min-w-[200px] p-2">
      {layers ? (
        <div className="nodrag px-2">
          <Label className="mb-1 text-silver-darken30">Layer:</Label>
          <NativeSelect onChange={onLayerChange}>
            {layers.map((value) => (
              <option value={value} key={value}>
                {value}
              </option>
            ))}
          </NativeSelect>
        </div>
      ) : (
        "← connect topojson…"
      )}
    </div>
  );
};
TopoToGeoComponent.displayName = "TopoToGeo";
export const TopoToGeo = withNodeWrapper(TopoToGeoComponent);

export { geoToRows };
