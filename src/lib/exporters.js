/**
 * Export formats per detected type. GeoJSON/TopoJSON can be exported as their native format,
 * as rows, or converted; each entry exposes a `filetype` label and a download handler.
 */
import { TYPES } from "./types";
import { unparseCsv, stringifyJson } from "./dataIO";
import { geoToRows } from "./types";
import { download } from "./download";
import * as geo from "./geo";

const downloadCsv = (data) => download(unparseCsv(data), "text/csv", "data.csv");
const downloadJson = (data) => download(stringifyJson(data), "application/json", "data.json");
const downloadGeojson = (data) =>
  download(stringifyJson(data), "application/geo+json", "data.geojson");
const downloadTopojson = (data) =>
  download(stringifyJson(data), "application/json", "data.topo.json");
const downloadGeoAsCsv = (data) => download(unparseCsv(geoToRows(data)), "text/csv", "data.csv");
const downloadGeoAsJson = (data) =>
  download(stringifyJson(geoToRows(data)), "application/json", "data.json");
const downloadText = (data) => download(String(data), "text/plain", "data.txt");
const downloadTopoAsGeo = (data) => {
  const firstKey = Object.keys(data.objects)[0];
  const geojson = geo.topologyToGeo(data, firstKey);
  download(stringifyJson(geojson), "application/geo+json", "data.geojson");
};
const downloadTopoAsTopo = (data) =>
  download(stringifyJson(data), "application/json", "data.topo.json");
const downloadTopoAsCsv = (data) => {
  const firstKey = Object.keys(data.objects)[0];
  const geojson = geo.topologyToGeo(data, firstKey);
  download(unparseCsv(geoToRows(geojson)), "text/csv", "data.csv");
};
const downloadTopoAsJson = (data) => {
  const firstKey = Object.keys(data.objects)[0];
  const geojson = geo.topologyToGeo(data, firstKey);
  download(stringifyJson(geoToRows(geojson)), "application/json", "data.json");
};

const formats = {
  csv: { filetype: "csv", handler: downloadCsv },
  json: { filetype: "json", handler: downloadJson },
  geojson: { filetype: "geojson", handler: downloadGeojson },
  topojson: { filetype: "topo.json", handler: downloadTopojson },
  geoAsCsv: { filetype: "csv", handler: downloadGeoAsCsv },
  geoAsJson: { filetype: "json", handler: downloadGeoAsJson },
  txt: { filetype: "txt", handler: downloadText },
  topoAsGeo: { filetype: "geojson", handler: downloadTopoAsGeo },
  topoAsTopo: { filetype: "topo.json", handler: downloadTopoAsTopo },
  topoAsCsv: { filetype: "csv", handler: downloadTopoAsCsv },
  topoAsJson: { filetype: "json", handler: downloadTopoAsJson },
};

export const getExportFormats = (type) => {
  switch (type) {
    case TYPES.DATASET:
      return [formats.csv, formats.json];
    case TYPES.OBJECT:
    case TYPES.ARRAY:
      return [formats.json];
    case TYPES.TOPOJSON:
      return [formats.topoAsGeo, formats.topoAsTopo, formats.topoAsCsv, formats.topoAsJson];
    case TYPES.GEOJSON:
      return [formats.geojson, formats.topojson, formats.geoAsCsv, formats.geoAsJson];
    case TYPES.DATE:
    case TYPES.STRING:
    case TYPES.NUMBER:
      return [formats.txt];
    default:
      return [];
  }
};
