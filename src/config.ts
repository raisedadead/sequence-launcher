export type Action =
  | { type: "application"; name: string }
  | { type: "folder"; path: string }
  | { type: "url"; url: string; openWith?: string };
export type Group = { key: string; label: string; children: Binding[] };
export type Leaf = { key: string; label: string; action: Action };
export type Binding = Group | Leaf;
export type Config = { version: 1; bindings: Binding[] };
export type ConfigError = { path: string; message: string };
export type ParseResult = { ok: true; config: Config } | { ok: false; errors: ConfigError[] };

export const EMPTY_CONFIG: Config = { version: 1, bindings: [] };

const KEY_PATTERN = /^[a-z0-9]$/;
const ACTION_FIELDS = { application: "name", folder: "path", url: "url" } as const;

type Fields = Record<string, unknown>;

export function isGroup(binding: Binding): binding is Group {
  return "children" in binding;
}

export function keyProblem(key: unknown): string | undefined {
  if (typeof key === "string" && KEY_PATTERN.test(key)) return undefined;
  return "Must be one lowercase letter or digit";
}

export function folderProblem(path: unknown): string | undefined {
  if (typeof path !== "string") return "Must be a path";
  if (path.startsWith("/") || (path.startsWith("~/") && path.length > 2)) return undefined;
  return "Must start with “/” or “~/”";
}

export function urlProblem(url: unknown): string | undefined {
  if (typeof url !== "string") return "Must be a URL";
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "Must be a URL, for example https://example.com";
  }
  if (parsed.protocol === "file:") return "Use a folder binding for a file:// URL";
  if (parsed.protocol === "javascript:") return "Must not use javascript:";
  if (parsed.username || parsed.password) return "Must not contain a user name or password";
  return undefined;
}

export function isWebUrl(url: string): boolean {
  const { protocol } = new URL(url);
  return protocol === "https:" || protocol === "http:";
}

export function urlSummary(url: string): string {
  const { protocol, host, pathname } = new URL(url);
  if (isWebUrl(url)) return host;
  return host ? `${protocol}//${host}` : `${protocol}${pathname}`;
}

export function expandHome(path: string, home: string): string {
  return path.startsWith("~/") ? `${home}/${path.slice(2)}` : path;
}

export function serializeConfig(config: Config): string {
  return JSON.stringify(config, null, 2) + "\n";
}

export function parseConfig(text: string): ParseResult {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid JSON";
    return { ok: false, errors: [{ path: "(file)", message: `Invalid JSON: ${message}` }] };
  }
  return validateConfig(value);
}

export function validateConfig(value: unknown): ParseResult {
  const errors: ConfigError[] = [];
  if (!isFields(value)) {
    return { ok: false, errors: [{ path: "(file)", message: "Must be a JSON object" }] };
  }
  unknownFields(value, ["version", "bindings"], "", errors);
  if (value.version !== 1) errors.push({ path: "version", message: "Must be 1" });
  const bindings = validateList(value.bindings, "bindings", errors);
  if (errors.length > 0 || !bindings) return { ok: false, errors };
  return { ok: true, config: { version: 1, bindings } };
}

function validateList(value: unknown, path: string, errors: ConfigError[]) {
  if (!Array.isArray(value)) {
    errors.push({ path, message: "Must be a list" });
    return undefined;
  }
  const seen = new Set<string>();
  const bindings: Binding[] = [];
  value.forEach((item, index) => {
    const binding = validateBinding(item, `${path}[${index}]`, errors);
    if (!binding) return;
    if (seen.has(binding.key)) {
      errors.push({
        path: `${path}[${index}].key`,
        message: `Duplicate key “${binding.key}” in this group`,
      });
    }
    seen.add(binding.key);
    bindings.push(binding);
  });
  return bindings;
}

function validateBinding(value: unknown, path: string, errors: ConfigError[]) {
  if (!isFields(value)) {
    errors.push({ path, message: "Must be an object" });
    return undefined;
  }
  const before = errors.length;
  unknownFields(value, ["key", "label", "children", "action"], `${path}.`, errors);
  const { key, label } = value;
  const keyError = keyProblem(key);
  if (keyError) errors.push({ path: `${path}.key`, message: keyError });
  if (typeof label !== "string" || label.trim() === "") {
    errors.push({ path: `${path}.label`, message: "Must not be empty" });
  }
  const hasChildren = "children" in value;
  const hasAction = "action" in value;
  if (hasChildren && hasAction) {
    errors.push({ path, message: "Use either “children” or “action”, not both" });
    return undefined;
  }
  if (!hasChildren && !hasAction) {
    errors.push({ path, message: "Add “children” or “action”" });
    return undefined;
  }
  const children = hasChildren
    ? validateList(value.children, `${path}.children`, errors)
    : undefined;
  const action = hasAction ? validateAction(value.action, `${path}.action`, errors) : undefined;
  if (errors.length > before) return undefined;
  const base = { key: key as string, label: label as string };
  return children ? { ...base, children } : { ...base, action: action as Action };
}

function validateAction(value: unknown, path: string, errors: ConfigError[]) {
  if (!isFields(value)) {
    errors.push({ path, message: "Must be an object" });
    return undefined;
  }
  const { type } = value;
  if (type !== "application" && type !== "folder" && type !== "url") {
    errors.push({ path: `${path}.type`, message: "Must be “application”, “folder”, or “url”" });
    return undefined;
  }
  const field = ACTION_FIELDS[type];
  const optional = type === "url" ? ["openWith"] : [];
  unknownFields(value, ["type", field, ...optional], `${path}.`, errors);
  const { openWith } = value;
  const hasOpenWith = type === "url" && "openWith" in value;
  if (hasOpenWith && (typeof openWith !== "string" || openWith.trim() === "")) {
    errors.push({ path: `${path}.openWith`, message: "Must be an application name" });
    return undefined;
  }
  const target = value[field];
  const problem =
    type === "url"
      ? urlProblem(target)
      : type === "folder"
        ? folderProblem(target)
        : typeof target === "string" && target.trim() !== ""
          ? undefined
          : "Must not be empty";
  if (problem) {
    errors.push({ path: `${path}.${field}`, message: problem });
    return undefined;
  }
  return { type, [field]: target, ...(hasOpenWith ? { openWith } : {}) } as Action;
}

function unknownFields(value: Fields, allowed: string[], prefix: string, errors: ConfigError[]) {
  for (const name of Object.keys(value)) {
    if (!allowed.includes(name))
      errors.push({ path: `${prefix}${name}`, message: "Unknown property" });
  }
}

function isFields(value: unknown): value is Fields {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
