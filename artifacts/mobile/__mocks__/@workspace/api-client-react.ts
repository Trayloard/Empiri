/**
 * Shared manual mock for `@workspace/api-client-react`.
 *
 * Why this exists: each CompanionContext test file used to hand-maintain its
 * own `jest.mock("@workspace/api-client-react", () => ({ ... }))` factory.
 * Whenever the provider gained a new API import, every stale factory made the
 * provider throw during init in a confusing way (assertions just saw zero
 * calls). This mock is generated from the real module's exports, so a new API
 * function is automatically covered with a `jest.fn()` — nothing to update.
 *
 * Usage: `jest.mock("@workspace/api-client-react");` in a test file (Jest also
 * auto-applies manual mocks for node_modules packages). Test files that need
 * different behaviour can still provide their own inline factory, which takes
 * precedence over this mock.
 *
 * Defaults (chosen to satisfy CompanionProvider initialization):
 *  - every function export is a bare `jest.fn()` (resolves to undefined)
 *  - `listConversations` resolves to `[]` (fresh account, no history)
 *  - `getCompanionSettings` / `getConversation` reject with "not mocked" so
 *    the provider falls back to its local defaults instead of consuming a
 *    silent `undefined`.
 * Note: `jest.clearAllMocks()` keeps these implementations; only
 * `jest.resetAllMocks()` would wipe them.
 */

const actual = jest.requireActual<Record<string, unknown>>(
  "@workspace/api-client-react",
);

const mock: Record<string, unknown> = {};
for (const [key, value] of Object.entries(actual)) {
  mock[key] = typeof value === "function" ? jest.fn() : value;
}

(mock.listConversations as jest.Mock).mockResolvedValue([]);
(mock.getCompanionSettings as jest.Mock).mockRejectedValue(
  new Error("not mocked"),
);
(mock.getConversation as jest.Mock).mockRejectedValue(new Error("not mocked"));

module.exports = mock;
