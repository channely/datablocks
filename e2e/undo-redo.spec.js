import { expect, test } from "./fixtures.js";

const mod = process.platform === "darwin" ? "Meta" : "Control";

test.describe("undo / redo", () => {
  test("adding a block can be undone and redone", async ({ app }) => {
    const { page } = app;
    await app.addBlock("filter");
    await app.waitForStats((s) => s.nodes === 1 && s.history.past === 1);

    await app.menu("view", "undo");
    await app.waitForStats((s) => s.nodes === 0 && s.history.future === 1);
    await expect(page.getByTestId("node-filter")).toHaveCount(0);

    await app.menu("view", "redo");
    await app.waitForStats((s) => s.nodes === 1 && s.history.future === 0);
    await expect(page.getByTestId("node-filter")).toHaveCount(1);
  });

  test("keyboard shortcuts undo and redo a new connection", async ({ app }) => {
    const { page } = app;
    const source = await app.addBlock("exampledata");
    await app.dragNode(source, -450, -150);
    const filter = await app.addBlock("filter");
    await app.connect(source, filter);
    await app.waitForStats((s) => s.edges === 1);

    await page.getByTestId("header").click({ position: { x: 600, y: 10 } });
    await page.keyboard.press(`${mod}+z`);
    await app.waitForStats((s) => s.edges === 0 && s.nodes === 2);
    await expect(filter).toContainText("connect dataset");

    // `stats` focused the terminal input; shortcuts are ignored inside inputs.
    await page.getByTestId("header").click({ position: { x: 600, y: 10 } });
    await page.keyboard.press(`${mod}+Shift+z`);
    await app.waitForStats((s) => s.edges === 1);
    await expect(filter).not.toContainText("connect dataset");
  });

  test("deleting a connected node restores node and edges in one step", async ({ app }) => {
    const { page } = app;
    await app.loadIntro();
    await page.getByTestId("node-filter").getByTestId("node__remove").click();
    await app.waitForStats((s) => s.nodes === 8 && s.edges === 1);

    await app.menu("view", "undo");
    const restored = await app.waitForStats((s) => s.nodes === 9 && s.edges === 3);
    expect(restored.history.past).toBe(0);
    await expect(app.warningEdges()).toHaveCount(0);
    await expect(page.getByTestId("node-filter")).not.toContainText("connect dataset");
  });

  test("moving a node is one undo step", async ({ app }) => {
    const { page } = app;
    await app.loadIntro();
    const filter = page.getByTestId("node-filter");
    const before = await filter.boundingBox();
    await app.dragNode(filter, 160, 80, 20);
    await app.waitForStats((s) => s.history.past === 1);
    const moved = await filter.boundingBox();
    expect(Math.round(moved.x - before.x)).toBeGreaterThan(100);

    await app.menu("view", "undo");
    await app.waitForStats((s) => s.history.past === 0);
    await expect.poll(async () => Math.round((await filter.boundingBox()).x - before.x)).toBe(0);
  });

  test("typing into a block setting coalesces into one step", async ({ app }) => {
    const { page } = app;
    await app.loadIntro();
    const input = page.getByTestId("node-filter").locator("input").first();
    const original = await input.inputValue();
    await input.click();
    await input.press("End");
    await input.pressSequentially("123", { delay: 40 });
    await app.waitForStats((s) => s.history.past === 1);

    await app.menu("view", "undo");
    await app.waitForStats((s) => s.history.past === 0 && s.history.future === 1);
    await expect(input).toHaveValue(original);
  });

  test("loading a flow clears the history", async ({ app }) => {
    await app.addBlock("filter");
    await app.waitForStats((s) => s.history.past === 1);
    const stats = await app.loadIntro();
    expect(stats.history).toEqual({ past: 0, future: 0 });
  });
});
