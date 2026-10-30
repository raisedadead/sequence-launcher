import { type Binding, type Group, isGroup, keyProblem, type Leaf } from "./config";

export type Match =
  | { kind: "group"; sequence: string; trail: Group[]; children: Binding[] }
  | { kind: "leaf"; sequence: string; trail: Group[]; leaf: Leaf }
  | { kind: "invalid"; sequence: string };

export type Destination = { sequence: string; trail: string[]; leaf: Leaf };

export function destinations(
  bindings: Binding[],
  prefix = "",
  trail: string[] = [],
): Destination[] {
  return bindings.flatMap((binding) =>
    isGroup(binding)
      ? destinations(binding.children, prefix + binding.key, [...trail, binding.label])
      : [{ sequence: prefix + binding.key, trail, leaf: binding }],
  );
}

export function keyCaps(sequence: string): string {
  return sequence.toUpperCase().split("").join(" ");
}

export function normalize(text: string): string {
  return text.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}

export type Placement =
  | Extract<Match, { kind: "group" | "invalid" }>
  | { kind: "free"; sequence: string; parent: string; key: string; trail: Group[] }
  | { kind: "used"; sequence: string; parent: string; key: string; trail: Group[]; leaf: Leaf };

export function place(bindings: Binding[], text: string): Placement {
  const found = match(bindings, text);
  const { sequence } = found;
  const parent = sequence.slice(0, -1);
  const key = sequence.slice(-1);
  if (found.kind === "group") return found;
  if (found.kind === "leaf") return { ...found, kind: "used", parent, key };
  const above = match(bindings, parent);
  if (!sequence || above.kind !== "group" || keyProblem(key)) return found;
  return { kind: "free", sequence, parent, key, trail: above.trail };
}

export function match(bindings: Binding[], text: string): Match {
  const sequence = normalize(text);
  const trail: Group[] = [];
  let children = bindings;
  for (let index = 0; index < sequence.length; index++) {
    const binding = children.find(({ key }) => key === sequence[index]);
    if (!binding) return { kind: "invalid", sequence };
    if (!isGroup(binding)) {
      if (index !== sequence.length - 1) return { kind: "invalid", sequence };
      return { kind: "leaf", sequence, trail, leaf: binding };
    }
    trail.push(binding);
    children = binding.children;
  }
  return { kind: "group", sequence, trail, children };
}
