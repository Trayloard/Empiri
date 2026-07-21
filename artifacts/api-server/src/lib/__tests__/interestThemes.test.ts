import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mock variables — vi.mock factories are hoisted to the top of the
// file, so any variables they reference must be declared via vi.hoisted().
// ---------------------------------------------------------------------------

const { mockOpenaiCreate } = vi.hoisted(() => ({
  mockOpenaiCreate: vi.fn(),
}));

vi.mock("@workspace/db", () => {
  const companionSelves = { conversationId: "conversationId", interestThemes: "interestThemes" };
  const mockWhere = vi.fn().mockResolvedValue([]);
  const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
  const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
  const mockSet = vi.fn();
  const mockUpdateWhere = vi.fn().mockResolvedValue(undefined);
  mockSet.mockReturnValue({ where: mockUpdateWhere });
  const mockUpdate = vi.fn().mockReturnValue({ set: mockSet });
  const db = { select: mockSelect, update: mockUpdate };
  return { companionSelves, db, eq: (a: unknown, b: unknown) => ({ a, b }) };
});

vi.mock("@workspace/integrations-openai-ai-server", () => ({
  openai: {
    chat: {
      completions: {
        create: mockOpenaiCreate,
      },
    },
  },
}));

vi.mock("@workspace/neurobrane", () => ({}));

// ---------------------------------------------------------------------------
// Import after mocks are wired up
// ---------------------------------------------------------------------------

import { getInterestThemes, sanitizeThemes, themeSignature } from "../interestThemes";
import { db } from "@workspace/db";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeInterests(keys: string[]) {
  return keys.map((k) => ({ topic: k, affinity: 1, display: k }));
}

/** Wire the mock db to return a cached row for a given signature + themes. */
function mockCachedRow(signature: string, themes: Record<string, string>) {
  const where = vi.fn().mockResolvedValue([{ interestThemes: { signature, themes } }]);
  const from = vi.fn().mockReturnValue({ where });
  (db.select as ReturnType<typeof vi.fn>).mockReturnValue({ from });
}

/** Wire the mock db to return no cached row (cache miss). */
function mockNoCachedRow() {
  const where = vi.fn().mockResolvedValue([]);
  const from = vi.fn().mockReturnValue({ where });
  (db.select as ReturnType<typeof vi.fn>).mockReturnValue({ from });
}

// ---------------------------------------------------------------------------
// themeSignature
// ---------------------------------------------------------------------------

describe("themeSignature", () => {
  it("is stable across ordering and casing", () => {
    expect(themeSignature(["space", "jazz"])).toBe(themeSignature(["Jazz ", "space"]));
  });

  it("changes when the topic set changes", () => {
    expect(themeSignature(["space", "jazz"])).not.toBe(themeSignature(["space"]));
  });
});

// ---------------------------------------------------------------------------
// sanitizeThemes — valid response
// ---------------------------------------------------------------------------

