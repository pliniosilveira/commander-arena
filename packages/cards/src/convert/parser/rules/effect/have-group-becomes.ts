/**
 * Effect rule of the Most Wanted deck, group 2 (mana and Treasure): the words after "you may" of Vihaan, Goldwaker, "you may have Treasures you control become 3/3 Construct Assassin
 * artifact creatures in addition to their other types until end of turn." (CR 613.1d, 613.4b, 205.1b, 611.2c, 611.2a).
 */
import { literal, pattern, sequence } from '../../combinators';
import type { IrBasePt, IrDuration, IrNoun, IrTypeList } from '../../ir/types';
import { defineRule, family, spanned } from '../registry';
import { CREATURE_TYPE_LIST } from './becomes';
import { type Clauses, makeClause } from './operands';

const ID = 'effect.have-group-become';

/**
 * `effect.have-group-become`: "have Treasures you control become 3/3 Construct Assassin artifact creatures in addition to their other types until end of turn" (CR 613.1d: the
 * types are added, layer 4; CR 613.4b: the base power and toughness are set, layer 7b; CR 205.1b: "in addition to their other types" keeps every type they have; CR 611.2c: the group
 * is the permanents it names as the effect begins; CR 611.2a: the duration). The instruction is optional by its "you may", which the sentence reads. The engine's group `setTypes` with
 * the creature types, the card types and `basePt` as one effect. Not read: one object ("have target artifact become"), a color, no creature type, no numbers, "all" or "each",
 * a duration other than the ones the duration family reads, a missing "in addition to their other types" (the types would be replaced).
 */
export const EFFECT_HAVE_GROUP_BECOME = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['have'],
  cites: [
    'CR 613.1d (Interaction of Continuous Effects)',
    'CR 613.4b (Interaction of Continuous Effects)',
    'CR 205.1b (Type Line)',
    'CR 611.2c (Continuous Effects)',
    'CR 611.2a (Continuous Effects)',
  ],
  examples: [
    'have Treasures you control become 3/3 Construct Assassin artifact creatures in addition to their other types until end of turn',
    'have Treasures you control become 2/2 Construct artifact creatures in addition to their other types until end of turn',
  ],
  rejects: [
    'have Treasures you control become 3/3 Construct Assassin artifact creatures in addition to their other types',
    'have Treasures you control become 3/3 Construct Assassin artifact creatures until end of turn',
    'have Treasures you control become Construct Assassin artifact creatures in addition to their other types until end of turn',
    'have Treasures you control become 3/3 artifact creatures in addition to their other types until end of turn',
    'have Treasures you control become 3/3 Construct Assassin artifact creatures in addition to their other types until your next turn',
    'have target Treasure become 3/3 Construct Assassin artifact creatures in addition to their other types until end of turn',
    'have each Treasure you control become 3/3 Construct Assassin artifact creatures in addition to their other types until end of turn',
    'have Treasures you control become 3/3 blue Construct artifact creatures in addition to their other types until end of turn',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal('have '),
      family<IrNoun>('noun', { only: ['noun.plain-permanents'] }),
      literal(' become '),
      spanned(pattern(/(\d+)\/(\d+) /u)),
      spanned(CREATURE_TYPE_LIST),
      pattern(/ artifact creatures in addition to their other types(?![\p{L}\p{N}])/iu),
      literal(' '),
      family<IrDuration>('duration'),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, subject, , numbers, types, , , duration] = r.value;
    const span = { start: numbers.span.start, end: r.pos };
    const basePt: IrBasePt = {
      kind: 'basePt',
      power: Number(numbers.value[1]),
      toughness: Number(numbers.value[2]),
      span: numbers.span,
      rule: ID,
    };
    const typeList: IrTypeList = {
      kind: 'typeList',
      subtypes: types.value,
      cardTypes: ['artifact', 'creature'],
      additive: true,
      span: types.span,
      rule: ID,
    };
    const clause = makeClause(ID, 'becomes', { objects: subject, types: typeList, basePt }, span);
    return { ok: true, value: [{ ...clause, duration }], pos: r.pos };
  },
});

export const HAVE_GROUP_BECOMES_RULES = [EFFECT_HAVE_GROUP_BECOME];
