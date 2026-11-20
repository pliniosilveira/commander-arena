/**
 * Effect rules of the Quick Draw deck (issue 121) for the cards that cast copies of cards they exiled: "Exile an instant or sorcery card at random from your graveyard." and "Then copy each
 * card exiled with ~. You may cast any number of the copies without paying their mana costs." (Arcane Bombardment, CR 701.13, 707.12, 608.2g, 118.9, 607.2a).
 */
import { choice, fail, literal, map, pattern, sequence } from '../../combinators';
import type { IrFilter, IrNoun, IrTypeList } from '../../ir/types';
import { defineRule, spanned } from '../registry';
import { flag, number } from './dragons';
import { type Clauses, makeClause } from './operands';

const BOUNDARY = '(?![\\p{L}\\p{N}])';

const CARD_TYPES = choice(
  map(literal('instant or sorcery'), () => ['instant', 'sorcery'] as readonly string[]),
  map(literal('instant'), () => ['instant'] as readonly string[]),
  map(literal('sorcery'), () => ['sorcery'] as readonly string[]),
  map(literal('creature'), () => ['creature'] as readonly string[]),
  map(literal('land'), () => ['land'] as readonly string[]),
);

/**
 * `effect.exile-at-random`: "exile an instant or sorcery card at random from your graveyard" (CR 701.13): of the cards of those types in the graveyard of the controller one is exiled, picked by
 * the game's generator. The engine's `exile` of `each` with `atRandom`, linked to the permanent when another ability of the same face reads "exiled with ~". Not read: a card with no type, a
 * graveyard that is not yours, "random" before the card, more than one card, "at random" left out.
 */
