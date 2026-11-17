import { expect, test } from "./fixtures.js";

test.describe("smoke", () => {
  test("empty canvas boots with a working terminal", async ({ app }) => {
    const stats = await app.stats();
    expect(stats.nodes).toBe(0);
    expect(stats.edges).toBe(0);
    expect(stats.history).toEqual({ past: 0, future: 0 });
    await expect(app.page.getByTestId("header")).toBeVisible();
  });

  test("introduction flow loads with every node and edge", async ({ app }) => {
    const stats = await app.loadIntro();
    expect(stats.dataStore).toBeLessThanOrEqual(stats.nodes + 5);
    // Loading a flow must not leave phantom undo steps behind.
    await expect.poll(async () => (await app.stats()).history.past).toBe(0);
    await expect(app.page.getByTestId("node-filter")).toBeVisible();
    await expect(app.page.getByTestId("node-scatterplot")).toHaveCount(2);
    await expect(app.page.getByTestId("edge")).toHaveCount(3);
    await expect(app.warningEdges()).toHaveCount(0);
  });

  test("help menu opens the introduction flow", async ({ app }) => {
    await app.menu("help", "introduction-flow");
    await app.waitForStats((s) => s.nodes === 9 && s.edges === 3);
  });
});
