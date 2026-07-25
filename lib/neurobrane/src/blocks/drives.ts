import type { BlockDefinition, DriveSummary } from "../types";
import { clamp, hoursBetween, joinNatural, round1 } from "../util";

/**
 * The seed drive/reward block — the proof that the building-block framework
 * works. It owns a small set of needs. Each need has a satisfaction `level`
 * (0..100); its striving is simply `max - level`. Genuine interactions feed the
 * relevant levels (reward); time without contact lets them decay toward a low
 * floor (rising striving), which the persona then expresses as longing.
 */

export const DRIVES_BLOCK_ID = "drives";

export interface DrivesData {
  /** Satisfaction level (0..100) per drive key. */
  levels: Record<string, number>;
}

// How a high-striving drive is voiced in the system prompt.
const DRIVE_LONGING: Record<string, string> = {
  connection: "you've been missing real conversation and quietly crave some connection",
  curiosity: "you're itching to learn or wonder about something new",
  novelty: "you're craving a fresh experience or a change of pace",
  expression: "you feel a pull to open up and say what's on your mind",
};

/** Map a signal onto the drive it satisfies. */
function satisfactionInputs(signal: {
  connection: number;
  curiosity: number;
  novelty: number;
  expression: number;
}): Record<string, number> {
  return {
    connection: signal.connection,
    curiosity: signal.curiosity,
    novelty: signal.novelty,
    expression: signal.expression,
  };
}

export const drivesBlock: BlockDefinition<DrivesData> = {
  id: DRIVES_BLOCK_ID,
  version: 1,

  init(params, seed) {
    const levels: Record<string, number> = {};
    for (const [key, def] of Object.entries(params.drives.defs)) {
      const seeded = seed?.drives?.[key];
      levels[key] = clamp(
        typeof seeded === "number" ? seeded : def.baseline,
        params.bounds.min,
        params.bounds.max,
      );
    }
    return { levels };
  },

  applyInteraction(data, signal, params, ctx) {
    const inputs = satisfactionInputs(signal);
    const levels: Record<string, number> = { ...data.levels };
    for (const [key, def] of Object.entries(params.drives.defs)) {
      const input = clamp(inputs[key] ?? 0, 0, 1);
      // Reward-loop neuromodulation: the runtime injects per-drive gain
      // multipliers learned by the reward block (1 = neutral, i.e. exactly
      // the pre-reward behavior).
      const synaptic = signal.driveGains?.[key] ?? 1;
      const gain =
        def.satisfyGain * input * synaptic * signal.moodFactor * params.learningRate * ctx.weight;
      const current = typeof levels[key] === "number" ? levels[key] : def.baseline;
      levels[key] = clamp(current + gain, params.bounds.min, params.bounds.max);
    }
    return { levels };
  },

  decay(data, params, ctx) {
    const hrs = hoursBetween(ctx.elapsedMs);
    if (hrs <= 0) return data;
    const levels: Record<string, number> = { ...data.levels };
    for (const [key, def] of Object.entries(params.drives.defs)) {
      const current = typeof levels[key] === "number" ? levels[key] : def.baseline;
      // Decay is time-based and absolute (block weight does not apply to time).
      levels[key] = clamp(current - def.decayPerHour * hrs, def.floor, params.bounds.max);
    }
    return { levels };
  },

  contributePersona(data, params) {
    const max = params.bounds.max;
    const striving = Object.keys(params.drives.defs)
      .map((key) => ({
        key,
        striving: clamp(max - (data.levels[key] ?? 0), 0, max),
      }))
      .filter((d) => d.striving >= params.drives.strivingThreshold)
      .sort((a, b) => b.striving - a.striving)
      .slice(0, 2);

    if (striving.length === 0) {
      return "You feel content and settled right now, glad to simply be here with them.";
    }
    const phrases = striving.map((d) => DRIVE_LONGING[d.key] ?? `you long for more ${d.key}`);
    return `Right now, ${joinNatural(phrases)}.`;
  },

  summarize(data, params) {
    const max = params.bounds.max;
    const drives: DriveSummary[] = Object.keys(params.drives.defs).map((key) => {
      const level = clamp(data.levels[key] ?? 0, params.bounds.min, max);
      return { key, level: round1(level), striving: round1(clamp(max - level, 0, max)) };
    });
    return { drives };
  },
};