describe("sanitizeThemes — valid response", () => {
  const topics = ["astrophysics", "galaxies", "jazz", "hiking"];

  it("keeps valid groups of two or more", () => {
    const out = sanitizeThemes(
      { astrophysics: "Space", galaxies: "Space", jazz: "Music" },
      topics,
    );
    expect(out).toEqual({ astrophysics: "Space", galaxies: "Space" });
  });

  it("trims labels", () => {
    const out = sanitizeThemes(
      { astrophysics: " Space ", galaxies: "Space" },
      topics,
    );
    expect(out).toEqual({ astrophysics: "Space", galaxies: "Space" });
  });

  it("returns empty object when nothing groups", () => {
    expect(sanitizeThemes({}, topics)).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// sanitizeThemes — missing topics in AI response (topics not dropped)
// ---------------------------------------------------------------------------

describe("sanitizeThemes — missing topics in AI response", () => {
  const topics = ["astrophysics", "galaxies", "jazz", "hiking", "cooking"];

  it("topics absent from AI response are simply not in the result map (they display ungrouped)", () => {
    // AI only grouped astrophysics+galaxies; jazz, hiking, cooking were omitted
    const out = sanitizeThemes(
      { astrophysics: "Space", galaxies: "Space" },
      topics,
    );
    // Grouped topics are mapped
    expect(out.astrophysics).toBe("Space");
    expect(out.galaxies).toBe("Space");
    // Omitted topics are absent from the map — they render individually, NOT dropped
    expect("jazz" in out).toBe(false);
    expect("hiking" in out).toBe(false);
    expect("cooking" in out).toBe(false);
    // The caller's topic list still has all 5; none were mutated
    expect(topics).toHaveLength(5);
  });

  it("all topics missing from AI response yields empty map (all display ungrouped)", () => {
    const out = sanitizeThemes({}, topics);
    expect(out).toEqual({});
    // Original topic list is intact
    expect(topics).toHaveLength(5);
  });

  it("partial group (AI returns only one member of a pair) falls back to empty for that theme", () => {
    // AI mentions astrophysics under "Space" but forgot galaxies → singleton → pruned
    const out = sanitizeThemes({ astrophysics: "Space" }, topics);
    expect(out).toEqual({});
    // astrophysics is still in topics — it will render ungrouped, not lost
    expect(topics).toContain("astrophysics");
  });
});

// ---------------------------------------------------------------------------
// sanitizeThemes — extra / unknown topics
// ---------------------------------------------------------------------------

describe("sanitizeThemes — extra unknown topics", () => {
  const topics = ["astrophysics", "galaxies", "jazz"];

  it("drops topics not in the known set", () => {
    const out = sanitizeThemes(
      {
        astrophysics: "Space",
        galaxies: "Space",
        invented_topic: "Space",   // not in topics
        "dark matter": "Space",    // not in topics
      },
      topics,
    );
    expect(out).toEqual({ astrophysics: "Space", galaxies: "Space" });
    expect("invented_topic" in out).toBe(false);
    expect("dark matter" in out).toBe(false);
  });

  it("known topics that share a theme with only unknown topics become singletons and are pruned", () => {
    // astrophysics is in topics; "star" is not → astrophysics ends up solo → pruned
    const out = sanitizeThemes(
      { astrophysics: "Space", star: "Space" },
      topics,
    );
    expect(out).toEqual({});
    expect(topics).toContain("astrophysics"); // not dropped from source
  });
});

// ---------------------------------------------------------------------------
// sanitizeThemes — non-string labels
// ---------------------------------------------------------------------------

describe("sanitizeThemes — non-string labels", () => {
  const topics = ["astrophysics", "galaxies", "jazz", "hiking"];

  it("rejects numeric labels", () => {
    const out = sanitizeThemes(
      { astrophysics: "Space", galaxies: "Space", jazz: 42 },
      topics,
    );
    expect(out).toEqual({ astrophysics: "Space", galaxies: "Space" });
    expect("jazz" in out).toBe(false);
  });

  it("rejects null / boolean / array labels", () => {
    const out = sanitizeThemes(
      { astrophysics: null, galaxies: true, jazz: ["Music"], hiking: "Outdoors" },
      topics,
    );
    expect(out).toEqual({});
  });

  it("rejects labels longer than 24 characters", () => {
    const out = sanitizeThemes(
      { astrophysics: "x".repeat(30), galaxies: "x".repeat(30) },
      topics,
    );
    expect(out).toEqual({});
  });

  it("rejects empty-string labels", () => {
    const out = sanitizeThemes(
      { astrophysics: "", galaxies: "" },
      topics,
    );
    expect(out).toEqual({});
  });

  it("rejects whitespace-only labels (empty after trim)", () => {
    const out = sanitizeThemes(
      { astrophysics: "   ", galaxies: "   " },
      topics,
    );
    expect(out).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// sanitizeThemes — non-object / parse-failure-like inputs
// ---------------------------------------------------------------------------

describe("sanitizeThemes — non-object input (simulates JSON parse failure fallback)", () => {
  const topics = ["astrophysics", "galaxies"];

  it("returns empty for null (model returned null JSON)", () => {
    expect(sanitizeThemes(null, topics)).toEqual({});
  });

  it("returns empty for an array (model returned JSON array instead of object)", () => {
    expect(sanitizeThemes(["Space"], topics)).toEqual({});
    expect(sanitizeThemes([{ astrophysics: "Space" }], topics)).toEqual({});
  });

  it("returns empty for a bare string (model returned unquoted text)", () => {
    expect(sanitizeThemes("Space", topics)).toEqual({});
  });

  it("returns empty for a number", () => {
    expect(sanitizeThemes(0, topics)).toEqual({});
    expect(sanitizeThemes(42, topics)).toEqual({});
  });

  it("returns empty for undefined", () => {
    expect(sanitizeThemes(undefined, topics)).toEqual({});
  });

  it("no topics are lost — topics list is unchanged after any bad input", () => {
    const originalTopics = [...topics];
    sanitizeThemes(null, topics);
    sanitizeThemes([], topics);
    sanitizeThemes("garbage", topics);
    expect(topics).toEqual(originalTopics);
  });
});

// ---------------------------------------------------------------------------
// getInterestThemes — cache-hit: AI is never called when signature matches
// ---------------------------------------------------------------------------

describe("getInterestThemes — cache hit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset update mock
    const mockUpdateWhere = vi.fn().mockResolvedValue(undefined);
    const mockSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
    (db.update as ReturnType<typeof vi.fn>).mockReturnValue({ set: mockSet });
  });

  it("returns cached themes without calling the AI when signature matches", async () => {
    const interests = makeInterests(["astrophysics", "galaxies", "jazz"]);
    const sig = themeSignature(interests.map((i) => i.topic));
    const cachedThemes = { astrophysics: "Space", galaxies: "Space" };

    mockCachedRow(sig, cachedThemes);

    const result = await getInterestThemes(1, interests);

    expect(result).toEqual(cachedThemes);
    expect(mockOpenaiCreate).not.toHaveBeenCalled();
  });

  it("does not mutate or drop any topics when returning cached themes", async () => {
    const interests = makeInterests(["astrophysics", "galaxies", "jazz", "hiking", "cooking"]);
    const sig = themeSignature(interests.map((i) => i.topic));
    const cachedThemes = { astrophysics: "Space", galaxies: "Space" };

    mockCachedRow(sig, cachedThemes);

    const result = await getInterestThemes(1, interests);

    // Grouped topics are present
    expect(result?.astrophysics).toBe("Space");
    expect(result?.galaxies).toBe("Space");
    // Ungrouped topics are absent from the map (they render individually)
    expect(result && "jazz" in result).toBe(false);
    expect(result && "hiking" in result).toBe(false);
    // Original interests list is unchanged
    expect(interests).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// getInterestThemes — cache miss: AI is called and result is sanitized
// ---------------------------------------------------------------------------

describe("getInterestThemes — cache miss", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const mockUpdateWhere = vi.fn().mockResolvedValue(undefined);
    const mockSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
    (db.update as ReturnType<typeof vi.fn>).mockReturnValue({ set: mockSet });
  });

  it("calls the AI and returns sanitized themes on a cache miss", async () => {
    const interests = makeInterests(["astrophysics", "galaxies", "jazz"]);
    mockNoCachedRow();

    mockOpenaiCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({ astrophysics: "Space", galaxies: "Space" }),
          },
        },
      ],
    });

    const result = await getInterestThemes(2, interests);

    expect(mockOpenaiCreate).toHaveBeenCalledOnce();
    expect(result).toEqual({ astrophysics: "Space", galaxies: "Space" });
  });

  it("falls back to null (no grouping) when AI throws and no stale cache exists", async () => {
    const interests = makeInterests(["astrophysics", "galaxies", "jazz"]);
    mockNoCachedRow();
    mockOpenaiCreate.mockRejectedValue(new Error("network error"));

    const result = await getInterestThemes(3, interests);

    expect(result).toBeNull();
  });

  it("falls back to stale cached themes when AI throws but stale cache exists", async () => {
    const interests = makeInterests(["astrophysics", "galaxies", "jazz", "hiking"]);
    // Stale cache: different signature (old topic set), but themes available
    const staleThemes = { astrophysics: "Space", galaxies: "Space" };
    const staleWhere = vi.fn().mockResolvedValue([
      { interestThemes: { signature: "old-signature", themes: staleThemes } },
    ]);
    const staleFrom = vi.fn().mockReturnValue({ where: staleWhere });
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: staleFrom });

    mockOpenaiCreate.mockRejectedValue(new Error("model timeout"));

    const result = await getInterestThemes(4, interests);

    // Stale themes returned — no topics silently dropped
    expect(result).toEqual(staleThemes);
    expect(interests).toHaveLength(4);
  });

  it("returns empty map for fewer than two interests without calling AI", async () => {
    const interests = makeInterests(["astrophysics"]);
    const result = await getInterestThemes(5, interests);
    expect(result).toEqual({});
    expect(mockOpenaiCreate).not.toHaveBeenCalled();
  });

  it("sanitizes malformed AI response — missing topics are not dropped", async () => {
    const interests = makeInterests(["astrophysics", "galaxies", "jazz", "hiking"]);
    mockNoCachedRow();

    // AI only mentions two topics, omits jazz and hiking entirely
    mockOpenaiCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({ astrophysics: "Space", galaxies: "Space" }),
          },
        },
      ],
    });

    const result = await getInterestThemes(6, interests);

    // The two grouped topics are mapped
    expect(result?.astrophysics).toBe("Space");
    expect(result?.galaxies).toBe("Space");
    // jazz and hiking are absent from map — they display individually, not lost
    expect(result && "jazz" in result).toBe(false);
    expect(result && "hiking" in result).toBe(false);
    // Source interests unchanged
    expect(interests).toHaveLength(4);
  });

  it("sanitizes AI response with invented topic keys — no phantom topics injected", async () => {
    const interests = makeInterests(["astrophysics", "galaxies"]);
    mockNoCachedRow();

    mockOpenaiCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              astrophysics: "Space",
              galaxies: "Space",
              dark_matter: "Space",   // invented
              quasar: "Space",        // invented
            }),
          },
        },
      ],
    });

    const result = await getInterestThemes(7, interests);

    expect(Object.keys(result ?? {})).toEqual(
      expect.arrayContaining(["astrophysics", "galaxies"]),
    );
    expect("dark_matter" in (result ?? {})).toBe(false);
    expect("quasar" in (result ?? {})).toBe(false);
  });
});
