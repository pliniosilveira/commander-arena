/**
 * Effect rule of the triggered mana ability "Whenever you tap a land for mana, add one mana of any type that land produced." (Mirari's Wake, Vorinclex, Voice of Hunger;
 * CR 106.12a, 605.1b, 605.4a): `effect.add-mana-of-produced-type`.
 */
import { choice, literal, pattern, satisfy, sequence } from '../../combinators';
import type { IrAmount, IrManaSpec } from '../../ir/types';
import { defineRule, family, spanned } from '../registry';
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

const TAPPER_ID = 'effect.tapper-adds-produced-type-then-land-damages';

/**
 * `effect.tapper-adds-produced-type-then-land-damages`: "that player adds one mana of any type that land produced. Then that land deals 1 damage to that player." (Barbflare Gremlin; CR 106.12a,
 * 605.1b, 605.4a, 120.3): the two sentences of a triggered mana ability about the player who tapped a land, kept together by `splitSentences`. The player gets one more mana of a type the land
 * produced and the land deals the damage to them, as the mana ability resolves. The lowering reads it only as the effect of "Whenever a player taps a land for mana" (`lower/triggers.ts`). Not
 * read: "you add", another count of mana, damage with no number or an X, damage by another source, "to you", a second sentence of another shape.
 */
export const EFFECT_TAPPER_ADDS_PRODUCED_TYPE_THEN_LAND_DAMAGES = defineRule<Clauses>({
  id: TAPPER_ID,
  family: 'effect',
  leading: ['that'],
  cites: [
    'CR 106.12a (Mana)',
    'CR 605.1b (Mana Abilities)',
    'CR 605.4a (Mana Abilities)',
    'CR 120.3 (Damage)',
  ],
  examples: [
    'that player adds one mana of any type that land produced. Then that land deals 1 damage to that player',
    'that player adds one mana of any type that land produced. Then that land deals 2 damage to that player',
  ],
  rejects: [
    'that player adds one mana of any type that land produced',
    'that player adds one mana of any type that land produced. Then that land deals damage to that player',
    'that player adds one mana of any type that land produced. Then that land deals 0 damage to that player',
    'that player adds two mana of any type that land produced. Then that land deals 1 damage to that player',
    'you add one mana of any type that land produced. Then that land deals 1 damage to that player',
    'that player adds one mana of any type that land produced. Then that land deals 1 damage to you',
    'that player adds one mana of any type that land produced. Then ~ deals 1 damage to that player',
    'that player adds one mana of any type that land produced. Then that land deals 1 damage to that player and draw a card',
  ],
  parse: single(
    TAPPER_ID,
    sequence(
      pattern(/that player adds one mana of any type that land produced\. then that land deals /iu),
      satisfy(
        family<IrAmount>('amount', { only: ['amount.number'] }),
        (amount) => amount.kind === 'number' && amount.value >= 1,
      ),
      pattern(/ damage to that player(?![\p{L}\p{N}'’])/iu),
    ),
    ([, amount]) => ({ verb: 'tapperAddsProducedTypeThenDamage', args: { amount } }),
  ),
});

export const PRODUCED_TYPE_MANA_EFFECT_RULES = [
  EFFECT_ADD_MANA_OF_PRODUCED_TYPE,
  EFFECT_TAPPER_ADDS_PRODUCED_TYPE_THEN_LAND_DAMAGES,
];
