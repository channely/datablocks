/**
 * Performance budgets on the large benchmark flow (~30 nodes, 20k rows). Budgets are the v1.3
 * measurements × 1.5. Tagged @perf: CI skips these; run them alone with
 * `npm run e2e -- --project perf --no-deps`.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "./fixtures.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const FLOW = `${ROOT}tmp/bench-large.datablocks.json`;

const BUDGET = {
  applyMs: Math.round(492 * 1.5),
  dragLongTasks: 0,
  dragColumnScans: 0,
  undoMs: 100,
};

const longTaskInit = () => {
  window.__lt = [];
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) window.__lt.push([entry.startTime, entry.duration]);
  }).observe({ type: "longtask", buffered: true });
};

/** Waits until no long task has ended for `quiet` ms; returns the settle time after `since`. */
const settle = async (page, since, quiet = 1000) => {
  const deadline = Date.now() + 120_000;
  for (;;) {
    const { now, lastEnd } = await page.evaluate((t0) => {
      const tasks = window.__lt.filter(([start]) => start >= t0);
      return {
        now: performance.now(),
        lastEnd: tasks.reduce((max, [s, d]) => Math.max(max, s + d), t0),
      };
    }, since);
    if (now - lastEnd > quiet) return Math.round(lastEnd - since);
    if (Date.now() > deadline) throw new Error("page did not settle");
    await page.waitForTimeout(100);
  }
};

test.describe("performance @perf", () => {
  test.describe.configure({ mode: "serial", timeout: 240_000 });

  test.beforeAll(() => {
    if (!existsSync(FLOW)) {
      execFileSync("node", ["scripts/make-bench-flow.mjs"], { cwd: ROOT, stdio: "inherit" });
    }
  });

  test("benchmark flow applies, drags and undoes within budget", async ({ app }) => {
    const { page } = app;
    await page.addInitScript(longTaskInit);
    await page.reload();
    await page.getByTestId("terminal__input").waitFor();
    // Let the empty canvas finish booting before measuring.
    await page.waitForTimeout(1000);

    const t0 = await page.evaluate(() => performance.now());
    await app.importFile(FLOW);
    await expect(page.getByTestId("edge")).toHaveCount(28, { timeout: 120_000 });
    const visible = Math.round((await page.evaluate(() => performance.now())) - t0);
    const applyMs = Math.max(await settle(page, t0), visible);
    test.info().annotations.push({ type: "apply", description: `${applyMs}ms` });
    expect(applyMs).toBeLessThanOrEqual(BUDGET.applyMs);

    // Drag a node 20 steps.
    const node = page.getByTestId("node-filter").first();
    const scansBefore = (await app.stats()).counters.columnScan || 0;
    const box = await node.boundingBox();
    const d0 = await page.evaluate(() => performance.now());
    await page.mouse.move(box.x + 30, box.y + 12);
    await page.mouse.down();
    for (let i = 1; i <= 20; i += 1) {
      await page.mouse.move(box.x + 30 + i * 12, box.y + 12 + i * 4);
      await page.waitForTimeout(16);
    }
    await page.mouse.up();
    const d1 = await page.evaluate(() => performance.now());
    const dragLongTasks = await page.evaluate(
      ([from, to]) => window.__lt.filter(([s, d]) => s >= from && s <= to && d > 50).length,
      [d0, d1],
    );
    await settle(page, d0, 500);
    const scans = ((await app.stats()).counters.columnScan || 0) - scansBefore;
    test.info().annotations.push({
      type: "drag",
      description: `${dragLongTasks} long tasks, ${scans} column scans`,
    });
    expect(dragLongTasks).toBeLessThanOrEqual(BUDGET.dragLongTasks);
    expect(scans).toBeLessThanOrEqual(BUDGET.dragColumnScans);

    // Undo the drag.
    await app.menu("view", "undo");
    const { timings } = await app.waitForStats((s) => s.timings?.undo !== undefined);
    test.info().annotations.push({ type: "undo", description: `${timings.undo}ms` });
    expect(timings.undo).toBeLessThanOrEqual(BUDGET.undoMs);
  });
});
