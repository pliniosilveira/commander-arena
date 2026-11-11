/**
 * What a card in a graveyard does from there (D-151, CR 113.6b, 604.2): the static abilities and the triggered abilities marked
 * `functionsIn: 'graveyard'` ("As long as this card is in your graveyard and you control a Mountain, creatures you control have haste",
 * "Whenever a Dragon you control enters, you may pay {R}. If you do, return this card from your graveyard to your hand"), and the
 * permission to cast it from there. Read from the printed face, in words composed from the AST, never from a card name; an ability the
 * words cannot say is left out, so the card's Oracle text stays the only description of it (AGENTS.md "Honesty"). Pure.
 */
import type { Ability, ObjectView } from '@commander-arena/engine';
import { graveyardGist, triggerCondition } from '../ui/decisions/ability-label';
import { nounOfTypes } from './artifacts-text';
import { lordWordings } from './static-text';

const lower = (text: string): string => text.charAt(0).toLowerCase() + text.slice(1);

/** True for an ability the card has while it is in a graveyard: its own permission to be cast from there, or one marked `functionsIn`. */
function worksInGraveyard(ability: Ability): boolean {
  if (ability.kind === 'static') {
    return ability.static.kind === 'castFromGraveyard' || ability.functionsIn === 'graveyard';
  }
  return ability.kind === 'triggered' && ability.functionsIn === 'graveyard';
}

/** The sentences, each with its period, of what the card `object` does from a graveyard; empty when it does nothing there. */
export function graveyardWordings(
  abilities: readonly Ability[],
  object: Pick<ObjectView, 'name' | 'types' | 'subtypes' | 'oracleText'>,
): readonly string[] {
  const here = abilities.filter(worksInGraveyard);
  const statics = lordWordings(
    here.filter((a) => a.kind === 'static'),
    { noun: nounOfTypes(object.types), zone: 'graveyard' },
  );
  const triggered = here.flatMap((a) => {
    if (a.kind !== 'triggered') return [];
    const when = triggerCondition(a, object.name, object, false);
    const gist = graveyardGist(a);
    return when === null || gist === '' ? [] : [`${when}, ${lower(gist)}.`];
  });
  return [...statics, ...triggered];
}
