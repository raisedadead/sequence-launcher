import { describe, expect, it, vi } from "vitest";
import type { Action } from "../src/config";
import { createCoordinator, type Outcome, resolveAction } from "../src/execution";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function setup() {
  const coordinator = createCoordinator();
  const settled: Outcome[] = [];
  const settle = (outcome: Outcome) => settled.push(outcome);
  return { coordinator, settled, settle };
}

describe("createCoordinator", () => {
  it("runs one exact leaf once", async () => {
    const { coordinator, settled, settle } = setup();
    const run = vi.fn(async () => {});
    await coordinator.request(run, settle);
    expect(run).toHaveBeenCalledTimes(1);
    expect(settled).toEqual([{ status: "opened" }]);
  });

  it("ignores duplicate and racing requests while one is pending", async () => {
    const { coordinator, settled, settle } = setup();
    const gate = deferred();
    const first = vi.fn(() => gate.promise);
    const second = vi.fn(async () => {});
    const pending = coordinator.request(first, settle);
    expect(coordinator.isPending()).toBe(true);
    expect(await coordinator.request(first, settle)).toEqual({ status: "ignored" });
    expect(await coordinator.request(second, settle)).toEqual({ status: "ignored" });
    gate.resolve();
    await pending;
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
    expect(settled).toEqual([{ status: "opened" }]);
    expect(coordinator.isPending()).toBe(false);
  });

  it("sets the latch before the run starts", async () => {
    const { coordinator, settle } = setup();
    let pendingInsideRun = false;
    await coordinator.request(async () => {
      pendingInsideRun = coordinator.isPending();
    }, settle);
    expect(pendingInsideRun).toBe(true);
  });

  it("reports failure without retrying, then allows an explicit retry", async () => {
    const { coordinator, settled, settle } = setup();
    const run = vi.fn(async () => {
      throw new Error("Folder not found");
    });
    await coordinator.request(run, settle);
    expect(run).toHaveBeenCalledTimes(1);
    expect(settled).toEqual([{ status: "failed", message: "Folder not found" }]);
    await coordinator.request(run, settle);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("drops a stale completion after invalidation but keeps the latch", async () => {
    const { coordinator, settled, settle } = setup();
    const gate = deferred();
    const pending = coordinator.request(() => gate.promise, settle);
    coordinator.invalidate();
    const again = vi.fn(async () => {});
    expect(await coordinator.request(again, settle)).toEqual({ status: "ignored" });
    gate.resolve();
    expect(await pending).toEqual({ status: "stale" });
    expect(settled).toEqual([]);
    expect(again).not.toHaveBeenCalled();
    expect(coordinator.isPending()).toBe(false);
  });

  it("drops a stale failure after invalidation", async () => {
    const { coordinator, settled, settle } = setup();
    const gate = deferred();
    const pending = coordinator.request(() => gate.promise, settle);
    coordinator.invalidate();
    gate.reject(new Error("late"));
    expect(await pending).toEqual({ status: "stale" });
    expect(settled).toEqual([]);
  });
});

describe("textChanged", () => {
  it("reports only values that differ from the previous callback", () => {
    const { coordinator } = setup();
    expect(["e", "ed", "ed", "e", "ed", ""].map((text) => coordinator.textChanged(text))).toEqual([
      true,
      true,
      false,
      true,
      true,
      true,
    ]);
  });
});

describe("resolveAction", () => {
  const environment = {
    home: "/Users/me",
    applications: [
      { name: "Finder", path: "/System/Library/CoreServices/Finder.app" },
      { name: "Xcode", path: "/Applications/Xcode.app" },
      { name: "Xcode", path: "/Applications/Xcode-beta.app" },
    ],
    isDirectory: (path: string) =>
      path === "/Users/me/Downloads" || path.endsWith(".app") || path.endsWith(".prefPane"),
  };
  const resolve = (action: Action) => resolveAction(action, environment);

  it("resolves an application to its discovered path", () => {
    expect(resolve({ type: "application", name: "Finder" })).toEqual({
      ok: true,
      target: "/System/Library/CoreServices/Finder.app",
    });
  });

  it("reports missing and ambiguous applications", () => {
    expect(resolve({ type: "application", name: "Nope" })).toEqual({
      ok: false,
      message: "No application named “Nope”",
    });
    expect(resolve({ type: "application", name: "Xcode" })).toEqual({
      ok: false,
      message: "2 applications are named “Xcode”",
    });
  });

  it("expands ~/ for folders and rejects missing folders and bundles", () => {
    expect(resolve({ type: "folder", path: "~/Downloads" })).toEqual({
      ok: true,
      target: "/Users/me/Downloads",
    });
    expect(resolve({ type: "folder", path: "~/Missing" })).toEqual({
      ok: false,
      message: "Folder not found",
    });
    for (const path of ["/Applications/Tool.app", "/Library/PreferencePanes/Pane.prefPane"]) {
      expect(resolve({ type: "folder", path })).toEqual({
        ok: false,
        message: "This path is an app or bundle, not a folder",
      });
    }
  });

  it("passes URLs through", () => {
    expect(resolve({ type: "url", url: "https://example.com/a" })).toEqual({
      ok: true,
      target: "https://example.com/a",
    });
  });

  it("resolves the app that opens a URL", () => {
    expect(resolve({ type: "url", url: "https://example.com", openWith: "Finder" })).toEqual({
      ok: true,
      target: "https://example.com",
      application: "/System/Library/CoreServices/Finder.app",
    });
    expect(resolve({ type: "url", url: "https://example.com", openWith: "Nope" })).toEqual({
      ok: false,
      message: "No application named “Nope”",
    });
  });
});
