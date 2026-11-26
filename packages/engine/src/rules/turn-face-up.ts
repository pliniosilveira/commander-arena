/**
 * The effect "turn that creature face up" (CR 701.40g, 708.8, 708.7): an effect, not the special action (`rules/face-down-actions.ts`), turns a face-down permanent face up
 * with no cost paid. It is the same object afterwards, with its copiable values back to its card's own (CR 708.8: nothing entered, so no enters ability triggers) and the
 * `turnedFaceUp` event, which anything that triggers when a permanent is turned face up reads.
 *
 * A manifested permanent represented by an instant or sorcery card is revealed and stays face down; nothing is turned face up, so nothing that triggers on it does (CR 701.40g).
 * The face-down land of Yedora (`forestLand`) is never turned face up.
 */
import type { Effect } from '../ast/types';
import type { GameEvent } from '../state/events';
import { definitionOf, setObject } from '../state/ops';
import type { ChosenTarget, GameState } from '../state/types';
import { controllerOf } from './control';
import { faceDownBy, withoutFaceDown } from './face-down';
import { resolveObjects, type SelectContext } from './select';
import { done, type StepOutcome } from './step-outcome';

/** Turns each face-down permanent the effect names face up, one after the other; a permanent that is not face down is left alone. */
export function runTurnFaceUp(
  state: GameState,
  effect: Extract<Effect, { kind: 'turnFaceUp' }>,
  ctx: SelectContext,
  targets: readonly ChosenTarget[],
): StepOutcome {
  let next = state;
  const events: GameEvent[] = [];
  let turned = 0;
  for (const id of resolveObjects(state, effect.objects, ctx, targets)) {
    const obj = next.objects[id];
    if (obj === undefined || obj.zone !== 'battlefield' || obj.card === null) continue;
    const by = faceDownBy(obj);
    if (by === null || by === 'forestLand') continue;
    const face = definitionOf(next, obj.card).faces[0];
    if (
      by === 'manifest' &&
      face !== undefined &&
      (face.types.includes('instant') || face.types.includes('sorcery'))
    ) {
      // CR 701.40g: revealed and left face down.
      events.push({
        kind: 'cardsRevealed',
        seat: controllerOf(next, obj),
        cards: [obj.card],
        names: [face.name],
        from: 'battlefield',
      });
      continue;
    }
    events.push({
      kind: 'turnedFaceUp',
      seat: controllerOf(next, obj),
      object: id,
      card: obj.card,
      cost: [],
    });
    next = setObject(next, withoutFaceDown(obj));
    turned += 1;
  }
  return { ...done(next, events), performed: turned };
}
