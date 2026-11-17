import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { FIXTURES, expect, test } from "./fixtures.js";

const LEGACY_INTRO = fileURLToPath(
  new URL("../public/data/flows/introduction.json", import.meta.url),
);
const V1_FIXTURE = `${FIXTURES}v1-legacy-merge.datablocks.json`;

test.describe("import / export", () => {
  test("a v2 export re-imports to the same canvas", async ({ app }) => {
    const { page } = app;
    await app.loadIntro();
    const { path, filename } = await app.exportFlow();
    expect(filename).toMatch(/\.datablocks\.json$/);

    const doc = JSON.parse(readFileSync(path, "utf8"));
    expect(doc.version).toBe(2);
    expect(Array.isArray(doc.payloads)).toBe(true);
    for (const element of doc.elements) {
      const current = element.data?.current;
      if (current) expect(Number.isInteger(current.ref)).toBe(true);
    }

    await app.menu("file", "new-flow");
    await app.waitForStats((s) => s.nodes === 0);
    await app.importFile(path);
    await app.waitForStats((s) => s.nodes === 9 && s.edges === 3);
    await expect(app.warningEdges()).toHaveCount(0);
    await expect(page.getByTestId("node-filter")).not.toContainText("connect dataset");
  });

  test("the legacy introduction file imports", async ({ app }) => {
    await app.importFile(LEGACY_INTRO);
    await app.waitForStats((s) => s.nodes === 9 && s.edges === 3);
    await expect(app.warningEdges()).toHaveCount(0);
  });

  test("a v1 file with legacy Merge fields imports and recomputes", async ({ app }) => {
    const { page } = app;
    await app.importFile(V1_FIXTURE);
    await app.waitForStats((s) => s.nodes === 6 && s.edges === 3);
    await expect(page.getByTestId("merge-count")).toContainText("merged 2 rows");
    // The fixture connects GeoJSON into a Barchart on purpose.
    await expect(app.warningEdges()).toHaveCount(1);
    await expect(page.getByTestId("node-filter")).toContainText("connect dataset");

    const { path } = await app.exportFlow();
    const doc = JSON.parse(readFileSync(path, "utf8"));
    const merge = doc.elements.find((element) => element.id === "merge");
    for (const field of ["baseData", "insertData", "data", "mergeCount"]) {
      expect(merge.data).not.toHaveProperty(field);
    }
  });

  for (const [name, file] of [
    ["malformed JSON", "garbage.json"],
    ["invalid structure", "invalid.datablocks.json"],
    ["a newer version", "too-new.datablocks.json"],
  ]) {
    test(`rejects ${name} and keeps the canvas`, async ({ app }) => {
      const { page } = app;
      await app.loadIntro();
      await app.importFile(`${FIXTURES}${file}`);
      await expect(page.getByTestId("terminal__output")).toContainText("Importing the flow failed");
      const stats = await app.stats();
      expect(stats.nodes).toBe(9);
      expect(stats.edges).toBe(3);
    });
  }
});
