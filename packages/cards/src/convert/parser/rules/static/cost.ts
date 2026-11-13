/**
 * Static statements about what a spell costs (stage P13, D-095, D-101): "~ costs {1} less to cast
 * for each creature on the battlefield." and "Artifact spells you cast cost {1} less to cast." (a
 * reduction of generic mana, CR 118.7a, 601.2f), "As an additional cost to cast ~, sacrifice a
 * creature." (an additional cost, CR 118.8, 601.2b) and "If you control a commander, you may cast ~
 * without paying its mana cost." (an alternative cost, CR 118.9, 903.3d). `~` is the spell itself
 * ("this spell", "this creature" are `~` after normalization). Each reads as an `IrStatic` with the
 * effect of its kind; the lowering turns the reduction into a `costReduction` static ability and
 * the other two into the face's `additionalCosts` and `alternativeCosts`, which are not abilities.
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
  quiet,
  satisfy,
  separatedBy1,
  sequence,
} from '../../combinators';
import type { IrAmount, IrCondition, IrCost, IrFilter, IrNoun, IrStatic } from '../../ir/types';
import { CREATURE_TYPES } from '../noun/creature-types';
import {
  BOUNDARY,
  CARD_TYPES,
  CHOSEN_SUFFIX,
  type Comparison,
  comparisonSuffix,
  type FilterParts,
  MODIFIER,
  NO_PARTS,
  SUBTYPE_WORD,
  typeChoice,
  typeWords,
  withComparison,
} from '../noun/phrases';
import { defineRule, family, spanned } from '../registry';

/** `~`: the spell (or the permanent) the statement is on. */
function selfNoun(rule: string, start: number): IrNoun {
  return {
    kind: 'noun',
    det: 'self',
    filter: { raw: '~' },
    upTo: false,
    plural: false,
    other: false,
    span: { start, end: start + 1 },
    rule,
  };
}

/** The statement with one effect: a subject, what it says, and the span and rule that read it. */
function statement(
  rule: string,
  subject: IrNoun,
  effect: IrStatic['effects'][number],
  start: number,
  end: number,
): IrStatic {
  return { kind: 'static', subject, effects: [effect], span: { start, end }, rule };
}

/** "{1}", "{2}": the generic mana of a reduction, at least one (CR 118.7a). Colored mana is not read. */
const GENERIC = map(
  spanned(pattern(/\{([1-9]\d*)\}/)),
  ({ value, span }): IrAmount => ({ kind: 'number', value: Number(value[1]), span }),
);

/**
 * "{N} less to cast", with "for each ..." after it when the reduction is counted. The count stands
 * for a reduction of {1} per object, so only {1} may be written in front of it (CR 118.7a; the
 * engine's count is of one for each).
 */
function reduction(): Parser<IrAmount> {
  const head = sequence(GENERIC, literal(' less to cast'));
  const each = sequence(
    literal(' '),
    family<IrAmount>('amount', { only: ['amount.for-each', 'amount.for-each-counter'] }),
  );
  // "{X} less to cast, where X is the total power of creatures you control" (stage P28, D-131, CR 107.3c, 118.7a): X is
  // what the text defines, read as the cost is determined (CR 601.2f). {X} with no definition is not read.
  const defined = map(
    sequence(
      literal('{X} less to cast, '),
      family<IrAmount>('amount', { only: ['amount.where-x'] }),
    ),
    ([, amount]) => amount,
  );
  return (ctx, pos) => {
    const x = defined(ctx, pos);
    if (x.ok) return x;
    const h = head(ctx, pos);
    if (!h.ok) return h;
    const base = h.value[0];
    const counted = each(ctx, h.pos);
    if (!counted.ok) return { ok: true, value: base, pos: h.pos };
    // "costs {2} less for each ...": the engine's count is one for each, not a step of two.
    if (base.kind !== 'number' || base.value !== 1) return fail(ctx, h.pos);
    return { ok: true, value: counted.value[1], pos: counted.pos };
  };
}

const PERIOD = literal('.');

/**
 * The conditions of "~ costs {3} less to cast if you control a creature with power 4 or greater." (stage P38, D-182, CR 601.2f): counts of the
 * permanents the controller has and their commander, read as the total cost is determined.
 */
