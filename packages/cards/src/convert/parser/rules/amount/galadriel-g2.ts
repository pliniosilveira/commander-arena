/**
 * The amounts of the Galadriel deck's group 2 (issue 43, D-1611): "for each land you control and each land card in your graveyard" (CR 608.2c, 613.4c: two counts
 * added into one number; the engine's `sum` of counts, D-131, which a static +N/+N and a characteristic-defining ability already read).
 */
import { literal } from '../../combinators';
import type { IrAmount } from '../../ir/types';
import { defineRule, quietly } from '../registry';
import { countAmount } from './count';

/**
 * `amount.for-each-and-each`: "for each land you control and each land card in your graveyard": a count of one kind of object and a count of another, as one amount.
 * Two counts only, each of the kinds `amount.for-each` reads. Not read: one count, three counts, a list of kinds without "each" ("for each artifact and creature
 * you control" is `amount.for-each`'s own list of kinds), a second count that is not of objects ("and each opponent").
 */
export const AMOUNT_FOR_EACH_AND_EACH = defineRule<IrAmount>({
  id: 'amount.for-each-and-each',
  family: 'amount',
  leading: ['for'],
  cites: [
    'CR 608.2c (Resolving Spells and Abilities)',
    'CR 613.4c (Interaction of Continuous Effects)',
  ],
  examples: [
    'for each land you control and each land card in your graveyard',
    'for each creature you control and each creature card in your graveyard',
    'for each artifact you control and each card in your hand',
    'for each Elf you control and each Elf card in all graveyards',
  ],
  rejects: [
    'for each land you control',
    'for each land you control and each',
    'for each land you control and each opponent',
    'for each land you control and each land card in your graveyard and each card in your hand',
    'for each land you control and land card in your graveyard',
    'for each land you control, each land card in your graveyard',
    'for each land you control and each land cards in your graveyard',
    'for each creature and each land you control',
    'each land you control and each land card in your graveyard',
    'for each land you control and each land card in your graveyard.',
  ],
  parse: (ctx, pos) => {
    const first = countAmount('amount.for-each-and-each', literal('for each '), false)(ctx, pos);
    if (!first.ok) return first;
    const second = countAmount(
      'amount.for-each-and-each',
      literal(' and each '),
      false,
    )(ctx, first.pos);
    if (!second.ok) return second;
    return {
      ok: true,
      value: {
        kind: 'sum',
        of: [first.value, second.value],
        span: { start: pos, end: second.pos },
      },
      pos: second.pos,
    };
  },
});

/** Quiet: a line this rule does not read ("for each fellowship counter on ~") must stop where it always did, with the diagnostics of `amount.for-each`. */
export const GALADRIEL_G2_AMOUNT_RULES = [quietly(AMOUNT_FOR_EACH_AND_EACH)];
