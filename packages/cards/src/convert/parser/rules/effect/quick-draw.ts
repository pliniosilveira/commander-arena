/**
 * Effect rules of the Quick Draw deck (issue 121) for the cards that cast copies of cards they exiled: "Exile an instant or sorcery card at random from your graveyard." and "Then copy each
 * card exiled with ~. You may cast any number of the copies without paying their mana costs." (Arcane Bombardment, CR 701.13, 707.12, 608.2g, 118.9, 607.2a).
 */
import { choice, literal, map, pattern, sequence } from '../../combinators';
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

export const QUICK_DRAW_EFFECT_RULES = [
  EFFECT_EXILE_AT_RANDOM,
  EFFECT_COPY_LINKED_EXILED_AND_CAST,
  EFFECT_MANA_RIDER_EXILE,
];
