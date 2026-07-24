/**
 * Global Jest setup for the mobile test suite.
 *
 * global.fetch is mocked so that no test ever performs a real network call.
 * In the Replit validation/CI environment, unmocked fetch calls hit the
 * infrastructure proxy and produce 401/404 responses that pollute the console
 * and mask real failures. Tests that need specific responses override
 * `globalThis.fetch` with their own jest.fn() (see lib/__tests__/auth.test.tsx).
 *
 * Expected console.error lines in CI (intentional, produced by tests that
 * exercise error paths — they do NOT indicate failures):
 *   - "Token exchange failed: 401"  — lib/__tests__/auth.test.tsx asserts the
 *     401 token-exchange path; lib/auth.tsx logs this via console.error.
 * Any other console.error output should be investigated.
 */

const defaultFetchMock = jest.fn().mockResolvedValue({
  ok: true,
  status: 200,
  json: async () => ({}),
  text: async () => "",
});

(globalThis as Record<string, unknown>).fetch = defaultFetchMock;

beforeEach(() => {
  // Restore the safe default in case a previous test replaced or reconfigured
  // global.fetch, so no test can accidentally reach the real network.
  const current = (globalThis as Record<string, unknown>).fetch;
  if (!jest.isMockFunction(current)) {
    (globalThis as Record<string, unknown>).fetch = defaultFetchMock;
  }
});
