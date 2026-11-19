/**
 * CasualAgent choice of "any number of cards from your graveyard with four or more card types among them" (`chooseCards` with `minCardTypes`, CR 205.2a, Winter, Cynical Opportunist):
 * the smallest set of cards that reaches the minimum, so that as little of the graveyard as possible is lost, and one that holds the best permanent card of the graveyard, because the
 * effect then puts one permanent card of the cards exiled onto the battlefield (the choice after this one takes the most expensive). Deliberately simple, as the other choices.
 */
import type { ChooseCardsDecision, GameView, ObjectId } from '@commander-arena/engine';
import { findObject, manaValueOf } from './casual-view';

const PERMANENT_TYPES: readonly string[] = [
  'artifact',
  'creature',
  'enchantment',
  'land',
  'planeswalker',
  'battle',
];

/** How many card types the cards have between them, by the types the decision lists for each. */
function typeCount(ids: readonly ObjectId[], types: Readonly<Record<ObjectId, readonly string[]>>) {
  const seen = new Set<string>();
  for (const id of ids) for (const t of types[id] ?? []) seen.add(t);
  return seen.size;
}

/** The cards to exile, in the order of `d.legal`, or none when the minimum cannot be reached (the question is not asked then). */
export function chooseCardTypeCover(view: GameView, d: ChooseCardsDecision): ChooseCardsAnswer {
  const need = d.minCardTypes;
  if (need === undefined) return { kind: 'chooseCards', objects: [] };
  const value = (id: ObjectId): number => {
    const o = findObject(view, id);
    return o === undefined ? 0 : manaValueOf(o);
  };
  const isPermanent = (id: ObjectId): boolean =>
    (need.types[id] ?? []).some((t) => PERMANENT_TYPES.includes(t));
  // The card to put onto the battlefield: the most expensive permanent card, the first of them on a tie.
  const seed = d.legal
    .map((id, index) => ({ id, index, mv: value(id) }))
    .filter((c) => isPermanent(c.id))
    .sort((a, b) => b.mv - a.mv || a.index - b.index)[0]?.id;
  const chosen: ObjectId[] = seed === undefined ? [] : [seed];
  while (typeCount(chosen, need.types) < need.count) {
    // The card that adds the most card types, the cheapest of them (the least loss) on a tie.
    const next = d.legal
      .map((id, index) => ({
        id,
        index,
        fresh: typeCount([...chosen, id], need.types) - typeCount(chosen, need.types),
        mv: value(id),
      }))
      .filter((c) => !chosen.includes(c.id) && c.fresh > 0)
      .sort((a, b) => b.fresh - a.fresh || a.mv - b.mv || a.index - b.index)[0];
    if (next === undefined) return { kind: 'chooseCards', objects: [] };
    chosen.push(next.id);
  }
  // A card that a later, wider one made unnecessary goes back (the card to put onto the battlefield stays).
  for (const id of [...chosen].reverse()) {
    if (id === seed) continue;
    const without = chosen.filter((c) => c !== id);
    if (typeCount(without, need.types) >= need.count) chosen.splice(chosen.indexOf(id), 1);
  }
  return { kind: 'chooseCards', objects: d.legal.filter((id) => chosen.includes(id)) };
}

type ChooseCardsAnswer = { readonly kind: 'chooseCards'; readonly objects: readonly ObjectId[] };
