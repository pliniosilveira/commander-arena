/**
 * "..., then you may have this creature become a copy of an artifact or creature card from among those cards until end of turn" (Spirit of Resilience; CR 707.2, 613.2a,
 * 400.7, D-232): the cards that left the graveyard and triggered the ability are the candidates; the ones the filter names, as they are now, in whatever zone they went to,
 * can be copied. The controller chooses when there are several (a `chooseCards` decision of purpose `copy`, which shows the cards with the decision, as they may be anywhere);
 * the permanents the effect names get the copiable values of the card (a layer 1 effect, `copyEffect`).
 */
import type { Effect } from '../ast/types';
import type { ObjectId } from '../ids';
import type { ChosenTarget } from '../state/chosen';
import type { GameState, Instruction, ResolutionContext } from '../state/types';
import { copyEffect } from './continuous';
import { derive } from './derive';
import { resolveObjects, type SelectContext } from './select';
import { done, type StepOutcome } from './step-outcome';

type CopyInstruction = Extract<Instruction, { kind: 'copyFromCards' }>;

/** The effect `becomeCopyOfCard` as it comes up: the candidates the filter names; nothing when there is none. */
export function startCopyFromCards(
  state: GameState,
  res: ResolutionContext,
  effect: Extract<Effect, { kind: 'becomeCopyOfCard' }>,
  ctx: SelectContext,
  targets: readonly ChosenTarget[],
): StepOutcome {
  const objects = resolveObjects(state, effect.objects, ctx, targets).filter(
    (id) => state.objects[id]?.zone === 'battlefield',
  );
  const cards = (res.triggerCards ?? []).filter((id) => {
    const card = state.objects[id];
    return (
      card !== undefined &&
      card.zone !== 'graveyard' &&
      derive(state, card).types.some((t) => effect.types.includes(t))
    );
  });
  if (objects.length === 0 || cards.length === 0) return done(state);
  return done(state, [], [{ kind: 'copyFromCards', cards, objects, chosen: null }]);
}

export function runCopyFromCards(
  state: GameState,
  res: ResolutionContext,
  ins: CopyInstruction,
): StepOutcome {
  const [only] = ins.cards;
  if (ins.chosen === null && ins.cards.length > 1) {
    return {
      state,
      events: [],
      front: [],
      needs: {
        kind: 'chooseCards',
        seat: res.controller,
        source: res.object,
        purpose: 'copy',
        // The cards went to different zones: the decision shows them itself (`GameView.pendingCards`).
        zone: 'library',
        legal: ins.cards,
        min: 1,
        max: 1,
        reveal: true,
        prompt: 'Choose an artifact or creature card from among those cards to become a copy of.',
      },
    };
  }
  const chosen: ObjectId | undefined = ins.chosen?.[0] ?? only;
  const source = chosen === undefined ? undefined : state.objects[chosen];
  if (source === undefined) return done(state);
  return copyEffect(
    state,
    { duration: 'untilEndOfTurn' },
    source,
    ins.objects.filter((id) => state.objects[id]?.zone === 'battlefield'),
  );
}
