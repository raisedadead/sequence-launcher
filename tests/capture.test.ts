import { describe, expect, it } from "vitest";
import { chooseCapture } from "../src/edit";

const finder = { name: "Finder", bundleId: "com.apple.finder" };

describe("chooseCapture", () => {
  it("takes the selected Finder folder first", () => {
    const captured = chooseCapture({
      folder: "~/Projects/site",
      clipboard: "https://example.com",
      app: finder,
    });
    expect(captured).toEqual({
      source: "Finder selection",
      label: "site",
      action: { type: "folder", path: "~/Projects/site" },
    });
  });

  it("then takes a URL on the clipboard", () => {
    const captured = chooseCapture({ clipboard: "  raycast://extensions/a/b  ", app: finder });
    expect(captured).toEqual({
      source: "Clipboard",
      label: "raycast://extensions",
      action: { type: "url", url: "raycast://extensions/a/b" },
    });
  });

  it("then takes the front app", () => {
    const captured = chooseCapture({ clipboard: "just some text", app: finder });
    expect(captured).toEqual({
      source: "Front app",
      label: "Finder",
      action: { type: "application", name: "Finder" },
    });
  });

  it("takes only clipboard text that is clearly a link", () => {
    for (const text of ["Re: meeting notes", "localhost:3000", "note:buy", "C:\\Users\\x"]) {
      expect(chooseCapture({ clipboard: text, app: finder })?.source).toBe("Front app");
    }
    for (const text of ["mailto:someone@example.com", "obsidian://open?vault=notes"]) {
      expect(chooseCapture({ clipboard: text, app: finder })?.source).toBe("Clipboard");
    }
  });

  it("skips an app bundle selected in Finder", () => {
    const captured = chooseCapture({ folder: "/Applications/Tool.app", app: finder });
    expect(captured?.source).toBe("Front app");
  });

  it("skips Raycast as the front app", () => {
    expect(chooseCapture({ app: { name: "Raycast", bundleId: "com.raycast.macos" } })).toBe(
      undefined,
    );
  });
});
