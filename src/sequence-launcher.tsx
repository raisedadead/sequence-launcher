import { type JSX, useEffect, useState } from "react";
import {
  Action,
  ActionPanel,
  Alert,
  confirmAlert,
  Icon,
  Keyboard,
  open,
  openExtensionPreferences,
  showToast,
  Toast,
} from "@raycast/api";
import { BindingForm, type FormMode } from "./binding-form";
import { saveBindings } from "./bindings-file";
import { type Binding, type Config, isGroup, type Leaf } from "./config";
import { removeBinding } from "./edit";
import { createCoordinator } from "./execution";
import { type Application, launch, listApplications, readBindings } from "./destinations";
import {
  fileProblemTitle,
  hintOf,
  iconOf,
  Tinted,
  tooltipOf,
  trailTitle,
  warningOf,
} from "./presentation";
import { preferredLayout, Surface, SurfaceEmpty, SurfaceItem, SurfaceSection } from "./surface";
import { keyCaps, match } from "./sequence";
import { createTrace } from "./trace";

const KEYS_ONLY = /^[A-Za-z0-9]*$/;

function traced(text: string) {
  return KEYS_ONLY.test(text) ? { raw: text } : { length: text.length };
}

function countDescendants(binding: Binding): number {
  return isGroup(binding)
    ? binding.children.reduce((sum, child) => sum + 1 + countDescendants(child), 0)
    : 0;
}

type Attempt = { sequence: string; failure?: string };

