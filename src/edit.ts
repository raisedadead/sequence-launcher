import {
  type Action,
  type Binding,
  type Config,
  folderProblem,
  isGroup,
  keyProblem,
  type ParseResult,
  urlProblem,
  urlSummary,
  validateConfig,
} from "./config";
import { isBundlePath } from "./execution";

export type Changes = { key: string; label: string; action?: Action };

export type Captured = {
  source: "Finder selection" | "Clipboard" | "Front app";
  label: string;
  action: Action;
};

export type CaptureInput = {
  folder?: string;
  clipboard?: string;
  app?: { name: string; bundleId?: string };
};

const RAYCAST_BUNDLE = "com.raycast.macos";
const HOSTLESS_SCHEMES = ["mailto:", "tel:"];

function isLinkText(text: string): boolean {
  if (/\s/.test(text) || urlProblem(text)) return false;
  const { protocol } = new URL(text);
  const hasSlashes = text.toLowerCase().startsWith(`${protocol}//`);
  return hasSlashes || HOSTLESS_SCHEMES.includes(protocol);
}

export function chooseCapture({ folder, clipboard, app }: CaptureInput): Captured | undefined {
  if (folder && !folderProblem(folder) && !isBundlePath(folder)) {
    const label = folder.split("/").filter(Boolean).pop() ?? folder;
    return { source: "Finder selection", label, action: { type: "folder", path: folder } };
  }
  const url = clipboard?.trim();
  if (url && isLinkText(url)) {
    return { source: "Clipboard", label: urlSummary(url), action: { type: "url", url } };
  }
  if (app && app.bundleId !== RAYCAST_BUNDLE) {
    return {
      source: "Front app",
      label: app.name,
      action: { type: "application", name: app.name },
    };
  }
  return undefined;
}

type ListEdit = (list: Binding[]) => Binding[] | string;

export function addBinding(config: Config, parent: string, binding: Binding): ParseResult {
  return apply(config, parent, (list) => [...list, binding]);
}

export function updateBinding(config: Config, sequence: string, changes: Changes): ParseResult {
  return applyAt(config, sequence, (list, index) => {
    const current = list[index];
    const { key, label, action } = changes;
    if (isGroup(current)) {
      if (action) return "A group cannot have a destination";
      return replace(list, index, { key, label, children: current.children });
    }
    if (!action) return "Choose a destination";
    return replace(list, index, { key, label, action });
  });
}

export function removeBinding(config: Config, sequence: string): ParseResult {
  return applyAt(config, sequence, (list, index) => list.filter((_, other) => other !== index));
}

function applyAt(
  config: Config,
  sequence: string,
  edit: (list: Binding[], index: number) => Binding[] | string,
): ParseResult {
  if (sequence === "") return failure("Choose a binding");
  const key = sequence[sequence.length - 1];
  return apply(config, sequence.slice(0, -1), (list) => {
    const index = list.findIndex((binding) => binding.key === key);
    return index === -1 ? `No binding for “${sequence}”` : edit(list, index);
  });
}

function apply(config: Config, parent: string, edit: ListEdit): ParseResult {
  const bindings = editList(config.bindings, parent, edit);
  if (typeof bindings === "string") return failure(bindings);
  return validateConfig({ version: config.version, bindings });
}

function editList(list: Binding[], parent: string, edit: ListEdit): Binding[] | string {
  if (parent === "") return edit(list);
  const index = list.findIndex(({ key }) => key === parent[0]);
  const group = list[index];
  if (!group || !isGroup(group)) return `No group for “${parent}”`;
  const children = editList(group.children, parent.slice(1), edit);
  if (typeof children === "string") return children;
  return replace(list, index, { ...group, children });
}

const ALL_KEYS = "abcdefghijklmnopqrstuvwxyz0123456789";

export function suggestKey(label: string, taken: Iterable<string>): string | undefined {
  const used = new Set(taken);
  const words = label.split(/\s+/);
  const initials = words.map((word) => word.charAt(0)).join("");
  const candidates = `${initials}${label}`.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
  return [...candidates, ...ALL_KEYS].find(
    (key) => keyProblem(key) === undefined && !used.has(key),
  );
}

function replace(list: Binding[], index: number, binding: Binding) {
  return list.map((current, other) => (other === index ? binding : current));
}

function failure(message: string): ParseResult {
  return { ok: false, errors: [{ path: "(edit)", message }] };
}
