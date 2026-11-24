/**
 * "~ is also a Cleric, Rogue, Warrior, and Wizard." (Burakos, Party Leader; CR 205.1b, 205.3m, 613.1d): creature types the permanent has as well as its own, in layer 4. The same
 * engine static ability as "Other creatures you control are Juggernauts in addition to their other creature types" (`setTypes` with named subtypes), said of the card itself.
 */
import { fail, pattern } from '../../combinators';
import type { IrNoun, IrStatic } from '../../ir/types';
import { readCreatureType } from '../noun/creature-types';
import { defineRule } from '../registry';

/** Creature types in the singular, written as a list: "A", "A and B", "A, B, and C". */
const LIST =
  /([A-Z][a-z]+(?:-[A-Z][a-z]+)?(?:(?:, [A-Z][a-z]+(?:-[A-Z][a-z]+)?)*,? and [A-Z][a-z]+(?:-[A-Z][a-z]+)?)?)/u;

/**
 * `static.self-also-types`: "~ is also a Cleric, Rogue, Warrior, and Wizard." One or more creature types of the table in the singular, joined as English joins a list. Not read: "is
 * also an", the plural, a type that is not a creature type, a repeated type, "or", a list with no "and" before the last type, another subject, no final period.
 */
export const STATIC_SELF_ALSO_TYPES = defineRule<IrStatic>({
  id: 'static.self-also-types',
  family: 'static',
  leading: ['~'],
  cites: [
    'CR 205.1b (Card Types)',
    'CR 205.3m (Subtypes)',
    'CR 613.1d (Interaction of Continuous Effects)',
  ],
  examples: [
    '~ is also a Cleric, Rogue, Warrior, and Wizard.',
    '~ is also a Wizard.',
    '~ is also a Cleric and Rogue.',
    '~ is also a Rogue and Warrior.',
  ],
  rejects: [
    '~ is also a Cleric, Rogue, Warrior, and Wizard',
    '~ is also a Clerics.',
    '~ is also a Cleric, Rogue, Warrior, or Wizard.',
    '~ is also a Cleric, Rogue, Warrior, Wizard.',
    '~ is also a Cleric, Cleric, and Rogue.',
    '~ is also a Goblinoid.',
    '~ is also a Cleric Rogue.',
    '~ is a Cleric.',
    'Other creatures you control are also a Cleric.',
  ],
  parse: (ctx, pos) => {
    const head = pattern(/~ is also an? /u)(ctx, pos);
    if (!head.ok) return head;
    const list = pattern(LIST)(ctx, head.pos);
    if (!list.ok) return list;
    const end = pattern(/\./u)(ctx, list.pos);
    if (!end.ok) return end;
    const words = (list.value[1] ?? '').split(/, and |, | and /u);
    const subtypes = words.map((w) => readCreatureType(w));
    // One reading of each word: a creature type of the table, in the singular, none twice.
    if (
      subtypes.some((s) => s === undefined || s.plural === true) ||
      new Set(words).size !== words.length ||
      (words.length > 2 && !/, and [^,]+$/u.test(list.value[1] ?? '')) ||
      (words.length === 2 && /,/u.test(list.value[1] ?? ''))
    ) {
      return fail(ctx, pos);
    }
    const span = { start: pos, end: end.pos };
    const subject: IrNoun = {
      kind: 'noun',
      det: 'self',
      filter: { raw: '~' },
      upTo: false,
      plural: false,
      other: false,
      span,
      rule: 'static.self-also-types',
    };
    return {
      ok: true,
      value: {
        kind: 'static',
        subject,
        effects: [{ kind: 'addTypes', subtypes: subtypes.map((s) => s?.type ?? '') }],
        span,
        rule: 'static.self-also-types',
      },
      pos: end.pos,
    };
  },
});

export const ALSO_TYPES_STATIC_RULES = [STATIC_SELF_ALSO_TYPES];
