import { describe, expect, it } from "vitest";

import { sanitizeThemes, themeSignature } from "../interestThemes";

describe("themeSignature", () => {
  it("is stable across ordering and casing", () => {
    expect(themeSignature(["space", "jazz"])).toBe(themeSignature(["Jazz ", "space"]));
  });

  it("changes when the topic set changes", () => {
    expect(themeSignature(["space", "jazz"])).not.toBe(themeSignature(["space"]));
  });
});

describe("sanitizeThemes", () => {
  const topics = ["astrophysics", "galaxies", "jazz", "hiking"];

  it("keeps valid groups of two or more", () => {
    const out = sanitizeThemes(
      { astrophysics: "Space", galaxies: "Space", jazz: "Music" },
      topics,
    );
    expect(out).toEqual({ astrophysics: "Space", galaxies: "Space" });
  });

  it("drops unknown topics, bad labels, and singleton themes", () => {
    const out = sanitizeThemes(
      {
        astrophysics: "Space",
        galaxies: "Space",
        invented: "Space",
        jazz: 42,
        hiking: "x".repeat(30),
      },
      topics,
    );
    expect(out).toEqual({ astrophysics: "Space", galaxies: "Space" });
  });

  it("returns empty for non-object input", () => {
    expect(sanitizeThemes(null, topics)).toEqual({});
    expect(sanitizeThemes(["Space"], topics)).toEqual({});
    expect(sanitizeThemes("Space", topics)).toEqual({});
  });

  it("trims labels", () => {
    const out = sanitizeThemes(
      { astrophysics: " Space ", galaxies: "Space" },
      topics,
    );
    expect(out).toEqual({ astrophysics: "Space", galaxies: "Space" });
  });
});
