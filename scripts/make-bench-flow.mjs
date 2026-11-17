#!/usr/bin/env node
/**
 * Generates a large benchmark flow (20k-row dataset, ~30 nodes) used to measure editor
 * performance. Output: tmp/bench-large.datablocks.json (not committed).
 *
 * Usage: node scripts/make-bench-flow.mjs [rows]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROWS = Number(process.argv[2]) || 20000;
const INSERT_ROWS = 2000;
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(root, "tmp/bench-large.datablocks.json");

// Deterministic pseudo-random generator so runs are comparable.
let seed = 42;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

const categories = Array.from({ length: 20 }, (_, i) => `cat-${i}`);
const base = Array.from({ length: ROWS }, (_, i) => ({
  id: i,
  key: `k${i % INSERT_ROWS}`,
  name: `item ${i}`,
  category: categories[i % categories.length],
  value: Math.round(rand() * 1000),
  score: Math.round(rand() * 10000) / 100,
  date: new Date(Date.UTC(2020, 0, 1) + i * 3600000).toISOString(),
  flag: rand() > 0.5 ? "yes" : "no",
}));
const insert = Array.from({ length: INSERT_ROWS }, (_, i) => ({
  key: `k${i}`,
  region: `region-${i % 7}`,
  weight: Math.round(rand() * 100),
}));

const nodes = [];
const edges = [];
let n = 0;
const node = (type, data, x, y) => {
  const id = `n${n++}-${type}`;
  nodes.push({ id, type, position: { x, y }, data: { label: type, ...data } });
  return id;
};
const edge = (source, target, targetHandle = target) => {
  edges.push({
    id: `e-${source}-${targetHandle}`,
    source,
    target,
    sourceHandle: source,
    targetHandle,
    animated: true,
    type: "default",
  });
};

const baseId = node(
  "file",
  { group: "input", fileName: "base.json", current: { data: base, type: "DATASET" } },
  0,
  0,
);
const insertId = node(
  "file",
  { group: "input", fileName: "insert.json", current: { data: insert, type: "DATASET" } },
  0,
  500,
);

const chain = (row) => {
  const y = row * 900;
  const filter = node(
    "filter",
    { group: "transform", column: "value", conditionId: "1", conditionValue: "" },
    300,
    y,
  );
  edge(baseId, filter);
  const sort = node("sort", { group: "transform", order: "desc", column: "score" }, 600, y);
  edge(filter, sort, `${sort}-sort`);
  const slice = node("slice", { group: "transform", startIndex: 0, endIndex: "" }, 900, y);
  edge(sort, slice);
  const merge = node(
    "merge",
    { group: "transform", baseColumn: "key", insertColumn: "key", mergeCount: 0 },
    1200,
    y,
  );
  edge(slice, merge, `${merge}-base`);
  edge(insertId, merge, `${merge}-insert`);
  const rename = node(
    "rename-cols",
    { group: "transform", inputs: [{ old: "flag", new: "isFlagged" }] },
    1500,
    y,
  );
  edge(merge, rename);
  const colorize = node(
    "colorize",
    {
      group: "transform",
      column: "value",
      colorScale: ["#fafa6e", "#9cdf7c", "#4abd8c", "#00968e", "#106e7c", "#2a4858"],
    },
    1800,
    y,
  );
  edge(rename, colorize);
  const group = node("grouping", { group: "transform", column: "category" }, 2100, y);
  edge(colorize, group);
  const stats = node("statistics", { group: "misc", column: "value" }, 2100, y + 300);
  edge(colorize, stats);
  const bar = node(
    "barchart",
    { group: "visualization", isHorizontal: true, xColumn: "category", yColumn: "value" },
    300,
    y + 400,
  );
  edge(slice, bar);
  const hist = node("histogram", { group: "visualization", column: "score" }, 700, y + 400);
  edge(sort, hist);
  const scatter = node(
    "scatterplot",
    { group: "visualization", xColumn: "value", yColumn: "score" },
    1100,
    y + 400,
  );
  edge(filter, scatter);
  const exp = node("export", { group: "misc" }, 1500, y + 400);
  edge(colorize, exp);
  const stats2 = node("statistics", { group: "misc", column: "score" }, 1800, y + 400);
  edge(merge, stats2);
};
chain(0);
chain(1);

const flow = {
  version: 1,
  id: null,
  title: `Bench ${ROWS} rows`,
  createdAt: null,
  updatedAt: null,
  viewport: { x: 0, y: 0, zoom: 0.5 },
  elements: [...nodes, ...edges],
};

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(flow));
console.log(`wrote ${out}: ${nodes.length} nodes, ${edges.length} edges, ${ROWS} rows`);
