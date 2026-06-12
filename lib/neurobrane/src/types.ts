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
  /** External affect multiplier (e.g. derived from client mood); 1 = neutral. */
  moodFactor: number;
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
  topic: string;
  affinity: number;
}

/** What a single block contributes to the friendly summary. */
export interface BlockSummary {
  drives?: DriveSummary[];
  traits?: TraitSummary[];
  interests?: InterestSummary[];
  narrative?: string[];
}

/** The merged, read-only view of the whole inner self for the peek UI. */
export interface SelfSummary {
  drives: DriveSummary[];
  traits: TraitSummary[];
  interests: InterestSummary[];
  narrative: string[];
  interactions: number;
  ageHours: number;
}