const REDUCTION_CONDITIONS = [
  'condition.control-a',
  'condition.control-at-least',
  'condition.control-at-most',
  'condition.control-none',
  'condition.control-commander',
  'condition.control-your-commander',
  // Stage P50 (D-207): "~ costs {3} less to cast if it targets a tapped creature".
  'condition.it-targets',
] as const;

const REDUCTION_IF: Parser<IrCondition> = map(
  sequence(literal(' if '), family<IrCondition>('condition', { only: REDUCTION_CONDITIONS })),
  ([, condition]) => condition,
);

/**
 * `static.self-cost-reduction`: "~ costs {2} less to cast." and "~ costs {1} less to cast for each
 * creature on the battlefield." (CR 118.7a: only the generic part of the cost is reduced; CR 113.6d:
 * the spell's own ability works while it is on the stack; CR 601.2f: the total cost is determined
 * then, so the count is taken as the spell is cast). Since stage P28 (D-131) also "costs {X} less to cast, where X is
 * the total power of creatures you control." (X is what the text defines it as, CR 107.3c) and "for each +1/+1 counter on
 * ~". Since stage P38 (D-182) also "costs {3} less to cast if you control a creature with power 4 or greater." (CR 601.2f: read as the
 * total cost is determined). Not read: "costs {W} less" and other colored
 * or hybrid mana, "costs {X} less" with no definition, "costs {2} less for each ..." (a larger step
 * than one), a condition other than what the controller has ("if an opponent controls ...") and "costs {1} more".
 */
export const STATIC_SELF_COST_REDUCTION = defineRule<IrStatic>({
  id: 'static.self-cost-reduction',
  family: 'static',
  leading: ['~'],
  cites: [
    'CR 118.7a (Costs)',
    'CR 113.6d (Abilities That Function in Zones Other Than the Battlefield)',
    'CR 601.2f (Casting Spells)',
  ],
  examples: [
    '~ costs {1} less to cast for each creature on the battlefield.',
    '~ costs {2} less to cast.',
    '~ costs {1} less to cast for each card in your hand.',
    '~ costs {1} less to cast for each other creature you control.',
    '~ costs {X} less to cast, where X is the total power of creatures you control.',
    '~ costs {X} less to cast, where X is the greatest power among creatures you control.',
    '~ costs {X} less to cast, where X is the number of creatures you control.',
    '~ costs {1} less to cast for each +1/+1 counter on ~.',
    // Stage P38 (D-182): a condition on the reduction.
    '~ costs {3} less to cast if you control a creature with power 4 or greater.',
    '~ costs {2} less to cast if you control a Dragon.',
    '~ costs {1} less to cast if you control your commander.',
    '~ costs {1} less to cast for each creature you control if you control a Dragon.',
    // Stage P50 (D-207): a condition on what the spell targets.
    '~ costs {3} less to cast if it targets a tapped creature.',
  ],
  rejects: [
    '~ costs {X} less to cast.',
    '~ costs {X} less to cast, where X is the number of creatures.',
    '~ costs {X} less to cast, where Y is the number of creatures you control.',
    '~ costs {1} less to cast',
    '~ costs {W} less to cast.',
    '~ costs {1}{W} less to cast.',
    '~ costs {0} less to cast.',
    '~ costs {2} less to cast for each creature on the battlefield.',
    '~ costs {3} less to cast if an opponent controls a creature with power 4 or greater.',
    '~ costs {3} less to cast if you control a creature with power 4 or greater',
    '~ costs {3} less to cast if.',
    '~ costs {3} less to cast if you control a creature with power 4 or greater if you control a Dragon.',
    '~ costs {1} more to cast.',
    '~ costs {1} less to activate.',
    '~ costs {1} less to cast for each creature.',
    '~ costs {1} less to cast for each creature on the battlefield and each land you control.',
    '~ costs {2}{R} more to cast for each target beyond the first.',
    "~ can't block.",
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal('~ costs '),
      reduction(),
      optional(REDUCTION_IF, undefined),
      PERIOD,
    )(ctx, pos);
    if (!r.ok) return r;
    const effect = { kind: 'costReduction' as const, amount: r.value[1] };
    const condition = r.value[2];
    const read = statement(
      'static.self-cost-reduction',
      selfNoun('static.self-cost-reduction', pos),
      effect,
      pos,
      r.pos,
    );
    return {
      ok: true,
      value: condition === undefined ? read : { ...read, condition },
      pos: r.pos,
    };
  },
});

