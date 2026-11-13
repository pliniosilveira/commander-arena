/**
 * The effects that look at or rearrange your own library: scry, surveil, "look at the top N cards of
 * your library, then put them back in any order" and "put N cards from your hand on top of your
 * library" (stage P10; the engine runs them, D-091 and D-093). They are always about the
 * controller: another player's scry has no engine node, so "target player scries 2" and "each
 * player scries 1" are not read. "You may scry 1" is read only where a triggered ability's
 * "you may" is (`TRIGGER_SENTENCE`), as for every other verb.
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
import type { IrArg, IrFilter, IrNoun } from '../../ir/types';
import { countAmount } from '../amount/count';
import { CARD_TYPES, PERMANENT_CARD_TYPES, typeChoice, typeWords } from '../noun/phrases';
import { SUBTYPE_WORD_NUMBERED } from '../noun/subtypes';
import { defineRule, family, spanned } from '../registry';
import { type Clauses, single } from './operands';

/** A number of cards: digits or a word from one to ten ("look at the top N cards" and "put N cards from your hand" read numbers only). */
const NUMBER = family<IrArg>('amount', { only: ['amount.number'] });

/** The count of a scry or a surveil: a number, or X (stage P16, D-103: the X of the spell or ability). */
const NUMBER_OR_X = family<IrArg>('amount', { only: ['amount.number', 'amount.x'] });

/** The value of an amount node that is a number (NaN for any other amount). */
function numberOf(amount: IrArg): number {
  return amount.kind === 'number' ? amount.value : Number.NaN;
}

const AT_LEAST = (n: number): Parser<IrArg> => satisfy(NUMBER, (a) => numberOf(a) >= n);

function keywordAction(verb: 'scry' | 'surveil', cite: string) {
  const id = `effect.${verb}`;
  return defineRule<Clauses>({
    id,
    family: 'effect',
    leading: [verb, 'you'],
    cites: [cite],
    examples:
      verb === 'scry'
        ? ['scry 1', 'scry 2', 'scry two', 'scry 0', 'you scry 3', 'scry X']
        : ['surveil 1', 'surveil 2', 'surveil two', 'you surveil 1', 'surveil X'],
    rejects: [
      `${verb} Y`,
      `${verb} x cards`,
      verb,
      `${verb} a`,
      `${verb} 1 card`,
      `${verb}s 1`,
      `target player ${verb}s 1`,
      `each player ${verb}s 1`,
      `target opponent ${verb}s 2`,
      `you may ${verb} 1`,
      `${verb} 1 then`,
    ],
    parse: single(
      id,
      sequence((ctx, pos) => {
        // "you scry 2" and "scry 2" are the same instruction (CR 701.22a, 701.25a).
        const you = literal('you ')(ctx, pos);
        return literal(`${verb} `)(ctx, you.ok ? you.pos : pos);
      }, NUMBER_OR_X),
      ([, count]) => ({ verb, args: { count } }),
    ),
  });
}

/** `effect.scry`: "Scry 2." (CR 701.22a: look at the top N cards, bottom some, reorder the rest). */
export const EFFECT_SCRY = keywordAction('scry', 'CR 701.22a (Scry)');

/** `effect.surveil`: "Surveil 1." (CR 701.25a: look at the top N cards, graveyard some, reorder the rest). */
export const EFFECT_SURVEIL = keywordAction('surveil', 'CR 701.25a (Surveil)');

/**
 * `effect.look-reorder`: "Look at the top three cards of your library, then put them back in any
 * order." It is not a scry (the keyword action is not named), so nothing that triggers on a scry
 * does. The cards are always the top of your own library; one card ("the top card") is not this
 * sentence. What follows in the same line ("You may shuffle.") is another sentence.
 */
export const EFFECT_LOOK_REORDER = defineRule<Clauses>({
  id: 'effect.look-reorder',
  family: 'effect',
  leading: ['look'],
  cites: ['CR 401.2 (Library)', 'CR 701.22a (Scry)'],
  examples: [
    'look at the top three cards of your library, then put them back in any order',
    'look at the top two cards of your library, then put them back in any order',
    'look at the top 4 cards of your library, then put them back in any order',
  ],
  rejects: [
    'look at the top card of your library, then put it back',
    'look at the top three cards of your library',
    'look at the top three cards of your library, then put them back',
    'look at the top three cards of target player’s library, then put them back in any order',
    'look at the top three cards of your library, then put one of them into your hand',
    'look at the top X cards of your library, then put them back in any order',
    'look at the top one cards of your library, then put them back in any order',
    'look at the top three cards of your library, then put them back in a random order',
  ],
  parse: single(
    'effect.look-reorder',
    sequence(
      literal('look at the top '),
      AT_LEAST(2),
      literal(' cards of your library, then put them back in any order'),
    ),
    ([, count]) => ({ verb: 'lookAndReorder', args: { count } }),
  ),
});

