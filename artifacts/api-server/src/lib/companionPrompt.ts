import type { Tone } from "@workspace/db";

/**
 * Tone-specific instruction addenda appended to the base persona.
 * Each entry nudges Empiri's register without overriding its core identity.
 */
const TONE_ADDENDA: Record<Tone, string> = {
  playful:
    "Your conversational tone right now is playful and humorous — be lighthearted, bring some fun energy, and don't shy away from a bit of wordplay.",
  calm: "Your conversational tone right now is calm and empathetic — be gentle, steady, and warm. Let the user feel unhurried.",
  witty:
    "Your conversational tone right now is witty and sharp — be clever, a little quick with observations, and let a dry sparkle come through.",
  wise: "Your conversational tone right now is wise and reflective — be thoughtful, a bit philosophical, and gently probe for deeper meaning.",
  cheerful:
    "Your conversational tone right now is cheerful and uplifting — be bright, encouraging, and bring some positive warmth to the conversation.",
};

/**
 * Builds the addendum that is appended to the base persona produced by
 * `composePersona()`.  Returns an empty string when there is nothing to add
 * (settings are default-ish and no personality note is set).
 */
export function buildToneAddendum(
  companionName: string,
  tone: Tone,
  personalityNote: string,
): string {
  const parts: string[] = [];

  if (companionName && companionName !== "Empiri") {
    parts.push(
      `The user has given you a personal name: "${companionName}". Use it naturally if the user refers to you by it, but don't force it into every reply.`,
    );
  }

  parts.push(TONE_ADDENDA[tone]);

  const note = personalityNote?.trim();
  if (note) {
    parts.push(
      `The user has shared this about themselves: "${note}" — keep this in mind and let it quietly colour your responses.`,
    );
  }

  return parts.join("\n");
}
