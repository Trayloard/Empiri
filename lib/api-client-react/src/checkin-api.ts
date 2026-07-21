import { customFetch } from "./custom-fetch";
import type { CheckInInput, Message } from "./generated/api.schemas";

/**
 * Shape returned by the check-in endpoint — a persisted Message plus the
 * first-person reflection thought Empiri composed while the user was away
 * (null when the absence was too short or the AI call timed out).
 */
export interface CheckInResult extends Message {
  reflectionThought: string | null;
}

/**
 * Generate a proactive companion check-in greeting. Returns the saved
 * assistant message together with any reflection thought that was due.
 */
export async function companionCheckInFull(
  id: number,
  checkInInput: CheckInInput,
  options?: RequestInit,
): Promise<CheckInResult> {
  return customFetch<CheckInResult>(`/api/conversations/${id}/checkin`, {
    ...options,
    method: "POST",
    headers: { "Content-Type": "application/json", ...options?.headers },
    body: JSON.stringify(checkInInput),
  });
}
