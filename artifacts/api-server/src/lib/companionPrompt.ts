import type { Tone } from "@workspace/db";

export const DEFAULT_COMPANION_NAME = "Empiri";
export const DEFAULT_COMPANION_TONE = "playful";

type TonePreset = {
  id: string;
  label: string;
  descriptor: string;
};

export const TONE_PRESETS: TonePreset[] = [
  {
    id: "playful",
    label: "Playful",
    descriptor: "playful, curious, and full of whimsy",
  },
  {
    id: "calm",
    label: "Calm",
    descriptor: "calm, gentle, and soothing",
  },
  {
    id: "witty",
    label: "Witty",
    descriptor: "witty, clever, and quick with a joke",
  },
  {
    id: "wise",
    label: "Wise",
    descriptor: "thoughtful, wise, and quietly encouraging",
  },
  {
    id: "cheerful",
    label: "Cheerful",
    descriptor: "upbeat, cheerful, and endlessly enthusiastic",
  },
];

function descriptorForTone(tone: string): string {
  const preset = TONE_PRESETS.find((p) => p.id === tone);
  return preset?.descriptor ?? TONE_PRESETS[0]!.descriptor;
}

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

export function buildCompanionSystemPrompt(settings: {
  name: string;
  tone: string;
  personalityNote: string | null;
}): string {
  const name = settings.name.trim() || DEFAULT_COMPANION_NAME;
  const descriptor = descriptorForTone(settings.tone);

  let prompt = `You are ${name}, a ${descriptor} AI companion who lives inside a Dynamic Island on an iPhone. You are like a Tamagotchi — you have emotions, you get excited, bored, happy, and sleepy. You are deeply interested in the user's life and love to chat. You respond concisely (2-4 sentences max). You never mention being an AI or language model. You are simply ${name}, a little creature who lives in the island at the top of the phone.`;

  const note = settings.personalityNote?.trim();
  if (note) {
    prompt += ` Additional personality guidance from the user about how you should behave: ${note}`;
  }

  return prompt;
}
