/**
 * `condition.cards-exiled-with-self`: "there are cards exiled with ~" (Valakut Exploration; CR 603.4 intervening "if", 607.2a linked abilities): at least one card the permanent exiled with
 * its linked ability is still in exile, read as the ability triggers and again as it resolves. The engine's `amountIs` of a count of the cards `exiledWithSource`; the lowering accepts it
 * only as the intervening "if" of a triggered ability, and leaves the cards for "put them into their owner's graveyard" to name. Not read: "a card exiled with ~", "no cards exiled with ~",
 * "cards exiled with it", another source, "there are three or more cards exiled with ~", "cards in exile".
 */
import { literal, pattern, satisfy, sequence } from '../../combinators';
import type { IrCondition } from '../../ir/types';
import { quantity } from '../amount/index';
import { defineRule, quietly, spanned } from '../registry';

export const CONDITION_CARDS_EXILED_WITH_SELF = defineRule<IrCondition>({
  id: 'condition.cards-exiled-with-self',
  family: 'condition',
  leading: ['there'],
  cites: ['CR 603.4 (Handling Triggered Abilities)', 'CR 607.2a (Linked Abilities)'],
  examples: ['there are cards exiled with ~'],
  rejects: [
    'there is a card exiled with ~',
    'there are no cards exiled with ~',
    'there are cards exiled with it',
    'there are cards exiled with target creature',
    'there are three or more cards exiled with ~',
    'there are cards in exile',
    'there are cards exiled with ~.',
    'there are cards exiled with ~ and',
    'there are creature cards exiled with ~',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(/there are cards exiled with ~(?![\p{L}\p{N}'’])(?!\s+(?:and|or)\b)/iu),
    )(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'cardsExiledWithSelf' },
        span: r.value.span,
        rule: 'condition.cards-exiled-with-self',
      },
      pos: r.pos,
    };
  },
});

/**
 * `condition.n-cards-exiled-with-self`: "three or more cards have been exiled with ~" (Colfenor's Urn; CR 603.4 intervening "if", 607.2a linked abilities): at least that many cards
 * the permanent exiled with its linked ability are still in exile, read as the ability triggers and again as it resolves. The engine's `amountIs` of the count of the cards
 * `exiledWithSource`, as `condition.cards-exiled-with-self` with a larger least; the cards are what "those cards" names after it. Not read: "one or more" (a plain "a card"), "fewer",
 * "exactly", another verb ("were exiled"), another source, a kind of card ("creature cards"), a trailing word.
 */
export const CONDITION_N_CARDS_EXILED_WITH_SELF = defineRule<IrCondition>({
  id: 'condition.n-cards-exiled-with-self',
  family: 'condition',
  leading: ['two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'],
  cites: ['CR 603.4 (Handling Triggered Abilities)', 'CR 607.2a (Linked Abilities)'],
  examples: [
    'three or more cards have been exiled with ~',
    'two or more cards have been exiled with ~',
  ],
  rejects: [
    'one or more cards have been exiled with ~',
    'three or fewer cards have been exiled with ~',
    'three cards have been exiled with ~',
    'three or more cards were exiled with ~',
    'three or more cards have been exiled with it',
    'three or more cards have been exiled with target creature',
    'three or more creature cards have been exiled with ~',
    'three or more cards have been exiled with ~.',
    'three or more cards have been exiled with ~ and',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      spanned(satisfy(quantity, (n) => n >= 2)),
      literal(' or more cards have been exiled with ~'),
      pattern(/(?![\p{L}\p{N}'’])(?!\s+(?:and|or)\b)/iu),
    )(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'cardsExiledWithSelf', atLeast: r.value[0].value },
        span: { start: pos, end: r.pos },
        rule: 'condition.n-cards-exiled-with-self',
      },
      pos: r.pos,
    };
  },
});

/**
 * `condition.a-card-exiled-with-self`: "a card is exiled with it", "a card is exiled with ~" (Smirking Spelljacker; CR 603.4 intervening "if", 607.2a linked abilities): at least one card the
 * permanent exiled with its linked ability is still in exile, as `condition.cards-exiled-with-self` says it. "It" is the permanent with the ability. Not read: "a card has been exiled with ~", "no
 * card is exiled with it", "a creature card is exiled with it", "cards are exiled with it", another source, a trailing word.
 */
export const CONDITION_A_CARD_EXILED_WITH_SELF = defineRule<IrCondition>({
  id: 'condition.a-card-exiled-with-self',
  family: 'condition',
  leading: ['a'],
  cites: ['CR 603.4 (Handling Triggered Abilities)', 'CR 607.2a (Linked Abilities)'],
  examples: ['a card is exiled with it', 'a card is exiled with ~'],
  rejects: [
    'a card has been exiled with it',
    'no card is exiled with it',
    'a creature card is exiled with it',
    'cards are exiled with it',
    'a card is exiled with target creature',
    'a card is exiled with it.',
    'a card is exiled with it and',
    'a card is exiled with it or',
    'a card is exiled with them',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(/a card is exiled with (?:it|~)(?![\p{L}\p{N}'’])(?!\s+(?:and|or)\b)/iu),
    )(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'cardsExiledWithSelf' },
        span: r.value.span,
        rule: 'condition.a-card-exiled-with-self',
      },
      pos: r.pos,
    };
  },
});

export const EXILED_WITH_CONDITION_RULES = [
  CONDITION_A_CARD_EXILED_WITH_SELF,
  CONDITION_CARDS_EXILED_WITH_SELF,
  CONDITION_N_CARDS_EXILED_WITH_SELF,
].map(quietly);
