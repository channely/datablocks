#!/usr/bin/env node
/**
 * Large-flow benchmark. Builds nothing itself: run `npm run build` first.
 *
 *   node scripts/make-bench-flow.mjs   # once, writes tmp/bench-large.datablocks.json
 *   node scripts/bench.mjs [label]     # writes tmp/bench-<label>.json
 *
 * Measures, against `vite preview`:
 * - first-load JS: entry + modulepreload bytes from dist/index.html, and scripts fetched by an
 *   empty canvas (raw and gzip)
 * - apply: import of the bench flow until the canvas settles (no long task for 1s)
 * - drag: 20-step node drag; long tasks > 50ms and column scans during the drag
 * - edits: 20 Filter edits (value + Run); dataStore size and history depth afterwards
 * - undo: `db:undo` timing and time until settled
 * - export: exported file size
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { chromium } from "@playwright/test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const label = process.argv[2] || "run";
const PORT = 4174;
const BASE = `http://localhost:${PORT}/datablocks/`;
const FLOW = resolve(root, "tmp/bench-large.datablocks.json");
const DIST = resolve(root, "dist");

if (!existsSync(FLOW)) throw new Error("Run `node scripts/make-bench-flow.mjs` first.");
if (!existsSync(DIST)) throw new Error("Run `npm run build` first.");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const kb = (bytes) => Math.round(bytes / 1024);

/** Entry script + modulepreload links in dist/index.html. */
const staticFirstLoad = () => {
  const html = readFileSync(resolve(DIST, "index.html"), "utf8");
  const files = [
    ...html.matchAll(/<script[^>]+src="\/datablocks\/([^"]+)"/g),
    ...html.matchAll(/<link rel="modulepreload"[^>]+href="\/datablocks\/([^"]+)"/g),
  ].map((m) => m[1]);
  let raw = 0;
  let gzip = 0;
  for (const file of files) {
    const buf = readFileSync(resolve(DIST, file));
    raw += buf.length;
    gzip += gzipSync(buf).length;
  }
  return { files, raw, gzip };
};

const startPreview = async () => {
  const child = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], {
    cwd: root,
    stdio: "pipe",
  });
  for (let i = 0; i < 100; i += 1) {
    try {
      const res = await fetch(BASE);
      if (res.ok) return child;
    } catch {
      // not up yet
    }
    await sleep(200);
  }
  child.kill();
  throw new Error("vite preview did not start");
};

const longTaskInit = () => {
  window.__lt = [];
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) window.__lt.push([entry.startTime, entry.duration]);
  }).observe({ type: "longtask", buffered: true });
};

const pageNow = (page) => page.evaluate(() => performance.now());

/** Wait until no long task has ended for `quiet` ms; returns timing relative to `since`. */
const settle = async (page, since, quiet = 1000, timeout = 180000) => {
  const started = Date.now();
  for (;;) {
    const { now, lastEnd, total, count } = await page.evaluate((t0) => {
      const tasks = window.__lt.filter(([start]) => start >= t0);
      return {
        now: performance.now(),
        lastEnd: tasks.reduce((max, [s, d]) => Math.max(max, s + d), t0),
        total: tasks.reduce((sum, [, d]) => sum + d, 0),
        count: tasks.length,
      };
    }, since);
    if (now - lastEnd > quiet) {
      return { settled: Math.round(lastEnd - since), longTaskMs: Math.round(total), count };
    }
    if (Date.now() - started > timeout) throw new Error("did not settle");
    await sleep(100);
  }
};

const stats = async (page) => {
  const input = page.getByTestId("terminal__input");
  await input.fill("stats");
  await input.press("Enter");
  await sleep(200);
  const text = await page.getByTestId("terminal__output").innerText();
  const matches = [...text.matchAll(/stats (\{.*\})/g)];
  if (!matches.length) throw new Error("stats output not found");
  return JSON.parse(matches[matches.length - 1][1]);
};