/**
 * `effect.put-hand-top`: "put two cards from your hand on top of your library in any order",
 * "put a card from your hand on top of your library" (CR 401.4: several cards put on top at once are
 * arranged by their owner; CR 401.2). The count is the number of cards, "a card" for one, and
 * "in any order" is said for two or more only.
 */
export const EFFECT_PUT_HAND_TOP = defineRule<Clauses>({
  id: 'effect.put-hand-top',
  family: 'effect',
  leading: ['put'],
  cites: ['CR 401.2 (Library)', 'CR 401.4 (Library)'],
  examples: [
    'put two cards from your hand on top of your library in any order',
    'put three cards from your hand on top of your library in any order',
    'put a card from your hand on top of your library',
  ],
  rejects: [
    'put two cards from your hand on top of your library',
    'put a card from your hand on top of your library in any order',
    'put two cards from your hand on the bottom of your library in any order',
    'put two cards from your graveyard on top of your library in any order',
    'put any number of cards from your hand on top of your library',
    'put a card from your hand on top of target player’s library',
    'put a land card from your hand on top of your library',
    'put one cards from your hand on top of your library',
    'put two card from your hand on top of your library in any order',
  ],
  parse: single(
    'effect.put-hand-top',
    choice(
      map(
        sequence(
          literal('put '),
          family<IrArg>('amount', { only: ['amount.article'] }),
          pattern(/ card from your hand on top of your library(?![\p{L}\p{N}])/iu),
        ),
        ([, count]) => count,
      ),
      map(
        sequence(
          literal('put '),
          AT_LEAST(2),
          pattern(/ cards from your hand on top of your library in any order(?![\p{L}\p{N}])/iu),
        ),
        ([, count]) => count,
      ),
    ),
    (count) => ({ verb: 'putFromHandOnTop', args: { count } }),
  ),
});

function takenNoun(
  ctx: { readonly text: string },
  pos: number,
  end: number,
  filter: Omit<IrFilter, 'raw'>,
) {
  const noun: IrNoun = {
    kind: 'noun',
    det: 'a',
    filter: { ...filter, card: true, raw: ctx.text.slice(pos, end) },
    upTo: false,
    plural: false,
    other: false,
    span: { start: pos, end },
    rule: 'effect.look-take',
  };
  return { ok: true, value: noun, pos: end } as const;
}

/** One kind of a list of kinds: a card type (lowercase in Oracle text, CR 205.2a) or a capitalised subtype (CR 205.3). */
type KindItem = { readonly kind: 'type' | 'subtype'; readonly value: string };

const KIND_ITEM: Parser<KindItem> = choice(
  map(
    pattern(new RegExp(`(?:${CARD_TYPES})(?![\\p{L}\\p{N}])`, 'iu')),
    (m): KindItem => ({ kind: 'type', value: (m[0] ?? '').toLowerCase() }),
  ),
  map(
    satisfy(SUBTYPE_WORD_NUMBERED, (w) => w.plural !== true),
    (w): KindItem => ({ kind: 'subtype', value: w.subtype }),
  ),
);

/**
 * "an instant, sorcery, or Dragon card", "an artifact or Wizard card" (issue 25, CR 205.2a, 205.3, 701.20a): two or more kinds, some card types and some
 * subtypes, joined as English joins a list ("A or B", "A, B, or C"); the card is any one of them (the engine's `anyOf`). A list of card types only is the
 * list of `typeChoice`, and one subtype with its card types ("a Goblin creature card") has no separator, so neither is read here.
 */
const MIXED_TAKEN_CARD: Parser<IrNoun> = (ctx, pos) => {
  const head = pattern(/an? /i)(ctx, pos);
  if (!head.ok) return head;
  const first = KIND_ITEM(ctx, head.pos);
  if (!first.ok) return first;
  const more = many(
    map(sequence(pattern(/, or | or |, /u), KIND_ITEM), ([separator, item]) => ({
      separator: separator[0] ?? '',
      item,
    })),
  )(ctx, first.pos);
  if (!more.ok) return more;
  const rest = more.value;
  const last = rest[rest.length - 1];
  if (last === undefined) return fail(ctx, pos);
  const items = [first.value, ...rest.map((r) => r.item)];
  const shaped =
    rest.slice(0, -1).every((r) => r.separator === ', ') &&
    (rest.length > 1 ? last.separator === ', or ' : last.separator === ' or ');
  const distinct = new Set(items.map((i) => i.value)).size === items.length;
  if (!shaped || !distinct || !items.some((i) => i.kind === 'subtype')) return fail(ctx, pos);
  const tail = pattern(/ card(?![\p{L}\p{N}])/iu)(ctx, more.pos);
  if (!tail.ok) return tail;
  return takenNoun(ctx, pos, tail.pos, {
    anyOf: items.map(
      (i): IrFilter =>
        i.kind === 'type'
          ? { types: [i.value], raw: i.value }
          : { subtypes: [i.value], raw: i.value },
    ),
  });
};