export default function Command(): JSX.Element {
  const [state, setState] = useState(readBindings);
  const [text, setText] = useState("");
  const [attempt, setAttempt] = useState<Attempt>();
  const [applications, setApplications] = useState<Application[]>();
  const [coordinator] = useState(createCoordinator);
  const [trace] = useState(createTrace);
  const [layout] = useState(preferredLayout);

  useEffect(() => {
    trace("mount");
    listApplications().then(setApplications, () => setApplications([]));
    return () => {
      coordinator.invalidate();
      trace("unmount");
    };
  }, []);

  const { file, loaded } = state;
  const usable = loaded.status === "ok" ? loaded.config : undefined;

  function reload() {
    coordinator.invalidate();
    setAttempt(undefined);
    setState(readBindings());
    trace("reload");
  }

  function launchLeaf(sequence: string, leaf: Leaf, source: string) {
    if (coordinator.isPending()) {
      trace("execute-ignored", { sequence, source });
      return;
    }
    setAttempt({ sequence });
    trace("execute-request", { sequence, source });
    void coordinator
      .request(
        () => launch(leaf.action, applications),
        (outcome) => {
          if (outcome.status !== "failed") return;
          setAttempt({ sequence, failure: outcome.message });
          void showToast({
            style: Toast.Style.Failure,
            title: `Could not open ${leaf.label}`,
            message: outcome.message,
          });
        },
      )
      .then(({ status }) => trace("execute-settled", { sequence, source, status }));
  }

  function onSearchTextChange(next: string) {
    if (!coordinator.textChanged(next)) {
      trace("input", { ...traced(next), kind: "repeat" });
      return;
    }
    setText(next);
    if (!usable) return;
    const result = match(usable.bindings, next);
    const kind = coordinator.isPending() ? "pending" : result.kind;
    trace("input", { ...traced(next), kind });
    if (result.kind === "leaf") launchLeaf(result.sequence, result.leaf, "text");
  }

  const fileActions = (
    <ActionPanel.Section>
      <Action
        title="Reload Bindings"
        icon={Icon.ArrowClockwise}
        shortcut={Keyboard.Shortcut.Common.Refresh}
        onAction={reload}
      />
      <Action
        title="Open Bindings File"
        icon={Icon.Document}
        shortcut={Keyboard.Shortcut.Common.Open}
        onAction={() => void open(file)}
      />
      <Action
        title="Open Extension Preferences"
        icon={Icon.Gear}
        onAction={() => void openExtensionPreferences()}
      />
    </ActionPanel.Section>
  );

  const resetAction = (
    <Action title="Reset Sequence" icon={Icon.Undo} onAction={() => onSearchTextChange("")} />
  );

  function editorActions(
    current: Config,
    snapshot: string,
    parent: string,
    binding?: { sequence: string; value: Binding },
  ) {
    const form = (mode: FormMode) => (
      <BindingForm mode={mode} config={current} snapshot={snapshot} file={file} onSaved={reload} />
    );
    return (
      <ActionPanel.Section>
        <Action.Push
          title={parent ? "Add Binding to This Group" : "Add Binding"}
          icon={Icon.Plus}
          shortcut={Keyboard.Shortcut.Common.New}
          target={form({ kind: "add", parent })}
        />
        {binding && isGroup(binding.value) ? (
          <Action.Push
            title={`Add Binding to ${binding.value.label}`}
            icon={Icon.PlusCircle}
            target={form({ kind: "add", parent: binding.sequence })}
          />
        ) : null}
        {binding ? (
          <Action.Push
            title="Edit Binding"
            icon={Icon.Pencil}
            shortcut={Keyboard.Shortcut.Common.Edit}
            target={form({ kind: "edit", sequence: binding.sequence, binding: binding.value })}
          />
        ) : null}
        {binding ? (
          <Action
            title="Delete Binding"
            icon={Icon.Trash}
            style={Action.Style.Destructive}
            shortcut={Keyboard.Shortcut.Common.Remove}
            onAction={() => void remove(current, snapshot, binding.sequence, binding.value)}
          />
        ) : null}
      </ActionPanel.Section>
    );
  }

  async function remove(current: Config, snapshot: string, sequence: string, binding: Binding) {
    const nested = countDescendants(binding);
    const confirmed = await confirmAlert({
      title: `Delete “${binding.label}”?`,
      message: nested > 0 ? `This also deletes the ${nested} items in this group.` : undefined,
      primaryAction: { title: "Delete", style: Alert.ActionStyle.Destructive },
    });
    if (!confirmed) return;
    const edited = removeBinding(current, sequence);
    const saved = edited.ok
      ? saveBindings(file, edited.config, snapshot)
      : { ok: false as const, message: edited.errors[0].message };
    if (!saved.ok) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Could not delete",
        message: saved.message,
      });
      return;
    }
    await showToast({ style: Toast.Style.Success, title: `Deleted ${binding.label}` });
    reload();
    onSearchTextChange(sequence.slice(0, -1));
  }

  if (loaded.status !== "ok") {
    const shown = loaded.status === "invalid" ? loaded.errors.slice(0, 5) : [];
    const hidden = loaded.status === "invalid" ? loaded.errors.length - shown.length : 0;
    const errors =
      loaded.status === "invalid"
        ? [
            ...shown.map(({ path, message }) => `${path}: ${message}`),
            ...(hidden > 0 ? [`… and ${hidden} more`] : []),
          ]
        : [loaded.message];
    return (
      <Surface layout={layout} searchText={text} onSearchTextChange={onSearchTextChange}>
        <SurfaceEmpty
          layout={layout}
          icon={Tinted.error}
          title={fileProblemTitle(loaded)}
          description={`${errors.join("\n")}\n\nFix the file, then reload. Sequences are disabled.`}
          actions={<ActionPanel>{fileActions}</ActionPanel>}
        />
      </Surface>
    );
  }

  const { config, snapshot } = loaded;
  const result = match(config.bindings, text);
  const current = attempt?.sequence === result.sequence ? attempt : undefined;
  const title =
    result.kind === "invalid"
      ? "Sequence Launcher"
      : `Sequence Launcher › ${trailTitle(result.trail)}`;

  return (
    <Surface
      layout={layout}
      searchText={text}
      onSearchTextChange={onSearchTextChange}
      navigationTitle={title}
      searchBarPlaceholder="Type a key sequence"
    >
      {result.kind === "invalid" ? (
        <SurfaceEmpty
          layout={layout}
          icon={Tinted.invalid}
          title={`No binding for “${text}”`}
          description="Press Backspace to correct the sequence."
          actions={
            <ActionPanel>
              {resetAction}
              {fileActions}
            </ActionPanel>
          }
        />
      ) : result.kind === "leaf" ? (
        <SurfaceEmpty
          layout={layout}
          icon={current?.failure ? Tinted.warning : iconOf(result.leaf, applications)}
          title={
            !current
              ? `Press Return to open ${result.leaf.label}`
              : current.failure
                ? `Could not open ${result.leaf.label}`
                : `Opening ${result.leaf.label}…`
          }
          description={current?.failure}
          actions={
            <ActionPanel>
              <Action
                title={current ? "Retry" : "Open"}
                icon={Icon.ArrowClockwise}
                onAction={() => launchLeaf(result.sequence, result.leaf, "retry")}
              />
              {resetAction}
              {editorActions(config, snapshot, result.sequence.slice(0, -1), {
                sequence: result.sequence,
                value: result.leaf,
              })}
              {fileActions}
            </ActionPanel>
          }
        />
      ) : result.children.length === 0 ? (
        <SurfaceEmpty
          layout={layout}
          icon={result.sequence ? Icon.Plus : Icon.Keyboard}
          title={result.sequence ? "No bindings in this group" : "No bindings yet"}
          description="Press ⌘N to add a binding."
          actions={
            <ActionPanel>
              {editorActions(config, snapshot, result.sequence)}
              {resetAction}
              {fileActions}
            </ActionPanel>
          }
        />
      ) : (
        <SurfaceSection
          layout={layout}
          title={trailTitle(result.trail)}
          subtitle={result.sequence ? keyCaps(result.sequence) : undefined}
        >
          {result.children.map((binding) => {
            const sequence = result.sequence + binding.key;
            return (
              <SurfaceItem
                key={sequence}
                layout={layout}
                keys={keyCaps(binding.key)}
                label={binding.label}
                icon={iconOf(binding, applications)}
                accessories={hintOf(binding, applications)}
                tooltip={tooltipOf(binding)}
                warning={warningOf(binding, applications)}
                actions={
                  <ActionPanel>
                    {isGroup(binding) ? (
                      <Action
                        title="Show Group"
                        icon={Icon.ChevronRight}
                        onAction={() => onSearchTextChange(sequence)}
                      />
                    ) : (
                      <Action
                        title="Open"
                        icon={Icon.ArrowRight}
                        onAction={() => launchLeaf(sequence, binding, "action")}
                      />
                    )}
                    {resetAction}
                    {editorActions(config, snapshot, result.sequence, {
                      sequence,
                      value: binding,
                    })}
                    {fileActions}
                  </ActionPanel>
                }
              />
            );
          })}
        </SurfaceSection>
      )}
    </Surface>
  );
}