const SPELLS = pattern(new RegExp(`spells${BOUNDARY}`, 'iu'));

/** Modifiers a reduction's subject may carry: colors and "non<type>" words (no tapped, no supertype). */
const SUBJECT_MODIFIERS = satisfy(
  map(many(MODIFIER), (modifiers) => modifiers.reduce<FilterParts>((acc, m) => m(acc), NO_PARTS)),
  // The filter below keeps only the colors and the "non<type>" words: any other modifier is refused, never dropped (D-230: "historic" would read as every spell).
  (parts) =>
    parts.tapped === undefined &&
    parts.supertypes.length === 0 &&
    parts.notSupertypes.length === 0 &&
    parts.token === undefined &&
    !parts.colorless &&
    !parts.attacking &&
    !parts.attackingOrBlocking &&
    !parts.historic &&
    parts.colorCount === undefined,
);

/**
 * The subtypes a spell can be named by: the creature types and the three non-creature ones the
 * Oracle text of a reduction uses. A capitalized word that is neither ("Legendary", "Historic") is a
 * quality or an unknown word and is not read as a subtype.
 */
const SPELL_SUBTYPES: ReadonlySet<string> = new Set(['Aura', 'Equipment', 'Vehicle']);
const isSpellSubtype = (word: string): boolean =>
  CREATURE_TYPES.has(word) || SPELL_SUBTYPES.has(word);

/**
 * The spells a statement is about, as the filter of a spell being cast: "spells", "noncreature
 * spells", "Artifact spells", "Black creature spells", "Instant and sorcery spells", "Dragon
 * spells", "Aura and Equipment spells". A list of types or of subtypes is joined with "and" and takes
 * no modifier, as a list of permanent types does for a target (CR 205.2a, 205.3).
 */
export function spellSubject(): Parser<IrFilter> {
  const typeList: Parser<IrFilter> = (ctx, pos) => {
    const r = sequence(typeChoice(CARD_TYPES, false, 'and'), literal(' '), SPELLS)(ctx, pos);
    if (!r.ok) return r;
    const anyOf = r.value[0].map((t): IrFilter => ({ types: [t], raw: t }));
    return { ok: true, value: { anyOf, raw: ctx.text.slice(pos, r.pos) }, pos: r.pos };
  };
  const subtypeList: Parser<IrFilter> = (ctx, pos) => {
    const r = sequence(
      satisfy(typeChoice(SUBTYPE_WORD, true, 'and'), (words) => words.every(isSpellSubtype)),
      literal(' '),
      SPELLS,
    )(ctx, pos);
    if (!r.ok) return r;
    const anyOf = r.value[0].map((t): IrFilter => ({ subtypes: [t], raw: t }));
    return { ok: true, value: { anyOf, raw: ctx.text.slice(pos, r.pos) }, pos: r.pos };
  };
  const plain: Parser<IrFilter> = (ctx, pos) => {
    const r = sequence(
      SUBJECT_MODIFIERS,
      optional(
        map(sequence(typeWords(CARD_TYPES, false), literal(' ')), ([words]) => words),
        [] as string[],
      ),
      SPELLS,
    )(ctx, pos);
    if (!r.ok) return r;
    const [parts, types] = r.value;
    const filter: IrFilter = {
      ...(types.length > 0 ? { types } : {}),
      ...(parts.notTypes.length > 0 ? { notTypes: parts.notTypes } : {}),
      ...(parts.colors.length > 0 ? { colors: parts.colors } : {}),
      raw: ctx.text.slice(pos, r.pos),
    };
    return { ok: true, value: filter, pos: r.pos };
  };
  const subtype: Parser<IrFilter> = (ctx, pos) => {
    const r = sequence(
      satisfy(
        map(pattern(new RegExp(`${SUBTYPE_WORD}${BOUNDARY}`, 'u')), (m) => m[0]),
        isSpellSubtype,
      ),
      literal(' '),
      SPELLS,
    )(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: { subtypes: [r.value[0]], raw: ctx.text.slice(pos, r.pos) },
      pos: r.pos,
    };
  };
  // "Angel spells and Human spells": each kind of spell says "spells" for itself (stage P28, D-131: Herald of War).
  const repeated: Parser<IrFilter> = (ctx, pos) => {
    const kind: Parser<IrFilter> = (c, at) => {
      const r = sequence(
        choice(
          map(pattern(new RegExp(`(${CARD_TYPES})${BOUNDARY}`, 'iu')), (m): IrFilter => {
            const word = (m[1] ?? '').toLowerCase();
            return { types: [word], raw: word };
          }),
          map(
            satisfy(
              map(pattern(new RegExp(`${SUBTYPE_WORD}${BOUNDARY}`, 'u')), (m) => m[0]),
              isSpellSubtype,
            ),
            (word): IrFilter => ({ subtypes: [word], raw: word }),
          ),
        ),
        literal(' '),
        SPELLS,
      )(c, at);
      return r.ok ? { ok: true, value: r.value[0], pos: r.pos } : r;
    };
    const items = separatedBy1(kind, literal(' and '))(ctx, pos);
    if (!items.ok) return items;
    const raws = items.value.map((f) => f.raw);
    if (items.value.length < 2 || new Set(raws).size !== raws.length) return fail(ctx, pos);
    return {
      ok: true,
      value: { anyOf: items.value, raw: ctx.text.slice(pos, items.pos) },
      pos: items.pos,
    };
  };
  return choice(typeList, subtypeList, repeated, plain, subtype);
}

