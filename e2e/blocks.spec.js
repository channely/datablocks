import { expect, test } from "./fixtures.js";

test.describe("blocks", () => {
  test("library adds blocks that connect and compute", async ({ app }) => {
    const { page } = app;
    const source = await app.addBlock("exampledata");
    await app.dragNode(source, -450, -150);
    const filter = await app.addBlock("filter");
    await app.dragNode(filter, 0, -150);
    await app.waitForStats((s) => s.nodes === 2);

    // Disconnected state.
    await expect(filter).toContainText("connect dataset");

    await app.connect(source, filter);
    await app.waitForStats((s) => s.edges === 1);
    await expect(filter).not.toContainText("connect dataset");
    await expect(app.warningEdges()).toHaveCount(0);

    // Selecting the filter shows its table output.
    await app.selectNode(filter);
    const output = page.getByTestId("output-view");
    await expect(output).toBeVisible();
    await expect(output).not.toBeEmpty();
  });

  test("an invalid connection is flagged and does not compute", async ({ app }) => {
    const source = await app.addBlock("exampledata");
    await app.dragNode(source, -450, 150);
    const area = await app.addBlock("area");
    await expect(area).toContainText("connect geojson");

    await app.connect(source, area);
    await app.waitForStats((s) => s.edges === 1);
    await expect(app.warningEdges()).toHaveCount(1);
    await expect(area).toContainText("connect geojson");
  });

  test("removing an edge returns the target to its disconnected state", async ({ app }) => {
    const { page } = app;
    await app.loadIntro();
    const scatterplots = page.getByTestId("node-scatterplot");
    await expect(scatterplots.filter({ hasText: "connect dataset" })).toHaveCount(0);

    // Filter -> Scatterplot: valid edges show their remove button only once selected.
    const edgeId = "D3cAjUHbgigxtA24jXfUS";
    await app.selectEdge(edgeId);
    await page
      .locator(`[data-testid="edge"][data-edge-id="${edgeId}"]`)
      .getByTestId("edge-remove")
      .click();
    await app.waitForStats((s) => s.edges === 2);
    await expect(scatterplots.filter({ hasText: "connect dataset" })).toHaveCount(1);
  });

  test("a selected edge is deleted with Backspace", async ({ app }) => {
    const { page } = app;
    await app.loadIntro();
    const filter = page.getByTestId("node-filter");
    await expect(filter).not.toContainText("connect dataset");

    // Example Data -> Filter; its midpoint sits under a text block, so use the keyboard.
    await app.selectEdge("ZtsTOle9iU5ou3GrYrOhe");
    await page.keyboard.press("Backspace");
    await app.waitForStats((s) => s.edges === 2);
    await expect(filter).toContainText("connect dataset");
  });

  test("removing a node drops its edges", async ({ app }) => {
    const { page } = app;
    await app.loadIntro();
    await page.getByTestId("node-filter").getByTestId("node__remove").click();
    await app.waitForStats((s) => s.nodes === 8 && s.edges === 1);
  });
});
