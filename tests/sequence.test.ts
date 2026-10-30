import { describe, expect, it } from "vitest";
import type { Binding } from "../src/config";
import { destinations, match, place } from "../src/sequence";

const app = (key: string, name: string): Binding => ({
  key,
  label: name,
  action: { type: "application", name },
});

const BINDINGS: Binding[] = [
  app("b", "Helium"),
  {
    key: "e",
    label: "Places",
    children: [
      { key: "d", label: "Downloads", action: { type: "folder", path: "~/Downloads" } },
      app("f", "Finder"),
      {
        key: "x",
        label: "Deep",
        children: [{ key: "y", label: "Deeper", children: [app("z", "Zed")] }],
      },
      { key: "n", label: "Empty", children: [] },
    ],
  },
  app("1", "Digit"),
];

const kindOf = (text: string) => match(BINDINGS, text).kind;

describe("match", () => {
  it("returns the root group for empty input", () => {
    const result = match(BINDINGS, "");
    expect(result).toMatchObject({ kind: "group", sequence: "", trail: [] });
    if (result.kind === "group") expect(result.children).toBe(BINDINGS);
  });

  it("matches a group and a leaf exactly", () => {
    const group = match(BINDINGS, "e");
    expect(group.kind).toBe("group");
    if (group.kind === "group") expect(group.trail.map(({ label }) => label)).toEqual(["Places"]);
    const leaf = match(BINDINGS, "ed");
    expect(leaf).toMatchObject({ kind: "leaf", sequence: "ed", leaf: { label: "Downloads" } });
  });

  it("matches root leaves and digit keys", () => {
    expect(match(BINDINGS, "b")).toMatchObject({ kind: "leaf", leaf: { label: "Helium" } });
    expect(match(BINDINGS, "1")).toMatchObject({ kind: "leaf", leaf: { label: "Digit" } });
  });

  it("folds ASCII uppercase letters", () => {
    expect(match(BINDINGS, "ED")).toMatchObject({ kind: "leaf", sequence: "ed" });
    expect(match(BINDINGS, "eD")).toMatchObject({ kind: "leaf", sequence: "ed" });
  });

  it("gives the same result for slow and batched input", () => {
    expect([kindOf("e"), kindOf("ed")]).toEqual(["group", "leaf"]);
  });

  it("follows deletion back to the root", () => {
    expect(["edx", "ed", "e", ""].map(kindOf)).toEqual(["invalid", "leaf", "group", "group"]);
  });

  it("rejects symbols, whitespace and non-ASCII letters", () => {
    for (const text of [" ", "e ", " e", "e-", "-", "é", "É", "ｅ", "\t"]) {
      expect(kindOf(text)).toBe("invalid");
    }
  });

  it("rejects input beyond a leaf without truncation", () => {
    expect(kindOf("edx")).toBe("invalid");
    expect(kindOf("bb")).toBe("invalid");
  });

  it("has no prefix or fuzzy matching", () => {
    expect(kindOf("q")).toBe("invalid");
    expect(kindOf("de")).toBe("invalid");
    expect(kindOf("ef1")).toBe("invalid");
  });

  it("walks deeply nested groups", () => {
    expect(kindOf("ex")).toBe("group");
    expect(kindOf("exy")).toBe("group");
    const deep = match(BINDINGS, "exyz");
    expect(deep).toMatchObject({ kind: "leaf", leaf: { label: "Zed" } });
    if (deep.kind === "leaf") {
      expect(deep.trail.map(({ label }) => label)).toEqual(["Places", "Deep", "Deeper"]);
    }
  });

  it("treats an empty group as a group", () => {
    expect(match(BINDINGS, "en")).toMatchObject({ kind: "group", children: [] });
    expect(kindOf("enx")).toBe("invalid");
  });
});

describe("place", () => {
  const kindAt = (text: string) => place(BINDINGS, text).kind;

  it("enters groups like the launcher", () => {
    expect(place(BINDINGS, "")).toMatchObject({ kind: "group", sequence: "" });
    expect(place(BINDINGS, "E")).toMatchObject({ kind: "group", sequence: "e" });
  });

  it("finds a free key in the current group", () => {
    expect(place(BINDINGS, "eg")).toMatchObject({ kind: "free", parent: "e", key: "g" });
    expect(place(BINDINGS, "z")).toMatchObject({ kind: "free", parent: "", key: "z" });
    expect(place(BINDINGS, "en5")).toMatchObject({ kind: "free", parent: "en", key: "5" });
  });

  it("reports a key that a destination already uses", () => {
    const used = place(BINDINGS, "ed");
    expect(used).toMatchObject({ kind: "used", parent: "e", key: "d" });
    expect(used.kind === "used" && used.leaf.label).toBe("Downloads");
  });

  it("rejects input after a free or used key, and characters that are not keys", () => {
    expect(kindAt("egx")).toBe("invalid");
    expect(kindAt("edx")).toBe("invalid");
    expect(kindAt("é")).toBe("invalid");
  });
});

describe("destinations", () => {
  it("lists every destination with its sequence and group labels, in file order", () => {
    const rows = destinations(BINDINGS).map(({ sequence, trail, leaf }) => [
      sequence,
      trail.join(" › "),
      leaf.label,
    ]);
    expect(rows).toEqual([
      ["b", "", "Helium"],
      ["ed", "Places", "Downloads"],
      ["ef", "Places", "Finder"],
      ["exyz", "Places › Deep › Deeper", "Zed"],
      ["1", "", "Digit"],
    ]);
  });
});
