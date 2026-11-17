/**
 * Geo blocks. Most are thin wrappers around `lib/geo` that publish the transformed GeoJSON;
 * Buffer and Simplify also keep their parameters in node data.
 */
import React, { useCallback, useEffect, useMemo } from "react";
import { Box, Button, FormLabel, Input, Select, Slider } from "@chakra-ui/react";
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
  geoToTopology,
  makeFeatureCollection,
  makePoint,
  simplifyTopology,
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
    <Box p={2} minWidth={200}>
      {result !== null ? (
        <Box
          as="pre"
          className="nodrag"
          margin={0}
          userSelect="all"
          cursor="text"
          style={{ margin: 0, userSelect: "all", cursor: "text" }}
        >
          {format(isJsonOutput ? JSON.stringify(result, null, 2) : result)}
        </Box>
      ) : (
        "← connect geojson…"
      )}
    </Box>
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
    (event) => {
      const result = bufferGeo(input, event.target.value, { units: "kilometers" });
      updateNodeData({ id, data: { distance: event.target.value, current: result } });
    },
    [id, updateNodeData, input],
  );

  useEffect(() => {
    if (valid) {
      const result = bufferGeo(input, distance, { units: "kilometers" });
      updateNodeData({ id, data: { current: result } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, input, valid, updateNodeData]);

  return (
    <Box p={2} minWidth={200}>
      {valid ? (
        <>
          <FormLabel mb={1} color="silverDarken30">
            Distance in kilometers
          </FormLabel>
          <Input
            value={distance}
            onChange={onDistanceChange}
            className="nodrag"
            mb={2}
            width="200px"
            type="number"
          />
        </>
      ) : (
        "← connect geojson…"
      )}
    </Box>
  );
};
BufferComponent.displayName = "Buffer";
export const Buffer = withNodeWrapper(BufferComponent);

/* --------------------------------- Simplify -------------------------------- */

const SimplifyComponent = ({ id, data }) => {
  const { sliderValue } = data;
  const [input, inputType, valid] = useInputData(id, [TYPES.GEOJSON, TYPES.TOPOJSON]);
  const addLogs = useStore((state) => state.addLogs);
  const updateNodeData = useStore((state) => state.updateNodeData);

  const scale = scalePow().exponent(5).domain([1e-4, 1]).range([1e-4, 1]);
  const weight = sliderValue < 1e-4 ? 0 : scale(sliderValue);

  const presimplified = useMemo(() => {
    if (!valid || !input) return null;
    try {
      const topology = inputType === TYPES.TOPOJSON ? input : geoToTopology(input);
      return simplifyTopology(topology, weight);
    } catch (error) {
      addLogs({ method: "error", data: [error.message] });
      return null;
    }
  }, [input, inputType, valid, addLogs, weight]);

  const result = useMemo(() => {
    if (!presimplified) return null;
    try {
      return presimplified;
    } catch (error) {
      addLogs({ method: "error", data: [error.message] });
      return null;
    }
  }, [addLogs, presimplified]);

  const onSliderChange = useCallback(
    (value) => updateNodeData({ id, data: { sliderValue: value } }),
    [id, updateNodeData],
  );

  useUpdateNodeCurrent(id, result);

  return (
    <Box p={2} minWidth={200}>
      {result !== null ? (
        <Box className="nodrag" px={2}>
          <Slider min={0} max={1} step={1e-4} value={sliderValue} onChange={onSliderChange} />
          {(100 * weight).toFixed(3)}%
        </Box>
      ) : (
        "← connect geojson…"
      )}
    </Box>
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
    ({ column }) => updateNodeData({ id, data: { lngColumn: column } }),
    [id, updateNodeData],
  );
  const onLatChangeData = useCallback(
    ({ column }) => updateNodeData({ id, data: { latColumn: column } }),
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
    <Box p={2} minWidth={200}>
      <FormLabel mb={1} mt={2} color="silverDarken30">
        Longitude column:
      </FormLabel>
      <ColumnSelect
        fromHandle={id}
        onChange={onLngChange}
        onChangeData={onLngChangeData}
        value={lngColumn}
        inputData={input}
        inputValid={valid}
      />
      <FormLabel mb={1} mt={2} color="silverDarken30">
        Latitude column:
      </FormLabel>
      <ColumnSelect
        fromHandle={id}
        onChange={onLatChange}
        onChangeData={onLatChangeData}
        value={latColumn}
        inputData={input}
        inputValid={valid}
      />
      <Button mt={2} onClick={run}>
        Run
      </Button>
    </Box>
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
      updateNodeData({ id, data: { layers: nextLayers, layer: nextLayers[0] } });
    }
  }, [id, input, valid, updateNodeData]);

  const onLayerChange = useCallback(
    (event) => updateNodeData({ id, data: { layer: event.target.value } }),
    [id, updateNodeData],
  );

  useUpdateNodeCurrent(id, result);

  return (
    <Box p={2} minWidth={200}>
      {layers ? (
        <Box className="nodrag" px={2}>
          <FormLabel mb={1} color="silverDarken30">
            Layer:
          </FormLabel>
          <Select onChange={onLayerChange}>
            {layers.map((value) => (
              <option value={value} key={value}>
                {value}
              </option>
            ))}
          </Select>
        </Box>
      ) : (
        "← connect topojson…"
      )}
    </Box>
  );
};
TopoToGeoComponent.displayName = "TopoToGeo";
export const TopoToGeo = withNodeWrapper(TopoToGeoComponent);

export { geoToRows };
