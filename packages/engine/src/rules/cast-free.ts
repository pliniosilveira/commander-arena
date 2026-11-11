/**
 * "You may cast a spell with mana value 5 or less from your hand without paying its mana cost" and "You may play the exiled card without paying
 * its mana cost" (D-145, CR 608.2g, 118.9, 305.1): the `castFree` effect, run as an instruction. The controller chooses (a `chooseCards`
 * decision of purpose 'cast', none or one card) among the cards the effect names that they could cast or, with `play`, also play:
 *
 *   - a spell is cast as CR 608.2g says (the steps of CR 601.2a-i: modes, targets, additional costs; no timing restriction; no player receives
 *     priority and the effect goes on resolving), which the answer itself starts (`rules/cast-free-answer.ts`, because it begins a cast and
 *     goes on with the resolution, which this interpreter cannot import);
 *   - a land is played (CR 305.1): put onto the battlefield as the controller's land play (CR 305.2a), allowed only on their own turn
 *     (CR 305.3) while they have a land play left. It is not cast, so there is no cost to pay and nothing to respond to; the instruction puts it
 *     onto the battlefield with a `move` that counts the land play.
 *
 * A card that could not be cast or played is not offered; with none the effect does nothing. Choosing no card does nothing.
 */
import type { ObjectRef } from '../ast/types';
import type { ObjectId } from '../ids';
import type { GameState, Instruction, ResolutionContext } from '../state/types';
import { derive } from './derive';
import { canCastDuringResolution, canPlayLandByEffect } from './legality';
import { matchesFilter, resolveObjects, type SelectContext } from './select';
import { done, type StepOutcome } from './step-outcome';

export type CastFreeInstruction = Extract<Instruction, { kind: 'castFree' }>;

/** Whether the card is a land card by its front face (CR 305.1: a land card is played, never cast). */
export function isLandCard(state: GameState, id: ObjectId): boolean {
  const obj = state.objects[id];
  return obj !== undefined && derive(state, obj).types.includes('land');
}

/** The cards the effect names that the controller could cast (or, with `play`, play) now. */
export function freeCandidates(
  state: GameState,
  res: ResolutionContext,
  ins: Pick<CastFreeInstruction, 'objects' | 'play'>,
): ObjectId[] {
  const seat = res.controller;
  const ctx: SelectContext = {
    controller: seat,
    source: res.source,
    ...(res.lastMoved === undefined ? {} : { moved: res.lastMoved }),
  };
  const named: readonly ObjectId[] =
    ins.objects.kind === 'choose'
      ? (state.seats[seat]?.hand.filter((id) => {
          const card = state.objects[id];
          return (
            card !== undefined &&
            ins.objects.kind === 'choose' &&
            matchesFilter(state, card, { ...ins.objects.filter, zone: 'hand' }, ctx)
          );
        }) ?? [])
      : resolveObjects(state, ins.objects as ObjectRef, ctx, []);
  return named.filter((id) => {
    const card = state.objects[id];
    if (card === undefined) return false;
    if (isLandCard(state, id)) return ins.play === true && canPlayLandByEffect(state, seat, card);
    return canCastDuringResolution(state, seat, card);
  });
}

export function runCastFree(
  state: GameState,
  res: ResolutionContext,
  ins: CastFreeInstruction,
): StepOutcome {
  if (ins.chosen !== null) {
    // The question was answered. A spell is cast by the answer itself, so what is left is a land to play, or nothing.
    const card = ins.chosen[0];
    if (card === undefined || !isLandCard(state, card)) return done(state);
    return done(
      state,
      [],
      [
        {
          kind: 'move',
          object: card,
          to: 'battlefield',
          position: 'top',
          tapped: false,
          commanderChoice: null,
          controller: 'you',
          playAsLand: true,
        },
      ],
    );
  }
  const legal = freeCandidates(state, res, ins);
  if (legal.length === 0) return done(state);
  const zone = state.objects[legal[0] as ObjectId]?.zone === 'exile' ? 'exile' : 'hand';
  return {
    state,
    events: [],
    front: [],
    needs: {
      kind: 'chooseCards',
      seat: res.controller,
      source: res.object,
      purpose: 'cast',
      zone,
      legal,
      min: 0,
      max: 1,
      reveal: false,
      prompt: `You may ${ins.play ? 'play' : 'cast'} ${
        ins.objects.kind === 'choose' ? 'a card from your hand' : 'the exiled card'
      } without paying its mana cost`,
    },
  };
}