/**
 * " you cast cost ", with "of the chosen type" or "of the chosen color" before or after "you cast"
 * (stage P15, D-100: "Creature spells you cast of the chosen type cost {1} less to cast.", "Creature
 * spells of the chosen type you cast cost {1} less to cast."): the engine reads the choice the
 * permanent made as it entered.
 */
const CAST_HEAD: Parser<{
  readonly chosen: 'type' | 'color' | undefined;
  readonly compared: Comparison | undefined;
  readonly notHand?: true;
  readonly anyCaster?: true;
}> = choice(
  map(sequence(CHOSEN_SUFFIX, literal(' you cast cost ')), ([chosen]) => ({
    chosen,
    compared: undefined,
  })),
  // Stage P69 (D-255, CR 601.2f, 604.2): "Creature spells of the chosen type cost {2} less to cast." says no "you cast": the spells of every player.
  map(sequence(CHOSEN_SUFFIX, literal(' cost ')), ([chosen]) => ({
    chosen,
    compared: undefined,
    anyCaster: true as const,
  })),
  // Stage P75 (D-235, CR 601.2a): "Spells you cast from anywhere other than your hand cost {2} less to cast".
  map(literal(' you cast from anywhere other than your hand cost '), () => ({
    chosen: undefined,
    compared: undefined,
    notHand: true as const,
  })),
  // Stage P32 (D-147): "Creature spells you cast with power 4 or greater cost {2} less to cast": a spell on the stack has the power,
  // toughness and mana value of its card (CR 202.3, 208.1), which the engine compares as the cost is determined.
  map(
    sequence(
      literal(' you cast'),
      optional(quiet(CHOSEN_SUFFIX), undefined),
      optional(quiet(comparisonSuffix(['power', 'toughness', 'manaValue'])), undefined),
      literal(' cost '),
    ),
    ([, chosen, compared]) => ({ chosen, compared }),
  ),
);

/**
 * `static.spells-cost-reduction`: "Artifact spells you cast cost {1} less to cast.", "Instant and
 * sorcery spells you cast cost {1} less to cast.", "Noncreature spells you cast cost {1} less to
 * cast." (CR 118.7a, 601.2f, 604.2: a static ability of a permanent that reduces the generic mana
 * of the spells its controller casts that match; the engine applies it as the cost is determined).
 * A count after the cost ("... cost {1} less to cast for each ...") is read as for `~`. "Of the chosen
 * type" and "of the chosen color" (a choice made as the permanent enters, D-100) are read, before or
 * after "you cast". Not read: "with power 4 or greater" and other
 * qualities of the spell, "that's red or green", "spells your opponents cast", colored reductions
 * ("cost {W} less"), "more" (an increase) and "cost {X} less".
 */
