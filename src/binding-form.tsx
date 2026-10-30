import { homedir } from "node:os";
import { basename } from "node:path";
import { type JSX, useEffect, useState } from "react";
import { Action, ActionPanel, Form, Icon, showToast, Toast, useNavigation } from "@raycast/api";
import { saveBindings } from "./bindings-file";
import {
  type Action as Destination,
  type Binding,
  type Config,
  expandHome,
  folderProblem,
  isGroup,
  keyProblem,
  urlProblem,
  urlSummary,
} from "./config";
import { addBinding, suggestKey, updateBinding } from "./edit";
import { type Application, listApplications, shortenHome } from "./destinations";
import { isBundlePath } from "./execution";
import { Tinted } from "./presentation";
import { normalize } from "./sequence";

export type FormMode =
  { kind: "add"; parent: string } | { kind: "edit"; sequence: string; binding: Binding };

type Kind = "application" | "folder" | "url" | "group";

type Values = {
  key: string;
  label: string;
  kind?: Kind;
  application?: string;
  folder?: string[];
  url?: string;
  openWith?: string;
};

type Props = {
  mode: FormMode;
  config: Config;
  snapshot: string;
  file: string;
  onSaved: () => void;
};

function initialKind(mode: FormMode): Kind {
  if (mode.kind === "add") return "application";
  return isGroup(mode.binding) ? "group" : mode.binding.action.type;
}

function childrenAt(config: Config, parent: string): Binding[] {
  let children = config.bindings;
  for (const key of parent) {
    const group = children.find((binding) => binding.key === key);
    if (!group || !isGroup(group)) return [];
    children = group.children;
  }
  return children;
}

function parentLabel(config: Config, parent: string) {
  const labels: string[] = [];
  let children = config.bindings;
  for (const key of parent) {
    const group = children.find((binding) => binding.key === key);
    if (!group || !isGroup(group)) break;
    labels.push(group.label);
    children = group.children;
  }
  return labels.length === 0 ? "Bindings (top level)" : labels.join(" › ");
}

