import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { loadBindings, saveBindings } from "../src/bindings-file";
import { type Config, EMPTY_CONFIG, serializeConfig } from "../src/config";

const CONFIG: Config = {
  version: 1,
  bindings: [{ key: "f", label: "Finder", action: { type: "application", name: "Finder" } }],
};

let directory: string;
let file: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "sequence-launcher-test-"));
  file = join(directory, "bindings.json");
});

describe("loadBindings", () => {
  it("creates an empty file when asked and it is missing", () => {
    const loaded = loadBindings(file, { create: true });
    expect(loaded).toMatchObject({ status: "ok", config: EMPTY_CONFIG });
    expect(readFileSync(file, "utf8")).toBe(serializeConfig(EMPTY_CONFIG));
  });

  it("reports a missing file when not asked to create it", () => {
    expect(loadBindings(file, { create: false })).toEqual({
      status: "error",
      message: `File not found: ${file}`,
    });
  });

  it("loads a valid file with its snapshot", () => {
    writeFileSync(file, serializeConfig(CONFIG));
    expect(loadBindings(file, { create: false })).toEqual({
      status: "ok",
      config: CONFIG,
      snapshot: serializeConfig(CONFIG),
    });
  });

  it("reports validation errors with locations", () => {
    writeFileSync(file, JSON.stringify({ version: 1, bindings: [{ key: "F" }] }));
    const loaded = loadBindings(file, { create: false });
    expect(loaded.status).toBe("invalid");
    if (loaded.status === "invalid") expect(loaded.errors[0].path).toBe("bindings[0].key");
  });
});

describe("saveBindings", () => {
  it("writes the file and keeps its permissions", () => {
    const { snapshot } = loadOk();
    chmodSync(file, 0o600);
    expect(saveBindings(file, CONFIG, snapshot)).toEqual({ ok: true });
    expect(readFileSync(file, "utf8")).toBe(serializeConfig(CONFIG));
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(readdirSync(directory)).toEqual(["bindings.json"]);
  });

  it("removes the temporary file when the write fails", () => {
    const { snapshot } = loadOk();
    chmodSync(directory, 0o500);
    try {
      expect(saveBindings(file, CONFIG, snapshot).ok).toBe(false);
    } finally {
      chmodSync(directory, 0o700);
    }
    expect(readdirSync(directory)).toEqual(["bindings.json"]);
    expect(readFileSync(file, "utf8")).toBe(snapshot);
  });

  it("refuses to overwrite a file changed on disk", () => {
    const { snapshot } = loadOk();
    writeFileSync(file, serializeConfig(CONFIG));
    expect(saveBindings(file, EMPTY_CONFIG, snapshot)).toEqual({
      ok: false,
      message: "The bindings file changed on disk. Reload, then try again.",
    });
    expect(readFileSync(file, "utf8")).toBe(serializeConfig(CONFIG));
  });

  it("writes through a symbolic link and keeps the link", () => {
    const target = join(directory, "real.json");
    writeFileSync(target, serializeConfig(EMPTY_CONFIG));
    const link = join(directory, "link.json");
    symlinkSync(target, link);
    const loaded = loadBindings(link, { create: false });
    if (loaded.status !== "ok") throw new Error("expected ok");
    expect(saveBindings(link, CONFIG, loaded.snapshot).ok).toBe(true);
    expect(readFileSync(target, "utf8")).toBe(serializeConfig(CONFIG));
    expect(readdirSync(directory).sort()).toEqual(["link.json", "real.json"]);
  });
});

function loadOk() {
  const loaded = loadBindings(file, { create: true });
  if (loaded.status !== "ok") throw new Error("expected ok");
  return loaded;
}
