import { classifyVoiceError } from "../voiceErrors";

describe("classifyVoiceError", () => {
  it("recognises a no-speech API response", () => {
    expect(
      classifyVoiceError(new Error("No speech detected. Try again.")),
    ).toBe("I didn't catch that. Try again.");
  });

  it("recognises a network failure from the native fetch layer", () => {
    const networkMessages = [
      "Network request failed",
      "Failed to fetch",
      "Request timed out",
      "Network error occurred",
      "Request aborted",
      "No internet connection",
    ];
    for (const m of networkMessages) {
      expect(classifyVoiceError(new Error(m))).toContain("connection");
    }
  });

  it("returns the generic message for server errors", () => {
    expect(
      classifyVoiceError(new Error("Couldn't transcribe that. Try again.")),
    ).toContain("went wrong");
    expect(classifyVoiceError(new Error("HTTP 502"))).toContain("went wrong");
    expect(classifyVoiceError(new Error("Internal Server Error"))).toContain(
      "went wrong",
    );
  });

  it("handles non-Error throws gracefully", () => {
    expect(classifyVoiceError("unknown failure")).toContain("went wrong");
    expect(classifyVoiceError(null)).toContain("went wrong");
    expect(classifyVoiceError(undefined)).toContain("went wrong");
    expect(classifyVoiceError(42)).toContain("went wrong");
  });
});
