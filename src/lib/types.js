/**
 * Value type detection and data-shape helpers shared by blocks, the output view, and exporters.
 * A "dataset" is a non-empty array of flat row objects; GeoJSON/TopoJSON are detected by their
 * `type` field.
 */
import { countBy, flatten, toPairs, sortBy, isDate } from "lodash-es";
import { count } from "./perf";

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

/*
 * Datasets are treated as immutable: blocks derive new arrays instead of editing their input. That
 * makes it safe to memoize the O(rows × columns) scans below by object identity.
 */
const rowsCache = new WeakMap();
const columnsCache = new WeakMap();

// convert a feature collection into rows
export const geoToRows = (geojson) => {
  if (!isFeatureCollection(geojson)) return [];
  const cached = rowsCache.get(geojson);
  if (cached) return cached;
  const rows = geojson.features.map((feature) => ({
    ...feature.properties,
    __geometry: JSON.stringify(feature.geometry),
    __type: feature.type,
  }));
  rowsCache.set(geojson, rows);
  return rows;
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
 * Results are cached per input object; callers must not mutate the returned array.
 */
export const getColumns = (input) => {
  if (!isDataset(input) && !isFeatureCollection(input)) return [];
  const cached = columnsCache.get(input);
  if (cached) return cached;
  count("columnScan");
  const data = isFeatureCollection(input) ? geoToRows(input) : input;
  const keys = flatten(data.map((row) => Object.keys(row || {})));
  const counts = countBy(keys);
  const sorted = sortBy(toPairs(counts), (pair) => -pair[1]);
  const columns = sorted.map(([name]) => {
    let firstValue;
    for (let i = 0; i < data.length; i += 1) {
      const value = data[i] ? data[i][name] : undefined;
      if (value !== undefined && value !== null) {
        firstValue = value;
        break;
      }
    }
    return { name, type: detect(firstValue) };
  });
  columnsCache.set(input, columns);
  return columns;
};

const namesCache = new WeakMap();
/** Column names in `getColumns` order; the array is cached per input and must not be mutated. */
export const getColumnNames = (input) => {
  const columns = getColumns(input);
  let names = namesCache.get(columns);
  if (!names) {
    names = columns.map((column) => column.name);
    namesCache.set(columns, names);
  }
  return names;
};

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
