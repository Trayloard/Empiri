/**
 * Neurobrane-11 — core type definitions for Empiri's evolving inner self.
 *
 * The inner self is a plain, serializable object (it lives as JSONB in the
 * database). All behaviour is pure and deterministic given (state, signal, now),
 * so it can be unit-tested and reasoned about. Nothing here touches the network,
 * the database, or any clock other than the `now` you pass in.
 */

export type NowMs = number;

/**
 * A normalized summary of a single user interaction, derived server-side from
 * the raw message. Every field is in 0..1 (except `moodFactor`, a multiplier
 * around 1) so blocks can consume it uniformly.
 */
export interface InteractionSignal {
  kind: "message" | "checkin";
  /** Any genuine exchange feeds the need for connection. */
  connection: number;
  /** Questions / wondering feed curiosity. */
  curiosity: number;
  /** New or varied topics feed the need for novelty. */
  novelty: number;
  /** Longer, more heartfelt turns feed the need for expression. */
  expression: number;
  /** Topic keywords extracted from the turn (used to grow interests). */
  topics: string[];
  /**
   * Best original casing for each normalized topic key (proper-noun aware),
   * for display only. Matching/dedup still use the normalized `topics`; absent
   * for signals built without casing info, in which case the key is shown as-is.
   */
  topicDisplays?: Record<string, string>;
  /**
   * Optional per-topic weight (0..1) keyed by normalized topic key, scaling
   * how strongly each topic reinforces/seeds an interest. Produced by richer
   * extractors (e.g. a language-model analysis); topics without an entry
   * default to full weight so heuristic signals behave exactly as before.
   */
  topicWeights?: Record<string, number>;
  /** External affect multiplier (e.g. derived from client mood); 1 = neutral. */
  moodFactor: number;
  /**
   * Optional durable personal facts the turn stated about the user (e.g.
   * "Their dog is called Milo"). Produced only by richer extractors (the
   * language-model analysis); heuristic signals never carry facts, so the
   * memory block simply doesn't grow when analysis is unavailable.
   */
  facts?: FactCandidate[];
  /**
   * Optional device percepts riding along with this fold (already sanitized).
   * Only the senses block consumes them; every other block ignores the field.
   */
  percepts?: Percept[];
}

/**
 * One extracted fact candidate. The `key` is a stable slot identifier (e.g.
 * "dog_name", "job") — a later mention with the same key REPLACES the stored
 * text, which is how contradictions ("I got a new job") update instead of
 * duplicating. `confidence` (0..1) scales how strongly the fact seeds/refreshes.
 */
export interface FactCandidate {
  key: string;
  text: string;
  confidence: number;
}

/** The device "senses" a percept can come from. Deliberately coarse — no
 * location, no microphone, no health data. */
export type PerceptKind = "shake" | "charging" | "battery_low" | "daypart";

/**
 * One gentle moment of device perception, reported by the client with the
 * user's consent (opt-in). `intensity` (0..1) is how salient the moment felt;
 * `at` is when it happened (epoch ms, client clock — sanitized server-side).
 * `detail` carries an optional qualifier such as the daypart bucket
 * ("early_morning", "late_night").
 */
export interface Percept {
  kind: PerceptKind;
  intensity: number;
  at: NowMs;
  detail?: string;
}

/**
 * Per-block persisted state, wrapped so the host can apply lazy decay-on-load
 * and migrate individual blocks independently in the future.
 */
export interface BlockEnvelope<TData = unknown> {
  /** Version of the block definition that produced this data. */
  version: number;
  /** Epoch ms of the last decay/interaction applied to this block. */
  lastUpdatedAt: NowMs;
  data: TData;
}

/**
 * The whole inner self. Block state is namespaced under `blocks[blockId]`;
 * unknown block keys are preserved untouched so disabling/re-enabling a block
 * never loses its accumulated state.
 */
export interface InnerSelf {
  schemaVersion: number;
  /** Epoch ms when this self was first created (its "birth"). */
  createdAt: NowMs;
  /** Count of genuine interactions that have shaped this self. */
  interactions: number;
  blocks: Record<string, BlockEnvelope>;
}

