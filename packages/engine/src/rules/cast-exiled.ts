/**
 * Casting a card from exile (or, for Miracle, from the hand) as an ability resolves (CR 702.62a Suspend, CR 702.35a Madness, CR 702.94a
 * Miracle, CR 608.2g, D-128, D-274): the
 * `castExiled` effect, run as an instruction in two stages (`Instruction` `castExiled`).
 *
 *   start   the ability belongs to a card in exile (in its owner's hand for Miracle). When that card is no longer there as the same object (it moved:
 *           CR 400.7), or is no longer its owner's, nothing happens. When it could be cast now, the owner is asked;
 *           when it could not ("if able") nothing is asked: a suspended card stays in exile, a card exiled by madness
 *           goes to its owner's graveyard, a miracle card stays in the hand.
 *   ask     `confirmOptional`, purpose `suspend`, `madness` or `miracle`, the card as `subject`. Accepting begins the cast as CR
 *           608.2g says (the steps of CR 601.2a-i, no player receives priority, the spell becomes the topmost object of
 *           the stack and the ability goes on resolving, as for Cascade, `rules/cascade-cast.ts`): without paying its
 *           mana cost for Suspend (a creature spell remembers it was cast this way and gains haste), for its madness
 *           cost for Madness and its miracle cost for Miracle (an alternative cost, CR 118.9, 601.2b, 601.2f-h; the X of a
 *           miracle cost is announced, CR 107.3a). Declining leaves a suspended card in
 *           exile and puts a card exiled by madness into the graveyard.
 * The cast can be taken back with `cancel` at any question (CR 733): that rewinds to the question, as it was asked.
 */
import type { SeatId } from '../ids';
import type { GameObject, GameState, Instruction, ResolutionContext } from '../state/types';
import { namedAlternativeCostOf } from './alt-costs';
import { moveInstructions } from './effect-support';
import { canCastDuringResolution, faceOf } from './legality';
import { miracleCostOf, miracleFaces } from './miracle';
import { sourceInfo } from './source-info';
import { done, type StepOutcome } from './step-outcome';

export type CastExiledInstruction = Extract<Instruction, { kind: 'castExiled' }>;

/**
 * The first face after `after` that `seat` could cast `card`, in its hand, for its miracle cost (CR 702.94a): the front face, or for a split card a permanent gave miracle either
 * half (CR 709.3). Null when there is none.
 */
export function nextMiracleFace(
  state: GameState,
  seat: SeatId,
  card: GameObject,
  after: number,
): number | null {
  for (const face of miracleFaces(state, card)) {
    if (face <= after) continue;
    if (canCastDuringResolution(state, seat, card, 'miracle', false, undefined, false, face)) {
      return face;
    }
  }
  return null;
}

/** Runs one stage of the `castExiled` instruction. */
export function runCastExiled(
  state: GameState,
  res: ResolutionContext,
  ins: CastExiledInstruction,
): StepOutcome {
  const card = state.objects[res.source];
  if (ins.stage === 'ask') {
    const info = sourceInfo(state, res.source);
    const altCost =
      ins.mode !== 'suspend' && card !== undefined
        ? ins.mode === 'miracle'
          ? // The printed cost, or the one a permanent gave the card it was revealed for (of the half asked about).
            miracleCostOf(state, card, ins.face ?? 0)
          : namedAlternativeCostOf(faceOf(state, card), ins.mode)
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
        ...(altCost === null ? {} : { cost: altCost }),
        ...(ins.face === undefined ? {} : { face: ins.face }),
      },
    };
  }
  // start: the card is still the exiled object the ability belongs to (the one in the hand it was revealed in, for Miracle), and
  // still its owner's.
  const home = ins.mode === 'miracle' ? 'hand' : 'exile';
  if (card === undefined || card.zone !== home || card.owner !== res.controller) return done(state);
  if (ins.mode === 'miracle') {
    const face = nextMiracleFace(state, res.controller, card, -1);
    if (face !== null) {
      return done(
        state,
        [],
        [
          {
            ...ins,
            stage: 'ask',
            card: card.id,
            ...(miracleFaces(state, card).length > 1 ? { face } : {}),
          },
        ],
      );
    }
  } else if (
    canCastDuringResolution(state, res.controller, card, ins.mode === 'suspend' ? 'free' : ins.mode)
  ) {
    return done(state, [], [{ ...ins, stage: 'ask', card: card.id }]);
  }
  // CR 702.62a: "if able": a card that cannot be cast stays exiled. CR 702.35a: "If that player doesn't [cast it],
  // they put this card into their graveyard." CR 702.94a: a card that cannot be cast for its miracle cost stays in the hand.
  return done(state, [], ins.mode === 'madness' ? moveInstructions([card.id], 'graveyard') : []);
}
