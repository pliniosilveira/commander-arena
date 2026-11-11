/**
 * The combat animation layer (issue 9, D-228): a hit is a lunge, a burst with rings and sparks, a
 * shaking recipient and a big number that lingers; a permanent that dies cracks and dissolves where
 * it stood; a life total pulses and shows what it gained or lost. Each effect lasts about 1.5 to
 * 2 s at Normal speed, and the effects of one snapshot are queued and staggered
 * (`combat-effects.ts`) so each can be seen.
 *
 * It is visual only. It listens to the store, so it sees a snapshot the moment it arrives, before
 * React has redrawn the board: a dying permanent is still on the page then, and its tile is copied
 * to stay as a ghost. It plays with the Web Animations API on elements it adds itself to a layer
 * that ignores the pointer, never changes the game, and draws nothing under
 * `prefers-reduced-motion`, in a hidden tab or when the setting is off. The one thing it asks of
 * the rest of the page is to hold the animation gate for the time the effects play, so the
 * autopilot's next automatic pass waits for them (`policy/animation-gate.ts`).
 */
import { useEffect, useRef } from 'react';
import type { Snapshot } from '../../game/protocol';
import { animationGate } from '../../policy/animation-gate';
import {
  currentAnimationSpeed,
  currentCombatAnimations,
  motionAllowed,
  SPEED_FACTOR,
} from '../panels/animations';
import { useStoreApi } from '../store-context';
import { planCombat } from './combat-effects';
import { createPlayer } from './combat-fx-play';

export function CombatEffects() {
  const store = useStoreApi();
  const layer = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = layer.current;
    if (root === null) return;
    const player = createPlayer(root);
    const onChange = (
      state: { snapshot: Snapshot | null },
      prev: { snapshot: Snapshot | null },
    ) => {
      const snapshot = state.snapshot;
      // A new game, the menu, or the effects switched off: nothing of the old game stays on screen.
      if (snapshot === null || !currentCombatAnimations() || !motionAllowed()) {
        if (snapshot !== prev.snapshot) player.clear();
        return;
      }
      if (snapshot === prev.snapshot || snapshot.steps.length === 0) return;
      if (typeof document !== 'undefined' && document.hidden) return;
      const scale = SPEED_FACTOR[currentAnimationSpeed()];
      const plan = planCombat(snapshot.steps, prev.snapshot?.view ?? null, scale);
      if (plan.beats.length === 0) return;
      player.play(plan, scale);
      animationGate.hold(plan.totalMs);
    };
    const unsubscribe = store.subscribe(onChange);
    return () => {
      unsubscribe();
      player.clear();
    };
  }, [store]);
  return <div className="fx-layer" ref={layer} aria-hidden="true" />;
}