export const STATIC_SPELLS_COST_REDUCTION = defineRule<IrStatic>({
  id: 'static.spells-cost-reduction',
  family: 'static',
  leading: [],
  cites: [
    'CR 118.7a (Costs)',
    'CR 601.2f (Casting Spells)',
    'CR 604.2 (Handling Static Abilities)',
    'CR 205.2a (Card Types)',
  ],
  examples: [
    'Artifact spells you cast cost {1} less to cast.',
    'Instant and sorcery spells you cast cost {1} less to cast.',
    'Creature spells you cast cost {1} less to cast.',
    'Noncreature spells you cast cost {1} less to cast.',
    'Dragon spells you cast cost {2} less to cast.',
    'Red spells you cast cost {1} less to cast.',
    'Black creature spells you cast cost {1} less to cast.',
    'Aura and Equipment spells you cast cost {1} less to cast.',
    'Spells you cast cost {1} less to cast.',
    'Creature spells you cast of the chosen type cost {1} less to cast.',
    'Creature spells of the chosen type you cast cost {1} less to cast.',
    // Stage P69 (D-255): Urza's Incubator.
    'Creature spells of the chosen type cost {2} less to cast.',
    'Spells you cast of the chosen type cost {1} less to cast.',
    'Red spells you cast of the chosen color cost {1} less to cast.',
    'Creature spells you cast cost {1} less to cast for each creature you control.',
    'Angel spells and Human spells you cast cost {1} less to cast for each +1/+1 counter on ~.',
    'Artifact spells and Dragon spells you cast cost {1} less to cast.',
    'Creature spells you cast with power 4 or greater cost {2} less to cast.',
    // Stage P75 (D-235): spells cast from anywhere other than the hand.
    'Spells you cast from anywhere other than your hand cost {2} less to cast.',
    'Spells you cast with mana value 5 or greater cost {1} less to cast.',
    'Creature spells you cast with toughness 3 or less cost {1} less to cast.',
  ],
  rejects: [
    'Angel spells and Angel spells you cast cost {1} less to cast.',
    'Angel spells and Human you cast cost {1} less to cast.',
    'Artifact spells you cast cost {1} less to cast',
    'Artifact spells cost {1} less to cast.',
    'Artifact spells you control cost {1} less to cast.',
    'Artifact spells your opponents cast cost {1} less to cast.',
    'Artifact spells you cast cost {W} less to cast.',
    'Artifact spells you cast cost {1} more to cast.',
    'Artifact spells you cast cost {X} less to cast.',
    'Creature spells cost {2} less to cast.',
    'Creature spells of the chosen type cost {2} less to cast',
    'Creature spells you cast of the chosen type of the chosen color cost {1} less to cast.',
    'Creature spells you cast of the chosen player cost {1} less to cast.',
    'Creature spells you cast with power 4 cost {2} less to cast for each creature you control.',
    'Creature spells you cast with flying cost {2} less to cast.',
    'Each spell you cast that’s red or green costs {1} less to cast.',
    'Instant or sorcery spells you cast cost {1} less to cast.',
    'Instant and sorcery spells you cast cost {2} less to cast for each creature you control.',
    'Legendary spells you cast cost {1} less to cast.',
    'Tapped creature spells you cast cost {1} less to cast.',
    'Artifact spell you cast costs {1} less to cast.',
    'Creature spells you cast cost {1} less to cast for each creature.',
    '~ costs {1} less to cast.',
    'Spells you cast from anywhere other than your graveyard cost {2} less to cast.',
    'Spells you cast from your graveyard cost {2} less to cast.',
  ],
  parse: (ctx, pos) => {
    // The subject and "you cast cost" are read as one: a line that merely starts like a subject
    // ("Creature spells you control can't be countered.") was never this statement.
    const r = sequence(quiet(sequence(spellSubject(), CAST_HEAD)), reduction(), PERIOD)(ctx, pos);
    if (!r.ok) return r;
    const [[filter, { chosen, compared, notHand, anyCaster }], amount] = r.value;
    const subjectEnd = pos + filter.raw.length;
    const subject: IrNoun = {
      kind: 'noun',
      det: 'each',
      filter: withComparison(
        {
          ...filter,
          ...(anyCaster === true ? {} : { controller: 'you' as const }),
          ...(chosen === undefined ? {} : { chosen }),
          ...(notHand === true ? { notCastFromHand: true as const } : {}),
        },
        compared,
      ),
      upTo: false,
      plural: true,
      other: false,
      span: { start: pos, end: subjectEnd },
      rule: 'static.spells-cost-reduction',
    };
    const effect = { kind: 'costReduction' as const, amount };
    return {
      ok: true,
      value: statement('static.spells-cost-reduction', subject, effect, pos, r.pos),
      pos: r.pos,
    };
  },
});

