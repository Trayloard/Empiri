import { customFetch } from "./custom-fetch";

/**
 * DEV-ONLY: Roll Empiri's inner self back a few steps without wiping it.
 * Useful for testing the early-relationship UX without creating a new
 * conversation.  No-op on the server in production builds.
 */
export async function devRegressSelf(conversationId: number): Promise<void> {
  await customFetch(`/api/conversations/${conversationId}/dev/regress`, {
    method: "POST",
  });
}
