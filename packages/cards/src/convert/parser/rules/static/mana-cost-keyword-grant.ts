/**
 * Static rules of the permanents that give the cards of their controller's hand or graveyard a keyword whose cost is made from the card's mana cost:
 * "Each enchantment card in your hand has miracle. Its miracle cost is equal to its mana cost reduced by {4}." (CR 702.94a) and "Each enchantment card in your graveyard has escape. The
 * escape cost is equal to the card's mana cost plus exile three other cards from your graveyard." (CR 702.138a).
 */
import { fail, literal, type Parser, pattern, sequence } from '../../combinators';
import type { IrFilter, IrNoun, IrStatic } from '../../ir/types';
import { BOUNDARY, CARD_TYPES, typeChoice } from '../noun/phrases';
import { defineRule } from '../registry';

const RULE = 'static.cards-have-keyword-from-mana-cost';

const NUMBER_WORDS: Readonly<Record<string, number>> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

/**
 * "enchantment card(s)": the card types of the cards a keyword is given to, one type or several joined by "or" or "and" (the cards that are any of them), as the noun of the statement. The
 * filter names the cards by what they are: no zone and no controller (the words "in your hand" or "in your graveyard" are read by the caller). `raw` is the text read.
 */
const GRANTED_CARDS: Parser<IrNoun> = (ctx, pos) => {
  const one = pattern(new RegExp(`(${CARD_TYPES}) cards?${BOUNDARY}`, 'iu'))(ctx, pos);
  const several = (join: 'or' | 'and') =>
    sequence(typeChoice(CARD_TYPES, false, join), pattern(new RegExp(` cards?${BOUNDARY}`, 'iu')));
  let list: readonly string[];
  let end: number;
  if (one.ok) {
    list = [(one.value[1] ?? '').toLowerCase()];
    end = one.pos;
  } else {
    const r = [several('or')(ctx, pos), several('and')(ctx, pos)].find((x) => x.ok);
    if (r === undefined || !r.ok) return fail(ctx, pos);
    list = r.value[0];
    end = r.pos;
  }
  const raw = ctx.text.slice(pos, end);
  const filter: IrFilter =
    list.length === 1
      ? { types: [...list], card: true, raw }
      : { anyOf: list.map((t): IrFilter => ({ types: [t], raw: t })), card: true, raw };
  return {
    ok: true,
    value: {
      kind: 'noun',
      det: 'each',
      filter,
      upTo: false,
      plural: true,
      other: false,
      span: { start: pos, end },
      rule: RULE,
    },
    pos: end,
  };
};

