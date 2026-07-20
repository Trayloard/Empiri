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
    return "I didn't catch that. Try again.";
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
    return "Couldn't upload the recording. Check your connection and try again.";
  }

  return "Something went wrong with the recording. Try again in a moment.";
}
