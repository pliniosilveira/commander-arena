/**
 * Effect rules of the Quandrix Unlimited deck, group F (mana abilities): the restriction on mana by the mana value or the {X} of the spell it pays for, and a player's
 * permission to cast spells as though they had flash for the turn.
 */
import { fail, pattern } from '../../combinators';
import type { IrFlag, Span } from '../../ir/types';
import { defineRule, quietly } from '../registry';
import { type Clauses, makeClause } from './operands';

const MANA_VALUE = '(?:mana value ([1-9][0-9]*) or greater)';
const HAS_X = '(?:\\{X\\} in their mana costs)';
const QUALITY = `(?:${MANA_VALUE}|${HAS_X})`;

function flag(rule: string, span: Span): IrFlag {
  return { kind: 'flag', value: true, span, rule };
}

/**
 * `effect.spend-only-qualities`: "Spend this mana only to cast spells with mana value 5 or greater or spells with {X} in their mana costs." (CR 106.6, 202.3, 107.3: a
 * mana ability may restrict what its mana can be spent on; here the mana value of the spell and an {X} in its mana cost). One quality, or two of different kinds joined by
 * "or spells with"; the spell needs one of them. It says something about the mana ability before it: the lowering of that ability gives the engine its `spendOnly` with
 * `qualities`; anywhere else it is read and not run. Not read: a type, a color or another quality ("with flying"), "or less", a quality said twice, "abilities".
 */
export const EFFECT_SPEND_ONLY_QUALITIES = defineRule<Clauses>({
  id: 'effect.spend-only-qualities',
  family: 'effect',
  leading: ['spend'],
  cites: [
    'CR 106.6 (Mana)',
    'CR 202.3 (Mana Value)',
    'CR 107.3 (Numbers and Symbols)',
    'CR 605.1a (Mana Abilities)',
  ],
  examples: [
    'spend this mana only to cast spells with mana value 5 or greater or spells with {X} in their mana costs',
    'spend this mana only to cast spells with mana value 4 or greater',
    'spend this mana only to cast spells with {X} in their mana costs',
    'spend this mana only to cast spells with {X} in their mana costs or spells with mana value 6 or greater',
  ],
  rejects: [
    'spend this mana only to cast spells with mana value 5 or less',
    'spend this mana only to cast spells with mana value 5 or greater or spells with mana value 7 or greater',
    'spend this mana only to cast spells with {X} in their mana costs or spells with {X} in their mana costs',
    'spend this mana only to cast spells with mana value 0 or greater',
    'spend this mana only to cast spells with mana value 5 or greater or creature spells',
    'spend this mana only to cast spells with mana value 5 or greater or activate abilities',
    'spend this mana only to cast creature spells with mana value 5 or greater',
    'spend this mana only to cast spells with flying',
    'spend this mana only to cast spells with mana value 5 or greater and spells with {X} in their mana costs',
    'spend this mana only to cast spells with mana value 5 or greater or spells with {X} in their mana costs and draw a card',
    'spend this mana only to cast spells with mana value five or greater',
    'spend this mana only to cast spells with mana value 5 or greater or spells with {X} in their mana cost',
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      new RegExp(
        `spend this mana only to cast spells with ${QUALITY}(?: or spells with ${QUALITY})?(?![\\p{L}\\p{N}])`,
        'iu',
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const id = 'effect.spend-only-qualities';
    const m = r.value;
    // Groups: 1 = the first value, 2 = the second value (the second quality's), the {X} qualities have none.
    const text = m[0];
    const values = [...text.matchAll(/mana value ([1-9][0-9]*) or greater/giu)].map((v) =>
      Number(v[1]),
    );
    const xs = [...text.matchAll(/\{X\} in their mana costs/giu)].length;
    // Two qualities must differ in kind: "mana value 5 or greater or ... mana value 7 or greater" says one twice.
    if (values.length > 1 || xs > 1) return fail(ctx, pos);
    const span = { start: pos, end: r.pos };
    const atLeast = values[0];
    return {
      ok: true,
      value: [
        makeClause(
          id,
          'spendOnly',
          {
            ...(atLeast === undefined
              ? {}
              : { manaValueAtLeast: { kind: 'number' as const, value: atLeast, span } }),
            ...(xs === 0 ? {} : { hasX: flag(id, span) }),
          },
          span,
        ),
      ],
      pos: r.pos,
    };
  },
});

/**
 * `effect.spend-only-colorless`: "Spend this mana only to cast colorless spells." (CR 106.6, 105.2c: a mana ability may restrict what its mana can be spent on; here the spell
 * must have no color). It says something about the mana ability before it: the lowering of that ability gives the engine its `spendOnly` with the `colorless` quality; anywhere
 * else it is read and not run. Not read: a color ("white spells"), "colorless creature spells", "or" another quality, "abilities", the sentence without its period.
 */
export const EFFECT_SPEND_ONLY_COLORLESS = defineRule<Clauses>({
  id: 'effect.spend-only-colorless',
  family: 'effect',
  leading: ['spend'],
  cites: ['CR 106.6 (Mana)', 'CR 105.2c (Colors)', 'CR 605.1a (Mana Abilities)'],
  examples: [
    'spend this mana only to cast colorless spells',
    'Spend this mana only to cast colorless spells',
  ],
  rejects: [
    'spend this mana only to cast white spells',
    'spend this mana only to cast colorless creature spells',
    'spend this mana only to cast colorless spells or spells with {X} in their mana costs',
    'spend this mana only to cast colorless spells or activate abilities',
    'spend this mana only to cast colored spells',
    'spend this mana only to cast spells',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/spend this mana only to cast colorless spells(?![\p{L}\p{N}])/iu)(ctx, pos);
    if (!r.ok) return r;
    const id = 'effect.spend-only-colorless';
    const span = { start: pos, end: r.pos };
    return {
      ok: true,
      value: [makeClause(id, 'spendOnly', { colorless: flag(id, span) }, span)],
      pos: r.pos,
    };
  },
});

export const SPEND_QUALITIES_EFFECT_RULES = [
  EFFECT_SPEND_ONLY_QUALITIES,
  EFFECT_SPEND_ONLY_COLORLESS,
].map(quietly);
