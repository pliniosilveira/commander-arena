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
 * `effect.spend-only-from-graveyard`: "Spend this mana only to cast a spell from your graveyard." (issue 102, Lord of the Forsaken; CR 106.6, 601.2a): the mana can pay for a
 * spell cast from its controller's graveyard. It says something about the mana ability before it; the lowering gives the engine its `spendOnly.fromGraveyard`. Not read: a
 * spell type or quality ("a creature spell from your graveyard"), another zone, another player's graveyard, "spells" in the plural, an ability.
 */
export const EFFECT_SPEND_ONLY_FROM_GRAVEYARD = defineRule<Clauses>({
  id: 'effect.spend-only-from-graveyard',
  family: 'effect',
  leading: ['spend'],
  cites: ['CR 106.6 (Mana)', 'CR 601.2a (Casting Spells)', 'CR 605.1a (Mana Abilities)'],
  examples: ['spend this mana only to cast a spell from your graveyard'],
  rejects: [
    'spend this mana only to cast a creature spell from your graveyard',
    'spend this mana only to cast a spell from your hand',
    "spend this mana only to cast a spell from an opponent's graveyard",
    'spend this mana only to cast spells from your graveyard',
    'spend this mana only to cast a spell from your graveyard and draw a card',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/spend this mana only to cast a spell from your graveyard(?![\p{L}\p{N}])/iu)(
      ctx,
      pos,
    );
    if (!r.ok) return r;
    const id = 'effect.spend-only-from-graveyard';
    const span = { start: pos, end: r.pos };
    return {
      ok: true,
      value: [makeClause(id, 'spendOnly', { fromGraveyard: flag(id, span) }, span)],
      pos: r.pos,
    };
  },
});

export const SPEND_QUALITIES_EFFECT_RULES = [
  EFFECT_SPEND_ONLY_QUALITIES,
  EFFECT_SPEND_ONLY_FROM_GRAVEYARD,
].map(quietly);
