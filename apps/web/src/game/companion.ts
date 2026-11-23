/**
 * The companion of a seat as a small card of the board (SPEC 10, CR 103.2b, 702.139). A revealed companion is outside the game until its owner brings it into their
 * hand (CR 116.2g), so it is no object of the engine's view: `SeatView.companion` carries its public card data and whether it was brought. The page builds an object of the
 * view's own shape for the preview, with an id that no real object has (the way `designations.ts` does for the monarch), so the hover treats it like any card.
 */
import type { GameView, ObjectId, ObjectView, SeatId } from '@commander-arena/engine';

/** The label of the special action that brings the companion into the hand (CR 116.2g, 702.139a): the action bar's button. */
export const BRING_COMPANION_LABEL = 'Bring your companion into your hand ({3})';

/** What the button's tooltip says: a special action, once per game, that uses no stack. */
export const BRING_COMPANION_HINT =
  'A special action: pay {3} and put your companion into your hand. Once per game, only in your main phase with the stack empty; it does not use the stack and cannot be responded to.';

/** `o-10` is the companion of seat 0, `o-11` of seat 1, ...: below the Ring's ids (`o-100` and up, `designations.ts`) and apart from the monarch's `o-1`. */
const COMPANION_BASE = 10;

/** The id of the companion card of a seat. */
export const companionId = (seat: SeatId): ObjectId => `o${-(COMPANION_BASE + seat)}`;

/** The seat whose companion an id names, or null for the id of anything else. */
export function companionSeatOf(id: ObjectId): SeatId | null {
  const at = /^o-(\d+)$/.exec(id);
  if (at === null) return null;
  const n = Number(at[1]);
  return n >= COMPANION_BASE && n < 100 ? n - COMPANION_BASE : null;
}

/** What the chip says about the companion's state: it is outside the game, or it was brought and is an ordinary card now. */
export function companionState(brought: boolean): string {
  return brought ? 'Used: brought into the game' : 'Companion';
}

/** The object of a seat's companion for the preview, or null when the seat has none. */
export function companionObject(view: GameView, seat: SeatId): ObjectView | null {
  const companion = view.seats.find((s) => s.id === seat)?.companion;
  if (companion === undefined) return null;
  return {
    id: companionId(seat),
    owner: seat,
    controller: seat,
    zone: 'outside the game',
    name: companion.name,
    manaCost: companion.manaCost,
    supertypes: companion.supertypes,
    types: companion.types,
    subtypes: companion.subtypes,
    colors: companion.colors,
    power: companion.power,
    toughness: companion.toughness,
    oracleText: companion.oracleText,
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
