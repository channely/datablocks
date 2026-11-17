/**
 * GeoJSON/TopoJSON output view: Mapbox GL map with a table toggle.
 *
 * The fallback token/style belong to the original public demo. Override them with
 * VITE_MAPBOX_TOKEN / VITE_MAPBOX_STYLE and restrict your own token by domain. Map rendering
 * requires network access to Mapbox; the table toggle remains usable offline.
 */
import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import { Box, Button } from "@chakra-ui/react";
import MapGL, { Layer, Source, WebMercatorViewport } from "react-map-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { TYPES, geoToRows } from "../lib/types";
import { getBbox, topologyToGeo } from "../lib/geo";
import GridView from "./GridView";

const MAPBOX_TOKEN =
  import.meta.env.VITE_MAPBOX_TOKEN ||
  "pk.eyJ1IjoibW9rbGljayIsImEiOiJCa1Z5dGN3In0.O90iOz45MNXs89_0-P5qKA";
const MAPBOX_STYLE =
  import.meta.env.VITE_MAPBOX_STYLE || "mapbox://styles/moklick/cklb0rpeg0z9817qrp2t4rvrq";

const getColor = (fallback = "transparent") => [
  "case",
  ["boolean", ["has", "color"], false],
  ["get", "color"],
  fallback,
];

const FILL_LAYER = {
  source: "geojson",
  id: "fill-layer",
  type: "fill",
  paint: { "fill-color": getColor() },
};

const LINE_LAYER = {
  source: "geojson",
  id: "line-layer",
  type: "line",
  paint: { "line-color": "#eee", "line-width": 0.8 },
};

const CIRCLE_LAYER = {
  source: "geojson",
  id: "circle-layer",
  type: "circle",
  paint: {
    "circle-color": getColor("#eee"),
    "circle-radius": {
      stops: [
        [0, 1],
        [20, 6],
      ],
    },
  },
};

const GeoViewMapboxGL = memo(({ data }) => {
  const [viewport, setViewport] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    const rect = ref.current.getBoundingClientRect();
    const [minX, minY, maxX, maxY] = getBbox(data);
    const bounds = [
      [minX, minY],
      [maxX, maxY],
    ];
    const nextViewport = new WebMercatorViewport({
      width: rect.width,
      height: rect.height,
    }).fitBounds(bounds, { padding: 20 });
    setViewport(nextViewport);
  }, [data]);

  const layers = useMemo(() => {
    const first = (data.features ? data.features : [data])[0];
    return first?.geometry?.type === "Point" ? (
      <Layer {...CIRCLE_LAYER} />
    ) : (
      <>
        <Layer {...FILL_LAYER} />
        <Layer {...LINE_LAYER} />
      </>
    );
  }, [data]);

  return (
    <Box ref={ref} position="relative" overflow="hidden" height="100%">
      {viewport && (
        <MapGL
          {...viewport}
          mapboxApiAccessToken={MAPBOX_TOKEN}
          mapStyle={MAPBOX_STYLE}
          onViewportChange={setViewport}
          width="100%"
          height="100%"
        >
          <Source type="geojson" id="geojson" data={data}>
            {layers}
          </Source>
        </MapGL>
      )}
    </Box>
  );
});
GeoViewMapboxGL.displayName = "GeoViewMapboxGL";

const GeoView = ({ data, type }) => {
  const geojson = useMemo(
    () => (type === TYPES.TOPOJSON ? topologyToGeo(data, Object.keys(data.objects)[0]) : data),
    [data, type],
  );
  const rows = useMemo(() => geoToRows(geojson), [geojson]);
  const [view, setView] = useState("geo");

  return (
    <Box position="relative" height="100%">
      <Box
        position="absolute"
        right="16px"
        bottom="24px"
        zIndex={1000}
        sx={{ button: { fontWeight: 400 } }}
      >
        <Button onClick={() => setView("geo")} mr={2}>
          Map View
        </Button>
        <Button onClick={() => setView("data")}>Data View</Button>
      </Box>
      {view === "geo" ? <GeoViewMapboxGL data={geojson} /> : <GridView data={rows} />}
    </Box>
  );
};

export default GeoView;
