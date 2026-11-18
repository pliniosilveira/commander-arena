/**
 * The words of the question "which pile goes where" (D-303, CR 700.3, `chooseOption` of purpose `pile`): the title, the prompt and the label of each pile. Pure, so the
 * wording is unit tested without a DOM; `PilesDialog.tsx` draws what these return. The pile chosen goes to `chosenTo` and the other to `otherTo`, both of `receiver`: the
 * player who is asked ("your hand") or, when the player who separated is the one that receives and an opponent chooses, "their hand".
 */
import type { ChooseOptionDecision, ObjectId } from '@commander-arena/engine';

type Piles = NonNullable<ChooseOptionDecision['piles']>;

/** "your hand", "their graveyard". */
function place(piles: Pick<Piles, 'receiver'>, seat: number, where: 'hand' | 'graveyard'): string {
  return `${piles.receiver === seat ? 'your' : 'their'} ${where}`;
}

/** "Pick a pile to put into your hand", "Pick a pile to put into their graveyard". */
export function pileTitle(d: Pick<ChooseOptionDecision, 'seat'> & { piles: Piles }): string {
  return `Pick a pile to put into ${place(d.piles, d.seat, d.piles.chosenTo)}`;
}

/** The line under the title: where the other pile goes, and that the cards are still in the library. */
export function pilePrompt(d: Pick<ChooseOptionDecision, 'seat'> & { piles: Piles }): string {
  // D-651 (CR 700.3c): piles of exiled cards stay in exile while they are chosen between; the controller may then cast a spell from the other pile.
  if (d.piles.zone === 'exile') {
    return 'The cards are exiled. The pile you choose goes into the graveyard; its owner looks at the other pile, may cast a spell from it for free and puts the rest into their hand.';
  }
  return `The other pile goes into ${place(d.piles, d.seat, d.piles.otherTo)}. The cards are revealed and still in the library.`;
}

/** "Pile 1 (2 cards)", "Pile 2 (no cards)". */
export function pileLabel(n: 1 | 2, cards: readonly ObjectId[], faceDownCount?: number): string {
  const cardCount = faceDownCount ?? cards.length;
  const count = cardCount === 0 ? 'no cards' : `${cardCount} card${cardCount === 1 ? '' : 's'}`;
  return `Pile ${n} (${count})`;
}

/** The option of the engine for a pile. */
export const pileOption = (n: 1 | 2): string => (n === 1 ? 'pile1' : 'pile2');
