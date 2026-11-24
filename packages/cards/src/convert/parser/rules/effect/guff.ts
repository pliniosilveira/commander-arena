/**
 * Effect rules of the Planeswalker Party deck (issue 132, Guff Rewrites History): a target for each player, the chosen permanents shuffled into their owners' libraries, and each player
 * who controlled one exiling until a nonland card, which each may cast for free.
 */
import { fail, literal, pattern, sequence } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { BOUNDARY, permanentPhrase } from '../noun/phrases';
import { defineRule, spanned } from '../registry';
import { type Clauses, makeClause } from './operands';

const THEM: Omit<IrNoun, 'span' | 'rule'> = {
  kind: 'noun',
  det: 'anaphor',
  filter: { raw: 'them' },
  upTo: false,
  plural: true,
  other: false,
};

const CHOOSE_ID = 'effect.for-each-player-choose-target';

/**
 * `effect.for-each-player-choose-target`: "For each player, choose target nonenchantment, nonland permanent that player controls." (Guff Rewrites History; CR 115.1, 601.2c, 603.3d): one
 * slot with a target for each player who controls a legal one, each controlled by that player (the engine's `differentControllers` with `everyController`). It makes no effect of its own: the
 * sentences after it read the chosen permanents as "those permanents". Not read: "each opponent", "up to one", a plural, a controller stated otherwise, "choose a".
 */
export const EFFECT_FOR_EACH_PLAYER_CHOOSE_TARGET = defineRule<Clauses>({
  id: CHOOSE_ID,
  family: 'effect',
  leading: ['for'],
  cites: [
    'CR 115.1 (Targets)',
    'CR 601.2c (Casting Spells)',
    'CR 603.3d (Handling Triggered Abilities)',
  ],
  examples: [
    'for each player, choose target nonenchantment, nonland permanent that player controls',
    'for each player, choose target creature that player controls',
  ],
  rejects: [
    'for each opponent, choose target creature that player controls',
    'for each player, choose up to one target creature that player controls',
    'for each player, choose target creatures that player controls',
    'for each player, choose target creature you control',
    'for each player, choose a creature that player controls',
    'for each player, choose target creature that player controls.',
    'for each player, choose target creature that player controls and draw a card',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal('for each player, choose target '),
      spanned(permanentPhrase(false, 'all')),
      pattern(new RegExp(` that player controls${BOUNDARY}`, 'iu')),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, what] = r.value;
    if (what.value.controller !== undefined || what.value.anyOf !== undefined) {
      return fail(ctx, pos);
    }
    const noun: IrNoun = {
      kind: 'noun',
      det: 'target',
      filter: what.value,
      upTo: false,
      plural: true,
      other: false,
      anyNumber: true,
      differentControllers: true,
      everyController: true,
      span: what.span,
      rule: CHOOSE_ID,
    };
    return {
      ok: true,
      value: [makeClause(CHOOSE_ID, 'chooseTarget', { what: noun }, { start: pos, end: r.pos })],
      pos: r.pos,
    };
  },
});

const SHUFFLE_ID = 'effect.those-owners-shuffle-them-in';

/**
 * `effect.those-owners-shuffle-them-in`: "Those permanents' owners shuffle them into their libraries." (Guff Rewrites History; CR 701.24, 400.3, 108.3): each permanent the sentence before
 * chose goes into its owner's library, and each owner shuffles. The engine's `moveToZone` of the targets and the `shuffle` of their owners. Not read: another group than "those
 * permanents", "their owners'" for one permanent, a destination other than the libraries, a rider.
 */
