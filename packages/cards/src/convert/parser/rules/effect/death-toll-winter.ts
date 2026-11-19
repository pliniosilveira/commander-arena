/**
 * Effect rules of the delirium ability of Winter, Cynical Opportunist (Death Toll deck): "You may exile any number of cards from your graveyard with four or more card types among
 * them. If you do, put a permanent card from among them onto the battlefield with a finality counter on it." The two clauses are read by their own rules, the sentence "If you do, ..." by the
 * sentence reader; the lowering is in `lower/death-toll-winter.ts`.
 */
import { literal, map, optional, type Parser, pattern, satisfy, sequence } from '../../combinators';
import type { IrArg, IrFlag, IrZoneSpec } from '../../ir/types';
import { defineRule, family, quietly, spanned } from '../registry';
import { PERMANENT_TAKEN_CARD } from './library';
import { type Clauses, single } from './operands';

/** A number of card types: digits or a word from one to ten. */
const NUMBER = family<IrArg>('amount', { only: ['amount.number'] });

/** The clauses of a rule that read "you may" themselves are optional (the sentence reader marks the same offer when it strips the words first). */
function asOffer(parser: Parser<Clauses>): Parser<Clauses> {
  return map(parser, (clauses) =>
    clauses.map((c) =>
      c.args.may?.kind === 'flag' && c.args.may.value ? { ...c, optional: true } : c,
    ),
  );
}

const EXILE_RULE = 'effect.exile-graveyard-card-types';
const PUT_RULE = 'effect.put-permanent-from-among-exiled';

/**
 * `effect.exile-graveyard-card-types`: "you may exile any number of cards from your graveyard with four or more card types among them" (CR 205.2a: card types, a supertype or a
 * subtype is no card type; CR 608.2d: the player chooses as the instruction comes up). The engine's `moveToZone` into exile of a `choose` selector with `anyNumber` and
 * `minCardTypes`: the cards chosen together must have that many card types, or none are chosen. Only the player's own graveyard and an offer ("you may"): without it the engine
 * has no way to say that the cards may be none. Not read: another zone or owner, "exile all", "up to", a count of cards, "among them" without "or more", a number under two.
 */
export const EFFECT_EXILE_GRAVEYARD_CARD_TYPES = defineRule<Clauses>({
  id: EXILE_RULE,
  family: 'effect',
  leading: ['you', 'exile'],
  cites: [
    'CR 205.2a (Card Types)',
    'CR 608.2d (Resolving Spells and Abilities)',
    'CR 404.1 (Graveyard)',
  ],
  examples: [
    'you may exile any number of cards from your graveyard with four or more card types among them',
    'exile any number of cards from your graveyard with four or more card types among them',
    'you may exile any number of cards from your graveyard with three or more card types among them',
  ],
  rejects: [
    'you may exile any number of cards from your graveyard',
    'you may exile any number of cards from your graveyard with four card types among them',
    'you may exile any number of cards from your graveyard with four or more types among them',
    'you may exile any number of cards from your graveyard with four or more card types',
    'you may exile any number of cards from your graveyard with one or more card types among them',
    'you may exile any number of cards from an opponent’s graveyard with four or more card types among them',
    'you may exile any number of cards from your hand with four or more card types among them',
    'you may exile all cards from your graveyard with four or more card types among them',
    'you may exile up to two cards from your graveyard with four or more card types among them',
    'you may exile any number of creature cards from your graveyard with four or more card types among them',
    'you may exile any number of cards from your graveyard with four or fewer card types among them',
    'you may exile any number of cards from your graveyard with four or more card types among them and draw a card',
  ],
  // "you may" is read here as well as by the sentence: the clause is optional either way (`lowerMay` reads an offer from the clause).
  parse: asOffer(
    single(
      EXILE_RULE,
      sequence(
        optional(literal('you may '), null),
        literal('exile any number of cards from your graveyard with '),
        satisfy(NUMBER, (a) => a.kind === 'number' && a.value >= 2),
        literal(' or more card types among them'),
        pattern(/(?![\p{L}\p{N}])(?!\s+(?:and|then)(?![\p{L}\p{N}]))/u),
      ),
      ([may, , types]) => {
        const flag: IrFlag = {
          kind: 'flag',
          value: may !== null,
          span: { start: 0, end: 0 },
          rule: EXILE_RULE,
        };
        return { verb: 'exileGraveyardCardTypes', args: { types, may: flag } };
      },
    ),
  ),
});

