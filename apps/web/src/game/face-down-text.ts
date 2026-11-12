/**
 * Words for face-down permanents and manifest (CR 701.40, 708, D-315). Everything here is read from the view's fields (`ObjectView.faceDown`, `faceDownBy`, `hiddenFace`,
 * `turnFaceUpCost`) and never from a card's name or Oracle text.
 *
 * Hidden information: a face-down permanent is a 2/2 creature named "Face-down creature N" to every viewer (CR 708.2, 708.6); only the player who controls it has `hiddenFace` (the
 * card) and `turnFaceUpCost`. The words below never ask for more than the view has, so the page of the other player cannot show what the card is.
 */
import type { ObjectView } from '@commander-arena/engine';
import { manaText } from './later-text';

/** True for a face-down permanent (a manifested one, CR 701.40a): its view says what made it face down. */
export function isFaceDownPermanent(o: Pick<ObjectView, 'faceDown' | 'faceDownBy'>): boolean {
  return o.faceDown === true && o.faceDownBy !== undefined;
}

/** True for a face-down permanent whose card the viewer may look at (CR 708.5): the view of the player who controls it carries the card. */
export function isOwnFaceDown(
  o: Pick<ObjectView, 'faceDown' | 'faceDownBy' | 'hiddenFace'>,
): boolean {
  return isFaceDownPermanent(o) && o.hiddenFace !== undefined;
}

/**
 * The card behind the viewer's own face-down permanent, as an object to draw (the preview panel): the characteristics of its printed face, the position of the permanent
 * (counters, damage and the rest as they are) and no face-down status. Null for every other object. The power and toughness are the card's printed ones.
 */
export function realCardOf(o: ObjectView): ObjectView | null {
  const face = o.hiddenFace;
  if (face === undefined || !isFaceDownPermanent(o)) return null;
  const { faceDown: _faceDown, faceDownBy: _by, hiddenFace: _face, ...rest } = o;
  return {
    ...rest,
    name: face.name,
    manaCost: face.manaCost,
    supertypes: face.supertypes,
    types: face.types,
    subtypes: face.subtypes,
    colors: face.colors,
    oracleText: face.oracleText,
    power: typeof face.power === 'number' ? face.power : null,
    toughness: typeof face.toughness === 'number' ? face.toughness : null,
  };
}

/** The button of turning a face-down permanent face up: "Turn face up {2}{G}". A permanent whose view has no cost gets the bare words. */
export function turnUpLabel(card: ObjectView | undefined): string {
  const cost = card?.turnFaceUpCost;
  return cost === undefined ? 'Turn face up' : `Turn face up ${manaText(cost)}`;
}

/** The line under the button: what the action does. */
export function turnUpDetail(): string {
  return 'Pay the mana cost of the card. It is the same permanent, with the card’s own characteristics; nothing enters the battlefield and it does not use the stack.';
}

/** The prompt of the payment of turning a permanent face up: "Pay {2}{G} to turn Face-down creature 1 face up". */
export function turnUpPayPrompt(cost: readonly string[], name: string): string {
  return `Pay ${manaText(cost)} to turn ${name} face up`;
}

/** The dock line of the payment: what happens once it is paid, and what Cancel does. */
export function turnUpPayDetail(name: string): string {
  return `Once this is paid, ${name} is turned face up: it becomes the card you see in the preview. Cancel keeps it face down.`;
}

/** The title of the badge on a face-down permanent. */
export function faceDownBadgeTitle(o: ObjectView): string {
  const by = o.faceDownBy === 'manifest' ? 'manifested' : 'face down';
  return isOwnFaceDown(o)
    ? `This permanent is ${by}: a 2/2 creature with no name, no types but creature, no mana cost and no abilities. Only you can look at the card (${o.hiddenFace?.name ?? 'the card'}); the preview shows it.${o.turnFaceUpCost === undefined ? ' It can’t be turned face up: it is not a creature card with a mana cost.' : ' You may turn it face up any time you have priority by paying its mana cost.'}`
    : `This permanent is ${by}: a 2/2 creature with no name, no types but creature, no mana cost and no abilities. Nobody but its controller can look at the card; it is revealed if it leaves the battlefield.`;
}

/** The log line of a manifest: "You manifest the top card of your library", "Opponent manifests the top card of your library". It names no card (CR 708.5). */
export function manifestedLine(who: 'You' | 'Opponent', yours: boolean, library: string): string {
  return `${who} ${yours ? 'manifest' : 'manifests'} the top card of ${library}.`;
}

/** The log line of turning a face-down permanent face up: the card is public from then on (CR 708.8). */
export function turnedUpLine(who: 'You' | 'Opponent', yours: boolean, name: string): string {
  return `${who} ${yours ? 'turn' : 'turns'} a face-down card face up: it is ${name}.`;
}
