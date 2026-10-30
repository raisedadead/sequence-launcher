import type { JSX, ReactNode } from "react";
import { getPreferenceValues, Grid, type Image, List } from "@raycast/api";
import { Tinted } from "./presentation";

export type Layout = "list" | "grid";

export function preferredLayout(): Layout {
  const { layout } = getPreferenceValues<{ layout?: Layout }>();
  return layout === "list" ? "list" : "grid";
}

type RootProps = {
  layout: Layout;
  searchText: string;
  onSearchTextChange: (text: string) => void;
  navigationTitle?: string;
  searchBarPlaceholder?: string;
  isLoading?: boolean;
  children?: ReactNode;
};

export function Surface({ layout, children, ...props }: RootProps): JSX.Element {
  if (layout === "grid") {
    return (
      <Grid {...props} filtering={false} columns={6} inset={Grid.Inset.Large}>
        {children}
      </Grid>
    );
  }
  return (
    <List {...props} filtering={false}>
      {children}
    </List>
  );
}

type SectionProps = { layout: Layout; title: string; subtitle?: string; children?: ReactNode };

export function SurfaceSection({ layout, children, ...props }: SectionProps): JSX.Element {
  if (layout === "grid") return <Grid.Section {...props}>{children}</Grid.Section>;
  return <List.Section {...props}>{children}</List.Section>;
}

type EmptyProps = {
  layout: Layout;
  icon: Image.ImageLike;
  title: string;
  description?: string;
  actions?: ReactNode;
};

export function SurfaceEmpty({ layout, ...props }: EmptyProps): JSX.Element {
  return layout === "grid" ? <Grid.EmptyView {...props} /> : <List.EmptyView {...props} />;
}

type ItemProps = {
  layout: Layout;
  keys: string;
  label: string;
  icon: Image.ImageLike;
  accessories: List.Item.Accessory[];
  tooltip: string;
  warning?: string;
  actions: ReactNode;
};

export function SurfaceItem(props: ItemProps): JSX.Element {
  const { layout, keys, label, icon, accessories, tooltip, warning, actions } = props;
  if (layout === "grid") {
    return (
      <Grid.Item
        content={{ value: icon, tooltip }}
        title={keys}
        subtitle={label}
        accessory={warning ? { icon: Tinted.warning, tooltip: warning } : undefined}
        actions={actions}
      />
    );
  }
  return (
    <List.Item
      title={keys}
      subtitle={label}
      icon={icon}
      accessories={accessories}
      actions={actions}
    />
  );
}
