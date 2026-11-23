/**
 * Effect rule of the gravecast group of the Dance of the Elements deck (Horde of Notions): "You may play target Elemental card from your graveyard without paying its mana cost."
 */
import { literal, optional, pattern, satisfy, sequence } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { defineRule, family, quietly } from '../registry';
import { flag } from './dragons';
import { type Clauses, single } from './operands';

const ID = 'effect.play-target-graveyard-card-free';

/**
 * `effect.play-target-graveyard-card-free`: "(you may) play target Elemental card from your graveyard without paying its mana cost" (CR 115.1, 608.2b: the card is a target, and
 * nothing happens to it if it left the graveyard; CR 608.2g, 118.9: a spell is cast as the ability resolves, without paying its mana cost; CR 305.1, 305.2a: a land card is played
 * as the land play of the turn, not cast). The engine's `castFree` of a target card with `play`. "You may" is the choice the effect asks for itself, so the sentence's own words
 * and a trigger's are the same thing; a play that is not optional is not read. Only one target card of your own graveyard, with no other words.
 */
export const EFFECT_PLAY_TARGET_GRAVEYARD_CARD_FREE = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['play', 'you'],
  cites: [
    'CR 115.1 (Targets)',
    'CR 608.2b (Resolving Spells and Abilities)',
    'CR 608.2g (Resolving Spells and Abilities)',
    'CR 118.9 (Alternative Costs)',
    'CR 305.1 (Lands)',
  ],
  examples: [
    'you may play target Elemental card from your graveyard without paying its mana cost',
    'play target Elemental card from your graveyard without paying its mana cost',
    'you may play target creature card from your graveyard without paying its mana cost',
  ],
  rejects: [
    'you may play target Elemental card from your graveyard',
    'you may play target Elemental card from a graveyard without paying its mana cost',
    "you may play target Elemental card from an opponent's graveyard without paying its mana cost",
    'you may play up to one target Elemental card from your graveyard without paying its mana cost',
    'you may play two target Elemental cards from your graveyard without paying their mana costs',
    'you may play target Elemental card from your graveyard without paying its mana cost and draw a card',
    'you may play target Elemental card from your graveyard without paying its mana cost this turn',
    'you may cast target Elemental card from your graveyard without paying its mana cost',
    'you may play target Elemental card from your hand without paying its mana cost',
  ],
  parse: single(
    ID,
    sequence(
      optional(literal('you may '), null),
      literal('play '),
      satisfy(
        family<IrNoun>('noun', { only: ['noun.target-graveyard-card'] }),
        (noun) =>
          noun.filter.controller === 'you' &&
          noun.count === undefined &&
          !noun.upTo &&
          !noun.plural,
      ),
      literal(' without paying its mana cost'),
      // Nothing joined to the clause: a join says a second instruction, which is not read.
      pattern(/(?=\.|$)/u),
    ),
    ([may, , objects]) => ({
      verb: 'castFreeTarget',
      args: {
        objects,
        may: flag(ID, may !== null, objects.span),
      },
    }),
  ),
});

export const GRAVECAST_EFFECT_RULES = [EFFECT_PLAY_TARGET_GRAVEYARD_CARD_FREE].map(quietly);
