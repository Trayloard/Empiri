/**
 * Drift guard: verifies that the shared manual mock at
 * __mocks__/@workspace/api-client-react.ts covers every function exported by
 * the real package, and that each covered entry is a jest.Mock (so test files
 * can call .mockResolvedValue() etc.).
 *
 * The mock is currently auto-generated from the real module via
 * jest.requireActual, so this test should always pass. Its value is catching
 * a future rewrite that replaces the dynamic approach with a hand-maintained
 * list — in that case, any new export not added to the hand-written list would
 * be caught here before it silently causes CompanionContext tests to pass
 * against a stale contract.
 */

// Activates the manual mock at __mocks__/@workspace/api-client-react.ts
// (hoisted to the top of the file by babel-jest).
jest.mock("@workspace/api-client-react");

describe("@workspace/api-client-react manual mock coverage", () => {
  it("exports a jest.fn() for every function the real module exports", () => {
    const actual = jest.requireActual<Record<string, unknown>>(
      "@workspace/api-client-react",
    );
    const mocked = jest.requireMock<Record<string, unknown>>(
      "@workspace/api-client-react",
    );

    // Collect the names of every callable export from the real module.
    const realFnKeys = Object.entries(actual)
      .filter(([, v]) => typeof v === "function")
      .map(([k]) => k)
      .sort();

    expect(realFnKeys.length).toBeGreaterThan(0);

    // Every real function export must be present in the mock — missing entries
    // mean test files that rely on `jest.mock("@workspace/api-client-react")`
    // would receive `undefined` instead of a spy, and calls would silently
    // go undetected.
    const missing = realFnKeys.filter((k) => !(k in mocked));
    expect(missing).toEqual([]);

    // Every mock entry for a real function must be a jest.Mock so test files
    // can call .mockResolvedValue() / .mockRejectedValue() / toHaveBeenCalled()
    // etc. on it.
    const notMocked = realFnKeys.filter(
      (k) =>
        typeof (mocked[k] as jest.Mock | undefined)?.mock === "undefined",
    );
    expect(notMocked).toEqual([]);
  });
});
