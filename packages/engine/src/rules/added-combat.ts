/**
 * "After this phase, there is an additional combat phase. Each of those creatures attacks that combat if able. They can't attack you or planeswalkers you control that combat."
 * (Illusionist's Gambit, `extraCombat.those`): as the added combat phase begins (CR 500.8), the creatures the effect fixed as it resolved get the requirement of CR 508.1d (a `restrict`
 * of `attacksEachCombat`) and the restriction of CR 508.1c against the controller of the effect and the planeswalkers that player controls (`cantAttackPlayer`), both for that combat
 * only ("that combat", CR 506.1, 611.2a: they end as its end of combat step ends). A creature that is no longer on the battlefield is a new object or none (CR 400.7) and gets nothing.
 */
import { allocateTimestamp } from '../state/ops';
import type { AddedPhase, ContinuousChange, ContinuousEffect, GameState } from '../state/types';

export function bindThoseCreatures(state: GameState, phase: AddedPhase): GameState {
  const those = phase.those;
  if (those === undefined) return state;
  const objects = those.objects.filter((id) => state.objects[id]?.zone === 'battlefield');
  if (objects.length === 0) return state;
  const changes: ContinuousChange[] = [
    ...(those.attackIfAble === true
      ? [{ kind: 'restrict', restriction: 'attacksEachCombat' } as const]
      : []),
    ...(those.cantAttackYou === true
      ? [{ kind: 'cantAttackPlayer', seat: those.controller } as const]
      : []),
  ];
  let next = state;
  for (const change of changes) {
    const [timestamp, stamped] = allocateTimestamp(next);
    const created: ContinuousEffect = {
      id: `ce${timestamp}`,
      timestamp,
      objects,
      until: 'endOfCombat',
      change,
    };
    next = { ...stamped, continuousEffects: [...stamped.continuousEffects, created] };
  }
  return next;
}
