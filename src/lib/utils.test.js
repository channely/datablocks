import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cwd } from "node:process";
import { describe, expect, it } from "vitest";
import { cn } from "./utils";
import { colors, cssVariableName, flatColors, fonts } from "./themeTokens";

describe("cn", () => {
  it("joins conditional classes", () => {
    const hidden = false;
    expect(cn("a", hidden && "b", { c: true, d: false }, ["e"])).toBe("a c e");
  });

  it("keeps the custom text-md size next to a text color", () => {
    expect(cn("text-md", "text-silver")).toBe("text-md text-silver");
  });

  it("lets later sizes and palette colors win", () => {
    expect(cn("text-md", "text-xs")).toBe("text-xs");
    expect(cn("bg-bg-grey", "bg-bg-light")).toBe("bg-bg-light");
    expect(cn("mb-2", "mb-1")).toBe("mb-1");
  });
});

describe("theme tokens", () => {
  const css = readFileSync(resolve(cwd(), "src/index.css"), "utf8").toLowerCase();

  it("maps nested token paths to CSS variable names", () => {
    expect(cssVariableName("bg.dark")).toBe("--color-bg-dark");
    expect(cssVariableName("handleHover")).toBe("--color-handle-hover");
    expect(cssVariableName("silverDarken15")).toBe("--color-silver-darken15");
  });

  it("declares every JavaScript color in index.css with the same value", () => {
    const pairs = flatColors();
    expect(pairs).toHaveLength(Object.keys(colors).length - 1 + Object.keys(colors.bg).length);
    for (const [path, value] of pairs) {
      expect(css).toContain(`${cssVariableName(path)}: ${value.toLowerCase()};`);
    }
  });

  it("uses the same font stacks", () => {
    expect(css).toContain(`--font-sans: ${fonts.body.toLowerCase()};`);
    expect(css).toContain(`--font-mono: ${fonts.mono.toLowerCase()};`);
  });
});
