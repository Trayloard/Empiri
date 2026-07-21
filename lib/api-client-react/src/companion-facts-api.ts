import { customFetch } from "./custom-fetch";

/**
 * Delete a single learned fact from the companion's long-term memory.
 * The fact is identified by its normalised slot key (e.g. "dog_name").
 * If the key does not exist, the server treats it as a no-op and returns ok.
 */
export async function deleteCompanionFact(
  conversationId: number,
  key: string,
): Promise<void> {
  await customFetch(
    `/api/conversations/${conversationId}/companion/facts/${encodeURIComponent(key)}`,
    { method: "DELETE" },
  );
}
