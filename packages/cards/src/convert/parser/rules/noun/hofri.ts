/**
 * Noun rules of the Hofri Ghostforge deck (stage P68, D-230): "each permanent you control that's a creature or Vehicle" (CR 110.1, 205.2a, 611.2c).
 */
import { fail, pattern } from '../../combinators';
import type { IrFilter, IrNoun } from '../../ir/types';
import { defineRule, node } from '../registry';

const TYPES = ['artifact', 'creature', 'enchantment', 'land', 'planeswalker'];

/**
 * `noun.each-permanent-that-is`: "each permanent you control that's a creature or Vehicle": the permanents the controller has that are of one kind or the other, a card
 * type and a type of the same kind of word ("Vehicle" is an artifact type, a subtype). A group fixed as the effect resolves (CR 611.2c). Not read: another controller, "each
 * permanent that's", a third kind, the singular article, a type that is not a card type or a capitalized subtype.
 */
export const NOUN_EACH_PERMANENT_THAT_IS = defineRule<IrNoun>({
  id: 'noun.each-permanent-that-is',
  family: 'noun',
  leading: ['each'],
  cites: ['CR 110.1 (Permanents)', 'CR 205.2a (Card Types)', 'CR 611.2c (Continuous Effects)'],
  examples: [
    "each permanent you control that's a creature or Vehicle",
    'each permanent you control that’s an artifact or Vehicle',
    "each permanent you control that's a creature or planeswalker",
  ],
  rejects: [
    "each permanent that's a creature or Vehicle",
    "each permanent an opponent controls that's a creature or Vehicle",
    "each permanent you control that's a creature",
    "each permanent you control that's a creature or Vehicle or Equipment",
    "each permanent you control that's a creature or vehicle",
    "each creature you control that's a Vehicle",
  ],
  parse: node<IrFilter, IrNoun>(
    'noun.each-permanent-that-is',
    (ctx, pos) => {
      const r = pattern(
        /each permanent you control that['’]s an? (artifact|creature|enchantment|land|planeswalker) or ([A-Za-z]+)(?![\p{L}\p{N}'’])/iu,
      )(ctx, pos);
      if (!r.ok) return r;
      const first = (r.value[1] ?? '').toLowerCase();
      const second = r.value[2] ?? '';
      if (!TYPES.includes(first)) return fail(ctx, pos);
      const members: IrFilter[] = [{ types: [first], raw: first }];
      if (TYPES.includes(second.toLowerCase())) {
        if (second !== second.toLowerCase() || second.toLowerCase() === first)
          return fail(ctx, pos);
        members.push({ types: [second], raw: second });
      } else if (/^[A-Z]/.test(second)) members.push({ subtypes: [second], raw: second });
      else return fail(ctx, pos);
      return {
        ok: true,
        value: {
          zone: 'battlefield',
          controller: 'you',
          anyOf: members,
          raw: r.value[0] ?? '',
        },
        pos: r.pos,
      };
    },
    (filter) => ({
      kind: 'noun',
      det: 'each',
      filter,
      upTo: false,
      plural: true,
      other: false,
    }),
  ),
});

export const HOFRI_NOUN_RULES = [NOUN_EACH_PERMANENT_THAT_IS];
