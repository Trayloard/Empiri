import { t } from "@/lib/i18n";

/**
 * Classifies a voice transcription error into a user-friendly message.
 *
 * The API server surfaces distinct status codes:
 *   - 422: no speech detected
 *   - 502: server-side transcription failure
 * The generated client throws Error objects with the server's JSON `error`
 * string as the message. Network failures arrive as native fetch errors such
 * as "Network request failed" or "Failed to fetch".
 */
export function classifyVoiceError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const msg = raw.toLowerCase();

  if (msg.includes("no speech")) {
    return t("error.didntCatch");
  }

  if (
    msg.includes("network request failed") ||
    msg.includes("failed to fetch") ||
    msg.includes("network error") ||
    msg.includes("aborted") ||
    msg.includes("timed out") ||
    msg.includes("timeout") ||
    msg.includes("no internet")
  ) {
    return t("error.upload");
  }

  return t("error.recordingGeneric");
}
