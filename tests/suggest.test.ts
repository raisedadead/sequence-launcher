import { describe, expect, it } from "vitest";
import { suggestKey } from "../src/edit";

describe("suggestKey", () => {
  it("takes the first letter of the label", () => {
    expect(suggestKey("Google Chat", [])).toBe("g");
  });

  it("tries the first letter of each word before other letters", () => {
    expect(suggestKey("Google Chat", ["g"])).toBe("c");
  });

  it("then tries the other letters of the label in order", () => {
    expect(suggestKey("Google Chat", ["g", "c", "o"])).toBe("l");
  });

  it("uses a digit in the label", () => {
    expect(suggestKey("Project 2", ["p", "r", "o", "j", "e", "c", "t"])).toBe("2");
  });

  it("falls back to the first free letter, then digit", () => {
    expect(suggestKey("ab", ["a", "b"])).toBe("c");
    const letters = "abcdefghijklmnopqrstuvwxyz".split("");
    expect(suggestKey("", letters)).toBe("0");
  });

  it("ignores characters that cannot be keys", () => {
    expect(suggestKey("Été · Notes", [])).toBe("n");
  });

  it("gives nothing when every key is taken", () => {
    const keys = "abcdefghijklmnopqrstuvwxyz0123456789".split("");
    expect(suggestKey("Anything", keys)).toBeUndefined();
  });
});
