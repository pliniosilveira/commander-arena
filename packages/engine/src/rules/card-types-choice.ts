/**
 * "You may exile any number of cards from your graveyard with four or more card types among them" (`ChooseSelector.minCardTypes`, CR 205.2a, 608.2d): a constraint on the
 * whole set of cards chosen, not on each card. The answer is legal when it is empty (the player says no) or when the cards chosen together have at least `count` different card
 * types; the card types of a card are the ones the decision lists for it (a supertype or a subtype is no card type).
 */
import type { ObjectId } from '../ids';

type CardTypes = Readonly<Record<ObjectId, readonly string[]>>;

/** The different card types the cards have between them. */
function typesAmong(chosen: readonly ObjectId[], types: CardTypes): number {
  const seen = new Set<string>();
  for (const id of chosen) for (const t of types[id] ?? []) seen.add(t);
  return seen.size;
}

/** Whether the cards chosen are a legal answer: none, or at least `count` different card types among them. */
export function coversCardTypes(
  chosen: readonly ObjectId[],
  need: { readonly count: number; readonly types: CardTypes },
): boolean {
  return chosen.length === 0 || typesAmong(chosen, need.types) >= need.count;
}

/** Most combinations `cardTypeCovers` tries before it stops looking for more (the candidates are in a graveyard, which may hold dozens of cards). */
const MAX_TRIED = 200_000;

/**
 * The answers worth listing for a choice with a card type minimum (the answers the AI and the tests pick from; any legal answer is accepted all the same, so a person can choose
 * every other set): nothing, the small sets that reach the minimum (cards in the order of `legal`, each one adding a card type the ones before it do not have, so that no
 * card is there for nothing; at most `limit` of them) and everything that qualifies. The small sets are the ones that matter: a set with a card more only loses a card from
 * the graveyard for nothing, and every set that reaches the minimum contains one of them or is bigger by cards that add nothing.
 */
export function cardTypeCovers(
  legal: readonly ObjectId[],
  need: { readonly count: number; readonly types: CardTypes },
  limit: number,
): ObjectId[][] {
  const out: ObjectId[][] = [[]];
  const chosen: ObjectId[] = [];
  const have = new Map<string, number>();
  let tried = 0;
  const walk = (start: number): void => {
    if (have.size >= need.count) {
      out.push([...chosen]);
      return;
    }
    for (let i = start; i < legal.length; i += 1) {
      if (out.length >= limit - 1 || tried >= MAX_TRIED) return;
      tried += 1;
      const id = legal[i] as ObjectId;
      const fresh = (need.types[id] ?? []).filter((t) => !have.has(t));
      if (fresh.length === 0) continue;
      chosen.push(id);
      for (const t of need.types[id] ?? []) have.set(t, (have.get(t) ?? 0) + 1);
      walk(i + 1);
      for (const t of need.types[id] ?? []) {
        const n = (have.get(t) ?? 1) - 1;
        if (n === 0) have.delete(t);
        else have.set(t, n);
      }
      chosen.pop();
    }
  };
  walk(0);
  const all = [...legal];
  if (!out.some((c) => c.length === all.length)) out.push(all);
  return out;
}
