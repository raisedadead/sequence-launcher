import { describe, expect, it } from "vitest";
import type { Binding, Config } from "../src/config";
import { addBinding, removeBinding, updateBinding } from "../src/edit";

const app = (key: string, name: string): Binding => ({
  key,
  label: name,
  action: { type: "application", name },
});

const CONFIG: Config = {
  version: 1,
  bindings: [
    app("b", "Helium"),
    {
      key: "e",
      label: "Places",
      children: [{ key: "d", label: "Downloads", action: { type: "folder", path: "~/Downloads" } }],
    },
  ],
};

function configOf(result: ReturnType<typeof addBinding>) {
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.config;
}

describe("addBinding", () => {
  it("adds to the root and keeps order", () => {
    const config = configOf(addBinding(CONFIG, "", app("t", "Ghostty")));
    expect(config.bindings.map(({ key }) => key)).toEqual(["b", "e", "t"]);
    expect(CONFIG.bindings).toHaveLength(2);
  });

  it("adds into a group", () => {
    const config = configOf(addBinding(CONFIG, "e", app("f", "Finder")));
    const group = config.bindings[1];
    expect("children" in group && group.children.map(({ key }) => key)).toEqual(["d", "f"]);
  });

  it("adds an empty group", () => {
    const config = configOf(addBinding(CONFIG, "", { key: "w", label: "Web", children: [] }));
    expect(config.bindings[2]).toEqual({ key: "w", label: "Web", children: [] });
  });

  it("rejects a duplicate sibling key", () => {
    const result = addBinding(CONFIG, "e", app("d", "Finder"));
    expect(result).toEqual({
      ok: false,
      errors: [{ path: "bindings[1].children[1].key", message: "Duplicate key “d” in this group" }],
    });
  });

  it("rejects a parent that is missing or a leaf", () => {
    expect(addBinding(CONFIG, "q", app("x", "X")).ok).toBe(false);
    expect(addBinding(CONFIG, "b", app("x", "X")).ok).toBe(false);
  });

  it("rejects an invalid binding", () => {
    expect(addBinding(CONFIG, "", app("Q", "X")).ok).toBe(false);
  });
});

describe("updateBinding", () => {
  it("changes a leaf key, label and action", () => {
    const config = configOf(
      updateBinding(CONFIG, "ed", {
        key: "o",
        label: "Docs",
        action: { type: "url", url: "https://example.com" },
      }),
    );
    const group = config.bindings[1];
    expect("children" in group && group.children[0]).toEqual({
      key: "o",
      label: "Docs",
      action: { type: "url", url: "https://example.com" },
    });
  });

  it("changes a group key and label and keeps its children", () => {
    const config = configOf(updateBinding(CONFIG, "e", { key: "p", label: "Paths" }));
    expect(config.bindings[1]).toEqual({ ...CONFIG.bindings[1], key: "p", label: "Paths" });
  });

  it("rejects a key used by a sibling", () => {
    expect(updateBinding(CONFIG, "e", { key: "b", label: "Places" }).ok).toBe(false);
  });

  it("rejects a missing target and an action on a group", () => {
    expect(updateBinding(CONFIG, "q", { key: "q", label: "Q" }).ok).toBe(false);
    const action = { type: "application" as const, name: "X" };
    expect(updateBinding(CONFIG, "e", { key: "e", label: "P", action }).ok).toBe(false);
    expect(updateBinding(CONFIG, "b", { key: "b", label: "Helium" }).ok).toBe(false);
  });
});

describe("removeBinding", () => {
  it("removes a leaf and a whole group", () => {
    expect(configOf(removeBinding(CONFIG, "ed")).bindings[1]).toEqual({
      key: "e",
      label: "Places",
      children: [],
    });
    expect(configOf(removeBinding(CONFIG, "e")).bindings).toEqual([CONFIG.bindings[0]]);
  });

  it("rejects a missing target", () => {
    expect(removeBinding(CONFIG, "q").ok).toBe(false);
    expect(removeBinding(CONFIG, "").ok).toBe(false);
  });
});
