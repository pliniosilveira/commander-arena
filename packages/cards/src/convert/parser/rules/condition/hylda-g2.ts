/**
 * Conditions of group 2 of the Hylda deck (issue 42, D-1511, D-1513): the card types among the cards of a graveyard ("if there are four or more card types among cards in your
 * graveyard", Delirium, Topplegeist) and the state of the permanent an Aura enchants ("if enchanted creature is untapped", Narcolepsy). Both are read after the "if" of an
 * intervening "if" (CR 603.4: checked as the ability triggers and again as it resolves).
 */
import { fail, literal, map, type Parser, pattern, satisfy, sequence } from '../../combinators';
import type { IrAmount, IrComparison, IrCondition } from '../../ir/types';
import { counted } from '../amount/count';
import { quantity } from '../amount/index';
import { BOUNDARY } from '../noun/phrases';
import { defineRule, spanned } from '../registry';

function condition(
  rule: string,
  start: number,
  end: number,
  test: IrCondition['test'],
): IrCondition {
  return { kind: 'condition', test, span: { start, end }, rule };
}

/** "N or more", "N or fewer": the comparison of a whole number (CR 107.1). */
function numberCompare(): Parser<IrComparison> {
  return map(
    sequence(
      satisfy(quantity, (n) => n >= 1),
      pattern(/ or (more|greater|less|fewer)(?![\p{L}\p{N}])/iu),
    ),
    ([value, word]): IrComparison => ({
      cmp: ['more', 'greater'].includes((word[1] ?? '').toLowerCase()) ? 'atLeast' : 'atMost',
      value,
    }),
  );
}

/**
 * `condition.card-types-among`: "there are four or more card types among cards in your graveyard" (CR 205.2a, 603.4, 608.2c; the ability word Delirium, CR 207.2c): how many card
 * types the cards of a zone have between them, each once however many have it (a supertype or a subtype is no card type), compared with a number. The engine's `amountIs` of a
 * `cardTypesAmong`, worked out when the condition is read. The cards are the ones the count phrase names ("cards in your graveyard", "creature cards in your graveyard"): a zone
 * other than the battlefield. Not read: no number, a number with no "or more" ("exactly four"), "types" with no "card", "among permanents", "among cards on the battlefield", "among
 * the cards", a zone with no owner ("in a graveyard" is read by the count phrase as every graveyard).
 */
export const CONDITION_CARD_TYPES_AMONG = defineRule<IrCondition>({
  id: 'condition.card-types-among',
  family: 'condition',
  leading: ['there'],
  cites: [
    'CR 205.2a (Card Types)',
    'CR 603.4 (Handling Triggered Abilities)',
    'CR 608.2c (Resolving Spells and Abilities)',
    'CR 207.2c (Text Box)',
  ],
  examples: [
    'there are four or more card types among cards in your graveyard',
    'there are 3 or more card types among cards in your graveyard',
    'there are two or fewer card types among cards in your graveyard',
    'there are four or more card types among creature cards in your graveyard',
  ],
  rejects: [
    'there are four card types among cards in your graveyard',
    'there are four or more card types among cards in your graveyard.',
    'there are four or more card types',
    'there are four or more types among cards in your graveyard',
    'there are four or more card types among permanents you control',
    'there are four or more card types among cards on the battlefield',
    'there are four or more card types among the cards in your graveyard',
    'there are zero or more card types among cards in your graveyard',
    'there is four or more card types among cards in your graveyard',
    'you have four or more card types among cards in your graveyard',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal('there are '),
      numberCompare(),
      literal(' card types among '),
      // The plural group of cards in a zone: "cards in your graveyard".
      counted('condition.card-types-among', true),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, compare, , of] = r.value;
    // Only cards in a zone other than the battlefield (the count phrase also reads permanents).
    if (of.filter.card !== true) return fail(ctx, pos);
    const amount: IrAmount = { kind: 'cardTypesAmong', of, span: of.span };
    return {
      ok: true,
      value: condition('condition.card-types-among', pos, r.pos, {
        kind: 'amountIs',
        amount,
        compare,
      }),
      pos: r.pos,
    };
  },
});

/**
 * `condition.host-is-tapped`: "enchanted creature is untapped", "enchanted creature is tapped", "equipped creature is untapped" (CR 303.4b, 301.5a, 701.26: the permanent an Aura or an
 * Equipment is attached to is untapped or tapped). The engine's `objectMatches` of the permanent the source is attached to, read as it is when the condition is read (a trigger's
 * intervening "if" is read as the ability triggers and again as it resolves, CR 603.4). The word of the condition says the kind of attachment the source is, which the face must
 * be. Not read: another type ("enchanted land is untapped"), "isn't untapped", "is untapped or tapped", "attacking", "~ is untapped" (`condition.this-tapped`), "target creature is
 * untapped".
 */
export const CONDITION_HOST_IS_TAPPED = defineRule<IrCondition>({
  id: 'condition.host-is-tapped',
  family: 'condition',
  leading: ['enchanted', 'equipped'],
  cites: [
    'CR 303.4b (Auras)',
    'CR 301.5a (Equipment)',
    'CR 701.26 (Tap and Untap)',
    'CR 603.4 (Handling Triggered Abilities)',
  ],
  examples: [
    'enchanted creature is untapped',
    'enchanted creature is tapped',
    'equipped creature is untapped',
    'Enchanted creature is untapped',
  ],
  rejects: [
    'enchanted creature is untapped.',
    'enchanted land is untapped',
    "enchanted creature isn't untapped",
    'enchanted creature is untapped or tapped',
    'enchanted creature is attacking',
    'enchanted creature is',
    'target creature is untapped',
    'enchanted creatures are untapped',
    'enchanted creature is untapped and tapped',
    '~ is untapped',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(
        new RegExp(
          `(enchanted|equipped) creature is (untapped|tapped)${BOUNDARY}(?! (?:or|and) (?:untapped|tapped)${BOUNDARY})`,
          'iu',
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const via = (r.value.value[1] ?? '').toLowerCase() === 'enchanted' ? 'enchanted' : 'equipped';
    const tapped = (r.value.value[2] ?? '').toLowerCase() === 'tapped';
    return {
      ok: true,
      value: condition('condition.host-is-tapped', pos, r.pos, {
        kind: 'attachedTo',
        filter: { types: ['creature'], tapped, raw: `${via} creature is ${r.value.value[2]}` },
        via,
      }),
      pos: r.pos,
    };
  },
});

export const HYLDA_G2_CONDITION_RULES = [CONDITION_CARD_TYPES_AMONG, CONDITION_HOST_IS_TAPPED];
