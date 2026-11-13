/**
 * Conditions of stage P30 (D-135, D-136): what the engine's recursion slice reads. "If it's a Zombie card" (an object an
 * earlier instruction moved or named, against a description of what it is) and "if the gift was promised" (CR 702.174k)
 * begin the sentence of a body or are the intervening "if" of a triggered ability; "an opponent controls four or more
 * nonbasic lands" is the test of a reduction of the cost of an ability (`restriction.cost-reduction`).
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
  separatedBy1,
  sequence,
} from '../../combinators';
import type { IrCondition, IrFilter, IrNoun } from '../../ir/types';
import { quantity } from '../amount/index';
import {
  BOUNDARY,
  CARD_TYPES,
  type FilterParts,
  MODIFIER,
  NO_PARTS,
  permanentPhrase,
  toFilter,
  typeWords,
  withoutZone,
} from '../noun/phrases';
import { SUBTYPE_WORD_NUMBERED } from '../noun/subtypes';
import { defineRule, spanned } from '../registry';

/** One or more singular subtype words in a row ("Zombie", "Elf Warrior"): the words of CR 205.3 the grammar knows. */
const SUBTYPE_RUN = separatedBy1(
  satisfy(SUBTYPE_WORD_NUMBERED, (word) => word.plural !== true),
  literal(' '),
);

const CARD_WORD = pattern(new RegExp(` card${BOUNDARY}`, 'iu'));

/** The filter of modifiers, subtypes and card types, with no zone: it says what an object is, not where it is. */
function whatItIs(
  modifiers: readonly ((p: FilterParts) => FilterParts)[],
  subtypes: readonly string[],
  types: readonly string[],
  raw: string,
): IrFilter {
  const parts = modifiers.reduce<FilterParts>((acc, m) => m(acc), { ...NO_PARTS, types });
  return withoutZone({
    ...toFilter('battlefield', parts, raw),
    ...(subtypes.length > 0 ? { subtypes: [...subtypes] } : {}),
  });
}

/**
 * What follows "it's a": a creature type with card types after it ("Zombie", "Zombie creature", "Angel card"), or modifiers and
 * card types ("creature card", "nonland card", "legendary creature"), each with " card" after it when the text says so.
 */
export const WHAT_IT_IS: Parser<IrFilter> = (ctx, pos) => {
  const named = map(
    sequence(
      SUBTYPE_RUN,
      optional(sequence(literal(' '), typeWords(CARD_TYPES, false)), null),
      optional(CARD_WORD, null),
    ),
    ([words, typed]) => ({
      modifiers: [] as ((p: FilterParts) => FilterParts)[],
      subtypes: words.map((word) => word.subtype),
      types: typed === null ? [] : typed[1],
    }),
  );
  const typed = map(
    sequence(many(MODIFIER), typeWords(CARD_TYPES, false), optional(CARD_WORD, null)),
    ([modifiers, types]) => ({ modifiers, subtypes: [] as string[], types }),
  );
  const modifiedCard = map(
    sequence(
      satisfy(many(MODIFIER), (modifiers) => modifiers.length > 0),
      pattern(new RegExp(`card${BOUNDARY}`, 'iu')),
    ),
    ([modifiers]) => ({ modifiers, subtypes: [] as string[], types: [] as string[] }),
  );
  const r = choice(named, typed, modifiedCard)(ctx, pos);
  if (!r.ok) return r;
  const { modifiers, subtypes, types } = r.value;
  return {
    ok: true,
    value: whatItIs(modifiers, subtypes, types, ctx.text.slice(pos, r.pos)),
    pos: r.pos,
  };
};

/**
 * `condition.it-matches`: "it's a Zombie card", "it's an Angel", "it's a creature card" (CR 608.2c, 113.7a: an instruction later
 * in the text asks what an object an earlier one moved is, as it is or, once it has left, as it last was; CR 205.3 creature types,
 * 205.2 card types). "It" is an object the binding pass finds (a target of the text, `m1` and the like are refused by the lowering);
 * what it is is a filter with no zone, controller or owner. The engine's `objectMatches`, in a `conditional` effect.
 */
