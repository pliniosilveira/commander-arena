/**
 * Effect rules of Summon: Esper Valigarmanda (deck support issue 97): "Exile an instant or sorcery card from each graveyard." and "You may cast an instant or sorcery card exiled with ~, and mana
 * of any type can be spent to cast that spell." (CR 608.2d, 404.1, 406.1, 607.2a, 608.2g, 601.2, 609.4b).
 *
 * - `effect.exile-instant-or-sorcery-from-each-graveyard`: the engine's `moveToZone` of a `choose` with `eachGraveyard` (one card of the types from each graveyard, the controller choosing), linked.
 * - `effect.may-cast-exiled-with-self-paying-any-type`: the engine's `castFree` of the `linkedExile` cards with `paying` and `anyManaType`: cast as the ability resolves, paying the mana cost.
 */
import { pattern } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { BOUNDARY } from '../noun/phrases';
import { defineRule, spanned } from '../registry';
import { flag } from './dragons';
import { type Clauses, makeClause } from './operands';

const EACH_ID = 'effect.exile-instant-or-sorcery-from-each-graveyard';

/**
 * `effect.exile-instant-or-sorcery-from-each-graveyard`: "exile an instant or sorcery card from each graveyard". The controller chooses one card for each graveyard (none from a graveyard with
 * none), in turn order from them; the permanent the ability belongs to remembers the cards ("exiled with ~"). Not read: "you may" (the optional form is its own rule), a target, a number, other
 * types, "your graveyard", "all", a trailing word.
 */
export const EFFECT_EXILE_INSTANT_OR_SORCERY_FROM_EACH_GRAVEYARD = defineRule<Clauses>({
  id: EACH_ID,
  family: 'effect',
  leading: ['exile'],
  cites: [
    'CR 608.2d (Resolving Spells and Abilities)',
    'CR 404.1 (Graveyard)',
    'CR 406.1 (Exile)',
    'CR 607.2a (Linked Abilities)',
  ],
  examples: ['exile an instant or sorcery card from each graveyard'],
  rejects: [
    'you may exile an instant or sorcery card from each graveyard',
    'exile an instant or sorcery card from your graveyard',
    'exile target instant or sorcery card from each graveyard',
    'exile two instant or sorcery cards from each graveyard',
    'exile an instant card from each graveyard',
    'exile an instant or creature card from each graveyard',
    'exile an instant or sorcery card from each graveyard and draw a card',
    'exile all instant or sorcery cards from each graveyard',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(
        new RegExp(
          `exile an instant or sorcery card from each graveyard${BOUNDARY}(?!,| and\\b| then\\b)`,
          'iu',
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const { span } = r.value;
    const noun: IrNoun = {
      kind: 'noun',
      det: 'a',
      upTo: false,
      plural: false,
      other: false,
      filter: {
        zone: 'graveyard',
        controller: 'you',
        card: true,
        raw: '',
        anyOf: [
          { types: ['instant'], raw: '' },
          { types: ['sorcery'], raw: '' },
        ],
      },
      span,
      rule: EACH_ID,
    };
    return {
      ok: true,
      value: [
        makeClause(
          EACH_ID,
          'exileFromEachGraveyard',
          { objects: noun, mandatory: flag(EACH_ID, true, span) },
          span,
        ),
      ],
      pos: r.pos,
    };
  },
});

const CAST_ID = 'effect.may-cast-exiled-with-self-paying-any-type';

/**
 * `effect.may-cast-exiled-with-self-paying-any-type`: "you may cast an instant or sorcery card exiled with ~, and mana of any type can be spent to cast that spell". As the ability resolves the
 * controller may cast one such card the permanent exiled with its linked ability, paying its mana cost with any mana. Not read: "this turn" or another length, "play", other types, "that card",
 * another permanent than "~", a trailing word, "without paying".
 */
export const EFFECT_MAY_CAST_EXILED_WITH_SELF_PAYING_ANY_TYPE = defineRule<Clauses>({
  id: CAST_ID,
  family: 'effect',
  leading: ['you', 'cast'],
  cites: [
    'CR 608.2g (Resolving Spells and Abilities)',
    'CR 601.2 (Casting Spells)',
    'CR 607.2a (Linked Abilities)',
    'CR 609.4b (Effects)',
  ],
  examples: [
    'you may cast an instant or sorcery card exiled with ~, and mana of any type can be spent to cast that spell',
    'cast an instant or sorcery card exiled with ~, and mana of any type can be spent to cast that spell',
  ],
  rejects: [
    'you may cast an instant or sorcery card exiled with ~',
    'you may cast an instant or sorcery card exiled with ~ this turn, and mana of any type can be spent to cast that spell',
    'you may play an instant or sorcery card exiled with ~, and mana of any type can be spent to cast that spell',
    'you may cast a creature card exiled with ~, and mana of any type can be spent to cast that spell',
    'you may cast an instant or sorcery card exiled with ~, and mana of any color can be spent to cast that spell',
    'you may cast an instant or sorcery card exiled with target creature, and mana of any type can be spent to cast that spell',
    'you may cast an instant or sorcery card exiled with ~, and mana of any type can be spent to cast that spell and draw a card',
    'you may cast an instant or sorcery card exiled with ~ without paying its mana cost, and mana of any type can be spent to cast that spell',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(
        new RegExp(
          `(?:you may )?cast an instant or sorcery card exiled with ~, and mana of any type can be spent to cast that spell${BOUNDARY}(?!,| and\\b| then\\b)`,
          'iu',
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const { span } = r.value;
    return {
      ok: true,
      value: [
        {
          ...makeClause(
            CAST_ID,
            'castExiledWithPaying',
            { anyManaType: flag(CAST_ID, true, span) },
            span,
          ),
          optional: true,
        },
      ],
      pos: r.pos,
    };
  },
});

/** Tried before the plain "exile" and "you may cast" rules, which start the same way. */
export const VALIGARMANDA_EFFECT_RULES = [
  EFFECT_EXILE_INSTANT_OR_SORCERY_FROM_EACH_GRAVEYARD,
  EFFECT_MAY_CAST_EXILED_WITH_SELF_PAYING_ANY_TYPE,
];
