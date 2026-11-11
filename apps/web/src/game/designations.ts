/**
 * The designations of the game that the board shows as small cards beside the permanents (issue 84,
 * D-243): the monarch (CR 725) and the Ring (CR 701.54c). Neither is an object of the engine's view
 * (the monarch is `GameView.monarch`, a seat; the Ring is `SeatView.ringTempted`, a count), so the page
 * builds an object of the view's own shape for each, with an id that no real object has, so the card
 * preview, the hover and the pin treat them like any card. Emblems that an effect made (CR 114, D-201)
 * are real objects of the command zone and need none. Nothing here is a card: no type, no mana cost,
 * no colour (CR 114.3).
 */
import type { GameView, ObjectId, ObjectView, SeatId } from '@commander-arena/engine';

/** What a small card of the strip is. */
export type DesignationKind = 'monarch' | 'ring';

/**
 * Ids of the engine's objects are `o<number>` from 0; a negative number is never one of them, so these
 * cannot name an object of the view: `o-1` is the monarch, `o-100` and up the Ring of seat 0, 1, ...
 */
const RING_BASE = 100;

/** The id of the monarch card (there is one monarch at a time, CR 725.3). */
export const MONARCH_ID: ObjectId = 'o-1';

/** The id of the Ring card of a seat. */
export const ringId = (seat: SeatId): ObjectId => `o${-(RING_BASE + seat)}`;

/** The kind of a designation id, or null for the id of a real object. */
export function designationKind(id: ObjectId): DesignationKind | null {
  if (id === MONARCH_ID) return 'monarch';
  const at = /^o-(\d+)$/.exec(id);
  return at !== null && Number(at[1]) >= RING_BASE ? 'ring' : null;
}

/** The name the monarch card carries (and the card that Scryfall knows it by). */
export const MONARCH_CARD_NAME = 'The Monarch';

/** The name of the Ring's emblem (CR 701.54c: "an emblem named The Ring"). */
export const RING_CARD_NAME = 'The Ring';

/**
 * The two inherent triggered abilities of the monarch, as CR 725.2 gives their full texts
 * ("At the beginning of the monarch's end step, that player draws a card" and "Whenever a creature deals
 * combat damage to the monarch, its controller becomes the monarch.").
 */
export const MONARCH_TEXT: readonly string[] = [
  "At the beginning of the monarch's end step, that player draws a card.",
  'Whenever a creature deals combat damage to the monarch, its controller becomes the monarch.',
];

/**
 * The abilities of the Ring at `tempted` temptations, from the words of CR 701.54c: the first always,
 * the others "as long as the Ring has tempted that player two, three, four or more times".
 */
export function ringText(tempted: number): readonly string[] {
  return [
    "Your Ring-bearer is legendary and can't be blocked by creatures with greater power.",
    ...(tempted >= 2
      ? ['Whenever your Ring-bearer attacks, draw a card, then discard a card.']
      : []),
    ...(tempted >= 3
      ? [
          "Whenever your Ring-bearer becomes blocked by a creature, the blocking creature's controller sacrifices it at end of combat.",
        ]
      : []),
    ...(tempted >= 4
      ? ['Whenever your Ring-bearer deals combat damage to a player, each opponent loses 3 life.']
      : []),
  ];
}

/** The type line of a designation card: the monarch is a designation, the Ring an emblem (CR 701.54c). */
export function designationTypeLine(kind: DesignationKind, tempted = 0): string {
  return kind === 'monarch'
    ? 'Designation'
    : `Emblem — tempted ${tempted} ${tempted === 1 ? 'time' : 'times'}`;
}

function blank(id: ObjectId, seat: SeatId, name: string, text: readonly string[]): ObjectView {
  return {
    id,
    owner: seat,
    controller: seat,
    zone: 'command',
    name,
    manaCost: null,
    supertypes: [],
    types: [],
    subtypes: [],
    colors: [],
    power: null,
    toughness: null,
    oracleText: text.join('\n'),
    tapped: false,
    damage: 0,
    counters: {},
    isCommander: false,
    summoningSick: false,
    isToken: false,
    keywords: [],
    protector: null,
    support: 'supported',
    targets: [],
  };
}

/** The object of the monarch for a view, or null while nobody is the monarch. */
export function monarchObject(view: GameView): ObjectView | null {
  return view.monarch === null
    ? null
    : blank(MONARCH_ID, view.monarch, MONARCH_CARD_NAME, MONARCH_TEXT);
}

/** The object of the Ring of a seat, or null while the Ring has not tempted it (`SeatView.ringTempted`). */
export function ringObject(view: GameView, seat: SeatId): ObjectView | null {
  const tempted = view.seats.find((s) => s.id === seat)?.ringTempted;
  if (tempted === undefined) return null;
  return { ...blank(ringId(seat), seat, RING_CARD_NAME, ringText(tempted)), emblem: true };
}

/** The object behind a designation id, for the preview of a card of the strip; null for a real id or one that no longer holds. */
export function designationObject(view: GameView, id: ObjectId): ObjectView | null {
  const kind = designationKind(id);
  if (kind === 'monarch') return monarchObject(view);
  if (kind === 'ring') return ringObject(view, Number(id.slice(2)) - RING_BASE);
  return null;
}

/** The tempted count of a Ring object (its type line says it), read from the view. */
export function ringTemptedOf(view: GameView, seat: SeatId): number {
  return view.seats.find((s) => s.id === seat)?.ringTempted ?? 0;
}