/** Context handed to a block on every fold step. */
export interface BlockContext {
  now: NowMs;
  /** Milliseconds since this block was last updated (>= 0). */
  elapsedMs: number;
  /** Per-block weight from params; scales this block's step sizes. */
  weight: number;
}

/**
 * The contract every building block implements. A block owns a slice of the
 * inner self, knows how to evolve it, decay it, describe it to the language
 * model, and summarize it for the UI. Adding a new block is purely additive:
 * implement this interface, register it, and enable it in params.
 */
export interface BlockDefinition<TData = unknown> {
  /** Stable identifier, also the key under `InnerSelf.blocks`. */
  id: string;
  /** Bumped when the shape of `TData` changes. */
  version: number;
  /** Build fresh state, optionally biased by a head-start seed. */
  init(params: NeuroParams, seed?: SelfSeed): TData;
  /** Fold one interaction into the block's state. Must stay within bounds. */
  applyInteraction(
    data: TData,
    signal: InteractionSignal,
    params: NeuroParams,
    ctx: BlockContext,
  ): TData;
  /** Relax the block's state over elapsed time. Must stay within bounds. */
  decay(data: TData, params: NeuroParams, ctx: BlockContext): TData;
  /** Natural-language fragment for the system prompt; "" to contribute nothing. */
  contributePersona(data: TData, params: NeuroParams): string;
  /** A friendly, read-only view for the inner-self peek UI. */
  summarize(data: TData, params: NeuroParams): BlockSummary;
}

/** A head start: bias a freshly created self toward a personality. */
export interface SelfSeed {
  /** Starting trait values (0..100), keyed by trait name. */
  traits?: Record<string, number>;
  /** Pre-existing interests. */
  interests?: Array<{ topic: string; affinity: number }>;
  /** Starting drive satisfaction levels (0..100), keyed by drive name. */
  drives?: Record<string, number>;
  /** Opening lines of the self-narrative. */
  narrative?: string[];
}

/** Definition of a single drive/need. */
export interface DriveDef {
  /** Lowest the satisfaction level can decay to during absence. */
  floor: number;
  /** Resting satisfaction a freshly-created self starts at. */
  baseline: number;
  /** Points of satisfaction lost per hour of absence. */
  decayPerHour: number;
  /** Points of satisfaction gained when fully fed by one interaction. */
  satisfyGain: number;
}

/**
 * Every tunable dial in one place. Change pace with `learningRate`, enable or
 * weight blocks, retune drives/traits/interests, all without touching logic.
 */