/** "its mana cost" or "the card's mana cost": the cost the keyword's is equal to. */
const OWN_MANA_COST = /(?:its|the card['’]s) mana cost/iu;

const miracleTail = pattern(
  new RegExp(
    ` in your hand has miracle\\. its miracle cost is equal to ${OWN_MANA_COST.source}(?: reduced by \\{(\\d+)\\})?\\.`,
    'iu',
  ),
);

const escapeTail = pattern(
  new RegExp(
    ` in your graveyard has escape\\. the escape cost is equal to ${OWN_MANA_COST.source} plus exile (\\d+|${Object.keys(NUMBER_WORDS).join('|')}) other cards? from your graveyard\\.`,
    'iu',
  ),
);

/**
 * `static.cards-have-keyword-from-mana-cost`: "Each <types> card in your hand has miracle. Its miracle cost is equal to its mana cost [reduced by {N}]." and "Each <types> card in your
 * graveyard has escape. The escape cost is equal to the card's mana cost plus exile N other cards from your graveyard." The cards of that kind in the hand (miracle, CR 702.94a) or the
 * graveyard (escape, CR 702.138a) of the controller of the permanent have the keyword, with the cost made from the card's own mana cost (CR 118.9: an alternative cost; CR 118.7a: a
 * reduction of generic mana takes only generic mana), for as long as the permanent is on the battlefield (CR 604.3, 613.1f). The two sentences are one statement: the second says the cost
 * of what the first gives. The engine's `grantKeywordFromManaCost`. Not read: another zone for the keyword, another cost, a reduction of coloured mana, another keyword, the first sentence
 * alone, cards of another player.
 */
export const STATIC_CARDS_HAVE_KEYWORD_FROM_MANA_COST = defineRule<IrStatic>({
  id: RULE,
  family: 'static',
  leading: ['each'],
  cites: [
    'CR 702.94a (Miracle)',
    'CR 702.138a (Escape)',
    'CR 118.9 (Alternative Costs)',
    'CR 118.7a (Costs)',
    'CR 613.1f (Interaction of Continuous Effects)',
    'CR 604.3 (Handling Static Abilities)',
  ],
  examples: [
    'Each enchantment card in your hand has miracle. Its miracle cost is equal to its mana cost reduced by {4}.',
    'Each enchantment card in your hand has miracle. Its miracle cost is equal to its mana cost reduced by {2}.',
    'Each creature card in your hand has miracle. Its miracle cost is equal to its mana cost.',
    "Each enchantment card in your graveyard has escape. The escape cost is equal to the card's mana cost plus exile three other cards from your graveyard.",
    'Each enchantment card in your graveyard has escape. The escape cost is equal to the card’s mana cost plus exile three other cards from your graveyard.',
    'Each artifact or creature card in your graveyard has escape. The escape cost is equal to its mana cost plus exile two other cards from your graveyard.',
  ],
  rejects: [
    'Each enchantment card in your hand has miracle.',
    'Each enchantment card in your hand has miracle. Its miracle cost is equal to its mana cost reduced by {4}',
    'Each enchantment card in your hand has miracle. Its miracle cost is equal to its mana cost reduced by {W}.',
    'Each enchantment card in your hand has miracle. Its miracle cost is equal to {2}.',
    'Each enchantment card in your graveyard has miracle. Its miracle cost is equal to its mana cost reduced by {4}.',
    'Each enchantment card in your hand has escape. The escape cost is equal to its mana cost plus exile three other cards from your graveyard.',
    'Each enchantment card in your graveyard has escape.',
    "Each enchantment card in your graveyard has escape. The escape cost is equal to the card's mana cost.",
    "Each enchantment card in your graveyard has escape. The escape cost is equal to the card's mana cost plus exile three other cards from a graveyard.",
    "Each enchantment card in your graveyard has escape. The escape cost is equal to the card's mana cost plus {2}.",
    "Each enchantment card in an opponent's graveyard has escape. The escape cost is equal to the card's mana cost plus exile three other cards from your graveyard.",
    'Each enchantment card in your graveyard has escape until end of turn. The escape cost is equal to its mana cost plus exile three other cards from your graveyard.',
    'Each enchantment card in your hand has miracle and flying. Its miracle cost is equal to its mana cost reduced by {4}.',
  ],
  parse: (ctx, pos) => {
    // The words up to the keyword decide whether this is the statement at all: their failure leaves no trace in the diagnostics.
    const lead = literal('each ')(ctx, pos);
    if (!lead.ok) return lead;
    const cards = GRANTED_CARDS(ctx, lead.pos);
    if (!cards.ok) return cards;
    const miracle = miracleTail(ctx, cards.pos);
    const escapeRead = miracle.ok ? null : escapeTail(ctx, cards.pos);
    let end: number;
    let grant: Extract<IrStatic['effects'][number], { kind: 'manaCostKeywordGrant' }>;
    if (miracle.ok) {
      end = miracle.pos;
      grant = {
        kind: 'manaCostKeywordGrant',
        cards: cards.value,
        keyword: 'miracle',
        reduce: Number(miracle.value[1] ?? 0),
        exile: 0,
      };
    } else if (escapeRead?.ok) {
      const word = (escapeRead.value[1] ?? '').toLowerCase();
      const count = NUMBER_WORDS[word] ?? Number(word);
      if (!Number.isSafeInteger(count)) return fail(ctx, pos);
      end = escapeRead.pos;
      grant = {
        kind: 'manaCostKeywordGrant',
        cards: cards.value,
        keyword: 'escape',
        reduce: 0,
        exile: count,
      };
    } else {
      return fail(ctx, pos);
    }
    return {
      ok: true,
      value: {
        kind: 'static',
        subject: {
          kind: 'noun',
          det: 'you',
          filter: { raw: 'You' },
          upTo: false,
          plural: false,
          other: false,
          span: { start: pos, end: pos + 4 },
          rule: RULE,
        },
        effects: [grant],
        span: { start: pos, end },
        rule: RULE,
      },
      pos: end,
    };
  },
});

export const MANA_COST_KEYWORD_GRANT_STATIC_RULES = [STATIC_CARDS_HAVE_KEYWORD_FROM_MANA_COST];
