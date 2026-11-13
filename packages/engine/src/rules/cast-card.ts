/**
 * "You may cast target instant or sorcery card from a graveyard, and mana of any type can be spent to cast that spell. If that spell would be put into a graveyard, exile it
 * instead" (D-350, CR 608.2g, 601.2, 609.4b, 614.1a): the `castCard` effect, run as an instruction in two stages (`Instruction` `castCard`).
 *
 *   start   the effect names a target card (resolved as the effect runs, from the targets that are still legal, CR 608.2b). When that card is no longer in a graveyard as the
 *           same object (it moved: CR 400.7) nothing happens. When it could be cast now (`canCastDuringResolution` with the cost the card has: a legal target for each of its
 *           targets, additional costs and the mana cost payable, with any mana when the effect says so) the controller is asked; when it could not nothing is asked and
 *           the card stays in its graveyard.
 *   ask     `confirmOptional`, purpose `castCard`, the card as `subject` (public: it is in a graveyard). Accepting begins the cast as CR 608.2g says (the steps of CR 601.2a-i,
 *           no player receives priority, the spell becomes the topmost object of the stack and the ability goes on resolving, as for Cascade, `rules/cascade-cast.ts`), paying
 *           the card's mana cost, with the riders of the effect on that one spell. The answer is in `rules/cast-card-answer.ts`.
 * The caster controls the spell; the card keeps its owner (CR 108.3), so a card of an opponent's graveyard that is exiled instead of going to a graveyard goes to exile, which is
 * nobody's, and one that would have gone to a graveyard goes to its owner's. The cast can be taken back with `cancel` at any question (CR 733).
 */
import type { GameState, Instruction, ResolutionContext } from '../state/types';
import { canCastDuringResolution } from './legality';
import { sourceInfo } from './source-info';
import { done, type StepOutcome } from './step-outcome';

export type CastCardInstruction = Extract<Instruction, { kind: 'castCard' }>;

/** Runs one stage of the `castCard` instruction. */
export function runCastCard(
  state: GameState,
  res: ResolutionContext,
  ins: CastCardInstruction,
): StepOutcome {
  if (ins.stage === 'ask') {
    const info = sourceInfo(state, res.source);
    return {
      state,
      events: [],
      front: [],
      needs: {
        kind: 'confirmOptional',
        seat: res.controller,
        source: res.object,
        sourceName: info?.name ?? '',
        sourceOracleText: info?.oracleText ?? '',
        purpose: 'castCard',
        subject: ins.card,
      },
    };
  }
  // start: the target is still the card it was chosen as, in a graveyard (`canCastDuringResolution` asks for the graveyard).
  const card = state.objects[ins.card];
  if (card === undefined) return done(state);
  if (canCastDuringResolution(state, res.controller, card, 'normal', ins.anyManaType)) {
    return done(state, [], [{ ...ins, stage: 'ask' }]);
  }
  return done(state);
}
