/**
 * The effect "turn that creature face up" (CR 701.40g, 708.8, 708.7): an effect, not the special action (`rules/face-down-actions.ts`), turns a face-down permanent face up
 * with no cost paid. It is the same object afterwards, with its copiable values back to its card's own (CR 708.8: nothing entered, so no enters ability triggers) and the
 * `turnedFaceUp` event, which anything that triggers when a permanent is turned face up reads.
 *
 * A manifested permanent represented by an instant or sorcery card is revealed and stays face down; nothing is turned face up, so nothing that triggers on it does (CR 701.40g).
 * The face-down land of Yedora (`forestLand`) is never turned face up.
 */
import type { Effect } from '../ast/types';
import type { ObjectId } from '../ids';
import type { GameEvent } from '../state/events';
import { definitionOf, objectsInZone, setObject } from '../state/ops';
import type { ChosenTarget, GameState, Instruction, ResolutionContext } from '../state/types';
import { controllerOf } from './control';
import { faceDownBy, withoutFaceDown } from './face-down';
import { matchesFilter, resolveObjects, type SelectContext } from './select';
import { done, type StepOutcome } from './step-outcome';

type ChooseTapInstruction = Extract<Instruction, { kind: 'chooseTap' }>;

/** Turns each face-down permanent the effect names face up, one after the other; a permanent that is not face down is left alone. */
export function runTurnFaceUp(
  state: GameState,
  effect: Extract<Effect, { kind: 'turnFaceUp' }>,
  ctx: SelectContext,
  targets: readonly ChosenTarget[],
): StepOutcome {
  if (effect.objects.kind === 'choose') {
    // CR 608.2d (Zimone, Mystery Unraveler): "you may turn a permanent you control face up": the controller chooses among the face-down permanents they control that match.
    const what = effect.objects;
    return done(
      state,
      [],
      [
        {
          kind: 'chooseTap' as const,
          filter: { ...what.filter, facing: 'down' as const },
          count: 1,
          chosen: null,
          turnUp: true as const,
          ...(what.optional === true ? { upTo: true as const } : {}),
        },
      ],
    );
  }
  return turnUp(state, resolveObjects(state, effect.objects, ctx, targets));
}

/** The face-down permanents `seat` controls that the filter matches and an effect can turn face up (the face-down land of Yedora never is). */
function turnUpCandidates(
  state: GameState,
  res: ResolutionContext,
  filter: ChooseTapInstruction['filter'],
): ObjectId[] {
  const scoped = { ...filter, zone: 'battlefield' as const, controller: 'you' as const };
  return objectsInZone(state, 'battlefield').filter((id) => {
    const obj = state.objects[id];
    if (obj === undefined || obj.card === null) return false;
    const by = faceDownBy(obj);
    return (
      by !== null &&
      by !== 'forestLand' &&
      matchesFilter(state, obj, scoped, { controller: res.controller, source: res.source })
    );
  });
}

/**
 * The instruction a `turnFaceUp` of a `choose` selector leaves (CR 608.2d): the controller chooses one of the candidates (none, when the selector is `optional`: the "you may" is
 * that choice), or the only candidate is turned face up at once when the choice is not optional.
 */
export function runChooseTurnUp(
  state: GameState,
  res: ResolutionContext,
  instruction: ChooseTapInstruction,
): StepOutcome {
  if (instruction.chosen !== null) {
    const r = turnUp(state, instruction.chosen);
    return {
      ...r,
      events: [
        {
          kind: 'permanentsChosen',
          seat: res.controller,
          source: res.object,
          objects: instruction.chosen,
          purpose: 'effect',
          automatic: false,
        },
        ...r.events,
      ],
    };
  }
  const legal = turnUpCandidates(state, res, instruction.filter);
  if (legal.length === 0) return done(state);
  const optional = instruction.upTo === true;
  if (!optional && legal.length <= instruction.count) return turnUp(state, legal);
  return {
    state,
    events: [],
    front: [],
    needs: {
      kind: 'choosePermanent',
      seat: res.controller,
      source: res.object,
      purpose: 'effect',
      min: optional ? 0 : instruction.count,
      max: Math.min(instruction.count, legal.length),
      legal,
    },
  };
}

function turnUp(state: GameState, ids: readonly ObjectId[]): StepOutcome {
  let next = state;
  const events: GameEvent[] = [];
  let turned = 0;
  for (const id of ids) {
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
