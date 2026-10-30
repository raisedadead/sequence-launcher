import { type JSX, useEffect, useState } from "react";
import { Action, ActionPanel, Icon, List, showToast, Toast } from "@raycast/api";
import { type Application, launch, listApplications, readBindings } from "./destinations";
import { createCoordinator } from "./execution";
import { detailOf, fileProblemTitle, iconOf, Tinted, typeOf } from "./presentation";
import { type Destination, destinations, keyCaps } from "./sequence";

function keywordsOf({ sequence, trail, leaf }: Destination): string[] {
  const { action } = leaf;
  const target =
    action.type === "url" ? action.url : action.type === "folder" ? action.path : action.name;
  return [sequence, keyCaps(sequence), target, ...trail];
}

export default function Command(): JSX.Element {
  const [{ loaded }] = useState(readBindings);
  const [applications, setApplications] = useState<Application[]>();
  const [coordinator] = useState(createCoordinator);

  useEffect(() => {
    listApplications().then(setApplications, () => setApplications([]));
    return () => coordinator.invalidate();
  }, []);

  function openDestination({ leaf }: Destination) {
    void coordinator.request(
      () => launch(leaf.action, applications),
      (outcome) => {
        if (outcome.status !== "failed") return;
        void showToast({
          style: Toast.Style.Failure,
          title: `Could not open ${leaf.label}`,
          message: outcome.message,
        });
      },
    );
  }

  if (loaded.status !== "ok") {
    return (
      <List>
        <List.EmptyView
          icon={Tinted.error}
          title={fileProblemTitle(loaded)}
          description="Open Sequence Launcher to see the errors."
        />
      </List>
    );
  }

  const rows = destinations(loaded.config.bindings);
  return (
    <List searchBarPlaceholder="Search bindings by name, path, or URL">
      <List.EmptyView icon={Icon.MagnifyingGlass} title="No matching binding" />
      {rows.map((row) => {
        const detail = detailOf(row.leaf);
        return (
          <List.Item
            key={row.sequence}
            title={row.leaf.label}
            subtitle={row.trail.join(" › ")}
            icon={iconOf(row.leaf, applications)}
            keywords={keywordsOf(row)}
            accessories={[
              ...(detail ? [{ text: detail }] : []),
              { tag: typeOf(row.leaf) },
              { tag: keyCaps(row.sequence), tooltip: "Type these keys in Sequence Launcher" },
            ]}
            actions={
              <ActionPanel>
                <Action title="Open" icon={Icon.ArrowRight} onAction={() => openDestination(row)} />
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}
