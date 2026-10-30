import { type JSX, useEffect, useRef, useState } from "react";
import {
  Action,
  ActionPanel,
  Clipboard,
  getFrontmostApplication,
  getSelectedFinderItems,
  Icon,
  PopToRootType,
  showHUD,
  showToast,
  Toast,
} from "@raycast/api";
import { saveBindings } from "./bindings-file";
import { type Config, isGroup, type Leaf } from "./config";
import {
  type Application,
  isDirectory,
  listApplications,
  readBindings,
  shortenHome,
} from "./destinations";
import { addBinding, type Captured, chooseCapture, suggestKey, updateBinding } from "./edit";
import { createCoordinator, isBundlePath } from "./execution";
import {
  fileProblemTitle,
  hintOf,
  iconOf,
  Tinted,
  tooltipOf,
  trailTitle,
  typeOf,
  warningOf,
} from "./presentation";
import { keyCaps, place, type Placement } from "./sequence";
import { preferredLayout, Surface, SurfaceEmpty, SurfaceItem, SurfaceSection } from "./surface";

type Slot = Extract<Placement, { kind: "free" | "used" }>;

const NOTHING_TO_BIND =
  "Select a folder in Finder, copy a URL, or bring an app to the front. Then run Bind This again.";
const BACKSPACE_HINT = "Press Backspace to choose another key.";

async function capture(): Promise<Captured | undefined> {
  const items = await getSelectedFinderItems().catch(() => []);
  const folder = items.find(({ path }) => isDirectory(path) && !isBundlePath(path))?.path;
  const clipboard = await Clipboard.readText().catch(() => undefined);
  const app = await getFrontmostApplication().catch(() => undefined);
  return chooseCapture({ folder: folder && shortenHome(folder), clipboard, app });
}

