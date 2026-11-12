/**
 * CasualAgent (and HeuristicAgent, which delegates) answers for "Reveal the top five cards of your library. An opponent separates those cards into two piles. Put one pile into your
 * hand and the other into your graveyard." (`revealAndSeparate`, D-303, CR 700.3): the two decisions are `chooseCards` of purpose `separate` (which cards form pile 1) and
 * `chooseOption` of purpose `pile` (which pile goes where). The cards are in a library, so the view lists them in `pendingCards`; every answer is legal and deterministic.
 *
 *  - Separating: the cards are sorted by worth, best first (ties in the engine's order), and dealt one by one to the pile with the lower total so far (the first pile on a tie): two
 *    piles of similar worth, so the other player's choice costs the agent as little as possible. A land is worth a little (two), any other card its mana value (at least one), a
 *    creature a quarter of its power plus toughness more.
 *  - Choosing: the pile that is worth more goes where the agent wants the better cards (its own hand), the other where the text puts it; when the chooser is not the player who
 *    receives the piles (the controller separated) the agent gives them the pile that is worth less. A tie takes pile 1.
 */
import type {
  Action,
  ChooseCardsDecision,
  ChooseOptionDecision,
  GameView,
  ObjectId,
  ObjectView,
} from '@commander-arena/engine';
import { findObject, isCreature, isLand, manaValueOf, powerOf, toughnessOf } from './casual-view';

/** What a card is worth to the player who would have it in hand. */
export function pileCardWorth(o: ObjectView): number {
  if (isLand(o)) return 2;
  return Math.max(manaValueOf(o), 1) + (isCreature(o) ? (powerOf(o) + toughnessOf(o)) / 4 : 0);
}

/** The objects the view shows for these cards (the decision's cards first, then anywhere else the view has them). */
function seenBy(view: GameView): (id: ObjectId) => ObjectView | undefined {
  const seen = new Map<ObjectId, ObjectView>((view.pendingCards ?? []).map((o) => [o.id, o]));
  return (id) => seen.get(id) ?? findObject(view, id);
}

/** Which cards form pile 1: the best cards dealt to the lighter pile, so the piles weigh about the same. */
export function chooseSeparation(view: GameView, d: ChooseCardsDecision): Action {
  const seen = seenBy(view);
  const ranked = d.legal
    .map((id, index) => {
      const o = seen(id);
      return { id, index, worth: o === undefined ? 0 : pileCardWorth(o) };
    })
    .sort((a, b) => b.worth - a.worth || a.index - b.index);
  const first: ObjectId[] = [];
  let firstWorth = 0;
  let secondWorth = 0;
  for (const card of ranked) {
    if (firstWorth <= secondWorth) {
      first.push(card.id);
      firstWorth += card.worth;
    } else {
      secondWorth += card.worth;
    }
  }
  return { kind: 'chooseCards', objects: d.legal.filter((id) => first.includes(id)) };
}

/** Which pile goes where: the better pile where the agent wants the better cards. */
export function choosePile(view: GameView, d: ChooseOptionDecision): Action {
  const [pile1, pile2] = d.options;
  if (pile1 === undefined || pile2 === undefined || d.piles === undefined) {
    throw new Error('a pile choice with no piles');
  }
  const seen = seenBy(view);
  const worth = (ids: readonly ObjectId[]): number =>
    ids.reduce((sum, id) => {
      const o = seen(id);
      return sum + (o === undefined ? 0 : pileCardWorth(o));
    }, 0);
  const better = worth(d.piles.second) > worth(d.piles.first) ? 2 : 1;
  // The player the cards go to gets the better pile in the hand; when that is somebody else, they get the worse one.
  const handGetsBetter = d.piles.receiver === d.seat;
  const handPile = handGetsBetter ? better : better === 1 ? 2 : 1;
  // The pile chosen goes to `chosenTo`: choose the pile that must go to the hand, or the other when the chosen pile goes to the graveyard.
  const chosen = d.piles.chosenTo === 'hand' ? handPile : handPile === 1 ? 2 : 1;
  return { kind: 'chooseOption', option: chosen === 1 ? pile1 : pile2 };
}
