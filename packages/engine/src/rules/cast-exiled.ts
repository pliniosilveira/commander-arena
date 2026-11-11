/**
 * Casting a card from exile as an ability resolves (CR 702.62a Suspend, CR 702.35a Madness, CR 608.2g, D-128): the
 * `castExiled` effect, run as an instruction in two stages (`Instruction` `castExiled`).
 *
 *   start   the ability belongs to a card in exile. When that card is no longer there as the same object (it moved:
 *           CR 400.7), or is no longer its owner's, nothing happens. When it could be cast now, the owner is asked;
 *           when it could not ("if able") nothing is asked: a suspended card stays in exile, a card exiled by madness
 *           goes to its owner's graveyard.
 *   ask     `confirmOptional`, purpose `suspend` or `madness`, the card as `subject`. Accepting begins the cast as CR
 *           608.2g says (the steps of CR 601.2a-i, no player receives priority, the spell becomes the topmost object of
 *           the stack and the ability goes on resolving, as for Cascade, `rules/cascade-cast.ts`): without paying its
 *           mana cost for Suspend (a creature spell remembers it was cast this way and gains haste), for its madness
 *           cost for Madness (an alternative cost, CR 118.9, 601.2b, 601.2f-h). Declining leaves a suspended card in
 *           exile and puts a card exiled by madness into the graveyard.
 * The cast can be taken back with `cancel` at any question (CR 733): that rewinds to the question, as it was asked.
 */
import type { GameState, Instruction, ResolutionContext } from '../state/types';
import { namedAlternativeCostOf } from './alt-costs';
import { moveInstructions } from './effect-support';
import { canCastDuringResolution, faceOf } from './legality';
import { sourceInfo } from './source-info';
import { done, type StepOutcome } from './step-outcome';

export type CastExiledInstruction = Extract<Instruction, { kind: 'castExiled' }>;

/** Runs one stage of the `castExiled` instruction. */
export function runCastExiled(
  state: GameState,
  res: ResolutionContext,
  ins: CastExiledInstruction,
): StepOutcome {
  const card = state.objects[res.source];
  if (ins.stage === 'ask') {
    const info = sourceInfo(state, res.source);
    const madnessCost =
      ins.mode === 'madness' && card !== undefined
        ? namedAlternativeCostOf(faceOf(state, card), 'madness')
        : null;
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
        purpose: ins.mode,
        ...(ins.card === null ? {} : { subject: ins.card }),
        ...(madnessCost === null ? {} : { cost: madnessCost }),
      },
    };
  }
  // start: the card is still the exiled object the ability belongs to, and still its owner's.
  if (card === undefined || card.zone !== 'exile' || card.owner !== res.controller)
    return done(state);
  if (
    canCastDuringResolution(
      state,
      res.controller,
      card,
      ins.mode === 'madness' ? 'madness' : 'free',
    )
  ) {
    return done(state, [], [{ ...ins, stage: 'ask', card: card.id }]);
  }
  // CR 702.62a: "if able": a card that cannot be cast stays exiled. CR 702.35a: "If that player doesn't [cast it],
  // they put this card into their graveyard."
  return done(state, [], ins.mode === 'madness' ? moveInstructions([card.id], 'graveyard') : []);
}
