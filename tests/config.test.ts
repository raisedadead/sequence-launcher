import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseConfig, urlProblem, urlSummary } from "../src/config";

it("accepts the example configuration", () => {
  const example = readFileSync(join(__dirname, "../examples/bindings.example.json"), "utf8");
  expect(parseConfig(example).ok).toBe(true);
});

const leaf = (key: string, extra: Record<string, unknown> = {}) => ({
  key,
  label: `Label ${key}`,
  action: { type: "application" as const, name: "Finder" },
  ...extra,
});

const text = (value: unknown) => JSON.stringify(value);

function errorsOf(value: unknown) {
  const result = parseConfig(text(value));
  if (result.ok) throw new Error("expected errors");
  return result.errors;
}

describe("parseConfig", () => {
  it("accepts a minimal configuration", () => {
    const result = parseConfig(text({ version: 1, bindings: [leaf("f")] }));
    expect(result).toEqual({
      ok: true,
      config: { version: 1, bindings: [leaf("f")] },
    });
  });

  it("accepts nested groups and reused keys in different groups", () => {
    const config = {
      version: 1,
      bindings: [
        leaf("d"),
        {
          key: "e",
          label: "Places",
          children: [leaf("d"), { key: "x", label: "X", children: [leaf("d")] }],
        },
      ],
    };
    expect(parseConfig(text(config))).toEqual({ ok: true, config });
  });

  it("accepts an empty group", () => {
    const config = { version: 1, bindings: [{ key: "e", label: "Places", children: [] }] };
    expect(parseConfig(text(config)).ok).toBe(true);
  });

  it("rejects invalid JSON", () => {
    const result = parseConfig("{ nope");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0].path).toBe("(file)");
  });

  it("rejects unsupported versions", () => {
    expect(errorsOf({ version: 2, bindings: [] })).toEqual([
      { path: "version", message: "Must be 1" },
    ]);
  });

  it("rejects unknown properties at each level", () => {
    const errors = errorsOf({
      version: 1,
      extra: true,
      bindings: [
        leaf("f", { color: "red" }),
        { ...leaf("g"), action: { type: "url", url: "https://a.example", x: 1 } },
      ],
    });
    expect(errors.map(({ path }) => path)).toEqual([
      "extra",
      "bindings[0].color",
      "bindings[1].action.x",
    ]);
  });

  it("rejects duplicate sibling keys with the location", () => {
    const errors = errorsOf({
      version: 1,
      bindings: [{ key: "e", label: "Places", children: [leaf("d"), leaf("d")] }],
    });
    expect(errors).toEqual([
      { path: "bindings[0].children[1].key", message: "Duplicate key “d” in this group" },
    ]);
  });

  it("rejects invalid keys and labels", () => {
    const errors = errorsOf({
      version: 1,
      bindings: [leaf("E"), leaf("ab"), leaf(" "), leaf("-"), { ...leaf("z"), label: "  " }],
    });
    expect(errors.map(({ path }) => path)).toEqual([
      "bindings[0].key",
      "bindings[1].key",
      "bindings[2].key",
      "bindings[3].key",
      "bindings[4].label",
    ]);
  });

  it("rejects nodes with both or neither of children and action", () => {
    const errors = errorsOf({
      version: 1,
      bindings: [
        { ...leaf("a"), children: [] },
        { key: "b", label: "B" },
      ],
    });
    expect(errors).toEqual([
      { path: "bindings[0]", message: "Use either “children” or “action”, not both" },
      { path: "bindings[1]", message: "Add “children” or “action”" },
    ]);
  });

  it("rejects unsupported action types", () => {
    const errors = errorsOf({
      version: 1,
      bindings: [{ ...leaf("a"), action: { type: "shell", command: "rm" } }],
    });
    expect(errors[0]).toEqual({
      path: "bindings[0].action.type",
      message: "Must be “application”, “folder”, or “url”",
    });
  });

  it("applies folder path rules", () => {
    const folder = (key: string, path: string) => ({
      ...leaf(key),
      action: { type: "folder", path },
    });
    const errors = errorsOf({
      version: 1,
      bindings: [
        folder("a", "~/Downloads"),
        folder("b", "/tmp"),
        folder("c", "Downloads"),
        folder("d", "~user/x"),
        folder("e", "$HOME/x"),
        folder("f", "~"),
      ],
    });
    expect(errors.map(({ path }) => path)).toEqual([
      "bindings[2].action.path",
      "bindings[3].action.path",
      "bindings[4].action.path",
      "bindings[5].action.path",
    ]);
  });

  it("applies URL rules", () => {
    const url = (key: string, value: string) => ({
      ...leaf(key),
      action: { type: "url", url: value },
    });
    const errors = errorsOf({
      version: 1,
      bindings: [
        url("a", "https://chat.example.com/u/1"),
        url("b", "http://example.com"),
        url("c", "raycast://extensions/someone/some-extension/command"),
        url("d", "mailto:someone@example.com"),
        url("e", "obsidian://open?vault=notes"),
        url("f", "https://user:pass@example.com"),
        url("g", "https://user@example.com"),
        url("h", "javascript:alert(1)"),
        url("i", "JavaScript:alert(1)"),
        url("j", "file:///Users/someone"),
        url("k", "not a url"),
      ],
    });
    expect(errors.map(({ path }) => path)).toEqual([
      "bindings[5].action.url",
      "bindings[6].action.url",
      "bindings[7].action.url",
      "bindings[8].action.url",
      "bindings[9].action.url",
      "bindings[10].action.url",
    ]);
  });

  it("accepts an app that opens a URL, and only on a URL", () => {
    const errors = errorsOf({
      version: 1,
      bindings: [
        { ...leaf("a"), action: { type: "url", url: "https://a.example", openWith: "Helium" } },
        { ...leaf("b"), action: { type: "url", url: "https://a.example", openWith: " " } },
        { ...leaf("c"), action: { type: "folder", path: "~/x", openWith: "Finder" } },
      ],
    });
    expect(errors.map(({ path }) => path)).toEqual([
      "bindings[1].action.openWith",
      "bindings[2].action.openWith",
    ]);
  });

  it("points a file URL to the folder type", () => {
    expect(urlProblem("file:///Users/someone")).toMatch(/folder/);
  });

  it("requires application names", () => {
    const errors = errorsOf({
      version: 1,
      bindings: [{ ...leaf("a"), action: { type: "application", name: "" } }],
    });
    expect(errors[0].path).toBe("bindings[0].action.name");
  });
});

describe("urlSummary", () => {
  it("shows the host of a web address", () => {
    expect(urlSummary("https://chat.example.com/u/1/app/home")).toBe("chat.example.com");
  });

  it("shows the scheme and host of another link", () => {
    expect(urlSummary("raycast://extensions/someone/x")).toBe("raycast://extensions");
  });

  it("shows the scheme and path when the link has no host", () => {
    expect(urlSummary("mailto:someone@example.com")).toBe("mailto:someone@example.com");
  });
});

describe("expandHome", () => {
  it("expands only a leading ~/", async () => {
    const { expandHome } = await import("../src/config");
    expect(expandHome("~/Downloads", "/Users/me")).toBe("/Users/me/Downloads");
    expect(expandHome("/tmp/~/x", "/Users/me")).toBe("/tmp/~/x");
  });
});

describe("serializeConfig", () => {
  it("round-trips through parseConfig", async () => {
    const { serializeConfig } = await import("../src/config");
    const config = { version: 1 as const, bindings: [leaf("f")] };
    const result = parseConfig(serializeConfig(config));
    expect(result).toEqual({ ok: true, config });
  });
});
