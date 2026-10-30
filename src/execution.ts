import { type Action, expandHome } from "./config";

export type Outcome =
  | { status: "opened" }
  | { status: "failed"; message: string }
  | { status: "ignored" }
  | { status: "stale" };

export type Coordinator = {
  request(run: () => Promise<void>, settle: (outcome: Outcome) => void): Promise<Outcome>;
  invalidate(): void;
  isPending(): boolean;
  textChanged(text: string): boolean;
};

export type Resolution =
  { ok: true; target: string; application?: string } | { ok: false; message: string };

export type DestinationEnvironment = {
  home: string;
  applications: { name: string; path: string }[];
  isDirectory(path: string): boolean;
};

export function createCoordinator(): Coordinator {
  let pending = false;
  let generation = 0;
  let previousText: string | undefined;

  async function request(run: () => Promise<void>, settle: (outcome: Outcome) => void) {
    if (pending) return { status: "ignored" } as const;
    pending = true;
    const started = generation;
    let outcome: Outcome;
    try {
      await run();
      outcome = { status: "opened" };
    } catch (error) {
      outcome = {
        status: "failed",
        message: error instanceof Error ? error.message : String(error),
      };
    } finally {
      pending = false;
    }
    if (started !== generation) return { status: "stale" } as const;
    settle(outcome);
    return outcome;
  }

  return {
    request,
    invalidate: () => {
      generation++;
    },
    isPending: () => pending,
    textChanged: (text) => {
      const changed = text !== previousText;
      previousText = text;
      return changed;
    },
  };
}

export function isBundlePath(path: string): boolean {
  return /\.(app|bundle|framework|kext|plugin|prefPane|qlgenerator|saver|workflow)\/?$/i.test(path);
}

export function resolveAction(action: Action, environment: DestinationEnvironment): Resolution {
  if (action.type === "url") {
    if (!action.openWith) return { ok: true, target: action.url };
    const app = resolveApplication(action.openWith, environment);
    if (!app.ok) return app;
    return { ok: true, target: action.url, application: app.target };
  }
  if (action.type === "folder") {
    const path = expandHome(action.path, environment.home);
    if (!environment.isDirectory(path)) return { ok: false, message: "Folder not found" };
    if (isBundlePath(path)) {
      return { ok: false, message: "This path is an app or bundle, not a folder" };
    }
    return { ok: true, target: path };
  }
  return resolveApplication(action.name, environment);
}

function resolveApplication(name: string, environment: DestinationEnvironment): Resolution {
  const found = environment.applications.filter((app) => app.name === name);
  if (found.length === 0) return { ok: false, message: `No application named “${name}”` };
  if (found.length > 1) {
    return { ok: false, message: `${found.length} applications are named “${name}”` };
  }
  return { ok: true, target: found[0].path };
}