export const EFFECT_THOSE_OWNERS_SHUFFLE_THEM_IN = defineRule<Clauses>({
  id: SHUFFLE_ID,
  family: 'effect',
  leading: ['those'],
  cites: ['CR 701.24 (Shuffle)', 'CR 400.3 (General)', 'CR 108.3 (Owners and Controllers)'],
  examples: [
    'those permanents’ owners shuffle them into their libraries',
    "those permanents' owners shuffle them into their libraries",
  ],
  rejects: [
    "those permanents' owners shuffle them into their library",
    "those creatures' owners shuffle them into their libraries",
    "those permanents' owners shuffle them into their libraries and draw a card",
    "those permanents' controllers shuffle them into their libraries",
    "those permanents' owners shuffle them",
    'their owners shuffle them into their libraries',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(/those permanents['’] owners shuffle them into their libraries(?![\p{L}\p{N}])/iu),
    )(ctx, pos);
    if (!r.ok) return r;
    const noun: IrNoun = { ...THEM, span: { start: pos, end: pos + 5 }, rule: SHUFFLE_ID };
    return {
      ok: true,
      value: [makeClause(SHUFFLE_ID, 'ownersShuffleThemIn', { objects: noun }, r.value.span)],
      pos: r.pos,
    };
  },
});

const EXILE_ID = 'effect.those-controllers-exile-until-nonland';

/**
 * `effect.those-controllers-exile-until-nonland`: "Each player who controlled one of those permanents exiles cards from the top of their library until they exile a nonland card, then puts
 * the rest on the bottom of their library in a random order." (Guff Rewrites History; CR 701.13, 401.4, 101.4, 608.2h): the controllers (as they last were) of the permanents the
 * sentences before chose, in turn order, each exile from their own library until a nonland card, the nonland card is what the next sentence reads as "the nonland card they exiled" and
 * the rest go to the bottom in a random order. The engine's `exileUntilFound` with `restToBottom` over the players that `controllerOf` the targets names. Not read: another kind of
 * card, "each opponent", the rest in the graveyard or in any order.
 */
export const EFFECT_THOSE_CONTROLLERS_EXILE_UNTIL_NONLAND = defineRule<Clauses>({
  id: EXILE_ID,
  family: 'effect',
  leading: ['each'],
  cites: [
    'CR 701.13 (Exile)',
    'CR 401.4 (Library)',
    'CR 101.4 (Starting Player)',
    'CR 608.2h (Resolving Spells and Abilities)',
  ],
  examples: [
    'each player who controlled one of those permanents exiles cards from the top of their library until they exile a nonland card, then puts the rest on the bottom of their library in a random order',
  ],
  rejects: [
    'each player who controlled one of those permanents exiles cards from the top of their library until they exile a nonland card',
    'each player who controlled one of those permanents exiles cards from the top of their library until they exile a land card, then puts the rest on the bottom of their library in a random order',
    'each player who controlled one of those permanents exiles cards from the top of their library until they exile a nonland card, then puts the rest into their graveyard',
    'each player who controls one of those permanents exiles cards from the top of their library until they exile a nonland card, then puts the rest on the bottom of their library in a random order',
    'each opponent who controlled one of those permanents exiles cards from the top of their library until they exile a nonland card, then puts the rest on the bottom of their library in a random order',
    'each player exiles cards from the top of their library until they exile a nonland card, then puts the rest on the bottom of their library in a random order',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(
        /each player who controlled one of those permanents exiles cards from the top of their library until they exile a nonland card, then puts the rest on the bottom of their library in a random order(?![\p{L}\p{N}])/iu,
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const noun: IrNoun = { ...THEM, span: { start: pos, end: pos + 4 }, rule: EXILE_ID };
    return {
      ok: true,
      value: [
        makeClause(EXILE_ID, 'controllersExileUntilNonland', { objects: noun }, r.value.span),
      ],
      pos: r.pos,
    };
  },
});

const CAST_ID = 'effect.each-player-may-cast-exiled-nonland';

/**
 * `effect.each-player-may-cast-exiled-nonland`: "Each player may cast the nonland card they exiled without paying its mana cost." (Guff Rewrites History; CR 608.2g, 101.4, 118.9): after
 * an instruction that exiled a card for each of several players, each of them, in turn order, may cast their own card for no mana cost. The engine's `castFree` of `moved` with `perOwner`
 * and `byOwner`. Not read: a card kind besides "the nonland card", "you may", a cost.
 */
export const EFFECT_EACH_PLAYER_MAY_CAST_EXILED_NONLAND = defineRule<Clauses>({
  id: CAST_ID,
  family: 'effect',
  leading: ['each'],
  cites: [
    'CR 608.2g (Resolving Spells and Abilities)',
    'CR 101.4 (Starting Player)',
    'CR 118.9 (Alternative Costs)',
  ],
  examples: ['each player may cast the nonland card they exiled without paying its mana cost'],
  rejects: [
    'each player may cast the nonland card they exiled',
    'each player may cast the land card they exiled without paying its mana cost',
    'each player may cast the nonland card they exiled without paying its mana cost.',
    'each opponent may cast the nonland card they exiled without paying its mana cost',
    'you may cast the nonland card you exiled without paying its mana cost',
    'each player may cast the nonland card they exiled without paying its mana cost and draw a card',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(
        /each player may cast the nonland card they exiled without paying its mana cost(?![\p{L}\p{N}])/iu,
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: [makeClause(CAST_ID, 'eachOwnerMayCastExiled', {}, r.value.span)],
      pos: r.pos,
    };
  },
});

export const GUFF_EFFECT_RULES = [
  EFFECT_FOR_EACH_PLAYER_CHOOSE_TARGET,
  EFFECT_THOSE_OWNERS_SHUFFLE_THEM_IN,
  EFFECT_THOSE_CONTROLLERS_EXILE_UNTIL_NONLAND,
  EFFECT_EACH_PLAYER_MAY_CAST_EXILED_NONLAND,
];
