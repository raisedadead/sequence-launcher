import { Color, Icon, type Image, type List } from "@raycast/api";
import type { Loaded } from "./bindings-file";
import { type Binding, isGroup, isWebUrl, type Leaf, urlSummary } from "./config";
import { type Application, destinationEnvironment } from "./destinations";
import { type Resolution, resolveAction } from "./execution";
import { keyCaps } from "./sequence";

export const Tinted = {
  website: { source: Icon.Globe, tintColor: Color.Blue },
  link: { source: Icon.Link, tintColor: Color.Purple },
  group: { source: Icon.Layers, tintColor: Color.Orange },
  suggested: { source: Icon.PlusCircle, tintColor: Color.Green },
  invalid: { source: Icon.XMarkCircle, tintColor: Color.Red },
  error: { source: Icon.ExclamationMark, tintColor: Color.Red },
  warning: { source: Icon.Warning, tintColor: Color.Yellow },
} satisfies Record<string, Image>;

export function trailTitle(trail: { label: string }[]): string {
  return trail.length === 0 ? "Bindings" : trail.map(({ label }) => label).join(" › ");
}

export function fileProblemTitle({ status }: Exclude<Loaded, { status: "ok" }>): string {
  return status === "invalid" ? "The bindings file has errors" : "Cannot read the bindings file";
}

function countLeaves(binding: Binding): number {
  return isGroup(binding)
    ? binding.children.reduce((sum, child) => sum + countLeaves(child), 0)
    : 1;
}

function availability(leaf: Leaf, applications?: Application[]): Resolution | undefined {
  if (!applications) return undefined;
  return resolveAction(leaf.action, destinationEnvironment(applications));
}

export function iconOf(binding: Binding, applications?: Application[]): Image.ImageLike {
  if (isGroup(binding)) return Tinted.group;
  const { action } = binding;
  const resolved = availability(binding, applications);
  if (action.type === "url") {
    if (resolved?.ok && resolved.application) return { fileIcon: resolved.application };
    return isWebUrl(action.url) ? Tinted.website : Tinted.link;
  }
  if (resolved?.ok) return { fileIcon: resolved.target };
  return action.type === "folder" ? Icon.Folder : Icon.AppWindow;
}

export function typeOf({ action }: Leaf): string {
  if (action.type === "url") return isWebUrl(action.url) ? "Website" : "Link";
  return action.type === "folder" ? "Folder" : "App";
}

export function detailOf({ action, label }: Leaf): string | undefined {
  if (action.type === "url") {
    const summary = urlSummary(action.url);
    return action.openWith ? `${summary} in ${action.openWith}` : summary;
  }
  if (action.type === "folder") return action.path;
  return action.name === label ? undefined : action.name;
}

export function tooltipOf(binding: Binding): string {
  if (isGroup(binding)) {
    if (binding.children.length === 0) return "Group with no bindings yet";
    const keys = keyCaps(binding.children.map(({ key }) => key).join(""));
    const count = countLeaves(binding);
    return `Group: ${keys} · ${count} ${count === 1 ? "binding" : "bindings"}`;
  }
  const detail = detailOf(binding);
  return detail ? `${typeOf(binding)}: ${detail}` : typeOf(binding);
}

export function warningOf(binding: Binding, applications?: Application[]): string | undefined {
  if (isGroup(binding)) return undefined;
  const resolved = availability(binding, applications);
  return resolved && !resolved.ok ? resolved.message : undefined;
}

export function hintOf(binding: Binding, applications?: Application[]): List.Item.Accessory[] {
  if (isGroup(binding)) {
    if (binding.children.length === 0) return [{ text: "Empty" }];
    const count = countLeaves(binding);
    return [
      {
        text: keyCaps(binding.children.map(({ key }) => key).join("")),
        tooltip: count === 1 ? "1 binding" : `${count} bindings`,
      },
    ];
  }
  const resolved = availability(binding, applications);
  const warning: List.Item.Accessory[] =
    resolved && !resolved.ok ? [{ icon: Tinted.warning, tooltip: resolved.message }] : [];
  const detail = detailOf(binding);
  return [...warning, { tag: typeOf(binding) }, ...(detail ? [{ text: detail }] : [])];
}
