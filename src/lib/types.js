/**
 * Value type detection and data-shape helpers shared by blocks, the output view, and exporters.
 * A "dataset" is a non-empty array of flat row objects; GeoJSON/TopoJSON are detected by their
 * `type` field.
 */
import { countBy, flatten, toPairs, sortBy, isDate } from "lodash-es";

export const TYPES = {
  DATASET: "DATASET",
  ARRAY: "ARRAY",
  OBJECT: "OBJECT",
  GEOJSON: "GEOJSON",
  TOPOJSON: "TOPOJSON",
  STRING: "STRING",
  NUMBER: "NUMBER",
  DATE: "DATE",
  BOOLEAN: "BOOLEAN",
  UNDEFINED: "UNDEFINED",
  NULL: "NULL",
  UNKNOWN: "UNKNOWN",
};

export const titlecase = (type) => {
  if (!TYPES[type]) return type;
  const n = TYPES[type];
  return `${n[0]}${n.substr(1, n.length).toLowerCase()}`;
};

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

const GEO_TYPES = [
  "Feature",
  "FeatureCollection",
  "Point",
  "MultiPoint",
  "LineString",
  "MultiLineString",
  "Polygon",
  "MultiPolygon",
  "GeometryCollection",
];

export const isDataset = (value) =>
  Array.isArray(value) &&
  value.length > 0 &&
  isObject(value[0]) &&
  Object.values(value[0]).every((v) => isDate(v) || !isObject(v));

export const isGeo = (value) => isObject(value) && !!value.type && GEO_TYPES.includes(value.type);

export const isFeatureCollection = (value) => isGeo(value) && value.type === "FeatureCollection";

export const isTopology = (value) => isObject(value) && value.type === "Topology";

/** Detects the app-level type of a value (see TYPES). */
export const detect = (value) => {
  const type = typeof value;
  if (type === "string") return TYPES.STRING;
  if (type === "number") return TYPES.NUMBER;
  if (type === "boolean") return TYPES.BOOLEAN;
  if (isDate(value)) return TYPES.DATE;
  if (type === "undefined") return TYPES.UNDEFINED;
  if (value === null) return TYPES.NULL;
  if (isDataset(value)) return TYPES.DATASET;
  if (isGeo(value)) return TYPES.GEOJSON;
  if (isTopology(value)) return TYPES.TOPOJSON;
  if (Array.isArray(value)) return TYPES.ARRAY;
  if (type === "object") return TYPES.OBJECT;
  return TYPES.UNKNOWN;
};

// convert a feature collection into rows
export const geoToRows = (geojson) => {
  if (!isFeatureCollection(geojson)) return [];
  return geojson.features.map((feature) => ({
    ...feature.properties,
    __geometry: JSON.stringify(feature.geometry),
    __type: feature.type,
  }));
};

export const rowsToGeo = (rows) => {
  if (!isDataset(rows) || !getColumnNames(rows).includes("__geometry")) return rows;
  const features = rows.map((row) => {
    const { __geometry, __type, ...properties } = row;
    return {
      geometry: JSON.parse(__geometry),
      type: __type,
      properties,
    };
  });
  return {
    type: "FeatureCollection",
    features,
  };
};

export const columnValue = (row, name) => (row ? row[name] : undefined);

/**
 * Lists columns for a dataset or feature collection, ordered by frequency of appearance.
 * Feature collections are flattened to rows first (properties plus `__geometry`/`__type`).
 */
export const getColumns = (input) => {
  if (!isDataset(input) && !isFeatureCollection(input)) return [];
  const data = isFeatureCollection(input) ? geoToRows(input) : input;
  const keys = flatten(data.map((row) => Object.keys(row || {})));
  const counts = countBy(keys);
  const sorted = sortBy(toPairs(counts), (pair) => -pair[1]);
  return sorted.map(([name]) => {
    const firstValue = data
      .map((row) => (row ? row[name] : undefined))
      .find((value) => {
        const t = detect(value);
        return t !== TYPES.UNDEFINED && t !== TYPES.NULL;
      });
    return { name, type: detect(firstValue) };
  });
};

export const getColumnNames = (input) => getColumns(input).map((column) => column.name);

export const getColumnType = (input, name) => {
  const column = getColumns(input).find((column) => column.name === name);
  return column ? column.type : null;
};

export const formatValue = ({ data, type }) => {
  switch (type) {
    case TYPES.DATASET:
    case TYPES.ARRAY:
    case TYPES.OBJECT:
    case TYPES.GEOJSON:
    case TYPES.TOPOJSON:
      return JSON.stringify(data, null, 2);
    case TYPES.BOOLEAN:
      return data ? "true" : "false";
    case TYPES.DATE:
      return data.toLocaleString();
    case TYPES.UNDEFINED:
      return "undefined";
    case TYPES.NULL:
      return "null";
    default:
      return String(data);
  }
};

/**
 * Normalizes values on insertion into the DataStore. Feature collections with null geometries
 * would break bounding-box and map rendering, so those features are dropped.
 */
export const sanitize = (type) => (data) => {
  if (type === TYPES.GEOJSON && data && data.type === "FeatureCollection") {
    return {
      ...data,
      features: data.features.filter((feature) => !!feature.geometry),
    };
  }
  return data;
};