export const EFFECT_EXILE_AT_RANDOM = defineRule<Clauses>({
  id: 'effect.exile-at-random',
  family: 'effect',
  leading: ['exile'],
  cites: ['CR 701.13 (Exile)', 'CR 404.1 (Graveyard)'],
  examples: [
    'exile an instant or sorcery card at random from your graveyard',
    'exile a creature card at random from your graveyard',
    'exile a sorcery card at random from your graveyard',
  ],
  rejects: [
    'exile a card at random from your graveyard',
    'exile an instant or sorcery card at random from an opponent’s graveyard',
    'exile an instant or sorcery card from your graveyard',
    'exile two instant or sorcery cards at random from your graveyard',
    'exile an instant or sorcery card at random from your hand',
    'exile an instant or sorcery card at random from your graveyard and draw a card',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.exile-at-random';
    if (!/^exile an? [a-z ]+ card at random /iu.test(ctx.text.slice(pos, pos + 60)))
      return fail(ctx, pos);
    const r = spanned(
      sequence(
        literal('exile '),
        pattern(/an? /),
        CARD_TYPES,
        literal(' card at random from your graveyard'),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const { span } = r.value;
    const cardTypes = r.value.value[2];
    const types: IrTypeList = { kind: 'typeList', subtypes: [], cardTypes, span, rule: id };
    return { ok: true, value: [makeClause(id, 'exileAtRandom', { types }, span)], pos: r.pos };
  },
});

/**
 * `effect.copy-linked-exiled-and-cast`: "copy each card exiled with ~. You may cast any number of the copies without paying their mana costs." (CR 707.12, 608.2g, 118.9, 607.2a): the two
 * sentences of one instruction (`segment.ts` keeps them together). The engine's `copyCardAndCast` of the cards the permanent exiled with its linked ability. Not read: another permanent, "a card
 * exiled with" (one), a copy that is not cast, a cost, "any number" left out.
 */
export const EFFECT_COPY_LINKED_EXILED_AND_CAST = defineRule<Clauses>({
  id: 'effect.copy-linked-exiled-and-cast',
  family: 'effect',
  leading: ['copy'],
  cites: [
    'CR 707.12 (Copying Objects)',
    'CR 608.2g (Resolving Spells and Abilities)',
    'CR 118.9 (Alternative Costs)',
    'CR 607.2a (Linked Abilities)',
  ],
  examples: [
    'copy each card exiled with ~. you may cast any number of the copies without paying their mana costs',
  ],
  rejects: [
    'copy each card exiled with ~',
    'copy each card exiled with ~. you may cast the copy without paying its mana cost',
    'copy each card exiled with ~. you may cast any number of the copies',
    'copy a card exiled with ~. you may cast any number of the copies without paying their mana costs',
    'copy each card exiled with it. you may cast any number of the copies without paying their mana costs',
    'copy each card exiled with ~. you may cast any number of the copies by paying their mana costs',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.copy-linked-exiled-and-cast';
    const r = pattern(
      new RegExp(
        `copy each card exiled with ~\\. you may cast any number of the copies without paying their mana costs${BOUNDARY}`,
        'iu',
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: [makeClause(id, 'copyLinkedExiledAndCast', {}, { start: pos, end: r.pos })],
      pos: r.pos,
    };
  },
});

/**
 * `effect.mana-rider-exile`: "When you spend this mana to cast an instant or sorcery spell with mana value 3 or less, you may exile that spell instead of putting it into its owner's graveyard as it
 * resolves." (Forger's Foundry, CR 106.6, 603.2, 614.1a, 607.2a): a rider of the mana the mana ability before it adds (as `effect.mana-rider-copy`): the spell is one of the card types with a
 * mana value no more than a number, and the permanent exiles it, remembering it as exiled with it. Not read: a spell with no type, another zone than the graveyard, another number
 * word, "may" left out, "that mana" (the wording is "this mana" here), a mana value of "or more".
 */
export const EFFECT_MANA_RIDER_EXILE = defineRule<Clauses>({
  id: 'effect.mana-rider-exile',
  family: 'effect',
  leading: ['when'],
  cites: [
    'CR 106.6 (Mana)',
    'CR 603.2 (Triggered Abilities)',
    'CR 614.1a (Replacement Effects)',
    'CR 607.2a (Linked Abilities)',
  ],
  examples: [
    'when you spend this mana to cast an instant or sorcery spell with mana value 3 or less, you may exile that spell instead of putting it into its owner’s graveyard as it resolves',
    "when you spend this mana to cast an instant spell with mana value 2 or less, you may exile that spell instead of putting it into its owner's graveyard as it resolves",
  ],
  rejects: [
    'when you spend this mana to cast a spell with mana value 3 or less, you may exile that spell instead of putting it into its owner’s graveyard as it resolves',
    'when you spend this mana to cast an instant or sorcery spell with mana value 3 or more, you may exile that spell instead of putting it into its owner’s graveyard as it resolves',
    'when you spend this mana to cast an instant or sorcery spell with mana value 3 or less, exile that spell instead of putting it into its owner’s graveyard as it resolves',
    'when you spend this mana to cast an instant or sorcery spell with mana value 3 or less, you may exile that spell',
    'when you spend this mana to cast an instant or sorcery spell, you may exile that spell instead of putting it into its owner’s graveyard as it resolves',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.mana-rider-exile';
    const r = spanned(
      sequence(
        literal('when you spend this mana to cast an '),
        CARD_TYPES,
        pattern(
          / spell with mana value (\d+) or less, you may exile that spell instead of putting it into its owner['’]s graveyard as it resolves/iu,
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const { span } = r.value;
    const types = r.value.value[1];
    const limit = Number(r.value.value[2][1]);
    const filter: IrFilter = {
      stackKind: 'spell',
      ...(types.length === 1
        ? { types: [...types] }
        : { anyOf: types.map((t): IrFilter => ({ types: [t], raw: t })) }),
      raw: 'instant or sorcery',
    };
    const noun: IrNoun = {
      kind: 'noun',
      det: 'each',
      filter,
      upTo: false,
      plural: true,
      other: false,
      span,
      rule: id,
    };
    return {
      ok: true,
      value: [
        makeClause(
          id,
          'spentRider',
          {
            spells: noun,
            exileLinked: flag(id, true, span),
            manaValueAtMost: number(limit, span),
          },
          span,
        ),
      ],
      pos: r.pos,
    };
  },
});

/**
 * `effect.pay-any-number-of-times`: "pay {2}{R} any number of times" (Bloodthirsty Adversary, CR 118.1, 603.12): the controller chooses how many times to pay the mana cost, from none to as many as
 * they can pay. "You may" makes it an offer and "When you pay this cost one or more times, ..." says what it buys: the lowering of the sentences reads the two. Not read: a cost with {X}, a
 * hybrid or a non-mana part, "any amount of", "any number of times" left out, "a number of times".
 */
export const EFFECT_PAY_ANY_NUMBER_OF_TIMES = defineRule<Clauses>({
  id: 'effect.pay-any-number-of-times',
  family: 'effect',
  leading: ['pay'],
  cites: [
    'CR 118.1 (Costs)',
    'CR 603.12 (Handling Triggered Abilities)',
    'CR 107.4 (Numbers and Symbols)',
  ],
  examples: [
    'pay {2}{R} any number of times',
    'pay {R} any number of times',
    'pay {1}{U}{U} any number of times',
  ],
  rejects: [
    'pay {2}{R}',
    'pay {X}{R} any number of times',
    'pay {R/G} any number of times',
    'pay {2}{R} any amount of times',
    'pay {2}{R} a number of times',
    'pay 3 life any number of times',
    'pay any number of times',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.pay-any-number-of-times';
    if (!/^pay (?:\{[^}]+\})+ any number of times/iu.test(ctx.text.slice(pos, pos + 40)))
      return fail(ctx, pos);
    const r = spanned(
      sequence(
        literal('pay '),
        pattern(/((?:\{(?:\d+|[WUBRGC])\})+)/u),
        literal(' any number of times'),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const { span } = r.value;
    const symbols = [...(r.value.value[1][1] ?? '').matchAll(/\{([^}]+)\}/gu)].map(
      (m) => m[1] ?? '',
    );
    return {
      ok: true,
      value: [
        makeClause(
          id,
          'payAnyNumberOfTimes',
          { mana: { kind: 'manaSpec', what: { kind: 'symbols', symbols }, span, rule: id } },
          span,
        ),
      ],
      pos: r.pos,
    };
  },
});

/**
 * `effect.exile-up-to-that-many-and-copy`: "exile up to that many target instant and/or sorcery cards with mana value 3 or less from your graveyard and copy them. You may cast any number of the
 * copies without paying their mana costs." (Bloodthirsty Adversary, CR 115.1, 601.2c, 707.12, 608.2g, 118.9): the targets are as many as the cost was paid, at most (the reflexive ability of
 * the payment). The engine's `exile` of the target slot and `copyCardAndCast` of the cards exiled. Not read: another zone, another number of targets, a copy that is not cast, a cost, "any number" left out.
 */
export const EFFECT_EXILE_UP_TO_THAT_MANY_AND_COPY = defineRule<Clauses>({
  id: 'effect.exile-up-to-that-many-and-copy',
  family: 'effect',
  leading: ['exile'],
  cites: [
    'CR 115.1 (Targets)',
    'CR 601.2c (Casting Spells)',
    'CR 707.12 (Copying Objects)',
    'CR 608.2g (Resolving Spells and Abilities)',
    'CR 118.9 (Alternative Costs)',
  ],
  examples: [
    'exile up to that many target instant and/or sorcery cards with mana value 3 or less from your graveyard and copy them. you may cast any number of the copies without paying their mana costs',
  ],
  rejects: [
    'exile up to that many target instant and/or sorcery cards with mana value 3 or less from your graveyard and copy them',
    'exile up to that many target instant and/or sorcery cards from your graveyard and copy them. you may cast any number of the copies without paying their mana costs',
    'exile up to two target instant and/or sorcery cards with mana value 3 or less from your graveyard and copy them. you may cast any number of the copies without paying their mana costs',
    'exile up to that many target instant and/or sorcery cards with mana value 3 or less from your hand and copy them. you may cast any number of the copies without paying their mana costs',
    'exile up to that many target creature cards with mana value 3 or less from your graveyard and copy them. you may cast any number of the copies without paying their mana costs',
    'exile up to that many target instant and/or sorcery cards with mana value 3 or less from your graveyard and copy them. you may cast the copies without paying their mana costs',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.exile-up-to-that-many-and-copy';
    const r = pattern(
      new RegExp(
        `exile up to that many target instant and\\/or sorcery cards with mana value (\\d+) or less from your graveyard and copy them\\. you may cast any number of the copies without paying their mana costs${BOUNDARY}`,
        'iu',
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const span = { start: pos, end: r.pos };
    return {
      ok: true,
      value: [
        makeClause(
          id,
          'exileThatManyAndCopy',
          { manaValue: number(Number(r.value[1]), span) },
          span,
        ),
      ],
      pos: r.pos,
    };
  },
});

/**
 * `effect.cast-instant-and-sorcery-from-graveyard-x`: "You may cast up to one target instant card and/or up to one target sorcery card from your graveyard each with mana value X or less without
 * paying their mana costs. If a spell cast this way would be put into your graveyard, exile it instead. If X is 10 or more, copy each of those spells twice. You may choose new targets for the
 * copies." (Finale of Promise, CR 115.1, 601.2c, 608.2g, 118.9, 614.1a, 707.10, 707.10c): the four sentences of one instruction (`segment.ts` keeps them together). The engine's two target slots of
 * cards in the graveyard (the mana value at most the X of the spell), a free `castCard` of each with its spell exiled in place of a graveyard, and, for an X of 10 or more, `copySpell` twice
 * of each spell cast. Not read: another number of cards, another X, another count of copies, other words between the sentences.
 */
export const EFFECT_CAST_INSTANT_AND_SORCERY_FROM_GRAVEYARD_X = defineRule<Clauses>({
  id: 'effect.cast-instant-and-sorcery-from-graveyard-x',
  family: 'effect',
  leading: ['you', 'cast'],
  cites: [
    'CR 115.1 (Targets)',
    'CR 608.2g (Resolving Spells and Abilities)',
    'CR 118.9 (Alternative Costs)',
    'CR 614.1a (Replacement Effects)',
    'CR 707.10 (Copying Objects)',
  ],
  examples: [
    'you may cast up to one target instant card and/or up to one target sorcery card from your graveyard each with mana value x or less without paying their mana costs. if a spell cast this way would be put into your graveyard, exile it instead. if x is 10 or more, copy each of those spells twice. you may choose new targets for the copies',
  ],
  rejects: [
    'you may cast up to one target instant card and/or up to one target sorcery card from your graveyard each with mana value x or less without paying their mana costs',
    'you may cast up to one target instant card and/or up to one target sorcery card from your graveyard each with mana value x or less without paying their mana costs. if a spell cast this way would be put into your graveyard, exile it instead',
    'you may cast up to two target instant cards and/or up to one target sorcery card from your graveyard each with mana value x or less without paying their mana costs. if a spell cast this way would be put into your graveyard, exile it instead. if x is 10 or more, copy each of those spells twice. you may choose new targets for the copies',
    'you may cast up to one target instant card and/or up to one target sorcery card from your graveyard each with mana value x or less without paying their mana costs. if a spell cast this way would be put into your graveyard, exile it instead. if x is 9 or more, copy each of those spells twice. you may choose new targets for the copies',
    'you may cast up to one target instant card and/or up to one target sorcery card from your graveyard each with mana value x or less without paying their mana costs. if a spell cast this way would be put into your graveyard, exile it instead. if x is 10 or more, copy each of those spells three times. you may choose new targets for the copies',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.cast-instant-and-sorcery-from-graveyard-x';
    const r = pattern(
      new RegExp(
        `(?:you may )?cast up to one target instant card and\\/or up to one target sorcery card from your graveyard each with mana value x or less without paying their mana costs\\. if a spell cast this way would be put into your graveyard, exile it instead\\. if x is 10 or more, copy each of those spells twice\\. you may choose new targets for the copies${BOUNDARY}`,
        'iu',
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: [
        makeClause(id, 'castInstantAndSorceryFromGraveyardX', {}, { start: pos, end: r.pos }),
      ],
      pos: r.pos,
    };
  },
});

/** Tried first: it starts like a plain "you may cast" and the rules for that would read its first words and stop. */
export const QUICK_DRAW_FIRST_EFFECT_RULES = [EFFECT_CAST_INSTANT_AND_SORCERY_FROM_GRAVEYARD_X];

export const QUICK_DRAW_EFFECT_RULES = [
  EFFECT_PAY_ANY_NUMBER_OF_TIMES,
  EFFECT_EXILE_UP_TO_THAT_MANY_AND_COPY,
  EFFECT_EXILE_AT_RANDOM,
  EFFECT_COPY_LINKED_EXILED_AND_CAST,
  EFFECT_MANA_RIDER_EXILE,
];
