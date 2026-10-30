import { randomUUID } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import {
  type Config,
  type ConfigError,
  EMPTY_CONFIG,
  parseConfig,
  serializeConfig,
} from "./config";

export type Loaded =
  | { status: "ok"; config: Config; snapshot: string }
  | { status: "invalid"; errors: ConfigError[] }
  | { status: "error"; message: string };

export type Saved = { ok: true } | { ok: false; message: string };

export function loadBindings(path: string, { create }: { create: boolean }): Loaded {
  try {
    if (!existsSync(path)) {
      if (!create) return { status: "error", message: `File not found: ${path}` };
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, serializeConfig(EMPTY_CONFIG), { flag: "wx" });
    }
    const snapshot = readFileSync(path, "utf8");
    const parsed = parseConfig(snapshot);
    if (!parsed.ok) return { status: "invalid", errors: parsed.errors };
    return { status: "ok", config: parsed.config, snapshot };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : String(error) };
  }
}

export function saveBindings(path: string, config: Config, snapshot: string): Saved {
  let temporary: string | undefined;
  try {
    const target = realpathSync(path);
    if (readFileSync(target, "utf8") !== snapshot) {
      return { ok: false, message: "The bindings file changed on disk. Reload, then try again." };
    }
    temporary = join(dirname(target), `.${basename(target)}.${randomUUID()}.tmp`);
    writeFileSync(temporary, serializeConfig(config), { flag: "wx" });
    chmodSync(temporary, statSync(target).mode);
    renameSync(temporary, target);
    return { ok: true };
  } catch (error) {
    if (temporary) rmSync(temporary, { force: true });
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}