export const CONDITION_IT_MATCHES = defineRule<IrCondition>({
  id: 'condition.it-matches',
  family: 'condition',
  leading: ['it’s', "it's", 'it', 'that'],
  cites: [
    'CR 608.2c (Resolving Spells and Abilities)',
    'CR 113.7a (Abilities)',
    'CR 205.3 (Subtypes)',
  ],
  examples: [
    "it's a Zombie card",
    'it’s a Zombie card',
    "it's an Angel",
    "it's a Zombie creature card",
    "it's a creature card",
    "it's a nonland card",
    "it's a legendary creature",
    "it's an Elf Warrior",
    // Stage P32 (D-147): the same test said in the past, of a card an earlier instruction exiled.
    'it was a creature card',
    'it was an Angel',
    'it was a Zombie card',
    // Stage P33 (D-150): the same test said of a noun, "that land is a Plains" (the permanent whose event triggered the ability).
    'that land is a Plains',
    'that creature is an Angel',
    'that card is a creature card',
  ],
  rejects: [
    "it's a card",
    "it's a Zombie cards",
    "it's Zombie",
    "it's a Banana",
    "it's a Zombie card from your graveyard",
    "it's not a Zombie card",
    "it's tapped",
    "it's a Zombie or a Goblin",
    'it is a Zombie card',
    'it was Zombie',
    'it was not a creature card',
    "that's a Zombie card",
    'that land is Plains',
    'that land is not a Plains',
    'that land is a Plains or a Forest',
    'that is a Plains',
    'that land card is a Plains',
  ],
  parse: (ctx, pos) => {
    const lead = spanned(pattern(/(it(?:['’]s| was)|that [a-z]+ (?:is|was)) (?:a|an) /iu))(
      ctx,
      pos,
    );
    if (!lead.ok) return lead;
    const what = WHAT_IT_IS(ctx, lead.pos);
    if (!what.ok) return what;
    // The words that name the object: "it", or "that land" (stage P33); the binding pass finds what they mean.
    const words = (lead.value.value[1] ?? 'it').replace(/ (?:is|was)$/iu, '');
    const named = words.toLowerCase().startsWith('it') ? 'it' : words;
    const it: IrNoun = {
      kind: 'noun',
      det: 'anaphor',
      filter: { raw: named },
      upTo: false,
      plural: false,
      other: false,
      span: { start: pos, end: pos + named.length },
      rule: 'condition.it-matches',
    };
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'objectMatches', who: it, filter: what.value },
        span: { start: pos, end: what.pos },
        rule: 'condition.it-matches',
      },
      pos: what.pos,
    };
  },
});

/**
 * `condition.its-mana-value`: "its mana value was 3 or less", "its mana value is 4 or greater", "its mana value was 2" (D-298, CR 202.3, 608.2c, 113.7a: an
 * instruction later in the text asks the mana value of an object an earlier one named, as it is or, once it has left, as it last was). "It" is an object
 * the binding pass finds (a target of the text; the lowering refuses what it cannot find); the number is a digit string and the direction "or less" or "or
 * greater". The engine's `objectMatches` with a mana value comparison, in a `conditional` effect. D-1213 (Danitha group 1b, Cosmic Rebirth): "it has mana value 3 or less" says
 * the same, the present of "have" for a card an earlier sentence chose (CR 202.3).
 */
export const CONDITION_ITS_MANA_VALUE = defineRule<IrCondition>({
  id: 'condition.its-mana-value',
  family: 'condition',
  leading: ['its', 'it’s', 'it'],
  cites: [
    'CR 202.3 (Mana Cost and Color)',
    'CR 608.2c (Resolving Spells and Abilities)',
    'CR 113.7a (Abilities)',
  ],
  examples: [
    'its mana value was 3 or less',
    'its mana value is 4 or greater',
    'its mana value was 0',
    // D-1213: the present of "have".
    'it has mana value 3 or less',
    'it has mana value 4 or greater',
    'it has mana value 0',
  ],
  rejects: [
    'it has mana value',
    'it has mana value three or less',
    'it has mana value X or less',
    'it has a mana value of 3 or less',
    'it had mana value 3 or less',
    'it has mana value 3 or more',
    'they have mana value 3 or less',
    'its mana value was',
    'its mana value was three or less',
    'its mana value was X or less',
    'its mana value was 3 or fewer',
    'its mana value was 3 or more',
    'its mana value was 3 or less or it was a land',
    'its power was 3 or less',
    'their mana value was 3 or less',
    'its mana value 3 or less',
    'its mana value was 3 or lesser',
    'it was a land',
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      /(?:its mana value (?:was|is)|it has mana value) (\d+)(?: or (less|greater))?(?![\p{L}\p{N}])/iu,
    )(ctx, pos);
    if (!r.ok) return r;
    const value = Number(r.value[1]);
    if (!Number.isSafeInteger(value)) return fail(ctx, pos);
    const cmp = (r.value[2] ?? '').toLowerCase();
    // The words that name the object: "its" (the span of the old reading) or "it" of "it has".
    const named = r.value[0].toLowerCase().startsWith('its') ? 3 : 2;
    const it: IrNoun = {
      kind: 'noun',
      det: 'anaphor',
      filter: { raw: 'it' },
      upTo: false,
      plural: false,
      other: false,
      span: { start: pos, end: pos + named },
      rule: 'condition.its-mana-value',
    };
    const filter: IrFilter = {
      manaValue: {
        cmp: cmp === 'less' ? 'atMost' : cmp === 'greater' ? 'atLeast' : 'equal',
        value,
      },
      raw: r.value[0],
    };
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'objectMatches', who: it, filter },
        span: { start: pos, end: r.pos },
        rule: 'condition.its-mana-value',
      },
      pos: r.pos,
    };
  },
});

