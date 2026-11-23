/**
 * "As you cast this spell" amounts (`asCast`, Lifestream's Blessing; CR 601.2i, 107.3c): the number is worked out once, when the spell becomes cast, and the spell keeps it
 * (`StackData.castAmount`); `amountOf` reads it back as the spell resolves.
 */
import type { Amount } from '../ast/types';
import type { SeatId } from '../ids';
import type { GameObject, GameState } from '../state/types';
import { amountOf } from './amounts';
import { faceOf } from './legality';

/** The first `asCast` amount in a piece of a card's AST (an effect, a mode): effects are plain data, so a walk over its fields finds it. */
function findAsCast(node: unknown): Extract<Amount, { kind: 'asCast' }> | null {
  if (node === null || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findAsCast(item);
      if (found !== null) return found;
    }
    return null;
  }
  const record = node as { readonly kind?: unknown };
  if (record.kind === 'asCast') return node as Extract<Amount, { kind: 'asCast' }>;
  for (const value of Object.values(node)) {
    const found = findAsCast(value);
    if (found !== null) return found;
  }
  return null;
}

/**
 * The number the `asCast` amount of the spell's text has now, as the spell becomes cast (CR 601.2i): its `of` read with the caster as "you" and the spell as the source. Undefined
 * for a spell whose text has none.
 */
export function castAmountOf(
  state: GameState,
  spell: GameObject,
  caster: SeatId,
): number | undefined {
  const found = findAsCast(faceOf(state, spell)?.spell);
  if (found === null) return undefined;
  return Math.max(0, amountOf(state, found.of, { controller: caster, source: spell.id }, []));
}