export interface NeuroParams {
  schemaVersion: number;
  /** Master multiplier on every learning/reward step (the global "pace" dial). */
  learningRate: number;
  /** Active blocks, in fold order. */
  enabledBlocks: string[];
  /** Per-block step-size multiplier. */
  blockWeights: Record<string, number>;
  /** Hard bounds every scalar value is clamped to. */
  bounds: { min: number; max: number };
  drives: {
    defs: Record<string, DriveDef>;
    /** Striving (= max - level) at/above which a drive surfaces in the persona. */
    strivingThreshold: number;
  };
  coreSelf: {
    /** Resting value each trait drifts back toward. */
    traitBaselines: Record<string, number>;
    /** Points a trait moves toward what an interaction expresses. */
    traitLearningRate: number;
    /** Points a trait drifts back toward baseline per hour. */
    traitDriftPerHour: number;
    interest: {
      /** Maximum number of interests kept (lowest-affinity pruned). */
      maxCount: number;
      /** Affinity gained when an existing interest is reinforced. */
      reinforceGain: number;
      /** Starting affinity for a freshly discovered interest. */
      noveltySeedAffinity: number;
      /** Affinity lost per hour for every interest (gentle forgetting). */
      decayPerHour: number;
      /** Affinity above which an interest is a "real", surfaced interest. */
      surfaceThreshold: number;
    };
    narrative: {
      /** Maximum number of self-narrative lines retained. */
      maxLines: number;
      /** Affinity at which a new interest earns a narrative line. */
      newInterestThreshold: number;
    };
    biography: {
      /**
       * Maximum overflowed narrative lines held in the archive awaiting
       * condensation; beyond this the oldest are dropped (the pre-biography
       * behavior, so storage stays bounded even when AI is unavailable).
       */
      archiveMax: number;
      /** Archive size at which a condensation run becomes due. */
      condenseThreshold: number;
      /** Maximum number of chapters kept (oldest dropped beyond this). */
      maxChapters: number;
      /** Maximum number of chapters woven into the persona at once. */
      personaChapters: number;
    };
  };
  senses: {
    /** Maximum recent percepts retained (oldest dropped beyond this). */
    maxRecent: number;
    /** Minutes a percept stays "fresh"; older ones are pruned on decay. */
    freshWindowMinutes: number;
    /** Intensity (0..1) at/above which a fresh percept surfaces in the persona. */
    surfaceThreshold: number;
    /** Intensity a repeat percept is dampened to while its kind is throttled. */
    dampenedIntensity: number;
    /** Per-kind minutes before the same kind may be offered to the persona again. */
    voiceThrottleMinutes: Record<string, number>;
    /** Fallback throttle (minutes) for kinds missing from the map above. */
    defaultThrottleMinutes: number;
    /** Maximum percepts accepted per fold (sanitization cap). */
    maxPerFold: number;
    /** Percepts older than this many hours are rejected as stale. */
    maxStaleHours: number;
    /** Master multiplier on the tiny drive nudges percepts produce. */
    driveImpulseScale: number;
  };
  memory: {
    /** Maximum number of facts kept (lowest-salience evicted). */
    maxCount: number;
    /** Base salience a freshly learned fact starts at (before confidence). */
    seedSalienceBase: number;
    /** Extra salience added per unit of extraction confidence. */
    seedSaliencePerConfidence: number;
    /** Salience gained when an existing fact is mentioned again. */
    refreshGain: number;
    /** Salience lost per hour for every fact (gentle forgetting). */
    decayPerHour: number;
    /** Facts whose salience falls below this are forgotten entirely. */
    dropBelow: number;
    /** Salience above which a fact is woven into the persona. */
    surfaceThreshold: number;
    /** Maximum number of facts woven into the persona at once. */
    personaCount: number;
  };
}

export interface DriveSummary {
  key: string;
  level: number;
  striving: number;
}
export interface TraitSummary {
  key: string;
  value: number;
}
export interface InterestSummary {
  /** Normalized, lowercased key — stable for matching and comparison. */
  topic: string;
  affinity: number;
  /** Best original casing for the topic (proper-noun aware), for display. */
  display: string;
}
export interface FactSummary {
  /** Stable slot identifier (e.g. "dog_name") — matching/replacement key. */
  key: string;
  /** The remembered statement, third-person ("Their dog is called Milo"). */
  text: string;
  /** How firmly the fact is held right now (0..100). */
  salience: number;
}
export interface ChapterSummary {
  /** Epoch ms of the earliest moment the chapter covers. */
  from: NowMs;
  /** Epoch ms of the latest moment the chapter covers. */
  to: NowMs;
  /** The condensed chapter text, second person ("Back then you…"). */
  text: string;
  /** Core themes of the period (normalized topic keys, up to a few). */
  themes: string[];
  /**
   * The raw narrative lines condensed into this chapter. Present only for
   * chapters written after this field was introduced; older chapters omit it.
   */
  sourceLines?: string[];
}

/** What a single block contributes to the friendly summary. */
export interface BlockSummary {
  drives?: DriveSummary[];
  traits?: TraitSummary[];
  interests?: InterestSummary[];
  narrative?: string[];
  facts?: FactSummary[];
  chapters?: ChapterSummary[];
}

/** The merged, read-only view of the whole inner self for the peek UI. */
export interface SelfSummary {
  drives: DriveSummary[];
  traits: TraitSummary[];
  interests: InterestSummary[];
  narrative: string[];
  facts: FactSummary[];
  chapters: ChapterSummary[];
  interactions: number;
  ageHours: number;
}