/**
 * "a permanent card" (D-397, CR 110.4a (Permanents): a card that could be put onto the battlefield, so an instant or a sorcery card is not): the choice of the six permanent card
 * types, as `noun.permanent-card` reads it for a phrase of cards in a zone.
 */
const PERMANENT_TAKEN_CARD: Parser<IrNoun> = (ctx, pos) => {
  const r = pattern(/a permanent card(?![\p{L}\p{N}])/iu)(ctx, pos);
  if (!r.ok) return r;
  return takenNoun(ctx, pos, r.pos, {
    anyOf: PERMANENT_CARD_TYPES.map((t): IrFilter => ({ types: [t], raw: t })),
  });
};

/** One list of card types or subtypes: "an artifact card", "a creature or land card", "a Dragon card", "a Goblin creature card". */
const PLAIN_TAKEN_CARD: Parser<IrNoun> = (ctx, pos) => {
  const r = sequence(
    pattern(/an? /i),
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
      map(sequence(typeChoice(CARD_TYPES), literal(' ')), ([types]) => types),
      null,
    ),
    optional(
      map(sequence(typeWords(CARD_TYPES, false), literal(' ')), ([types]) => types),
      [] as string[],
    ),
    pattern(/card(?![\p{L}\p{N}])/iu),
  )(ctx, pos);
  if (!r.ok) return r;
  const [, subtypes, either, types] = r.value;
  if (either !== null && types.length > 0) return fail(ctx, pos);
  const filter: IrFilter = {
    ...(types.length > 0 ? { types } : {}),
    ...(subtypes.length > 0 ? { subtypes } : {}),
    ...(either === null ? {} : { anyOf: either.map((t): IrFilter => ({ types: [t], raw: t })) }),
    card: true,
    raw: ctx.text.slice(pos, r.pos),
  };
  const noun: IrNoun = {
    kind: 'noun',
    det: 'a',
    filter,
    upTo: false,
    plural: false,
    other: false,
    span: { start: pos, end: r.pos },
    rule: 'effect.look-take',
  };
  return { ok: true, value: noun, pos: r.pos };
};

/**
 * The card a look at the top cards lets the player take: one list of card types or subtypes ("an artifact card", "a creature or land card", "a Dragon
 * card"), or a list of both kinds, "an instant, sorcery, or Dragon card" (issue 25).
 */
export const TAKEN_CARD: Parser<IrNoun> = choice(
  PERMANENT_TAKEN_CARD,
  PLAIN_TAKEN_CARD,
  MIXED_TAKEN_CARD,
);

/**
 * `effect.look-take`: "look at the top six cards of your library. You may reveal an artifact card from among them and put it into your
 * hand. Put the rest on the bottom of your library in a random order" (stage P31, D-140, CR 401.2, 701.20a: revealing shows the card,
 * CR 401.4). Three sentences that `splitSentences` keeps together: the cards looked at, the one of a kind the player may take into their
 * hand, and where the others go (the bottom in a random order, or the graveyard). The count is two or more.
 */
