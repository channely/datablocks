import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const setStorage = (value) => {
  Object.defineProperty(navigator, "storage", { value, configurable: true });
};

/** Fresh module per test: `requestPersistentStorage` only asks once per module instance. */
const load = async () => {
  vi.resetModules();
  return import("./storageHealth");
};

afterEach(() => {
  delete navigator.storage;
  vi.unstubAllGlobals();
});

describe("formatBytes", () => {
  it("formats sizes with binary units", async () => {
    const { formatBytes } = await load();
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatBytes(3 * 1024 ** 3)).toBe("3.0 GB");
    expect(formatBytes(2 * 1024 ** 5)).toBe("2048.0 TB");
    expect(formatBytes(NaN)).toBe("—");
    expect(formatBytes(Infinity)).toBe("—");
    expect(formatBytes(undefined)).toBe("—");
  });
});

describe("getStorageEstimate", () => {
  it("returns null when unsupported", async () => {
    const { getStorageEstimate } = await load();
    expect(navigator.storage).toBeUndefined();
    expect(await getStorageEstimate()).toBeNull();
    setStorage({});
    expect(await getStorageEstimate()).toBeNull();
  });

  it("returns usage, quota and ratio", async () => {
    const { getStorageEstimate } = await load();
    setStorage({ estimate: vi.fn().mockResolvedValue({ usage: 25, quota: 100 }) });
    expect(await getStorageEstimate()).toEqual({ usage: 25, quota: 100, ratio: 0.25 });
    setStorage({ estimate: vi.fn().mockResolvedValue({}) });
    expect(await getStorageEstimate()).toEqual({ usage: 0, quota: 0, ratio: 0 });
  });

  it("returns null when the estimate rejects", async () => {
    const { getStorageEstimate } = await load();
    setStorage({ estimate: vi.fn().mockRejectedValue(new Error("denied")) });
    expect(await getStorageEstimate()).toBeNull();
  });
});

describe("requestPersistentStorage", () => {
  it("is a no-op where unsupported", async () => {
    const { requestPersistentStorage } = await load();
    expect(await requestPersistentStorage()).toBeNull();
  });

  it("asks only once per session", async () => {
    const { requestPersistentStorage } = await load();
    const persist = vi.fn().mockResolvedValue(true);
    setStorage({ persist, persisted: vi.fn().mockResolvedValue(false) });
    expect(await requestPersistentStorage()).toBe(true);
    expect(await requestPersistentStorage()).toBeNull();
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("does not ask again when storage is already persisted", async () => {
    const { requestPersistentStorage } = await load();
    const persist = vi.fn();
    setStorage({ persist, persisted: vi.fn().mockResolvedValue(true) });
    expect(await requestPersistentStorage()).toBe(true);
    expect(persist).not.toHaveBeenCalled();
  });

  it("works without `persisted` and reports a refusal", async () => {
    const { requestPersistentStorage } = await load();
    setStorage({ persist: vi.fn().mockResolvedValue(false) });
    expect(await requestPersistentStorage()).toBe(false);
  });

  it("returns null when persist throws", async () => {
    const { requestPersistentStorage } = await load();
    setStorage({ persist: vi.fn().mockRejectedValue(new Error("nope")) });
    expect(await requestPersistentStorage()).toBeNull();
  });
});

describe("createTabChannel", () => {
  let channels;

  class FakeBroadcastChannel {
    constructor(name) {
      this.name = name;
      this.posted = [];
      this.closed = false;
      this.onmessage = null;
      channels.push(this);
    }

    postMessage(message) {
      this.posted.push(message);
    }

    close() {
      this.closed = true;
    }
  }

  beforeEach(() => {
    channels = [];
  });

  it("returns a no-op channel without BroadcastChannel", async () => {
    vi.stubGlobal("BroadcastChannel", undefined);
    const { createTabChannel } = await load();
    const channel = createTabChannel(vi.fn());
    expect(() => channel.announce()).not.toThrow();
    expect(() => channel.close()).not.toThrow();
  });

  it("announces edits with its tab id and warns once for another tab", async () => {
    vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);
    const { createTabChannel } = await load();
    const onOtherTab = vi.fn();
    const channel = createTabChannel(onOtherTab);
    expect(channels).toHaveLength(1);
    const [fake] = channels;
    expect(fake.name).toBe("datablocks-editor");

    channel.announce();
    expect(fake.posted).toEqual([{ type: "edit", tabId: expect.any(String) }]);
    const ownId = fake.posted[0].tabId;

    // Own messages, unrelated messages and empty events are ignored.
    fake.onmessage({ data: { type: "edit", tabId: ownId } });
    fake.onmessage({ data: { type: "other", tabId: "x" } });
    fake.onmessage({ data: null });
    expect(onOtherTab).not.toHaveBeenCalled();

    fake.onmessage({ data: { type: "edit", tabId: "another-tab" } });
    fake.onmessage({ data: { type: "edit", tabId: "third-tab" } });
    expect(onOtherTab).toHaveBeenCalledTimes(1);

    channel.close();
    expect(fake.closed).toBe(true);
  });

  it("tolerates a missing callback", async () => {
    vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);
    const { createTabChannel } = await load();
    createTabChannel();
    expect(() => channels[0].onmessage({ data: { type: "edit", tabId: "other" } })).not.toThrow();
  });

  it("delivers between two tabs over a real BroadcastChannel", async () => {
    if (typeof BroadcastChannel === "undefined") return;
    const { createTabChannel } = await load();
    const onA = vi.fn();
    const onB = vi.fn();
    const a = createTabChannel(onA);
    const b = createTabChannel(onB);
    try {
      a.announce();
      await vi.waitFor(() => expect(onB).toHaveBeenCalledTimes(1));
      expect(onA).not.toHaveBeenCalled();
    } finally {
      a.close();
      b.close();
    }
  });
});
