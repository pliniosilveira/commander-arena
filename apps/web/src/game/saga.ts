/**
 * Saga words for the page (CR 714): Roman numerals for chapter numbers, the lore badge text, and
 * the chapter name of an ability on the stack. Everything is read from what the engine's view and
 * events already carry (`ObjectView.finalChapter`, `ObjectView.chapter`, `counters.lore`,
 * `abilityTriggered.chapter`); nothing is derived from a card's name or text.
 */
import type { GameObject, GameState, ObjectId, ObjectView } from '@commander-arena/engine';

const NUMERALS: readonly (readonly [number, string])[] = [
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
];

/** "I", "II", "IV", "X": a chapter symbol's Roman numeral (CR 714.2a). Non-positive: the digits. */
export function romanNumeral(n: number): string {
  if (!Number.isInteger(n) || n < 1) return String(n);
  let rest = n;
  let out = '';
  for (const [value, symbol] of NUMERALS) {
    while (rest >= value) {
      out += symbol;
      rest -= value;
    }
  }
  return out;
}

/** "Lore 1 / 3" for a Saga with chapter abilities on the battlefield, otherwise null. */
export function loreBadge(o: Pick<ObjectView, 'counters' | 'finalChapter'>): string | null {
  if (o.finalChapter === undefined) return null;
  return `Lore ${o.counters.lore ?? 0} / ${o.finalChapter}`;
}

/** "chapter II" for a chapter ability on the stack, otherwise null. */
export function chapterWord(chapter: number | undefined): string | null {
  return chapter === undefined ? null : `chapter ${romanNumeral(chapter)}`;
}

/** The stack label of an object: "Rite of Three — chapter II" for a chapter ability, else its name. */
export function stackLabel(o: Pick<ObjectView, 'name' | 'chapter'>): string {
  const word = chapterWord(o.chapter);
  return word === null ? o.name : `${o.name} — ${word}`;
}

/**
 * The lore counters a Saga has in `state`, or null when the object is not a Saga (or is gone).
 * The Saga subtype is read from the object's characteristics, so a lore counter on any other
 * permanent is worded as an ordinary counter.
 */
export function loreCountIn(state: GameState, id: ObjectId): number | null {
  const obj: GameObject | undefined = state.objects[id];
  if (obj === undefined) return null;
  // CR 708.2 (D-965): a face-down permanent has no subtypes: it is no Saga to anyone.
  if (obj.faceDown !== undefined) return null;
  let subtypes: readonly string[] = [];
  if (obj.token !== null) {
    subtypes = obj.token.characteristics.subtypes ?? [];
  } else if (obj.card !== null) {
    const card = state.cards[obj.card];
    const def = card === undefined ? undefined : state.definitions[card.definition];
    subtypes = def?.faces?.[obj.face]?.subtypes ?? [];
  }
  return subtypes.includes('Saga') ? (obj.counters.lore ?? 0) : null;
}