export const EFFECT_LOOK_TAKE = defineRule<Clauses>({
  id: 'effect.look-take',
  family: 'effect',
  leading: ['look'],
  cites: ['CR 401.2 (Library)', 'CR 701.20a (Reveal)', 'CR 401.4 (Library)'],
  examples: [
    'look at the top six cards of your library. You may reveal an artifact card from among them and put it into your hand. Put the rest on the bottom of your library in a random order',
    'look at the top four cards of your library. You may reveal a creature card from among them and put it into your hand. Put the rest into your graveyard',
    'look at the top five cards of your library. You may reveal a creature or land card from among them and put it into your hand. Put the rest on the bottom of your library in a random order',
    // Stage P32 (D-147): onto the battlefield, with a mana value limit read as the effect resolves.
    'look at the top six cards of your library. You may reveal a creature card with mana value less than or equal to the number of lands you control from among them and put it onto the battlefield. Put the rest on the bottom of your library in a random order',
    'look at the top four cards of your library. You may reveal a land card from among them and put it onto the battlefield. Put the rest into your graveyard',
    'look at the top six cards of your library. You may reveal a creature card from among them and put it onto the battlefield. Put the rest on the bottom in a random order',
    // Issue 25: a list of card types and subtypes, any one of which the card may be.
    'look at the top six cards of your library. You may reveal an instant, sorcery, or Dragon card from among them and put it into your hand. Put the rest on the bottom of your library in a random order',
    'look at the top four cards of your library. You may reveal an artifact or Wizard card from among them and put it into your hand. Put the rest into your graveyard',
  ],
  rejects: [
    'look at the top six cards of your library. You may reveal an artifact card from among them and put it into your hand',
    'look at the top six cards of your library. You may reveal an artifact card from among them and put it into your library. Put the rest on the bottom of your library in a random order',
    'look at the top six cards of your library. You may reveal an artifact card with mana value less than or equal to 3 from among them and put it into your hand. Put the rest on the bottom of your library in a random order',
    'look at the top six cards of your library. You may reveal an artifact card from among them and put it into your hand. Put the rest on the bottom of your library in any order',
    'look at the top card of your library. You may reveal an artifact card from among them and put it into your hand. Put the rest on the bottom of your library in a random order',
    'look at the top X cards of your library. You may reveal an artifact card from among them and put it into your hand. Put the rest on the bottom of your library in a random order',
    'look at the top six cards of your library. You may reveal an instant, sorcery or Dragon card from among them and put it into your hand. Put the rest on the bottom of your library in a random order',
    'look at the top six cards of your library. You may reveal an instant, or Dragon card from among them and put it into your hand. Put the rest on the bottom of your library in a random order',
    'look at the top six cards of your library. You may reveal an instant, sorcery, or dragon card from among them and put it into your hand. Put the rest on the bottom of your library in a random order',
    'look at the top six cards of your library. You may reveal an instant, sorcery, or Dragons card from among them and put it into your hand. Put the rest on the bottom of your library in a random order',
    'look at the top six cards of your library. You may reveal a Dragon or Elf creature card from among them and put it into your hand. Put the rest on the bottom of your library in a random order',
    'look at the top six cards of your library. You may reveal an instant, sorcery, or sorcery card from among them and put it into your hand. Put the rest on the bottom of your library in a random order',
  ],
  parse: single(
    'effect.look-take',
    sequence(
      literal('look at the top '),
      AT_LEAST(2),
      literal(' cards of your library. you may reveal '),
      TAKEN_CARD,
      // Stage P32 (D-147): "with mana value less than or equal to the number of lands you control", read as the effect resolves.
      optional(
        map(
          sequence(
            literal(' with mana value less than or equal to '),
            countAmount('effect.look-take', literal('the number of '), true),
          ),
          ([, amount]) => amount,
        ),
        null,
      ),
      literal(' from among them and put it '),
      spanned(choice(literal('into your hand'), literal('onto the battlefield'))),
      literal('. put the rest '),
      spanned(
        choice(
          // "on the bottom in a random order" is the wording of the newer cards (stage P32).
          map(
            pattern(/on the bottom (?:of your library )?in a random order(?![\p{L}\p{N}])/iu),
            () => 'bottomRandom' as const,
          ),
          map(literal('into your graveyard'), () => 'graveyard' as const),
        ),
      ),
    ),
    ([, count, , take, atMost, , where, , rest]) => ({
      verb: 'lookTake',
      args: {
        count,
        take,
        // Set when the rest go to the graveyard; the bottom in a random order otherwise.
        toGraveyard: {
          kind: 'flag',
          value: rest.value === 'graveyard',
          span: rest.span,
          rule: 'effect.look-take',
        },
        // Set when the card taken goes onto the battlefield; into the hand otherwise.
        ontoBattlefield: {
          kind: 'flag',
          value: where.value.toLowerCase() === 'onto the battlefield',
          span: where.span,
          rule: 'effect.look-take',
        },
        ...(atMost === null ? {} : { manaValueAtMost: atMost }),
      },
    }),
  ),
});

/**
 * `effect.look-split`: "look at the top three cards of your library. Put one of them into your hand, put one of them on the bottom of your library, and
 * exile one of them" (stage P63, D-216, CR 401.2, 608.2c): the cards looked at are sorted into three piles, the player choosing the first two. Two
 * sentences that `splitSentences` keeps together. The numbers are words or digits and must add up to the cards looked at (all are placed).
 */
