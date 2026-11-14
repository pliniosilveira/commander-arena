/**
 * "Exile that card instead of putting it into your graveyard as it resolves. If you do, return it to your hand at the beginning of the next end step" (CR 614.1a, 608.2n,
 * 603.7, 603.7c, D-1322 provisional): the effect `exileOnResolve` and what the stack does with the mark it leaves.
 *
 * The effect resolves while the spell is still on the stack (it is the effect of a trigger of its being cast): it marks the spell (`StackData.exileOnResolve`). The mark is a
 * replacement effect of the resolution only (CR 614.1a, "as it resolves"): a spell that is countered, fizzles or is put into exile by another effect is not changed, and so it is not
 * returned either (the "if you do" is false). A spell that would not go to the graveyard anyway (flashback, an Adventure, "exile it instead") is not changed. When the resolved
 * spell is exiled the delayed triggered ability the effect describes is created for it (CR 603.7), named for the card in exile (CR 603.7c, 400.7: one that left since is a
 * new object and is not found).
 */

import type { ObjectId, SeatId } from '../ids';
import { patchObject } from '../state/ops';
import type { DelayedTrigger, GameObject, GameState, TriggeredAbility } from '../state/types';

/** CR 603.7: "return it to your hand at the beginning of the next end step", for the card the spell became in exile. */
const RETURN_TO_HAND: TriggeredAbility = {
  kind: 'triggered',
  trigger: { kind: 'endStep', whose: 'each' },
  effect: { kind: 'moveToZone', objects: { kind: 'triggerSubject' }, to: 'hand' },
};

/** D-1322: marks each of `spells` that is a spell card still on the stack. */
export function markExileOnResolve(
  state: GameState,
  spells: readonly ObjectId[],
  by: SeatId,
  source: ObjectId,
): GameState {
  let next = state;
  for (const id of spells) {
    const obj = next.objects[id];
    if (obj?.zone !== 'stack' || obj.stack?.kind !== 'spell' || obj.card === null) continue;
    next = patchObject(next, id, { stack: { ...obj.stack, exileOnResolve: { by, source } } });
  }
  return next;
}

/**
 * Whether a resolving spell is exiled instead of put into its owner's graveyard (CR 614.1a): it carries the mark, and it is an instant or sorcery card that would go to the graveyard
 * (not a permanent, not an Adventure, not a spell that another effect already sends to exile).
 */
export function exiledAsItResolves(
  obj: GameObject,
  permanent: boolean,
  adventure: boolean,
): boolean {
  const stack = obj.stack;
  return (
    stack?.exileOnResolve !== undefined &&
    obj.card !== null &&
    !permanent &&
    !adventure &&
    stack.flashback !== true &&
    stack.exileInstead !== true
  );
}

/** The delayed triggered ability that returns the card the resolved spell became in exile (CR 603.7, 603.7c). */
export function returnExiledSpell(obj: GameObject, exiled: ObjectId): DelayedTrigger | null {
  const mark = obj.stack?.exileOnResolve;
  if (mark === undefined) return null;
  return {
    source: mark.source,
    controller: mark.by,
    ability: RETURN_TO_HAND,
    subject: exiled,
  };
}
