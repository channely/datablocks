import { describe, it, expect, vi, afterEach } from "vitest";
import { download, getFlowRect } from "./download";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("download", () => {
  it("creates an object URL, clicks a temporary link and cleans up", () => {
    const createObjectURL = vi.fn(() => "blob:test");
    const revokeObjectURL = vi.fn();
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    const clicked = [];
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function record() {
        clicked.push({ href: this.href, download: this.download, attached: this.isConnected });
      });
    try {
      download("a,b", "text/csv", "data.csv");
      expect(createObjectURL).toHaveBeenCalledTimes(1);
      const blob = createObjectURL.mock.calls[0][0];
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe("text/csv");
      expect(click).toHaveBeenCalledTimes(1);
      expect(clicked).toEqual([{ href: "blob:test", download: "data.csv", attached: true }]);
      expect(document.querySelectorAll("a")).toHaveLength(0);
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:test");
    } finally {
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    }
  });
});

describe("getFlowRect", () => {
  it("returns null without a canvas and the bounding rect otherwise", () => {
    expect(getFlowRect()).toBeNull();
    const el = document.createElement("div");
    el.id = "reactflow";
    document.body.appendChild(el);
    const rect = { width: 800, height: 600 };
    vi.spyOn(el, "getBoundingClientRect").mockReturnValue(rect);
    expect(getFlowRect()).toBe(rect);
  });
});
