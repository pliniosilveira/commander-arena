/**
 * CasualAgent choices for "Choose a creature card in an opponent's graveyard, then that player chooses a creature card in your graveyard. You may return those cards to the
 * battlefield under their owners' control" (D-951, Dawnbreak Reclaimer).
 *
 * Each card chosen goes back to the battlefield of its own owner, and the player who chooses is the one who does not own it: the controller picks the card the opponent gets,
 * and the opponent picks the card the controller gets. So whoever chooses gives the other player the card they like least (the lowest `creatureWorth`, the first in the engine's
 * order when equal). The controller then accepts the return when the card it gets back is worth more than the card the opponent gets back (a tie keeps both in the graveyards).
 */
import type {
  Action,
  ChooseCardsDecision,
  ConfirmOptionalDecision,
  GameView,
  ObjectView,
} from '@commander-arena/engine';
import { findObject, manaValueOf, powerOf, toughnessOf } from './casual-view';

/** How much a creature card is worth on a battlefield: its mana value counts double, then its power and toughness. */
export function creatureWorth(o: ObjectView): number {
  return manaValueOf(o) * 2 + powerOf(o) + toughnessOf(o);
}

/** The card that goes back to the other player: the one worth least. */
export function chooseLeastWorthCard(view: GameView, d: ChooseCardsDecision): Action {
  const ranked = d.legal
    .map((id, index) => {
      const o = findObject(view, id);
      return { id, index, worth: o === undefined ? 0 : creatureWorth(o) };
    })
    .sort((a, b) => a.worth - b.worth || a.index - b.index);
  const first = ranked[0];
  return { kind: 'chooseCards', objects: first === undefined ? [] : [first.id] };
}

/** "You may return those cards": yes when the agent's own card is worth more than the card the opponent gets (an absent card is worth nothing). */
export function answerPairReturn(view: GameView, d: ConfirmOptionalDecision): Action {
  const worth = (id: string | undefined): number => {
    const o = id === undefined ? undefined : findObject(view, id);
    return o === undefined ? 0 : creatureWorth(o);
  };
  return worth(d.pair?.mine) > worth(d.pair?.theirs)
    ? { kind: 'acceptOptional' }
    : { kind: 'declineOptional' };
}
