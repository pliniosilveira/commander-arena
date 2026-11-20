/**
 * Effect rules for casting the card an earlier sentence chose from your graveyard (Conduit of Worlds): "Choose target nonland permanent card in your graveyard. If you haven't
 * cast a spell this turn, you may cast that card. If you do, you can't cast additional spells this turn." The first sentence is `effect.choose-graveyard-cards`, the conditions
 * are `condition.no-spell-cast-this-turn` and `condition.if-you-do`; the lowerings are in `lower/graveyard-cast.ts` and `lower/sentences.ts`.
 */
import { literal, optional, pattern, satisfy, sequence } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { BOUNDARY } from '../noun/phrases';
import { defineRule, family, quietly, spanned } from '../registry';
import { flag } from './dragons';
import { type Clauses, single } from './operands';

const CAST_THAT_CARD = 'effect.may-cast-that-card';

/**
 * `effect.may-cast-that-card`: "you may cast that card" (CR 608.2g: a spell cast as an effect resolves, with no timing restriction, paying its mana cost; CR 608.2c: "that
 * card" is the card an earlier instruction of the text chose; CR 601.2: the steps of casting). The engine's `castCard` on the target card of your graveyard that the binding pass
 * names, which asks the controller itself, so "you may" is that question. Not read: "that card" with more words ("from your graveyard", "this turn", "without paying its mana
 * cost"), "it", several cards, a cast that is not an offer, a second instruction joined to it.
 */
export const EFFECT_MAY_CAST_THAT_CARD = defineRule<Clauses>({
  id: CAST_THAT_CARD,
  family: 'effect',
  leading: ['you'],
  cites: [
    'CR 608.2g (Resolving Spells and Abilities)',
    'CR 608.2c (Resolving Spells and Abilities)',
    'CR 601.2 (Casting Spells)',
  ],
  examples: ['you may cast that card', 'you may cast that nonland permanent card'],
  rejects: [
    'cast that card',
    'you may cast it',
    'you may cast those cards',
    'you may cast that card this turn',
    'you may cast that card from your graveyard',
    'you may cast that card without paying its mana cost',
    'you may cast that card and draw a card',
    'you may cast that card, then draw a card',
    'you may cast target card',
    'you may cast that creature',
  ],
  parse: single(
    CAST_THAT_CARD,
    sequence(
      literal('you may cast '),
      // "that card", "that nonland permanent card": the words between "that" and "card" name the card, never a second instruction ("that card and draw a card").
      satisfy(
        family<IrNoun>('noun', { only: ['noun.that-card'] }),
        (noun) =>
          !/\b(?:and|or|then|that|you|put|from|with|card)\b/iu.test(
            (noun.filter.raw ?? '').slice(5, -4),
          ),
      ),
      // Nothing joined to the clause: a join says a second instruction, which is not read.
      pattern(/(?=\.|$)/u),
    ),
    ([, objects]) => ({
      verb: 'castThatCard',
      args: { objects, may: flag(CAST_THAT_CARD, true, objects.span) },
    }),
  ),
});

const CAST_THIS_FROM_GRAVEYARD = 'effect.may-cast-this-from-graveyard';

/**
 * `effect.may-cast-this-from-graveyard`: "you may cast ~ from your graveyard" (CR 113.6b: an ability that works from the graveyard; CR 608.2g: a spell cast as an effect resolves,
 * with no timing restriction, paying its mana cost; CR 601.2: the steps of casting). The engine's `castCard` on the card with the ability, which asks the controller itself, so "you may"
 * is that question. Not read: no "you may", another zone or owner, "this turn", "without paying its mana cost", another card, a second instruction joined to it.
 */
export const EFFECT_MAY_CAST_THIS_FROM_GRAVEYARD = defineRule<Clauses>({
  id: CAST_THIS_FROM_GRAVEYARD,
  family: 'effect',
  leading: ['you', 'cast'],
  cites: [
    'CR 113.6b (Abilities)',
    'CR 608.2g (Resolving Spells and Abilities)',
    'CR 601.2 (Casting Spells)',
  ],
  examples: ['you may cast ~ from your graveyard', 'cast ~ from your graveyard'],
  rejects: [
    'cast ~',
    'you may cast ~',
    'you may cast ~ from a graveyard',
    'you may cast ~ from your hand',
    'you may cast ~ from an opponent’s graveyard',
    'you may cast ~ from your graveyard this turn',
    'you may cast ~ from your graveyard without paying its mana cost',
    'you may cast ~ from your graveyard and draw a card',
    'you may cast that card from your graveyard',
    'you may cast another card from your graveyard',
  ],
  parse: single(
    CAST_THIS_FROM_GRAVEYARD,
    sequence(
      optional(spanned(literal('you may ')), null),
      literal('cast ~ from your graveyard'),
      // Nothing joined to the clause: a join says a second instruction, which is not read.
      pattern(/(?=\.|$)/u),
    ),
    ([may]) => ({
      verb: 'castThisFromGraveyard',
      args: {
        may: flag(CAST_THIS_FROM_GRAVEYARD, may !== null, may?.span ?? { start: 0, end: 0 }),
      },
    }),
  ),
});

const CANT_CAST_MORE = 'effect.cant-cast-additional-spells';

/**
 * `effect.cant-cast-additional-spells`: "you can't cast additional spells this turn" (CR 101.2: "can't" beats "can"; CR 611.2a: an effect of a resolving ability lasts for the
 * time it says; CR 601.2: a spell cast earlier is unaffected). The engine's `playerCantCastSpells` for the controller until end of turn. Not read: "you can't cast spells this turn"
 * (no spell is "additional"), "target player", "each opponent", another duration, a count, a second instruction joined to it.
 */
export const EFFECT_CANT_CAST_ADDITIONAL_SPELLS = defineRule<Clauses>({
  id: CANT_CAST_MORE,
  family: 'effect',
  leading: ['you'],
  cites: ['CR 101.2 (Golden Rules)', 'CR 611.2a (Continuous Effects)', 'CR 601.2 (Casting Spells)'],
  examples: [
    "you can't cast additional spells this turn",
    'you can’t cast additional spells this turn',
  ],
  rejects: [
    "you can't cast additional spells",
    "you can't cast spells this turn",
    "you can't cast additional spells this game",
    "you can't cast additional spells until end of turn",
    "you can't cast additional spells this turn and draw a card",
    "target player can't cast additional spells this turn",
    "you can't cast an additional spell this turn",
    'you can cast additional spells this turn',
  ],
  parse: single(
    CANT_CAST_MORE,
    pattern(new RegExp(`you can['’]t cast additional spells this turn${BOUNDARY}`, 'iu')),
    () => ({ verb: 'cantCastAdditionalSpells', args: {} }),
  ),
});

export const GRAVEYARD_CAST_EFFECT_RULES = [
  EFFECT_MAY_CAST_THAT_CARD,
  EFFECT_MAY_CAST_THIS_FROM_GRAVEYARD,
  EFFECT_CANT_CAST_ADDITIONAL_SPELLS,
].map(quietly);