/**
 * `condition.gift-promised`: "the gift was promised" (CR 702.174k: a spell was cast with its gift cost paid, or the permanent came
 * from such a spell; the opponent was chosen as it was cast). The engine's `giftPromised`, which needs the keyword Gift on the face.
 */
export const CONDITION_GIFT_PROMISED = defineRule<IrCondition>({
  id: 'condition.gift-promised',
  family: 'condition',
  leading: ['the'],
  cites: ['CR 702.174k (Gift)', 'CR 702.174a (Gift)', 'CR 603.4 (Handling Triggered Abilities)'],
  examples: ['the gift was promised', 'The gift was promised'],
  rejects: [
    'the gift was not promised',
    "the gift wasn't promised",
    'the gift is promised',
    'its gift cost was paid',
    'the gift was promised to you',
    'a gift was promised',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/the gift was promised(?![\p{L}\p{N}])/iu)(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'giftPromised' },
        span: { start: pos, end: r.pos },
        rule: 'condition.gift-promised',
      },
      pos: r.pos,
    };
  },
});

/**
 * `condition.opponent-controls-at-least`: "an opponent controls four or more nonbasic lands" (CR 109.4: the objects a player controls;
 * CR 205.4 supertypes): some one opponent of the controller controls that many permanents that match, not the opponents together. A
 * count of two or more of a plural phrase with no controller of its own. The engine's `opponentControlsAtLeast`.
 */
export const CONDITION_OPPONENT_CONTROLS_AT_LEAST = defineRule<IrCondition>({
  id: 'condition.opponent-controls-at-least',
  family: 'condition',
  leading: ['an'],
  cites: ['CR 109.4 (Objects)', 'CR 205.4 (Supertypes)', 'CR 603.4 (Handling Triggered Abilities)'],
  examples: [
    'an opponent controls four or more nonbasic lands',
    'an opponent controls two or more creatures',
    'an opponent controls three or more artifacts',
    'an opponent controls five or more Zombies',
  ],
  rejects: [
    'an opponent controls a nonbasic land',
    'an opponent controls four nonbasic lands',
    'an opponent controls four or more other nonbasic lands',
    'an opponent controls four or fewer nonbasic lands',
    'an opponent controls four or more',
    'an opponent controls four or more lands you control',
    'an opponent controls more lands than you',
    'you control four or more nonbasic lands',
    'an opponent controls four or more nonbasic land',
  ],
  parse: (ctx, pos) => {
    // Only a count of two or more reads here: a lookahead first, so that "an opponent controls a land" (another rule's, or not read)
    // stops where it always did.
    const r = sequence(
      pattern(/(?=an opponent controls [\p{L}\p{N}]+ or more )/iu),
      literal('an opponent controls '),
      spanned(satisfy(quantity, (n) => n >= 2)),
      literal(' or more '),
      satisfy(
        map(permanentPhrase(true, 'all'), withoutZone),
        (filter) => filter.controller === undefined,
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, , count, , filter] = r.value;
    const span = { start: pos, end: r.pos };
    const noun: IrNoun = {
      kind: 'noun',
      det: 'a',
      filter,
      upTo: false,
      plural: true,
      other: false,
      span,
      rule: 'condition.opponent-controls-at-least',
    };
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: {
          kind: 'opponentControls',
          noun,
          atLeast: { kind: 'number', value: count.value, span: count.span },
        },
        span,
        rule: 'condition.opponent-controls-at-least',
      },
      pos: r.pos,
    };
  },
});

export const RECURSION_CONDITION_RULES = [
  CONDITION_IT_MATCHES,
  CONDITION_ITS_MANA_VALUE,
  CONDITION_GIFT_PROMISED,
  CONDITION_OPPONENT_CONTROLS_AT_LEAST,
];
