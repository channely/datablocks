import { describe, it, expect } from "vitest";
import execution from "./execution";

const iframe = () => document.getElementById("use-execution-iframe");
const dependencyScripts = () =>
  [...iframe().contentWindow.document.querySelectorAll("[data-dependency]")].map((script) =>
    script.getAttribute("data-dependency"),
  );

describe("execution engine", () => {
  it("creates one hidden iframe and loads the default dependency", () => {
    expect(iframe()).not.toBeNull();
    expect(iframe().style.display).toBe("none");
    expect(execution.iFrame).toBe(iframe());
    expect(dependencyScripts()).toEqual(["lodash@4.17.21"]);
    const script = iframe().contentWindow.document.querySelector("[data-dependency]");
    expect(script.getAttribute("src")).toBe("https://unpkg.com/lodash@4.17.21");
  });

  it("adds, keeps and removes dependencies; rejects URL-like names", () => {
    execution.updateDependencies(["lodash@4.17.21", "@scope/pkg@1.0.0", "https://evil.test/x.js"]);
    expect(dependencyScripts()).toEqual(["lodash@4.17.21", "@scope/pkg@1.0.0"]);
    execution.updateDependencies(["@scope/pkg@1.0.0"]);
    expect(dependencyScripts()).toEqual(["@scope/pkg@1.0.0"]);
    execution.updateDependencies([]);
    expect(dependencyScripts()).toEqual([]);
    execution.updateDependencies(null);
    expect(dependencyScripts()).toEqual([]);
  });

  it("exposes variables as iframe globals", () => {
    expect(execution.execute("a + b", { a: 2, b: 3 })).toBe(5);
    expect(iframe().contentWindow.a).toBe(2);
    expect(execution.execute("typeof b")).toBe("number");
  });

  it("throws without an iframe", () => {
    const original = execution.iFrame;
    execution.iFrame = null;
    try {
      expect(() => execution.execute("1")).toThrow("No Iframe created.");
    } finally {
      execution.iFrame = original;
    }
  });
});
