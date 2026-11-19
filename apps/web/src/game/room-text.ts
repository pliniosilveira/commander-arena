/**
 * The words of Rooms (CR 709.5): the special action of unlocking a locked half (CR 709.5e), the log line of an unlock (CR 709.5h) and the facts of a Room in the preview. Built only
 * from the view (`ObjectView.faces` and `unlockedDoors`) and the engine's cost, never from a card's name or Oracle text.
 */
import type { ObjectView } from '@commander-arena/engine';

/** The mana symbols as the card prints them: "{2}{B}". */
const manaText = (cost: readonly string[]): string => cost.map((s) => `{${s}}`).join('');

/** The name of the half `door` of a Room (0 the left half, 1 the right half), from the view of the permanent. */
export function doorName(card: ObjectView | undefined, door: number): string {
  return card?.faces?.[door]?.name ?? (door === 0 ? 'the left half' : 'the right half');
}

/** The button of unlocking a half: "Unlock Dim Oubliette {4}{B}". A permanent whose view has no such half gets the bare words. */
export function unlockLabel(card: ObjectView | undefined, door: number): string {
  const cost = card?.faces?.[door]?.manaCost;
  return `Unlock ${doorName(card, door)}${cost === null || cost === undefined ? '' : ` ${manaText(cost)}`}`;
}

/** The line under the button: what the action does. */
export function unlockDetail(): string {
  return 'Pay the mana cost of the locked half. It is a special action: it does not use the stack, and only in your main phase with the stack empty. The half’s name, cost and rules text count from then on, and “When you unlock this door” abilities of that half trigger.';
}

/** The prompt of the payment of unlocking a half: "Pay {4}{B} to unlock Dim Oubliette". */
export function unlockPayPrompt(
  cost: readonly string[],
  card: ObjectView | undefined,
  door: number,
): string {
  return `Pay ${manaText(cost)} to unlock ${doorName(card, door)}`;
}

/** The dock line of the payment: what happens once it is paid, and what Cancel does. */
export function unlockPayDetail(card: ObjectView | undefined, door: number): string {
  return `Once this is paid, ${doorName(card, door)} is unlocked. Cancel leaves it locked.`;
}

/** The log line of an unlock: "You unlocked Dim Oubliette." */
export function unlockedLine(who: string, door: string): string {
  return `${who} unlocked ${door}.`;
}

/**
 * What the preview says of a Room on the battlefield (CR 709.5c): which halves are unlocked and which are locked, and what a locked half costs to unlock. Empty for an
 * object that is not a Room.
 */
export function roomFacts(object: ObjectView): readonly string[] {
  const unlocked = object.unlockedDoors;
  const faces = object.faces;
  if (unlocked === undefined || faces === undefined) return [];
  return faces.map((face, door) => {
    if (unlocked.includes(door)) return `${face.name}: unlocked`;
    const cost = face.manaCost === null ? '' : ` (unlock for ${manaText(face.manaCost)})`;
    return `${face.name}: locked, no name, mana cost or rules text${cost}`;
  });
}
