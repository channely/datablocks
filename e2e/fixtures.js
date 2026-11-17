/**
 * Shared E2E fixtures. Selectors stay on `data-testid` and roles so the suite survives a UI
 * library swap; canvas counts come from the terminal `stats` command instead of library DOM.
 */
import { test as base, expect } from "@playwright/test";

export const FIXTURES = new URL("./fixtures/", import.meta.url).pathname;

/** Fails a test when the page logs a console error or throws, unless the test opts out. */
export const test = base.extend({
  consoleErrors: [
    async ({ page }, use) => {
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (msg) => msg.type() === "error" && errors.push(msg.text()));
      await use(errors);
    },
    { auto: true },
  ],
  app: async ({ page, consoleErrors }, use, testInfo) => {
    // Confirm/prompt dialogs (new flow, delete, …) are accepted unless a test handles them.
    page.on("dialog", (dialog) => dialog.accept().catch(() => {}));
    await page.goto("./");
    await page.getByTestId("terminal__input").waitFor();
    await use(createApp(page));
    if (!testInfo.annotations.some((a) => a.type === "allow-console-errors")) {
      expect(consoleErrors, "console errors").toEqual([]);
    }
  },
});

export { expect };

const createApp = (page) => {
  const terminal = async (command) => {
    const input = page.getByTestId("terminal__input");
    await input.fill(command);
    await input.press("Enter");
  };

  const stats = async () => {
    await terminal("stats");
    const output = page.getByTestId("terminal__output");
    await expect(output).toContainText("stats {");
    const text = await output.innerText();
    const matches = [...text.matchAll(/stats (\{.*\})/g)];
    return JSON.parse(matches[matches.length - 1][1]);
  };

  /** Polls `stats` until `predicate` passes; returns the last snapshot. */
  const waitForStats = async (predicate, timeout = 15_000) => {
    let last;
    try {
      await expect
        .poll(
          async () => {
            last = await stats();
            return predicate(last);
          },
          { timeout },
        )
        .toBe(true);
    } catch (error) {
      error.message += `\nLast stats: ${JSON.stringify(last)}`;
      throw error;
    }
    return last;
  };

  const counts = async () => {
    const { nodes, edges } = await stats();
    return { nodes, edges };
  };

  const warningEdges = () => page.getByTestId("edge-label").filter({ hasText: "⚠" });

  const loadIntro = async () => {
    await terminal("intro");
    return waitForStats((s) => s.nodes === 9 && s.edges === 3);
  };

  const menu = async (menuId, item) => {
    await page.getByTestId(`menu-${menuId}`).click();
    await page.getByTestId(`menuitem-${item}`).click();
  };

  const importFile = async (path) => {
    await page.getByTestId("flow-import-input").setInputFiles(path);
  };

  const addBlock = async (type) => {
    await page.getByTestId("addblock").click();
    await page.getByTestId(`blockitem-${type}`).click();
    const node = page.getByTestId(`node-${type}`).last();
    await node.waitFor();
    return node;
  };

  /** Drags a node by its title bar. */
  const dragNode = async (node, dx, dy, steps = 8) => {
    const box = await node.boundingBox();
    const x = box.x + 30;
    const y = box.y + 12;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx, y + dy, { steps });
    await page.mouse.up();
  };

  /** Connects the source handle of `from` to the (index-th) target handle of `to`. */
  const connect = async (from, to, targetIndex = 0) => {
    const source = await from.getByTestId("source-handle").first().boundingBox();
    const target = await to.getByTestId("target-handle").nth(targetIndex).boundingBox();
    await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
    await page.mouse.down();
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, {
      steps: 10,
    });
    await page.mouse.up();
  };

  /**
   * Selects an edge by clicking a point on its curve. The bounding-box centre of a bezier is
   * usually off the stroke and other nodes may overlap it, so this walks along the path and
   * clicks the first point whose hit target is the edge itself.
   */
  const selectEdge = async (edgeId) => {
    const point = await page
      .locator(`[data-testid="edge-path"][data-edge-id="${edgeId}"]`)
      .evaluate((path) => {
        const total = path.getTotalLength();
        for (let step = 1; step < 20; step += 1) {
          const local = path.getPointAtLength((total * step) / 20);
          const screen = new DOMPoint(local.x, local.y).matrixTransform(path.getScreenCTM());
          if (document.elementFromPoint(screen.x, screen.y) === path) {
            return { x: screen.x, y: screen.y };
          }
        }
        return null;
      });
    if (!point) throw new Error(`Edge ${edgeId} has no clickable point`);
    await page.mouse.click(point.x, point.y);
    // Valid edges reveal their label (remove button) only while selected.
    await expect(page.locator(`[data-testid="edge"][data-edge-id="${edgeId}"]`)).toBeVisible();
  };

  const selectNode = async (node) => {
    await node.click({ position: { x: 40, y: 10 } });
  };

  /** Clicks File → Export flow and returns the parsed download. */
  const exportFlow = async () => {
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      menu("file", "export-flow"),
    ]);
    const path = await download.path();
    return { path, filename: download.suggestedFilename() };
  };

  return {
    page,
    terminal,
    stats,
    waitForStats,
    counts,
    warningEdges,
    loadIntro,
    menu,
    importFile,
    addBlock,
    dragNode,
    connect,
    selectNode,
    selectEdge,
    exportFlow,
  };
};
