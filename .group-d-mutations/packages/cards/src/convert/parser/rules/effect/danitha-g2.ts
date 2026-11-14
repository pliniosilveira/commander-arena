/**
 * Effect rules of group 2 of the Danitha deck (issue 26, D-411): "Mill four cards. You may put a land card from among them into your hand." (Ainok Wayfarer,
 * Blanchwood Prowler, Airlift Chaplain, Cache Grab, Something Worth Saving, Town Greeter, Midnight Tilling). The mill is `effect.mill`; the choice among the cards it moved is the
 * rule here; the riders ("If you don't, put a +1/+1 counter on this creature", "You gain 1 life", "If you put a Town card into your hand this way, ...") are sentences of their own
 * (`condition.if-you-dont`, `condition.put-this-way`, `condition.control-or-returned`). The lowering is in `lower/danitha-g2.ts`.
 */
import {
  choice,
  fail,
  literal,
  map,
  optional,
  type Parser,
  pattern,
  sequence,
} from '../../combinators';
import type { IrFilter, IrFlag, IrNoun } from '../../ir/types';
import { defineRule, quietly } from '../registry';
import { PERMANENT_TAKEN_CARD, PLAIN_TAKEN_CARD, TAKEN_CARD } from './library';
import { type Clauses, single } from './operands';

const RULE = 'effect.put-from-among';

/** " from among them" and " from among the cards milled this way": the cards the mill before it put into the graveyard. */
const FROM_AMONG: Parser<string> = map(
  sequence(literal(' from among '), choice(literal('them'), literal('the cards milled this way'))),
  ([, which]) => which,
);

/** The card words of one side of "a Plains card or a creature card with mana value 3 or less": a kind of card and, optionally, a limit on its mana value (CR 202.3). */
const KIND_WITH_LIMIT: Parser<IrFilter> = (ctx, pos) => {
  const kind = choice(PERMANENT_TAKEN_CARD, PLAIN_TAKEN_CARD)(ctx, pos);
  if (!kind.ok) return kind;
  const limit = pattern(/ with mana value (\d+) or less(?![\p{L}\p{N}])/iu)(ctx, kind.pos);
  const { card: _card, ...rest } = kind.value.filter;
  const filter: IrFilter = {
    ...rest,
    ...(limit.ok ? { manaValue: { cmp: 'atMost' as const, value: Number(limit.value[1]) } } : {}),
    raw: ctx.text.slice(pos, limit.ok ? limit.pos : kind.pos),
  };
  return { ok: true, value: filter, pos: limit.ok ? limit.pos : kind.pos };
};

/**
 * "a Plains card or a creature card with mana value 3 or less" (CR 205.3i, 202.3): two kinds of card, each with its own words and each with a limit on its mana value or none;
 * the card is any one of them (the engine's `anyOf`). At least one of the two has a limit (a list with none is `TAKEN_CARD`'s). Not read: three kinds, a limit with another
 * comparison ("or more", "less than or equal to").
 */
const EITHER_TAKEN_CARD: Parser<IrNoun> = (ctx, pos) => {
  const first = KIND_WITH_LIMIT(ctx, pos);
  if (!first.ok) return first;
  const joined = literal(' or ')(ctx, first.pos);
  if (!joined.ok) return joined;
  const second = pattern(/an? /iu)(ctx, joined.pos);
  if (!second.ok) return second;
  const other = KIND_WITH_LIMIT(ctx, joined.pos);
  if (!other.ok) return other;
  if (first.value.manaValue === undefined && other.value.manaValue === undefined) {
    return fail(ctx, pos);
  }
  const noun: IrNoun = {
    kind: 'noun',
    det: 'a',
    filter: {
      anyOf: [first.value, other.value],
      card: true,
      raw: ctx.text.slice(pos, other.pos),
    },
    upTo: false,
    plural: false,
    other: false,
    span: { start: pos, end: other.pos },
    rule: RULE,
  };
  return { ok: true, value: noun, pos: other.pos };
};

