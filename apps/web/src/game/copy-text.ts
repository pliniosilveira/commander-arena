/**
 * Words for the two keywords that copy the spell being cast (D-129): Storm (CR 702.40a) and Replicate
 * (CR 702.56a). Both are triggered abilities of the engine's own, "When you cast this spell", on the
 * stack above the spell. Read from the AST of the ability (`ObjectView.ability`) and, for the number of
 * copies of Replicate, from the spell it came from (`ObjectView.replicated`); never from a card's name
 * or Oracle text. Pure functions, tested in `test/copies-model.test.ts`.
 *
 * Limit: the number of spells cast before a storm spell is kept in the engine's `StackData` and is not in
 * the view, so the Storm line cannot say it. The seat's `spellsCastThisTurn` is a different number once
 * more spells have been cast.
 */
import type { ObjectView, StackAbility } from '@commander-arena/engine';

/**
 * What a Storm or Replicate trigger on the stack says: "When you cast this spell" and what it does.
 * `source` is the spell it came from when that is still on the stack. Null for any other ability.
 */
export function copyAbilityWords(
  ability: StackAbility,
  source: Pick<ObjectView, 'replicated'> | undefined,
): { readonly when: string; readonly does: string } | null {
  const { effect } = ability;
  const when = 'When you cast this spell';
  if (effect.kind === 'storm') {
    return { when, does: 'Copy this spell for each other spell cast before it this turn.' };
  }
  if (effect.kind !== 'replicate') return null;
  const times = source?.replicated;
  return {
    when,
    does:
      times === undefined
        ? 'Copy this spell for each time its replicate cost was paid.'
        : `Copy this spell ${times === 1 ? 'once' : `${times} times`}.`,
  };
}