/** " with a finality counter on it": the counter the card enters with (CR 122.6). */
const WITH_A_COUNTER: Parser<{ readonly counter: string; readonly count: number }> = map(
  sequence(
    literal(' with a '),
    pattern(/[+-]\d+\/[+-]\d+|[a-z]+/iu),
    pattern(/ counter on it(?![\p{L}\p{N}])/iu),
  ),
  ([, name]) => ({ count: 1, counter: (name[0] ?? '').toLowerCase() }),
);

/**
 * `effect.put-permanent-from-among-exiled`: "put a permanent card from among them onto the battlefield with a finality counter on it" (CR 608.2c: "them" are the cards the instruction
 * before it exiled; CR 110.4a: a permanent card; CR 122.6: the counter it enters with, CR 110.2a: under the control of the player). The cards are the ones the exile before it
 * moved, which the lowering checks; the engine's `moveToZone` onto the battlefield of a `choose` selector among them (`fromMoved`). Not read: another kind of card, "up to", more than
 * one card, "into your hand", a place other than the battlefield, a count of counters other than one, "under its owner's control".
 */
export const EFFECT_PUT_PERMANENT_FROM_AMONG_EXILED = defineRule<Clauses>({
  id: PUT_RULE,
  family: 'effect',
  leading: ['put'],
  cites: [
    'CR 608.2c (Resolving Spells and Abilities)',
    'CR 110.4a (Permanents)',
    'CR 122.6 (Counters)',
  ],
  examples: [
    'put a permanent card from among them onto the battlefield with a finality counter on it',
    'put a permanent card from among them onto the battlefield',
    'put a permanent card from among them onto the battlefield with a +1/+1 counter on it',
  ],
  rejects: [
    'put a permanent card from among them into your hand',
    'put a creature card from among them onto the battlefield',
    'put a permanent card from among them onto the battlefield tapped',
    'put a permanent card from your graveyard onto the battlefield with a finality counter on it',
    'put two permanent cards from among them onto the battlefield',
    'put up to one permanent card from among them onto the battlefield',
    'put a permanent card from among them onto the battlefield under its owner’s control',
    'put a permanent card from among them onto the battlefield with two finality counters on it',
    'put a permanent card from among them onto the battlefield with a finality counter on it and draw a card',
  ],
  parse: single(
    PUT_RULE,
    sequence(
      literal('put '),
      PERMANENT_TAKEN_CARD,
      literal(' from among them'),
      spanned(sequence(literal(' onto the battlefield'), optional(WITH_A_COUNTER, null))),
      pattern(/(?![\p{L}\p{N}])(?!\s+(?:and|then)(?![\p{L}\p{N}]))/u),
    ),
    ([, objects, , to]) => {
      const counters = to.value[1];
      const spec: IrZoneSpec = {
        kind: 'zoneSpec',
        zone: 'battlefield',
        ...(counters === null ? {} : { counters }),
        span: to.span,
        rule: PUT_RULE,
      };
      return { verb: 'putPermanentFromAmongExiled', args: { objects, to: spec } };
    },
  ),
});

/** Quiet: a line these rules do not read ("Exile target card from a graveyard", "Put a +1/+1 counter on ~") must stop where it always did. */
export const DEATH_TOLL_WINTER_EFFECT_RULES = [
  quietly(EFFECT_EXILE_GRAVEYARD_CARD_TYPES),
  quietly(EFFECT_PUT_PERMANENT_FROM_AMONG_EXILED),
];