/** The card the player may take: one list of kinds (`TAKEN_CARD`) or two kinds with their own limits (`EITHER_TAKEN_CARD`, tried first: it starts like a plain card). */
const TAKEN: Parser<IrNoun> = choice(EITHER_TAKEN_CARD, TAKEN_CARD);

/**
 * `effect.put-from-among`: "you may put a land card from among them into your hand", "you may put a permanent card from among the cards milled this way into your hand", "you
 * may return a permanent card from among them to your hand" (CR 608.2c: an instruction reads what an earlier one did; CR 608.2d: the player chooses as it comes up; CR 701.17a:
 * the cards a mill put into the graveyard). "Them" and "the cards milled this way" are the cards of the mill before it, which the lowering checks; the card goes from the
 * graveyard to the hand of the player, none with "you may" (the words are read here as well as by the sentence, so a spell has them too). Only "put ... into" and "return ... to".
 * Not read: another zone for the card, another place to look ("from your graveyard", "from among the cards exiled this way"), more than one card, "up to", a card put onto the
 * battlefield, "put ... into your hand" with "return", "them" for the card taken.
 */
export const EFFECT_PUT_FROM_AMONG = defineRule<Clauses>({
  id: RULE,
  family: 'effect',
  leading: ['you', 'put', 'return'],
  cites: [
    'CR 608.2c (Resolving Spells and Abilities)',
    'CR 608.2d (Resolving Spells and Abilities)',
    'CR 701.17a (Mill)',
    'CR 404.1 (Graveyard)',
  ],
  examples: [
    'you may put a land card from among them into your hand',
    'put a land card from among them into your hand',
    'you may put a land card from among the cards milled this way into your hand',
    'you may put a permanent card from among them into your hand',
    'you may return a permanent card from among them to your hand',
    'you may put a Plains card or a creature card with mana value 3 or less from among the cards milled this way into your hand',
    'you may put an artifact or creature card from among them into your hand',
    'you may put a creature card from among them into your hand',
  ],
  rejects: [
    'you may put a land card from among them onto the battlefield',
    'you may put a land card from your graveyard into your hand',
    'you may put a land card from among the cards exiled this way into your hand',
    'you may put two land cards from among them into your hand',
    'you may put up to two land cards from among them into your hand',
    'you may put a land card from among them into your graveyard',
    'you may put a land card from among them to your hand',
    'you may return a land card from among them into your hand',
    'you may put a land card from among them into their hand',
    'you may put it from among them into your hand',
    'you may put a land card from among it into your hand',
    'you may put a land card from among them into your hand and draw a card',
    'you may put a Plains card or a creature card from among them into your hand',
    'you may put a Plains card or a creature card with mana value 3 or more from among them into your hand',
    'you may put a land card or a creature card or an artifact card with mana value 3 or less from among them into your hand',
    'you may reveal a land card from among them and put it into your hand',
  ],
  parse: single(
    RULE,
    sequence(
      optional(literal('you may '), null),
      choice(
        // "put ... into your hand" and "return ... to your hand": the two ways the text says it; any other pairing is not read.
        map(
          sequence(literal('put '), TAKEN, FROM_AMONG, literal(' into your hand')),
          ([, objects]) => objects,
        ),
        map(
          sequence(literal('return '), TAKEN, FROM_AMONG, literal(' to your hand')),
          ([, objects]) => objects,
        ),
      ),
      pattern(/(?![\p{L}\p{N}])(?!\s+(?:and|then)(?![\p{L}\p{N}]))/u),
    ),
    ([may, objects]) => {
      const flag: IrFlag = {
        kind: 'flag',
        value: may !== null,
        span: { start: 0, end: 0 },
        rule: RULE,
      };
      return { verb: 'putFromAmong', args: { objects, may: flag } };
    },
  ),
});

/** Quiet: a line this rule does not read ("Put a +1/+1 counter on ~", "Return target card to your hand") must stop where it always did. */
export const DANITHA_G2_EFFECT_RULES = [quietly(EFFECT_PUT_FROM_AMONG)];
