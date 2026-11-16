/**
 * Effect rules of group 2 of the Galadriel deck (issue 43): "Mill four cards, then put up to two land cards from among them into your hand." (Silvan Rally, D-1614),
 * which extends the choice among the milled cards of the Danitha deck (D-411) from one card to a number "up to" it.
 */
import {
  choice,
  fail,
  literal,
  many,
  map,
  optional,
  type Parser,
  pattern,
  satisfy,
  sequence,
} from '../../combinators';
import type { IrFlag, IrNoun } from '../../ir/types';
import { positiveCount } from '../amount';
import { CARD_TYPES, typeWords } from '../noun/phrases';
import { SUBTYPE_WORD_NUMBERED } from '../noun/subtypes';
import { defineRule, quietly } from '../registry';
import { type Clauses, single } from './operands';

const RULE = 'effect.put-up-to-from-among';

/** " from among them" and " from among the cards milled this way": the cards the mill before it put into the graveyard. */
const FROM_AMONG = map(
  sequence(literal(' from among '), pattern(/(?:them|the cards milled this way)(?![\p{L}\p{N}])/u)),
  ([, which]) => which[0],
);

/** The cards, in the plural, of one list of card types and creature types: "land cards", "creature cards", "Elf cards", "artifact creature cards". */
const CARDS: Parser<{ types: string[]; subtypes: string[] }> = map(
  sequence(
    many(
      map(
        sequence(
          satisfy(SUBTYPE_WORD_NUMBERED, (w) => w.plural !== true),
          literal(' '),
        ),
        ([w]) => w.subtype,
      ),
    ),
    optional(
      map(sequence(typeWords(CARD_TYPES, false), literal(' ')), ([types]) => types),
      [] as string[],
    ),
    pattern(/cards(?![\p{L}\p{N}])/iu),
  ),
  ([subtypes, types]) => ({ subtypes, types }),
);

/**
 * `effect.put-up-to-from-among`: "put up to two land cards from among them into your hand", "return up to two creature cards from among the cards milled this way to your hand" (CR 608.2c:
 * the cards of the mill before it; CR 608.2d: the player chooses none, one or up to that many; CR 701.17a: the cards a mill put into the graveyard). A number of two or more, in
 * the plural, "up to" always (there is no "you may": naming no card is a choice of none). Not read: "up to one" (the singular rule's), a number without "up to", "any number of", a
 * card with a mana value limit, another zone or place, "them" for the cards taken.
 */
export const EFFECT_PUT_UP_TO_FROM_AMONG = defineRule<Clauses>({
  id: RULE,
  family: 'effect',
  leading: ['put', 'return'],
  cites: [
    'CR 608.2c (Resolving Spells and Abilities)',
    'CR 608.2d (Resolving Spells and Abilities)',
    'CR 701.17a (Mill)',
    'CR 404.1 (Graveyard)',
  ],
  examples: [
    'put up to two land cards from among them into your hand',
    'put up to three creature cards from among the cards milled this way into your hand',
    'return up to two creature cards from among them to your hand',
    'put up to two Elf cards from among them into your hand',
    'put up to two artifact creature cards from among them into your hand',
  ],
  rejects: [
    'put up to one land card from among them into your hand',
    'put up to one land cards from among them into your hand',
    'put up to two land cards from among them onto the battlefield',
    'put two land cards from among them into your hand',
    'you may put up to two land cards from among them into your hand',
    'put up to two land cards from your graveyard into your hand',
    'put up to two land card from among them into your hand',
    'put up to two land cards from among them to your hand',
    'return up to two land cards from among them into your hand',
    'put up to two land cards from among them into your hand and draw a card',
    'put up to two land cards from among them into your hand, then draw a card',
    'put up to two lands from among them into your hand',
    'put up to two land cards from among it into your hand',
    'put up to X land cards from among them into your hand',
    'put any number of land cards from among them into your hand',
    'put up to two land cards from among them into their hand',
  ],
  parse: single(
    RULE,
    (ctx, pos) => {
      const head = choice(
        map(literal('put up to '), () => ' into your hand'),
        map(literal('return up to '), () => ' to your hand'),
      )(ctx, pos);
      if (!head.ok) return head;
      const body = sequence(positiveCount, literal(' '), CARDS, FROM_AMONG)(ctx, head.pos);
      if (!body.ok) return body;
      const [count, , cards] = body.value;
      const place = literal(head.value)(ctx, body.pos);
      if (!place.ok) return place;
      // The sentence ends here: "and ..." and "then ..." are other clauses, and any other word is not this phrase.
      const tail = pattern(/(?![\p{L}\p{N}])(?!\s+(?:and|then)(?![\p{L}\p{N}]))/u)(ctx, place.pos);
      if (!tail.ok) return tail;
      if (count < 2) return fail(ctx, pos);
      return {
        ok: true,
        value: { count, cards, raw: ctx.text.slice(head.pos, body.pos), at: head.pos },
        pos: place.pos,
      };
    },
    ({ count, cards, raw, at }) => {
      const span = { start: at, end: at + raw.length };
      const noun: IrNoun = {
        kind: 'noun',
        det: 'a',
        filter: {
          ...(cards.types.length > 0 ? { types: cards.types } : {}),
          ...(cards.subtypes.length > 0 ? { subtypes: cards.subtypes } : {}),
          card: true,
          raw,
        },
        count: { kind: 'number', value: count, span },
        upTo: true,
        plural: true,
        other: false,
        span,
        rule: RULE,
      };
      const flag: IrFlag = { kind: 'flag', value: true, span, rule: RULE };
      return { verb: 'putFromAmong', args: { objects: noun, may: flag } };
    },
  ),
});

/** Quiet: a line this rule does not read must stop where it always did. */
export const GALADRIEL_G2_EFFECT_RULES = [quietly(EFFECT_PUT_UP_TO_FROM_AMONG)];
