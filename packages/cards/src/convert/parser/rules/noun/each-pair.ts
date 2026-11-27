/**
 * Noun rule of the Animated Army deck (issue 110): "each Fungus and Saproling you control" (Brightcap Badger) and "each non-Equipment artifact and non-Aura enchantment you
 * control with mana value 4 or greater" (Bello, Bard of the Brambles): two kinds of permanent joined by "and" under one "each", with the words after them said of both.
 */
import { fail, literal, map, optional, type Parser, pattern, sequence } from '../../combinators';
import type { IrFilter, IrNoun } from '../../ir/types';
import { defineRule, node } from '../registry';
import { comparisonSuffix, NO_PARTS, toFilter, withComparison } from './phrases';
import { SUBTYPE_WORD_NUMBERED } from './subtypes';

const CARD_TYPE = /(artifact|creature|enchantment|land|planeswalker|battle)(?![\p{L}\p{N}-])/u;

/** One kind of the pair: a subtype in the singular ("Fungus"), or a card type, which may leave a subtype out ("non-Equipment artifact"). */
const KIND: Parser<IrFilter> = (ctx, pos) => {
  const typed = sequence(
    optional(
      map(sequence(literal('non-'), SUBTYPE_WORD_NUMBERED, literal(' ')), ([, word]) => word),
      null,
    ),
    pattern(CARD_TYPE),
  )(ctx, pos);
  if (typed.ok) {
    const [non, type] = typed.value;
    if (non !== null && non.plural === true) return fail(ctx, pos);
    return {
      ok: true,
      value: {
        types: [type[1] ?? ''],
        ...(non === null ? {} : { notSubtypes: [non.subtype] }),
        raw: ctx.text.slice(pos, typed.pos),
      },
      pos: typed.pos,
    };
  }
  const word = SUBTYPE_WORD_NUMBERED(ctx, pos);
  if (!word.ok) return word;
  if (word.value.plural === true) return fail(ctx, pos);
  // A subtype followed by a card type ("Plant creature") is a phrase of its own, which this pair does not read.
  if (
    /^ (?:artifact|creature|enchantment|land|planeswalker|battle)\b/u.test(ctx.text.slice(word.pos))
  )
    return fail(ctx, pos);
  return {
    ok: true,
    value: { subtypes: [word.value.subtype], raw: ctx.text.slice(pos, word.pos) },
    pos: word.pos,
  };
};

/**
 * `noun.each-pair`: "each Fungus and Saproling you control", "each non-Equipment artifact and non-Aura enchantment you control with mana value 4 or greater" (CR 205.3,
 * 205.2a, 202.3, 611.3a): every permanent the controller has that is of one kind or of the other. "You control" and the mana value are said once, after both, and hold for
 * both (the engine's `anyOf` of the two kinds with the controller and the mana value on the group). Not read: a controller other than "you" or none, one kind, a third kind,
 * "or", a kind in the plural, the same kind twice, "other", a power or toughness (what the group is must not depend on what the statement changes), a subtype with a card
 * type after it.
 */
export const NOUN_EACH_PAIR = defineRule<IrNoun>({
  id: 'noun.each-pair',
  family: 'noun',
  leading: ['each'],
  cites: [
    'CR 205.3 (Subtypes)',
    'CR 205.2a (Card Types)',
    'CR 202.3 (Mana Cost and Color)',
    'CR 611.3a (Continuous Effects)',
  ],
  examples: [
    'each Fungus and Saproling you control',
    'Each Fungus and Saproling you control',
    'each non-Equipment artifact and non-Aura enchantment you control with mana value 4 or greater',
    'each non-Equipment artifact and non-Aura enchantment you control',
    'each Treasure and land you control',
  ],
  rejects: [
    'each Fungus and Saproling',
    'each Fungus and Saproling your opponents control',
    'each Fungus you control',
    'each Fungus, Saproling, and Elf you control',
    'each Fungus or Saproling you control',
    'each Fungi and Saprolings you control',
    'each Fungus and Fungus you control',
    'each artifact and creature you control',
    'each artifact and artifact you control',
    'each other Fungus and Saproling you control',
    'each Fungus and Banana you control',
    'each non-Equipment artifact and non-Aura enchantment you control with power 4 or greater',
    'each non-Equipments artifact and non-Aura enchantment you control',
    'each Plant creature and Saproling you control',
    'each Fungus and Saproling you controlled',
  ],
  parse: node<IrFilter, IrNoun>(
    'noun.each-pair',
    (ctx, pos) => {
      const r = sequence(
        pattern(/each /iu),
        KIND,
        literal(' and '),
        KIND,
        pattern(/ you control(?![\p{L}\p{N}'’])/u),
        optional(comparisonSuffix(['manaValue']), undefined),
      )(ctx, pos);
      if (!r.ok) return r;
      const [, first, , second, , comparison] = r.value;
      const { raw: _a, ...one } = first;
      const { raw: _b, ...two } = second;
      if (JSON.stringify(one) === JSON.stringify(two)) return fail(ctx, pos);
      // Two card types with nothing else said ("each artifact and creature you control") are `noun.each-type-union`'s.
      if (
        first.types !== undefined &&
        second.types !== undefined &&
        first.notSubtypes === undefined &&
        second.notSubtypes === undefined
      ) {
        return fail(ctx, pos);
      }
      // " with power 4 or greater" and any other words of a phrase after the group are not this noun's.
      if (/^ (?:with|that|and|or|but)\b/u.test(ctx.text.slice(r.pos))) return fail(ctx, pos);
      const raw = ctx.text.slice(pos, r.pos);
      const base = toFilter('battlefield', { ...NO_PARTS, controller: 'you' }, raw);
      return {
        ok: true,
        value: withComparison({ ...base, anyOf: [first, second] }, comparison),
        pos: r.pos,
      };
    },
    (filter) => ({
      kind: 'noun',
      det: 'each',
      filter,
      upTo: false,
      plural: false,
      other: false,
    }),
  ),
});

export const EACH_PAIR_NOUN_RULES = [NOUN_EACH_PAIR];
