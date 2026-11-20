/**
 * Effect rule of the triggered mana ability "Whenever you tap a land for mana, add one mana of any type that land produced." (Mirari's Wake, Vorinclex, Voice of Hunger;
 * CR 106.12a, 605.1b, 605.4a): `effect.add-mana-of-produced-type`.
 */
import { choice, literal, pattern, sequence } from '../../combinators';
import type { IrManaSpec } from '../../ir/types';
import { defineRule, spanned } from '../registry';
import { type Clauses, single } from './operands';

const ID = 'effect.add-mana-of-produced-type';

/** The permanent words the sentence may use for the permanent that was tapped for mana. */
const PERMANENT_WORD = choice(
  literal('land'),
  literal('permanent'),
  literal('creature'),
  literal('artifact'),
);

/**
 * `effect.add-mana-of-produced-type`: "add one mana of any type that land produced" (CR 106.12a: a permanent "is tapped for mana" as its mana ability resolves and produces
 * mana; CR 605.4a: a triggered mana ability resolves at once into the same pool; CR 106.1b: colorless is a type of mana). The permanent is the one that was tapped for mana,
 * which the trigger names; the lowering reads it only as the effect of the trigger `tappedForMana` ("you tap a land for mana"), so it carries the `additional` flag that marks
 * such an effect. Not read: "any color", "any type that a land you control could produce" (`couldProduce`), another count, "could produce", "of any one type", "that lands produced".
 */
export const EFFECT_ADD_MANA_OF_PRODUCED_TYPE = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['add'],
  cites: [
    'CR 106.12a (Mana)',
    'CR 605.1b (Mana Abilities)',
    'CR 605.4a (Mana Abilities)',
    'CR 106.1b (Mana)',
  ],
  examples: [
    'add one mana of any type that land produced',
    'add one mana of any type that permanent produced',
    'add one mana of any type that creature produced',
    'add one mana of any type that artifact produced',
  ],
  rejects: [
    'add one mana of any color that land produced',
    'add two mana of any type that land produced',
    'add one mana of any type that land could produce',
    'add one mana of any type that a land you control could produce',
    'add one mana of any type that lands produced',
    'add one mana of any type that land produced and',
    'add one mana of any one type that land produced',
    'add mana of any type that land produced',
    'add an additional one mana of any type that land produced',
    'add one mana of any type that card produced',
  ],
  parse: single(
    ID,
    sequence(
      literal('add one mana of any type that '),
      spanned(PERMANENT_WORD),
      pattern(/ produced(?![\p{L}\p{N}'’])/iu),
    ),
    ([, word]) => ({
      verb: 'addMana',
      args: {
        mana: {
          kind: 'manaSpec' as const,
          what: { kind: 'producedType', noun: word.value } as IrManaSpec['what'],
          span: word.span,
          rule: ID,
        },
        additional: { kind: 'flag' as const, value: true as const, span: word.span, rule: ID },
      },
    }),
  ),
});

export const PRODUCED_TYPE_MANA_EFFECT_RULES = [EFFECT_ADD_MANA_OF_PRODUCED_TYPE];