export default function Command(): JSX.Element {
  const [{ file, loaded }] = useState(readBindings);
  const [captured, setCaptured] = useState<Captured | null>();
  const [applications, setApplications] = useState<Application[]>();
  const [text, setText] = useState("");
  const [layout] = useState(preferredLayout);
  const [coordinator] = useState(createCoordinator);
  const saving = useRef(false);

  useEffect(() => {
    let live = true;
    capture().then(
      (found) => live && setCaptured(found ?? null),
      () => live && setCaptured(null),
    );
    listApplications().then(setApplications, () => setApplications([]));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!captured || loaded.status !== "ok") return;
    const slot = place(loaded.config.bindings, text);
    if (slot.kind === "free") void bind(loaded.config, loaded.snapshot, slot, captured);
  }, [captured]);

  async function bind(config: Config, snapshot: string, slot: Slot, item: Captured) {
    if (saving.current) return;
    saving.current = true;
    const binding = { key: slot.key, label: item.label, action: item.action };
    const edited =
      slot.kind === "free"
        ? addBinding(config, slot.parent, binding)
        : updateBinding(config, slot.sequence, binding);
    const saved = edited.ok
      ? saveBindings(file, edited.config, snapshot)
      : { ok: false as const, message: edited.errors[0].message };
    if (!saved.ok) {
      saving.current = false;
      coordinator.textChanged("");
      setText("");
      await showToast({
        style: Toast.Style.Failure,
        title: "Could not bind",
        message: saved.message,
      });
      return;
    }
    await showHUD(`Bound ${keyCaps(slot.sequence)} · ${item.label}`, {
      clearRootSearch: true,
      popToRootType: PopToRootType.Immediate,
    });
  }

  if (loaded.status !== "ok") {
    return (
      <Surface layout={layout} searchText={text} onSearchTextChange={setText}>
        <SurfaceEmpty
          layout={layout}
          icon={Tinted.error}
          title={fileProblemTitle(loaded)}
          description="Open Sequence Launcher to see the errors."
        />
      </Surface>
    );
  }

  const { config, snapshot } = loaded;

  function onSearchTextChange(next: string) {
    if (!coordinator.textChanged(next)) return;
    setText(next);
    const slot = place(config.bindings, next);
    if (slot.kind === "free" && captured) void bind(config, snapshot, slot, captured);
  }

  if (captured === undefined || captured === null) {
    return (
      <Surface
        layout={layout}
        searchText={text}
        onSearchTextChange={onSearchTextChange}
        isLoading={captured === undefined}
      >
        {captured === null ? (
          <SurfaceEmpty
            layout={layout}
            icon={Icon.Plus}
            title="Nothing to bind"
            description={NOTHING_TO_BIND}
          />
        ) : null}
      </Surface>
    );
  }

  const item = captured;
  const preview: Leaf = { key: "", label: item.label, action: item.action };
  const slot = place(config.bindings, text);
  const reset = (
    <Action title="Reset Sequence" icon={Icon.Undo} onAction={() => onSearchTextChange("")} />
  );

  return (
    <Surface
      layout={layout}
      searchText={text}
      onSearchTextChange={onSearchTextChange}
      navigationTitle={`Bind ${item.label} · ${typeOf(preview)} from ${item.source}`}
      searchBarPlaceholder={`Type the keys for ${item.label}`}
    >
      {slot.kind === "invalid" ? (
        <SurfaceEmpty
          layout={layout}
          icon={Tinted.invalid}
          title={`“${text}” is not a place for a binding`}
          description="A key goes after a group. Press Backspace to correct the sequence."
          actions={<ActionPanel>{reset}</ActionPanel>}
        />
      ) : slot.kind === "used" ? (
        <SurfaceEmpty
          layout={layout}
          icon={iconOf(slot.leaf, applications)}
          title={`${keyCaps(slot.sequence)} opens ${slot.leaf.label}`}
          description={`Press Return to replace it with ${item.label}. ${BACKSPACE_HINT}`}
          actions={
            <ActionPanel>
              <Action
                title={`Replace with ${item.label}`}
                icon={Icon.Replace}
                onAction={() => void bind(config, snapshot, slot, item)}
              />
              {reset}
            </ActionPanel>
          }
        />
      ) : slot.kind === "free" ? (
        <SurfaceEmpty
          layout={layout}
          icon={iconOf(preview, applications)}
          title={`Binding ${keyCaps(slot.sequence)} · ${item.label}…`}
        />
      ) : (
        <SurfaceSection
          layout={layout}
          title={trailTitle(slot.trail)}
          subtitle="Type a free key to bind here"
        >
          {[
            ...suggestion(slot),
            ...slot.children.map((binding) => {
              const sequence = slot.sequence + binding.key;
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
                      <Action
                        title={isGroup(binding) ? "Show Group" : "Choose This Key"}
                        icon={isGroup(binding) ? Icon.ChevronRight : Icon.Replace}
                        onAction={() => onSearchTextChange(sequence)}
                      />
                      {reset}
                    </ActionPanel>
                  }
                />
              );
            }),
          ]}
        </SurfaceSection>
      )}
    </Surface>
  );

  function suggestion(group: Extract<Placement, { kind: "group" }>) {
    const key = suggestKey(
      item.label,
      group.children.map((binding) => binding.key),
    );
    if (!key) return [];
    const free: Slot = {
      kind: "free",
      sequence: group.sequence + key,
      parent: group.sequence,
      key,
      trail: group.trail,
    };
    return [
      <SurfaceItem
        key="suggestion"
        layout={layout}
        keys={keyCaps(key)}
        label={`Bind ${item.label} here`}
        icon={Tinted.suggested}
        accessories={[{ tag: "Suggested key" }]}
        tooltip={`Suggested free key for ${item.label}`}
        actions={
          <ActionPanel>
            <Action
              title={`Bind on ${keyCaps(free.sequence)}`}
              icon={Icon.Plus}
              onAction={() => void bind(config, snapshot, free, item)}
            />
            {reset}
          </ActionPanel>
        }
      />,
    ];
  }
}
