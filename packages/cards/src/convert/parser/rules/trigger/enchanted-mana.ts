/**
 * Trigger rule of the Aura "Whenever enchanted land is tapped for mana, its controller adds an additional one mana of any color." (CR 106.12, 605.1b, 303.4):
 * `trigger.enchanted-tapped-for-mana`.
 */
import { fail, literal, map, pattern, sequence } from '../../combinators';
import type { IrTrigger } from '../../ir/types';
import { permanentPhrase, withoutZone } from '../noun/phrases';
import { defineRule, quietly, spanned } from '../registry';
import { makeNoun } from './subjects';

const ID = 'trigger.enchanted-tapped-for-mana';

/**
 * `trigger.enchanted-tapped-for-mana`: "enchanted land is tapped for mana" (CR 106.12: to tap a permanent for mana is to activate a mana ability of it with {T} in its cost;
 * CR 605.1b: an ability that triggers from it and adds mana is a mana ability; CR 303.4: the Aura's controller need not control the land it enchants). The land is
 * the permanent the Aura is attached to, tapped by whoever controls it. Not read: another permanent type than one word ("enchanted creature"), "for {G}" (a type of mana), "this
 * land", "a land", "enchanted lands", "you tap enchanted land".
 */
export const TRIGGER_ENCHANTED_TAPPED_FOR_MANA = defineRule<IrTrigger>({
  id: ID,
  family: 'trigger',
  leading: ['enchanted'],
  cites: ['CR 106.12 (Mana)', 'CR 605.1b (Mana Abilities)', 'CR 303.4 (Auras)'],
  examples: ['enchanted land is tapped for mana', 'enchanted Forest is tapped for mana'],
  rejects: [
    'enchanted creature is tapped for mana',
    'enchanted land is tapped for {G}',
    'enchanted land is tapped',
    'enchanted lands are tapped for mana',
    'enchanted land taps for mana',
    'a land is tapped for mana',
    'you tap enchanted land for mana',
    'enchanted land is tapped for mana and',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal('enchanted '),
      spanned(map(permanentPhrase(false, 'all'), withoutZone)),
      pattern(/ is tapped for mana(?![\p{L}\p{N}'’])/iu),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, kind] = r.value;
    // Only a land (or a land type): the permanent type the mana abilities of the Aura's host belong to.
    if (!kind.value.types?.includes('land') && !kind.value.subtypes?.length) return fail(ctx, pos);
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'tappedForMana',
        subject: makeNoun(ID, kind.span, 'a', kind.value),
        enchantedTapped: true,
        args: {},
        span: { start: pos, end: r.pos },
        rule: ID,
      },
      pos: r.pos,
    };
  },
});

export const ENCHANTED_MANA_TRIGGER_RULES = [TRIGGER_ENCHANTED_TAPPED_FOR_MANA].map(quietly);