/** One cost of an additional cost: a sacrifice, a discard, life, or mana after "pay". */
const ADDITIONAL_COST: Parser<IrCost> = choice(
  family<IrCost>('cost', {
    only: ['cost.sacrifice', 'cost.discard', 'cost.discard-x', 'cost.pay-life', 'cost.pay-x-life'],
  }),
  map(
    sequence(literal('pay '), family<IrCost>('cost', { only: ['cost.mana'] })),
    ([, cost]) => cost,
  ),
);

/**
 * `static.additional-cost`: "As an additional cost to cast ~, sacrifice a creature.", "... discard a
 * card.", "... sacrifice an artifact or creature.", "... sacrifice a land.", "... pay 3 life.", "...
 * pay {1}.", "... pay X life." (stage P16, D-103: X is announced as the spell is cast, CR 107.3a), "... discard X cards." (D-386)
 * and costs joined with "and" ("sacrifice a creature and discard a card"). Since stage P38 (D-182) also a choice
 * of two ways, one cost each ("sacrifice an artifact or creature or pay {4}", "discard a card or pay 3 life"): the
 * caster pays one of them (CR 118.8, 601.2b). CR 118.8: an
 * additional cost is paid with the spell's other costs as it is cast (CR 601.2b announces it, CR
 * 601.2h pays it); the player chooses what to sacrifice and discard. It is read for a spell
 * whose text it is ("this spell" is `~`); the costs are the face's `additionalCosts`, or for a choice its
 * `additionalCostChoice`. Not read: an optional cost ("you may sacrifice"), a choice of ways of more than
 * one cost each ("sacrifice a creature and discard a card or pay {2}"), a choice of three,
 * "sacrifice another creature", "sacrifice two creatures" and any other kind of cost.
 */
export const STATIC_ADDITIONAL_COST = defineRule<IrStatic>({
  id: 'static.additional-cost',
  family: 'static',
  leading: ['as'],
  cites: [
    'CR 118.8 (Costs)',
    'CR 601.2b (Casting Spells)',
    'CR 601.2f (Casting Spells)',
    'CR 701.21 (Sacrifice)',
    'CR 701.9 (Discard)',
  ],
  examples: [
    'As an additional cost to cast ~, sacrifice a creature.',
    'As an additional cost to cast ~, discard a card.',
    'As an additional cost to cast ~, sacrifice an artifact or creature.',
    'As an additional cost to cast ~, sacrifice a land.',
    'As an additional cost to cast ~, discard two cards.',
    'As an additional cost to cast ~, pay 3 life.',
    'As an additional cost to cast ~, pay {2}.',
    'As an additional cost to cast ~, sacrifice a creature and discard a card.',
    'As an additional cost to cast ~, pay X life.',
    'As an additional cost to cast ~, pay X life and discard a card.',
    // Hashaton group 10 (D-386): "discard X cards", announced like "pay X life".
    'As an additional cost to cast ~, discard X cards.',
    // Stage P38 (D-182): a choice of two ways.
    'As an additional cost to cast ~, sacrifice an artifact or creature or pay {4}.',
    'As an additional cost to cast ~, pay 5 life or pay {2}.',
    'As an additional cost to cast ~, sacrifice an artifact or discard a card.',
    'As an additional cost to cast ~, sacrifice a creature or discard a card.',
    'As an additional cost to cast ~, discard a card or pay 3 life.',
  ],
  rejects: [
    'As an additional cost to cast ~, sacrifice a creature',
    'As an additional cost to cast ~, pay Y life.',
    'As an additional cost to cast ~, pay X.',
    'As an additional cost to cast ~, pay {X}.',
    'As an additional cost to cast ~, you may sacrifice a creature.',
    'As an additional cost to cast ~, sacrifice a creature and discard a card or pay {2}.',
    'As an additional cost to cast ~, sacrifice a creature or discard a card or pay {2}.',
    'As an additional cost to cast ~, sacrifice an artifact or creature or.',
    'As an additional cost to cast ~, sacrifice a creature or.',
    'As an additional cost to cast ~, discard a creature card.',
    'As an additional cost to cast ~, discard X cards at random.',
    'As an additional cost to cast ~, discard Y cards.',
    'As an additional cost to cast ~, exile a card from your graveyard.',
    'As an additional cost to cast ~, tap an untapped creature you control.',
    'As an additional cost to cast spells, sacrifice a creature.',
    'As an additional cost to cast ~.',
    'As ~ enters, sacrifice a creature.',
    'Additional cost to cast ~, sacrifice a creature.',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal('as an additional cost to cast ~, '),
      separatedBy1(ADDITIONAL_COST, literal(' and ')),
      optional(
        map(sequence(literal(' or '), ADDITIONAL_COST), ([, cost]) => cost),
        undefined,
      ),
      PERIOD,
    )(ctx, pos);
    if (!r.ok) return r;
    const castAt = pos + 'as an additional cost to cast '.length;
    const [, costs, other] = r.value;
    // "A or B" is one cost for each way (stage P38, D-182): a way of several costs ("A and B or C") is not read.
    if (other !== undefined && costs.length > 1) return fail(ctx, pos);
    const effect = {
      kind: 'additionalCost' as const,
      costs,
      ...(other === undefined ? {} : { orCosts: [other] }),
    };
    return {
      ok: true,
      value: statement(
        'static.additional-cost',
        selfNoun('static.additional-cost', castAt),
        effect,
        pos,
        r.pos,
      ),
      pos: r.pos,
    };
  },
});

