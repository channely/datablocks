/**
 * Block registry: the single source of truth for the library, node type map, and default node
 * data. `input`/`output` list accepted TYPES; `null` means the block has no handle on that side.
 * Keep `type` values stable because they are persisted in saved flows.
 */
import { TYPES } from "../lib/types";
import { File, Paste, Request, Spreadsheet, ExampleData } from "./inputBlocks";
import {
  Filter,
  Merge,
  Group,
  Slice,
  Sort,
  RenameColumns,
  Js,
  Geocode,
  Colorize,
} from "./transformBlocks";
import { BarChart, Histogram, Scatterplot, Timeseries } from "./chartBlocks";
import {
  BoundingBox,
  Centroid,
  Area,
  Buffer,
  Simplify,
  DataToPoints,
  TopoToGeo,
} from "./geoBlocks";
import { Stats, Markdown, Export } from "./miscBlocks";

export const GROUPS = [
  { key: "input", label: "Input", icon: "input" },
  { key: "transform", label: "Transform", icon: "transform" },
  { key: "visualization", label: "Visualization", icon: "chart" },
  { key: "geo data", label: "Geo Data", icon: "geo" },
  { key: "misc", label: "Misc", icon: "misc" },
];

const definitions = [
  {
    type: "file",
    component: File,
    description: "Handles csv, json, geojson or topojson files.",
    input: null,
    output: [TYPES.DATASET, TYPES.GEOJSON],
    data: { label: "File", group: "input" },
  },
  {
    type: "paste",
    component: Paste,
    description: "Paste input: string, number, csv, json, geojson or topojson.",
    input: null,
    output: [TYPES.DATASET, TYPES.OBJECT, TYPES.STRING, TYPES.NUMBER, TYPES.GEOJSON],
    data: {
      label: "Paste",
      group: "input",
      inputValue: "",
      inputType: "json",
      inputTypeOptions: ["json", "csv", "text"],
    },
  },
  {
    type: "request",
    component: Request,
    description: "Loads data via a http request.",
    input: null,
    output: [TYPES.DATASET, TYPES.OBJECT, TYPES.GEOJSON],
    data: { label: "HTTP Request", group: "input", url: "" },
  },
  {
    type: "spreadsheet",
    component: Spreadsheet,
    description: "Loads data from google sheets.",
    input: null,
    output: [TYPES.DATASET],
    data: { label: "Sheets", group: "input", sheetIdInput: "" },
  },
  {
    type: "exampledata",
    component: ExampleData,
    description: "Some example data for playing around with data blocks.",
    output: [TYPES.DATASET, TYPES.GEOJSON],
    data: { label: "Example Data", group: "input", index: 0 },
  },
  {
    type: "filter",
    component: Filter,
    description: "Groups a data set based on a given column name.",
    input: [TYPES.DATASET],
    output: [TYPES.DATASET],
    data: {
      label: "Filter",
      group: "transform",
      column: "",
      conditionValue: "",
      conditionId: "",
    },
  },
  {
    type: "merge",
    component: Merge,
    description: "Merges two data sets based on the given column names.",
    input: [TYPES.DATASET, TYPES.GEOJSON],
    output: [TYPES.DATASET],
    data: {
      label: "Merge",
      group: "transform",
      baseColumn: "",
      baseData: null,
      insertColumn: "",
      insertData: null,
      mergeCount: 0,
    },
  },
  {
    type: "grouping",
    component: Group,
    description: "Groups a data set based on a given column name.",
    input: [TYPES.DATASET, TYPES.GEOJSON],
    output: [TYPES.DATASET],
    data: { label: "Group", group: "transform", column: "" },
  },
  {
    type: "slice",
    component: Slice,
    description: "Slices a data set based on indices.",
    input: [TYPES.DATASET, TYPES.ARRAY],
    output: [TYPES.DATASET],
    data: {
      label: "Slice",
      group: "transform",
      startIndex: 0,
      endIndex: "",
    },
  },
  {
    type: "sort",
    component: Sort,
    description: "Sorts data based on a given column.",
    input: [TYPES.DATASET],
    output: [TYPES.DATASET],
    data: {
      label: "Sort",
      group: "transform",
      order: "asc",
      column: "",
    },
  },
  {
    type: "rename-cols",
    component: RenameColumns,
    description: "Renames multiple columns.",
    input: [TYPES.DATASET],
    output: [TYPES.DATASET],
    data: {
      label: "Rename Columns",
      group: "transform",
      inputs: [{ old: "", new: null }],
    },
  },
  {
    type: "js",
    component: Js,
    input: Object.values(TYPES),
    output: Object.values(TYPES),
    description:
      "The most powerful node! Takes two inputs (can be everything) and lets you transform it with Javascript.",
    data: {
      label: "Javascript",
      group: "transform",
      code: "// your code here\n\nreturn null;",
    },
  },
  {
    type: "geocode",
    component: Geocode,
    input: [TYPES.DATASET],
    output: [TYPES.DATASET],
    description:
      "Adds latitude and longitude to each entry of a data set. Can be used with Here or Google Maps.",
    data: {
      label: "Geocode",
      group: "transform",
      apiKey: "",
      column: "",
      provider: "googlemaps",
    },
  },
  {
    type: "colorize",
    component: Colorize,
    input: [TYPES.DATASET, TYPES.GEOJSON],
    output: [TYPES.DATASET],
    description: 'Adds "color" property to each entry of a data set or geojson.',
    data: {
      label: "Colorize",
      group: "transform",
      colorScale: ["#fafa6e", "#9cdf7c", "#4abd8c", "#00968e", "#106e7c", "#2a4858"],
    },
  },
  {
    type: "bbox",
    component: BoundingBox,
    description: "Calculates the bounding box of a given geojson.",
    input: [TYPES.GEOJSON],
    output: [TYPES.GEOJSON],
    data: { label: "Bounding Box", group: "geo data" },
  },
  {
    type: "centroid",
    component: Centroid,
    description: "Calculates the centroid of a given geojson.",
    input: [TYPES.GEOJSON],
    output: [TYPES.GEOJSON],
    data: { label: "Centroid", group: "geo data" },
  },
  {
    type: "area",
    component: Area,
    input: [TYPES.GEOJSON],
    output: [TYPES.NUMBER],
    description: "Calculates the area in square meters of a given geojson.",
    data: { label: "Area", group: "geo data" },
  },
  {
    type: "buffer",
    component: Buffer,
    input: [TYPES.GEOJSON],
    output: [TYPES.GEOJSON],
    description: "Buffers a geojson.",
    data: { label: "Buffer", group: "geo data", distance: 0 },
  },
  {
    type: "simplify",
    component: Simplify,
    input: [TYPES.GEOJSON],
    output: [TYPES.GEOJSON],
    description: "Simplifies a geojson.",
    data: { label: "Simplify", group: "geo data", sliderValue: 1 },
  },
  {
    type: "data2points",
    component: DataToPoints,
    input: [TYPES.DATASET],
    output: [TYPES.GEOJSON],
    description: "Converts data rows to a feature collection with points.",
    data: {
      label: "Data to Points",
      group: "geo data",
      latColumn: "",
      lngColumn: "",
    },
  },
  {
    type: "topo2geo",
    component: TopoToGeo,
    input: [TYPES.TOPOJSON],
    output: [TYPES.GEOJSON],
    description: "Converts a Topojson to Geojson.",
    data: {
      label: "Topojson to Geojson",
      group: "geo data",
      layer: "",
      layers: null,
    },
  },
  {
    type: "barchart",
    component: BarChart,
    description: "Displays a bar chart of given x and y column names.",
    input: [TYPES.DATASET],
    output: [TYPES.DATASET],
    data: {
      label: "Barchart",
      group: "visualization",
      isHorizontal: true,
      xColumn: "",
      yColumn: "",
    },
  },
  {
    type: "histogram",
    component: Histogram,
    description: "Displays a histogram of a given column name.",
    input: [TYPES.DATASET],
    output: [TYPES.DATASET],
    data: { label: "Histogram", group: "visualization", column: "" },
  },
  {
    type: "scatterplot",
    component: Scatterplot,
    description: "Displays a scatterplot of given x and y column names.",
    input: [TYPES.DATASET],
    output: [TYPES.DATASET],
    data: {
      label: "Scatterplot",
      group: "visualization",
      xColumn: "",
      yColumn: "",
    },
  },
  {
    type: "timeseries",
    component: Timeseries,
    description: "Displays a timeseries line chart of given x and y column names.",
    input: [TYPES.DATASET],
    output: [TYPES.DATASET],
    data: {
      label: "Time Series",
      group: "visualization",
      xColumn: "",
      yColumn: "",
    },
  },
  {
    type: "statistics",
    component: Stats,
    description: "Gives you min, max, avg, mean and count of a given column name.",
    input: [TYPES.DATASET],
    output: null,
    data: { label: "Stats", group: "misc" },
  },
  {
    type: "markdown",
    component: Markdown,
    description: "Lets you write some markdown.",
    input: null,
    output: null,
    data: {
      label: "Markdown",
      group: "misc",
      mode: "write",
      inputValue: "## hello datablocks",
    },
  },
  {
    type: "export",
    component: Export,
    description: "Lets you export data as csv, json or geojson.",
    input: [TYPES.DATASET, TYPES.GEOJSON, TYPES.TOPOJSON, TYPES.OBJECT],
    output: null,
    data: { label: "Export", group: "misc" },
  },
];

export const BLOCKS = definitions;

/** @param {string} type Registry key. */
export const getBlock = (type) => definitions.find((definition) => definition.type === type);

/** Builds the React Flow `nodeTypes` map (`{ [type]: component }`). */
export const getNodeTypes = () =>
  definitions.reduce((types, definition) => {
    types[definition.type] = definition.component;
    return types;
  }, {});

export default definitions;
