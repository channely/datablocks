/**
 * Data parsing and fetching. Every parser returns `{ data, error }` instead of throwing so
 * blocks can report failures through the terminal.
 */
import Papa from "papaparse";

const CSV_OPTIONS = { header: true, dynamicTyping: true };

export const parseCsv = (text, options) => {
  const config = { ...CSV_OPTIONS, ...options };
  const result = Papa.parse(text, config);
  return result?.data?.length ? { data: result.data, error: null } : { error: "Parse Error." };
};

const UNPARSE_OPTIONS = { quotes: true };

export const unparseCsv = (data, options = {}) =>
  Papa.unparse(data, { ...UNPARSE_OPTIONS, ...options });

export const parseJson = (text) => {
  try {
    return { data: JSON.parse(text), error: null };
  } catch (error) {
    return { error };
  }
};

export const stringifyJson = (data) => JSON.stringify(data, null, 2);

export const FILE_TYPES = [
  { id: "json", mime: "application/json", ext: [".json"], parser: parseJson },
  { id: "csv", mime: "text/csv", ext: [".csv"], parser: parseCsv },
  { id: "tsv", mime: "text/tab-separated-values", ext: [".tsv"], parser: parseCsv },
  {
    id: "geojson",
    mime: "application/geo+json",
    ext: [".geojson", ".json"],
    parser: parseJson,
  },
  {
    id: "topojson",
    mime: "application/json",
    ext: [".json", ".topojson"],
    parser: parseJson,
  },
];

export const getParserForFile = (file) => {
  const type = file.type;
  const extension = file.name.match(/\.[0-9a-z]+$/i)?.[0];
  const byMime = FILE_TYPES.find((f) => f.mime === type);
  const byExt = extension ? FILE_TYPES.find((f) => f.ext.includes(extension)) : undefined;
  return byMime || byExt ? (byMime || byExt).parser : null;
};

const readFile = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = (e) => reject(e);
    reader.readAsText(file);
  });

/** Reads and parses a dropped file based on MIME type or extension. */
export const parseFile = async (file) => {
  const parser = getParserForFile(file);
  if (!parser) return { error: `${file.name}: File type not supported.` };
  try {
    const text = await readFile(file);
    return await parser(text);
  } catch (error) {
    console.log(error);
    return { error: `Error while parsing file: ${file.name}` };
  }
};

const textParser = (text) => ({ data: `${text}`, error: null });

const getTextParser = (type) =>
  type === "json" ? parseJson : type === "csv" ? parseCsv : type === "text" ? textParser : null;

export const parseText = async (text, type) => {
  const parser = getTextParser(type);
  if (!parser) return { error: "Couldn't parse text" };
  try {
    return await parser(text);
  } catch (error) {
    console.log(error);
    return { error: "Error while parsing text" };
  }
};

const getParserForContentType = (contentType) =>
  FILE_TYPES.find((f) => contentType.includes(f.mime))?.parser;

/** Fetches a URL and parses it according to the response Content-Type. */
export const fetchData = async (url) => {
  try {
    const response = await fetch(url);
    const contentType = response.headers.get("Content-Type");
    const parser = getParserForContentType(contentType);
    if (!parser) return { error: `File type not supported: ${contentType}` };
    const text = await response.text();
    return parser(text);
  } catch (error) {
    console.log(error);
    return { error: `Error while fetching url: ${url}` };
  }
};