/**
 * `static.free-cast`: "If you control a commander, you may cast ~ without paying its mana cost."
 * and, with no condition, "You may cast ~ without paying its mana cost." (CR 118.9: an alternative
 * cost that is paying nothing, chosen as the spell is cast; CR 118.9d: additional costs, commander
 * tax and reductions still apply; CR 903.3d: the condition). Not read: another condition, "rather
 * than pay its mana cost", "as you cast", a choice of modes and a spell cast by another effect
 * ("you may cast a spell ... without paying its mana cost").
 */
export const STATIC_FREE_CAST = defineRule<IrStatic>({
  id: 'static.free-cast',
  family: 'static',
  leading: ['if', 'you'],
  cites: [
    'CR 118.9 (Costs)',
    'CR 118.9d (Costs)',
    'CR 903.3d (Commander)',
    'CR 601.2b (Casting Spells)',
  ],
  examples: [
    'If you control a commander, you may cast ~ without paying its mana cost.',
    'You may cast ~ without paying its mana cost.',
  ],
  rejects: [
    'If you control a commander, you may cast ~ without paying its mana cost',
    'If you control a commander, you may cast ~ rather than pay its mana cost.',
    'If you control a creature, you may cast ~ without paying its mana cost.',
    'If you control a commander as you cast ~, you may cast ~ without paying its mana cost.',
    'You may cast a spell with mana value 5 or less from your hand without paying its mana cost.',
    'You may cast ~ without paying its mana cost if you control a commander.',
    'You may cast target card without paying its mana cost.',
    'If you control a commander, you may cast ~ from your hand without paying its mana cost.',
    'If you control a commander, cast ~ without paying its mana cost.',
  ],
  parse: (ctx, pos) => {
    const lead = optional(
      quiet(
        map(
          sequence(
            literal('if '),
            family<IrCondition>('condition', { only: ['condition.control-commander'] }),
            literal(', '),
          ),
          ([, condition]) => condition,
        ),
      ),
      null,
    )(ctx, pos);
    if (!lead.ok) return lead;
    const cast = sequence(literal('you may cast ~ without paying its mana cost'), PERIOD)(
      ctx,
      lead.pos,
    );
    if (!cast.ok) return cast;
    const effect =
      lead.value === null
        ? { kind: 'freeCast' as const }
        : { kind: 'freeCast' as const, condition: lead.value };
    const castAt = lead.pos + 'you may cast '.length;
    return {
      ok: true,
      value: statement(
        'static.free-cast',
        selfNoun('static.free-cast', castAt),
        effect,
        pos,
        cast.pos,
      ),
      pos: cast.pos,
    };
  },
});

export const COST_STATIC_RULES = [
  STATIC_SELF_COST_REDUCTION,
  STATIC_SPELLS_COST_REDUCTION,
  STATIC_ADDITIONAL_COST,
  STATIC_FREE_CAST,
];