export function BindingForm({ mode, config, snapshot, file, onSaved }: Props): JSX.Element {
  const { pop } = useNavigation();
  const editing = mode.kind === "edit" ? mode.binding : undefined;
  const action = editing && !isGroup(editing) ? editing.action : undefined;
  const [kind, setKind] = useState<Kind>(initialKind(mode));
  const [applications, setApplications] = useState<Application[]>();
  const [keyError, setKeyError] = useState<string>();
  const [targetError, setTargetError] = useState<string>();

  useEffect(() => {
    listApplications().then(setApplications, () => setApplications([]));
  }, []);

  const storedName = action?.type === "application" ? action.name : undefined;
  const storedOpenWith = action?.type === "url" ? action.openWith : undefined;
  const names = [
    ...new Set([
      ...(applications ?? []).map(({ name }) => name),
      ...(storedName ? [storedName] : []),
      ...(storedOpenWith ? [storedOpenWith] : []),
    ]),
  ].sort((a, b) => a.localeCompare(b));
  const pathOf = (name: string) => applications?.find((app) => app.name === name)?.path;
  const parent = mode.kind === "add" ? mode.parent : mode.sequence.slice(0, -1);

  function destination(values: Values): { action: Destination; label: string } | string {
    if (kind === "application") {
      const name = values.application ?? "";
      const count = (applications ?? []).filter((app) => app.name === name).length;
      if (count === 0 && name && name === storedName) {
        return { action: { type: "application", name }, label: name };
      }
      if (count === 0) return "Choose an application";
      if (count > 1) return `${count} applications are named “${name}”. Rename one copy first.`;
      return { action: { type: "application", name }, label: name };
    }
    if (kind === "folder") {
      const chosen = values.folder?.[0];
      if (!chosen) return "Choose a folder";
      const path = shortenHome(chosen);
      const problem =
        folderProblem(path) ?? (isBundlePath(path) ? "Choose a folder, not an app" : undefined);
      if (problem) return problem;
      return { action: { type: "folder", path }, label: basename(chosen) };
    }
    const url = (values.url ?? "").trim();
    const problem = urlProblem(url);
    if (problem) return problem;
    const openWith =
      (values.openWith === undefined ? storedOpenWith : values.openWith) || undefined;
    const copies = (applications ?? []).filter((app) => app.name === openWith).length;
    if (openWith && copies > 1) {
      return `${copies} applications are named “${openWith}”. Rename one copy first.`;
    }
    return {
      action: { type: "url", url, ...(openWith ? { openWith } : {}) },
      label: urlSummary(url),
    };
  }

  function keyFor(typed: string, label: string) {
    if (typed || mode.kind === "edit") return typed;
    const taken = childrenAt(config, parent).map(({ key }) => key);
    return suggestKey(label, taken) ?? "";
  }

  async function submit(values: Values) {
    if (kind === "application" && !applications) {
      await showToast({ style: Toast.Style.Failure, title: "The app list is still loading" });
      return;
    }
    const typed = normalize(values.key.trim());
    const target = kind === "group" ? undefined : destination(values);
    setTargetError(typeof target === "string" ? target : undefined);
    if (typeof target === "string") return;
    const label = values.label.trim() || (target ? target.label : "Group");
    const key = keyFor(typed, label);
    const keyIssue = keyProblem(key);
    setKeyError(keyIssue);
    if (keyIssue) return;
    let result;
    if (!target) {
      result =
        mode.kind === "add"
          ? addBinding(config, mode.parent, { key, label, children: [] })
          : updateBinding(config, mode.sequence, { key, label });
    } else {
      const binding = { key, label, action: target.action };
      result =
        mode.kind === "add"
          ? addBinding(config, mode.parent, binding)
          : updateBinding(config, mode.sequence, binding);
    }
    if (!result.ok) {
      const [first] = result.errors;
      if (first.path.endsWith(".key")) setKeyError(first.message);
      else
        await showToast({
          style: Toast.Style.Failure,
          title: "Could not save",
          message: first.message,
        });
      return;
    }
    const saved = saveBindings(file, result.config, snapshot);
    if (!saved.ok) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Could not save",
        message: saved.message,
      });
      return;
    }
    const title = typed ? "Saved" : `Saved on key ${key.toUpperCase()}`;
    await showToast({ style: Toast.Style.Success, title });
    onSaved();
    pop();
  }

  const lockedGroup = editing && isGroup(editing);

  return (
    <Form
      navigationTitle={mode.kind === "add" ? "Add Binding" : "Edit Binding"}
      isLoading={!applications}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Save Binding" icon={Icon.Check} onSubmit={submit} />
        </ActionPanel>
      }
    >
      <Form.Description title="Group" text={parentLabel(config, parent)} />
      <Form.TextField
        id="key"
        title="Key"
        placeholder={
          mode.kind === "add" ? "Empty: a free key from the label" : "One letter or digit"
        }
        info="Type this key in Sequence Launcher to open the binding."
        defaultValue={editing?.key}
        error={keyError}
        onChange={() => setKeyError(undefined)}
      />
      <Form.TextField
        id="label"
        title="Label"
        placeholder="Optional. The name of the destination is used if empty."
        defaultValue={editing?.label}
      />
      {lockedGroup ? (
        <Form.Description title="Opens" text="Group" />
      ) : (
        <Form.Dropdown
          id="kind"
          title="Opens"
          value={kind}
          onChange={(value) => {
            setKind(value as Kind);
            setTargetError(undefined);
          }}
        >
          <Form.Dropdown.Item value="application" title="Application" icon={Icon.AppWindow} />
          <Form.Dropdown.Item value="folder" title="Folder" icon={Icon.Folder} />
          <Form.Dropdown.Item value="url" title="Website or Link" icon={Tinted.website} />
          {mode.kind === "add" ? (
            <Form.Dropdown.Item value="group" title="Group of Bindings" icon={Tinted.group} />
          ) : null}
        </Form.Dropdown>
      )}
      {kind === "application" && applications ? (
        <Form.Dropdown
          id="application"
          title="Application"
          defaultValue={action?.type === "application" ? action.name : undefined}
          error={targetError}
          onChange={() => setTargetError(undefined)}
        >
          {names.map((name) => {
            const path = pathOf(name);
            return (
              <Form.Dropdown.Item
                key={name}
                value={name}
                title={name}
                icon={path ? { fileIcon: path } : Icon.AppWindow}
              />
            );
          })}
        </Form.Dropdown>
      ) : null}
      {kind === "folder" ? (
        <Form.FilePicker
          id="folder"
          title="Folder"
          canChooseDirectories
          canChooseFiles={false}
          allowMultipleSelection={false}
          defaultValue={
            action?.type === "folder" ? [expandHome(action.path, homedir())] : undefined
          }
          error={targetError}
          onChange={() => setTargetError(undefined)}
        />
      ) : null}
      {kind === "url" ? (
        <Form.TextField
          id="url"
          title="URL"
          placeholder="https://, raycast://, mailto:"
          defaultValue={action?.type === "url" ? action.url : undefined}
          error={targetError}
          onChange={() => setTargetError(undefined)}
        />
      ) : null}
      {kind === "url" && applications ? (
        <Form.Dropdown
          id="openWith"
          title="Open With"
          info="The app that opens this URL. The default is the app that macOS assigns to the scheme."
          defaultValue={action?.type === "url" ? (action.openWith ?? "") : ""}
        >
          <Form.Dropdown.Item value="" title="Default App" icon={Tinted.website} />
          {names.map((name) => {
            const path = pathOf(name);
            return (
              <Form.Dropdown.Item
                key={name}
                value={name}
                title={name}
                icon={path ? { fileIcon: path } : Icon.AppWindow}
              />
            );
          })}
        </Form.Dropdown>
      ) : null}
    </Form>
  );
}