const run = async () => {
  const preview = await startPreview();
  const browser = await chromium.launch();
  const result = { label, date: new Date().toISOString() };
  try {
    result.staticFirstLoad = staticFirstLoad();

    const context = await browser.newContext({
      viewport: { width: 1600, height: 1000 },
      acceptDownloads: true,
    });
    await context.addInitScript(longTaskInit);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (msg) => msg.type() === "error" && errors.push(msg.text()));
    const scripts = [];
    page.on("response", async (response) => {
      if (response.request().resourceType() !== "script") return;
      try {
        const body = await response.body();
        scripts.push({
          url: response.url().replace(BASE, ""),
          raw: body.length,
          gzip: gzipSync(body).length,
        });
      } catch {
        // ignore aborted responses
      }
    });

    // 1. Empty canvas first load.
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.getByTestId("terminal__input").waitFor();
    await sleep(1000);
    const own = scripts.filter((s) => !s.url.startsWith("http"));
    result.emptyCanvasScripts = {
      raw: own.reduce((sum, s) => sum + s.raw, 0),
      gzip: own.reduce((sum, s) => sum + s.gzip, 0),
      files: own.map((s) => `${s.url} ${kb(s.raw)}KB`),
    };

    // 2. Import + apply.
    const t0 = await pageNow(page);
    await page.getByTestId("flow-import-input").setInputFiles(FLOW);
    await page.locator(".react-flow__node").nth(27).waitFor({ timeout: 180000 });
    await page.waitForFunction(
      () => document.querySelectorAll(".react-flow__edge").length >= 28,
      null,
      { timeout: 180000 },
    );
    const visible = Math.round((await pageNow(page)) - t0);
    const apply = await settle(page, t0);
    result.apply = { ...apply, edgesVisible: visible, total: Math.max(apply.settled, visible) };
    const afterApply = await stats(page);
    result.afterApply = afterApply;

    // 3. Drag a node 20 steps.
    const node = page.locator(".react-flow__node").nth(6);
    const box = await node.boundingBox();
    const scansBefore = (await stats(page)).counters.columnScan || 0;
    const d0 = await pageNow(page);
    await page.mouse.move(box.x + 30, box.y + 12);
    await page.mouse.down();
    for (let i = 1; i <= 20; i += 1) {
      await page.mouse.move(box.x + 30 + i * 12, box.y + 12 + i * 4);
      await sleep(16);
    }
    await page.mouse.up();
    const dragWindow = Math.round((await pageNow(page)) - d0);
    const drag = await settle(page, d0, 500);
    const dragLong = await page.evaluate(
      ([from, to]) => window.__lt.filter(([s, d]) => s >= from && s <= to && d > 50).length,
      [d0, d0 + dragWindow],
    );
    const scansAfter = (await stats(page)).counters.columnScan || 0;
    result.drag = {
      windowMs: dragWindow,
      longTasksOver50: dragLong,
      columnScans: scansAfter - scansBefore,
      settle: drag,
    };

    // 4. Twenty Filter edits (value + Run).
    const filter = page.getByTestId("node-filter").first();
    const valueInput = filter.locator("input").first();
    const runButton = filter.getByRole("button", { name: "Run" });
    const e0 = await pageNow(page);
    for (let i = 0; i < 20; i += 1) {
      await valueInput.fill(String(100 + i * 10));
      await runButton.click();
      await sleep(250);
    }
    result.edits = { settle: await settle(page, e0) };
    const afterEdits = await stats(page);
    result.edits.dataStore = afterEdits.dataStore;
    result.edits.nodes = afterEdits.nodes;
    result.edits.history = afterEdits.history;

    // 5. Undo through the View menu.
    await page.getByTestId("menu-view").click();
    const u0 = await pageNow(page);
    await page.getByTestId("menuitem-undo").click();
    const undoSettle = await settle(page, u0);
    const afterUndo = await stats(page);
    result.undo = { dbUndo: afterUndo.timings.undo, settle: undoSettle };

    // 6. Export.
    await page.getByTestId("menu-file").click();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("menuitem-export-flow").click(),
    ]);
    const target = resolve(root, `tmp/bench-export-${label}.json`);
    await download.saveAs(target);
    result.export = { bytes: statSync(target).size };
    result.timings = afterUndo.timings;
    result.consoleErrors = errors;
  } finally {
    await browser.close();
    preview.kill();
  }
  const out = resolve(root, `tmp/bench-${label}.json`);
  writeFileSync(out, JSON.stringify(result, null, 2));
  const f = result.staticFirstLoad;
  console.log(
    [
      `bench ${label}`,
      `first load (entry+preload): ${kb(f.raw)}KB raw / ${kb(f.gzip)}KB gzip (${f.files.length} files)`,
      `empty canvas scripts: ${kb(result.emptyCanvasScripts.raw)}KB raw / ${kb(result.emptyCanvasScripts.gzip)}KB gzip`,
      `apply: ${result.apply.total}ms (long tasks ${result.apply.longTaskMs}ms, ${result.apply.count})`,
      `drag: ${result.drag.longTasksOver50} long tasks >50ms, ${result.drag.columnScans} column scans`,
      `edits: dataStore ${result.edits.dataStore} entries for ${result.edits.nodes} nodes`,
      `undo: db:undo ${result.undo.dbUndo}ms, settled ${result.undo.settle.settled}ms`,
      `export: ${kb(result.export.bytes)}KB`,
      `console errors: ${result.consoleErrors.length}`,
    ].join("\n"),
  );
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
