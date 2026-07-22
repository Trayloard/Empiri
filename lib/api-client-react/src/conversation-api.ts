import { customFetch } from "./custom-fetch";

/**
 * Delete a conversation and all of its messages. Owner-only — the server
 * enforces ownership and returns 404 for unknown or non-owned IDs.
 */
export async function deleteConversation(id: number): Promise<void> {
  await customFetch(`/api/conversations/${id}`, { method: "DELETE" });
}
