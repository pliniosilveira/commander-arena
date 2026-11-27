/**
 * Effect rule of the Exit from Exile deck (Journey to the Lost City): "You may put a land card from among those cards onto the battlefield." after "exile the top four cards of your
 * library" (CR 608.2c, 608.2d, 110.2a). The lowering is `PUT_FROM_AMONG_EXILED` (`lower/troyan-g4.ts`), which refuses it unless the cards are those the exile before it moved.
 */
import { fail, literal, map, pattern, sequence } from '../../combinators';
import type { IrFilter, IrFlag, IrNoun } from '../../ir/types';
import { defineRule } from '../registry';
import { TAKEN_CARD } from './library';
import { type Clauses, makeClause, single } from './operands';

const ID = 'effect.put-from-among-those-cards-onto-battlefield';

const ANY_ID = 'effect.put-any-number-from-among-them-onto-battlefield';

/** "creature and/or land cards": one or two card types of permanents, each said once. */
const TYPES_CARDS = map(
  pattern(
    /(artifact|creature|enchantment|land|planeswalker)(?: and\/or (artifact|creature|enchantment|land|planeswalker))? cards(?![\p{L}\p{N}])/iu,
  ),
  (m): { types: string[]; end: number } | null => {
    const types = [m[1], m[2]]
      .filter((t): t is string => t !== undefined)
      .map((t) => t.toLowerCase());
    return new Set(types).size === types.length ? { types, end: m[0].length } : null;
  },
);

/**
 * `effect.put-from-among-those-cards-onto-battlefield`: "you may put a land card from among those cards onto the battlefield". One card of the kind named, from among the cards the
 * instruction before it exiled, onto the battlefield under the control of the player. Not read: another place ("into your hand"), "them" (the Troyan sentence's wording, read with its
 * own rule), more than one card, "up to", a second instruction in the same sentence.
 */
export const EFFECT_PUT_FROM_AMONG_THOSE_CARDS_ONTO_BATTLEFIELD = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['you', 'put'],
  cites: [
    'CR 608.2c (Resolving Spells and Abilities)',
    'CR 608.2d (Resolving Spells and Abilities)',
    'CR 110.2a (Permanents)',
  ],
  examples: [
    'you may put a land card from among those cards onto the battlefield',
    'put a land card from among those cards onto the battlefield',
    'you may put a creature card from among those cards onto the battlefield',
  ],
  rejects: [
    'you may put a land card from among those cards into your hand',
    'you may put a land card from among them onto the battlefield',
    'you may put two land cards from among those cards onto the battlefield',
    'you may put up to two land cards from among those cards onto the battlefield',
    'you may put a land card from among those cards onto the battlefield tapped',
    'you may put a land card from among those cards onto the battlefield and draw a card',
    'you may put it from among those cards onto the battlefield',
  ],
  parse: single(
    ID,
    sequence(
      // One pattern, so that a text that is not a put fails where it starts ("you may draw" is no near miss of this rule).
      map(pattern(/(?:you may )?(?=put [^.]*? from among (?:those cards|them))/iu), (m) =>
        m[0] === '' ? null : m[0],
      ),
      literal('put '),
      TAKEN_CARD,
      literal(' from among those cards onto the battlefield'),
      pattern(/(?![\p{L}\p{N}])(?!\s+(?:and|then|tapped)(?![\p{L}\p{N}]))/u),
    ),
    ([may, , objects]: [string | null, string, IrNoun, string, unknown]) => {
      const flag: IrFlag = {
        kind: 'flag',
        value: may !== null,
        span: { start: 0, end: 0 },
        rule: ID,
      };
      return { verb: 'putFromAmongExiled', args: { objects, may: flag } };
    },
  ),
});

/**
 * `effect.put-any-number-from-among-them-onto-battlefield`: "you may put any number of creature and/or land cards from among them onto the battlefield" (Xenagos, the Reveler; CR 608.2d,
 * 110.2a): none or as many of the cards the exile before it exiled as the player chooses, of the one or two card types named. Not read: a number, "up to", other places, a type that is
 * not a permanent type, the same type twice, a second instruction in the same sentence.
 */
export const EFFECT_PUT_ANY_NUMBER_FROM_AMONG_THEM_ONTO_BATTLEFIELD = defineRule<Clauses>({
  id: ANY_ID,
  family: 'effect',
  leading: ['you', 'put'],
  cites: [
    'CR 608.2c (Resolving Spells and Abilities)',
    'CR 608.2d (Resolving Spells and Abilities)',
    'CR 110.2a (Permanents)',
  ],
  examples: [
    'you may put any number of creature and/or land cards from among them onto the battlefield',
    'you may put any number of land cards from among them onto the battlefield',
    'put any number of creature cards from among them onto the battlefield',
  ],
  rejects: [
    'you may put any number of creature and/or land cards from among them into your hand',
    'you may put any number of creature and creature cards from among them onto the battlefield',
    'you may put any number of creature and/or land cards from among those cards onto the battlefield',
    'you may put up to two land cards from among them onto the battlefield',
    'you may put any number of instant cards from among them onto the battlefield',
    'you may put any number of land cards from among them onto the battlefield and draw a card',
    'you may put any number of cards from among them onto the battlefield',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      // One pattern, so that a text that is not a put fails where it starts ("you may draw" is no near miss of this rule).
      map(pattern(/(?:you may )?(?=put [^.]*? from among (?:those cards|them))/iu), (m) =>
        m[0] === '' ? null : m[0],
      ),
      literal('put any number of '),
      TYPES_CARDS,
      literal(' from among them onto the battlefield'),
      pattern(/(?![\p{L}\p{N}])(?!\s+(?:and|then|tapped)(?![\p{L}\p{N}]))/u),
    )(ctx, pos);
    if (!r.ok) return r;
    const [may, , cards] = r.value;
    if (cards === null) return fail(ctx, pos);
    const span = { start: pos, end: r.pos };
    const member = (t: string): IrFilter => ({ types: [t], raw: t });
    const filter: IrFilter = {
      ...(cards.types.length === 1 ? { types: cards.types } : { anyOf: cards.types.map(member) }),
      card: true,
      raw: cards.types.join(' and/or '),
    };
    const objects: IrNoun = {
      kind: 'noun',
      det: 'a',
      filter,
      upTo: false,
      plural: true,
      other: false,
      anyNumber: true,
      span,
      rule: ANY_ID,
    };
    const flag: IrFlag = { kind: 'flag', value: may !== null, span, rule: ANY_ID };
    return {
      ok: true,
      value: [makeClause(ANY_ID, 'putFromAmongExiled', { objects, may: flag }, span)],
      pos: r.pos,
    };
  },
});

export const PUT_FROM_AMONG_EXILED_EFFECT_RULES = [
  EFFECT_PUT_FROM_AMONG_THOSE_CARDS_ONTO_BATTLEFIELD,
  EFFECT_PUT_ANY_NUMBER_FROM_AMONG_THEM_ONTO_BATTLEFIELD,
];
