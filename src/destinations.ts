import { statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  closeMainWindow,
  environment,
  getApplications,
  getPreferenceValues,
  open,
  PopToRootType,
} from "@raycast/api";
import { type Loaded, loadBindings } from "./bindings-file";
import type { Action } from "./config";
import { type DestinationEnvironment, resolveAction } from "./execution";

export type Application = { name: string; path: string };

export async function listApplications(): Promise<Application[]> {
  const applications = await getApplications();
  return applications.map(({ name, path }) => ({ name, path }));
}

export function isDirectory(path: string): boolean {
  try {
    return statSync(path, { throwIfNoEntry: false })?.isDirectory() ?? false;
  } catch {
    return false;
  }
}

export function shortenHome(path: string): string {
  const home = homedir();
  return path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
}

export function destinationEnvironment(applications: Application[]): DestinationEnvironment {
  return { home: homedir(), applications, isDirectory };
}

export async function launch(action: Action, known?: Application[]): Promise<void> {
  const applications = known ?? (await listApplications());
  const resolution = resolveAction(action, destinationEnvironment(applications));
  if (!resolution.ok) throw new Error(resolution.message);
  await open(resolution.target, resolution.application);
  try {
    await closeMainWindow({ clearRootSearch: true, popToRootType: PopToRootType.Immediate });
  } catch (error) {
    console.error(error);
  }
}

export function bindingsPath(): { path: string; custom: boolean } {
  const { bindingsFile } = getPreferenceValues<{ bindingsFile?: string }>();
  if (bindingsFile) return { path: bindingsFile, custom: true };
  return { path: join(environment.supportPath, "bindings.json"), custom: false };
}

export function readBindings(): { file: string; loaded: Loaded } {
  const { path, custom } = bindingsPath();
  return { file: path, loaded: loadBindings(path, { create: !custom }) };
}
