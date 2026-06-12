import { getCompanionSelf } from "@workspace/api-client-react";
import { useEffect, useRef, useState } from "react";

import {
  NEUTRAL_INFLUENCE,
  computeTraitInfluence,
  type TraitInfluence,
} from "@/lib/traitInfluence";

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Fetches Empiri's current personality traits and converts them to a
 * `TraitInfluence` that the orb / ambient glow can consume directly.
 *
 * - Returns `NEUTRAL_INFLUENCE` immediately (before the first fetch resolves)
 *   so the visual always has a sensible default.
 * - Re-fetches every 5 minutes while the screen is mounted, so the visual
 *   drifts gently as personality evolves during a session.
 * - Silently swallows errors — trait influence is best-effort.
 */
export function useCompanionTraits(
  conversationId: number | null,
): TraitInfluence {
  const [influence, setInfluence] =
    useState<TraitInfluence>(NEUTRAL_INFLUENCE);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (conversationId == null) return;

    let cancelled = false;

    async function fetch() {
      if (conversationId == null) return;
      try {
        const self = await getCompanionSelf(conversationId);
        if (!cancelled) {
          setInfluence(computeTraitInfluence(self.traits));
        }
      } catch {
        // trait influence is best-effort; keep the current value
      }
    }

    fetch();

    timerRef.current = setInterval(fetch, REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (timerRef.current != null) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [conversationId]);

  return influence;
}
