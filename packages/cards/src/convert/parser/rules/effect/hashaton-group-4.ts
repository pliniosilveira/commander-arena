/**
 * Effect rules of group 4 of the Hashaton deck (issue 31, D-1120): "amass Zombies 1" (CR 701.47a), the keyword action of Gleaming Overseer. The engine runs `amass`
 * (`rules/amass.ts`). ("Until end of turn, target creature you control becomes an Avatar in addition to its other types and gains flying, first strike, lifelink, and
 * hexproof" is `effect.lead-becomes-target` of `becomes.ts`; "Zombie tokens you control" is `noun.subtype-token-permanents`.)
 */
import { fail, literal, pattern, sequence } from '../../combinators';
import type { IrArg, IrTypeList } from '../../ir/types';
import { CREATURE_TYPES } from '../noun/creature-types';
import { SUBTYPE_WORD_NUMBERED } from '../noun/subtypes';
import { defineRule, family, quietly, spanned } from '../registry';
import { type Clauses, single } from './operands';

const COUNT = family<IrArg>('amount', { only: ['amount.number', 'amount.x'] });

const ID = 'effect.amass';

/** A creature type said in the plural, as the cards write it: "Zombies", "Orcs", "Elves" (a type that is its own plural, "Merfolk", reads too). */
const PLURAL_CREATURE_TYPE = spanned((ctx, pos) => {
  const word = SUBTYPE_WORD_NUMBERED(ctx, pos);
  if (!word.ok) return word;
  return CREATURE_TYPES.has(word.value.subtype) && word.value.plural !== false
    ? { ok: true as const, value: word.value.subtype, pos: word.pos }
    : fail(ctx, pos);
});

/**
 * `effect.amass`: "amass Zombies 1", "amass Orcs 2", "amass Zombies X" (CR 701.47a: if you don't control an Army creature, create a 0/0 black [subtype] Army
 * creature token; choose an Army creature you control; put N +1/+1 counters on it; if it isn't a [subtype], it becomes one in addition to its other types).
 * The creature type is said in the plural and N is a number or X. The old form without a type ("amass 1") was given one by errata (CR 701.47d), so it is not
 * read. The engine's `amass`.
 */
export const EFFECT_AMASS = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['amass'],
  cites: ['CR 701.47a (Amass)', 'CR 701.47d (Amass)'],
  examples: [
    'amass Zombies 1',
    'Amass Zombies 2',
    'amass Orcs 3',
    'amass Zombies X',
    'amass Elves 1',
    'amass Zombies two',
  ],
  rejects: [
    'amass 1',
    'amass Zombie 1',
    'amass Zombies',
    'amass Zombies and Orcs 1',
    'amass Zombies 1 times',
    'amass Treasures 1',
    'amass zombies 1',
    'amassed Zombies 1',
    'amass the Zombies 1',
    'amass Zombies minus 1',
  ],
  parse: single(
    ID,
    sequence(
      literal('amass '),
      PLURAL_CREATURE_TYPE,
      literal(' '),
      COUNT,
      pattern(/(?![\p{L}\p{N}])/u),
    ),
    ([, type, , count]) => {
      const types: IrTypeList = {
        kind: 'typeList',
        subtypes: [type.value],
        span: type.span,
        rule: ID,
      };
      return { verb: 'amass', args: { types, count } };
    },
  ),
});

export const HASHATON_GROUP_4_EFFECT_RULES = [EFFECT_AMASS].map(quietly);
