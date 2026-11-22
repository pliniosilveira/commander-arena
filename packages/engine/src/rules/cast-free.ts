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
 *
 * D-660 (CR 608.2g, 601.2): with `remaining` ("up to two spells", "any number of spells") the question comes again after each spell is cast, among the cards still there that
 * can be cast now (the card cast is on the stack, a new object, so it is not offered again), until the controller chooses no card, the number is reached or nothing can be cast.
 * Every spell is cast during this resolution (CR 608.2g: "which may include casting other spells this way"), so they are all on the stack when it ends.
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
  ins: Pick<
    CastFreeInstruction,
    'objects' | 'play' | 'filter' | 'cards' | 'cardsZone' | 'seat' | 'payInstead'
  >,
): ObjectId[] {
  // "... then they may cast that card": the player the effect names casts it, not always its controller.
  const seat = ins.seat ?? res.controller;
  const ctx: SelectContext = {
    controller: seat,
    source: res.source,
    // CR 107.3a: "mana value X or less" reads the X announced for the spell that is resolving.
    x: state.objects[res.object]?.stack?.x ?? 0,
    ...(res.lastMoved === undefined ? {} : { moved: res.lastMoved }),
    // CR 603.3d: "with lesser mana value that shares a card type with it": the spell a cast trigger is about.
    ...(res.triggerSubject === undefined ? {} : { triggerSubject: res.triggerSubject }),
  };
  const named: readonly ObjectId[] =
    // CR 608.2g: "from among them": the effect named the cards itself (those looked at), which are still where they were.
    ins.cards !== undefined
      ? ins.cards.filter((id) => state.objects[id]?.zone === (ins.cardsZone ?? 'library'))
      : ins.objects.kind === 'choose'
        ? // CR 608.2g: a card of the controller's hand, or (issue 102, Diviner of Mist) of their graveyard, as the filter says.
          ((ins.objects.filter.zone === 'graveyard'
            ? state.seats[seat]?.graveyard
            : state.seats[seat]?.hand
          )?.filter((id) => {
            const card = state.objects[id];
            return (
              card !== undefined &&
              ins.objects.kind === 'choose' &&
              matchesFilter(
                state,
                card,
                {
                  ...ins.objects.filter,
                  zone: ins.objects.filter.zone === 'graveyard' ? 'graveyard' : 'hand',
                },
                ctx,
              )
            );
          }) ?? [])
        : resolveObjects(state, ins.objects as ObjectRef, ctx, []);
  return named.filter((id) => {
    const card = state.objects[id];
    if (card === undefined) return false;
    // D-655: "an Aura spell from among them": the filter reads the card as it is in exile.
    if (
      ins.filter !== undefined &&
      !matchesFilter(state, card, { ...ins.filter, zone: card.zone }, ctx)
    ) {
      return false;
    }
    if (isLandCard(state, id)) return ins.play === true && canPlayLandByEffect(state, seat, card);
    // CR 118.9: a card of a graveyard (`perOwner`) is cast from there, whoever's it is.
    return canCastDuringResolution(
      state,
      seat,
      card,
      card.zone === 'graveyard' ? 'freeGraveyard' : 'free',
      false,
      ins.payInstead,
    );
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
  // CR 608.2c (issue 100): "If you don't": nothing is done until a spell is cast, so what "if you do" reads starts again at 0 (`resetPerformed`).
  if (legal.length === 0) return { ...done(state), resetPerformed: true };
  const first = state.objects[legal[0] as ObjectId]?.zone;
  const zone =
    first === 'exile'
      ? 'exile'
      : first === 'library'
        ? 'library'
        : first === 'graveyard'
          ? 'graveyard'
          : 'hand';
  return {
    state,
    events: [],
    front: [],
    resetPerformed: true,
    needs: {
      kind: 'chooseCards',
      seat: ins.seat ?? res.controller,
      source: res.object,
      purpose: 'cast',
      zone,
      legal,
      min: 0,
      max: 1,
      reveal: false,
      prompt:
        ins.remaining === undefined
          ? `You may ${ins.play ? 'play' : 'cast'} ${
              ins.objects.kind === 'target'
                ? 'the target card from your graveyard'
                : ins.cardsZone === 'graveyard'
                  ? 'a card that player milled'
                  : ins.cards !== undefined
                    ? 'a card from among those you looked at'
                    : ins.objects.kind === 'choose'
                      ? ins.objects.filter.zone === 'graveyard'
                        ? 'a card from your graveyard'
                        : 'a card from your hand'
                      : 'the exiled card'
            } ${ins.payInstead === undefined ? 'without paying its mana cost' : 'by paying its alternative cost'}`
          : // D-660: "up to two spells from among them", "any number of spells from among them": one at a time, until the player stops.
            `You may cast ${
              ins.remaining === 'any'
                ? 'any number of spells'
                : `up to ${ins.remaining === 1 ? 'one more spell' : `${ins.remaining} spells`}`
            } from among the exiled cards without paying their mana costs`,
    },
  };
}
