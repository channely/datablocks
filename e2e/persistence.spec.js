import { expect, test } from "./fixtures.js";

const rows = (page) => page.locator('[data-testid^="flow-row-"]');

test.describe("persistence", () => {
  test("save, open, rename, duplicate and delete in the flow library", async ({ app }) => {
    const { page } = app;
    await app.loadIntro();
    await app.menu("file", "save");
    await expect(page.getByTestId("save-status")).toContainText("Saved");

    await app.menu("file", "open");
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText("9 nodes");

    // Rename.
    await rows(page).first().getByTestId("flow-rename").click();
    await page.getByTestId("flow-rename-input").fill("Renamed flow");
    await page.getByTestId("flow-rename-input").press("Enter");
    await expect(rows(page).first()).toContainText("Renamed flow");

    // Duplicate.
    await rows(page).first().getByTestId("flow-duplicate").click();
    await expect(rows(page)).toHaveCount(2);
    await expect(rows(page).filter({ hasText: "Renamed flow copy" })).toHaveCount(1);

    // Delete the copy (the fixture accepts window.confirm).
    await rows(page).filter({ hasText: "Renamed flow copy" }).getByTestId("flow-delete").click();
    await expect(rows(page)).toHaveCount(1);

    // Open into an empty canvas.
    await page.getByRole("button", { name: "Close" }).click();
    await app.menu("file", "new-flow");
    await app.waitForStats((s) => s.nodes === 0);
    await app.menu("file", "open");
    await rows(page).first().getByTestId("flow-open").click();
    await app.waitForStats((s) => s.nodes === 9 && s.edges === 3);
  });

  test("reload restores the autosaved canvas", async ({ app }) => {
    const { page } = app;
    await app.loadIntro();
    await page.getByTestId("node-filter").getByTestId("node__remove").click();
    await app.waitForStats((s) => s.nodes === 8 && s.edges === 1);

    // Reload immediately: the pending autosave must be flushed on pagehide.
    await page.reload();
    await page.getByTestId("terminal__input").waitFor();
    await app.waitForStats((s) => s.nodes === 8 && s.edges === 1);
    await expect(page.getByTestId("node-filter")).toHaveCount(0);
  });
});
