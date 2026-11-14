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
    return {
      when,
      does:
        effect.gravestorm === true
          ? 'Copy this spell for each permanent put into a graveyard from the battlefield this turn.'
          : 'Copy this spell for each other spell cast before it this turn.',
    };
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

/**
 * "Copy that spell. You may choose new targets for the copy." and, with a count, "Copy it for each time you've cast your commander from the command
 * zone this game. You may choose new targets for the copies." (CR 707.10, 707.10c, 903.8; D-337): the effect `copySpell`. `spell` is how the spell is
 * named ("that spell", "this spell", a target), and `count` the words of the amount when the copies are counted, null for the one copy.
 */
export function copySpellWords(
  spell: string,
  newTargets: 'may' | 'no',
  count: string | null,
): string {
  const copies = count === null ? '' : ` for each ${count}`;
  const choice =
    newTargets === 'may'
      ? `. You may choose new targets for the cop${count === null ? 'y' : 'ies'}`
      : '';
  return `Copy ${spell}${copies}${choice}`;
}

/**
 * "Copy that spell for each other creature you control that the spell could target. Each copy targets a different one of those creatures." and "That player copies that spell for each other
 * creature they control that the spell could target. ..." (CR 707.10, 707.10e; D-438): the effect `copySpell` with `forEach`. `spell` is how the spell is named ("that spell"), `theirs`
 * whether the player the trigger is about copies it.
 */
export function copyForEachWords(spell: string, theirs: boolean): string {
  const copier = theirs ? 'That player copies' : 'Copy';
  const control = theirs ? 'they' : 'you';
  return `${copier} ${spell} for each other creature ${control} control that the spell could target. Each copy targets a different one of those creatures`;
}

/**
 * "When you next cast an instant or sorcery spell this turn, copy that spell" (CR 603.7, 603.7a; D-336): the delayed triggered ability a spell or ability
 * creates. `spell` is the spell the filter names ("an instant or sorcery spell"), `does` what the ability does.
 */
export function delayedCastWords(spell: string, does: string): string {
  return `When you next cast ${spell} this turn, ${does.charAt(0).toLowerCase()}${does.slice(1)}`;
}