export const EFFECT_LOOK_SPLIT = defineRule<Clauses>({
  id: 'effect.look-split',
  family: 'effect',
  leading: ['look'],
  cites: ['CR 401.2 (Library)', 'CR 608.2c (Resolving Spells and Abilities)', 'CR 701.13 (Exile)'],
  examples: [
    'look at the top three cards of your library. put one of them into your hand, put one of them on the bottom of your library, and exile one of them',
  ],
  rejects: [
    'look at the top three cards of your library. put one of them into your hand, put one of them on the bottom of your library',
    'look at the top three cards of your library. put one of them into your hand, put one of them on the bottom of your library, and exile two of them',
    'look at the top four cards of your library. put one of them into your hand, put one of them on the bottom of your library, and exile one of them',
    'look at the top three cards of your library. put one of them into your hand, put one of them into your graveyard, and exile one of them',
    'look at the top three cards of target player’s library. put one of them into your hand, put one of them on the bottom of your library, and exile one of them',
  ],
  parse: single(
    'effect.look-split',
    satisfy(
      sequence(
        literal('look at the top '),
        AT_LEAST(2),
        literal(' cards of your library. put '),
        NUMBER,
        literal(' of them into your hand, put '),
        NUMBER,
        literal(' of them on the bottom of your library, and exile '),
        NUMBER,
        literal(' of them'),
      ),
      ([, count, , hand, , bottom, , exile]) =>
        numberOf(count) === numberOf(hand) + numberOf(bottom) + numberOf(exile),
    ),
    ([, count, , hand, , bottom, , exile]) => ({
      verb: 'lookAndSplit',
      args: { count, hand, bottom, exile },
    }),
  ),
});

/**
 * `effect.look-take-bottom`: "look at the top five cards of your library. Put two of them into your hand and the rest on the bottom of your library in any order" (Stock Up,
 * D-324, CR 401.2, 401.4): two sentences that `splitSentences` keeps together. The cards put into the hand are not revealed (no "reveal" is said, CR 701.20a), the player who looks
 * chooses which, and chooses the order of the rest on the bottom (CR 401.4: the owner arranges cards put into a library at the same time). Not read: a number of cards
 * taken that is not smaller than the number looked at (nothing would be left), "a random order" (that is `effect.look-take`), another library, X, another place for either group.
 */
export const EFFECT_LOOK_TAKE_BOTTOM = defineRule<Clauses>({
  id: 'effect.look-take-bottom',
  family: 'effect',
  leading: ['look'],
  cites: ['CR 401.2 (Library)', 'CR 401.4 (Library)', 'CR 701.20a (Reveal)'],
  examples: [
    'look at the top five cards of your library. put two of them into your hand and the rest on the bottom of your library in any order',
    'look at the top four cards of your library. put one of them into your hand and the rest on the bottom of your library in any order',
    'look at the top 3 cards of your library. put 1 of them into your hand and the rest on the bottom of your library in any order',
  ],
  rejects: [
    'look at the top five cards of your library. put two of them into your hand and the rest on the bottom of your library',
    'look at the top five cards of your library. put two of them into your hand and the rest on the bottom of your library in a random order',
    'look at the top five cards of your library. put two of them into your hand and the rest into your graveyard',
    'look at the top five cards of your library. put two of them onto the battlefield and the rest on the bottom of your library in any order',
    'look at the top five cards of your library. put five of them into your hand and the rest on the bottom of your library in any order',
    'look at the top two cards of your library. put three of them into your hand and the rest on the bottom of your library in any order',
    'look at the top five cards of your library. put zero of them into your hand and the rest on the bottom of your library in any order',
    'look at the top x cards of your library. put two of them into your hand and the rest on the bottom of your library in any order',
    'look at the top five cards of target player’s library. put two of them into your hand and the rest on the bottom of your library in any order',
    'look at the top five cards of your library. put two of them into your hand and the rest on top of your library in any order',
    'look at the top five cards of your library. put two of them into your hand',
  ],
  parse: single(
    'effect.look-take-bottom',
    satisfy(
      sequence(
        literal('look at the top '),
        AT_LEAST(2),
        literal(' cards of your library. put '),
        AT_LEAST(1),
        literal(' of them into your hand and the rest on the bottom of your library in any order'),
      ),
      ([, count, , taken]) => numberOf(taken) < numberOf(count),
    ),
    ([, count, , taken]) => ({ verb: 'lookTakeBottom', args: { count, taken } }),
  ),
});

export const LIBRARY_RULES = [
  EFFECT_SCRY,
  EFFECT_SURVEIL,
  EFFECT_LOOK_REORDER,
  EFFECT_LOOK_TAKE,
  EFFECT_LOOK_TAKE_BOTTOM,
  EFFECT_LOOK_SPLIT,
  EFFECT_PUT_HAND_TOP,
];
