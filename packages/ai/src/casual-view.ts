/**
 * Small readers over a `GameView` shared by the CasualAgent heuristics. An agent only ever sees a
 * view, so everything here works from `ObjectView` and `SeatView`.
 */
import { type GameView, manaValue, type ObjectView } from '@commander-arena/engine';

export const isCreature = (o: ObjectView): boolean => o.types.includes('creature');
export const isLand = (o: ObjectView): boolean => o.types.includes('land');
export const hasKeyword = (o: ObjectView, keyword: string): boolean => o.keywords.includes(keyword);
export const powerOf = (o: ObjectView): number => o.power ?? 0;
export const toughnessOf = (o: ObjectView): number => o.toughness ?? 0;

/** Mana value from the printed cost (CR 202.3). Commander tax is not included. */
export const manaValueOf = (o: ObjectView): number =>
  o.manaCost === null ? 0 : manaValue(o.manaCost);

/**
 * The object as it would be if `face` of its card were up: a card with several faces (split,
 * Adventure, double-faced) is judged as the face a cast or land option names, since the view shows
 * a card in hand as its front face, or as both halves of a split card combined. The faces carry
 * printed values only, so a face that is not the front shows no current power or toughness.
 */
export function asFace(obj: ObjectView, face: number | undefined): ObjectView {
  if (face === undefined) return obj;
  const printed = obj.faces?.[face];
  if (printed === undefined) return obj;
  return {
    ...obj,
    name: printed.name,
    manaCost: printed.manaCost,
    supertypes: printed.supertypes,
    types: printed.types,
    subtypes: printed.subtypes,
    colors: printed.colors,
    power: typeof printed.power === 'number' ? printed.power : null,
    toughness: typeof printed.toughness === 'number' ? printed.toughness : null,
    oracleText: printed.oracleText,
    face,
  };
}

/** The viewer's own hand (empty if the view hides it, which it never does for the viewer). */
export function ownHand(view: GameView): readonly ObjectView[] {
  return view.seats.find((s) => s.id === view.viewer)?.hand ?? [];
}

export function ownCommandZone(view: GameView): readonly ObjectView[] {
  return view.seats.find((s) => s.id === view.viewer)?.command ?? [];
}

/**
 * The life a cost pays when it is a fixed number (D-135): a payment equal to a count ("equal to the number of colors in your
 * commanders' color identity") is worked out by the engine as the ability is activated and is not on a card's view, so the
 * agent reads it as 0 here; only an activated ability has one, and the agent leaves those alone unless it knows the shape.
 */
export function fixedLifeOf(cost: { readonly kind: string; readonly amount?: unknown }): number {
  return cost.kind === 'payLife' && typeof cost.amount === 'number' ? cost.amount : 0;
}

export function ownLife(view: GameView): number {
  return view.seats.find((s) => s.id === view.viewer)?.life ?? 0;
}

/** Life of the opposing seat with the least life (v1 has exactly one opponent). */
export function opponentLife(view: GameView): number {
  const lives = view.seats.filter((s) => s.id !== view.viewer && !s.hasLost).map((s) => s.life);
  return lives.length === 0 ? Number.POSITIVE_INFINITY : Math.min(...lives);
}

/** An object anywhere the view shows it: battlefield, stack, exile, graveyards, hand, command. */
export function findObject(view: GameView, id: string): ObjectView | undefined {
  const pools: (readonly ObjectView[])[] = [view.battlefield, view.stack, view.exile];
  // D-151: the top card of the library, when its controller may look at it and may cast it from there.
  for (const seat of view.seats) {
    pools.push(
      seat.graveyard,
      seat.command,
      seat.hand ?? [],
      seat.libraryTop ? [seat.libraryTop] : [],
    );
  }
  for (const pool of pools) {
    const found = pool.find((o) => o.id === id);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** Creatures on the battlefield controlled by seats other than the viewer. */
export function opposingCreatures(view: GameView): ObjectView[] {
  return view.battlefield.filter((o) => o.controller !== view.viewer && isCreature(o));
}

export function ownCreatureCount(view: GameView): number {
  return view.battlefield.filter((o) => o.controller === view.viewer && isCreature(o)).length;
}

/** The mana value of what casting the card costs now, from the view's `castCost` (else the printed cost). */
export function effectiveCost(o: ObjectView): number {
  return o.castCost === undefined ? manaValueOf(o) : manaValue(o.castCost);
}
