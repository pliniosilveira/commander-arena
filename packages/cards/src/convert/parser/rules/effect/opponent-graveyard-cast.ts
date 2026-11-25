/**
 * Effect rule of group 5 of the Mind Flayarrrs deck (Memory Plunder): casting an instant or sorcery card of an opponent's graveyard without paying its mana cost.
 */
import { literal, optional, pattern, satisfy, sequence } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { defineRule, family, quietly, spanned } from '../registry';
import { flag } from './dragons';
import { isInstantOrSorcery } from './f144';
import { type Clauses, single } from './operands';

const ID = 'effect.cast-opponent-graveyard-card-free';

/**
 * `effect.cast-opponent-graveyard-card-free`: "(you may) cast target instant or sorcery card from an opponent's graveyard without paying its mana cost" (CR 115.1, 601.2, 608.2g,
 * 118.9, 108.3: the card is a target in the graveyard of an opponent, whichever one; the spell is cast as the effect resolves and its owner stays the card's owner). The engine's
 * `castCard` with `free`, as `effect.cast-own-graveyard-card-free` reads a card of your own graveyard. "You may" is the choice the effect asks for itself. Not read: a graveyard that is
 * not an opponent's, several cards, "up to", paying the mana cost, a card that is not an instant or sorcery, a rider, another instruction joined to the clause.
 */
export const EFFECT_CAST_OPPONENT_GRAVEYARD_CARD_FREE = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['cast', 'you'],
  cites: [
    'CR 115.1 (Targets)',
    'CR 601.2 (Casting Spells)',
    'CR 608.2g (Resolving Spells and Abilities)',
    'CR 118.9 (Alternative Costs)',
  ],
  examples: [
    "you may cast target instant or sorcery card from an opponent's graveyard without paying its mana cost",
    "cast target instant or sorcery card from an opponent's graveyard without paying its mana cost",
    "you may cast target sorcery card from an opponent's graveyard without paying its mana cost",
  ],
  rejects: [
    'you may cast target instant or sorcery card from your graveyard without paying its mana cost',
    'you may cast target instant or sorcery card from a graveyard without paying its mana cost',
    "you may cast target instant or sorcery card from an opponent's graveyard",
    "you may cast up to one target instant or sorcery card from an opponent's graveyard without paying its mana cost",
    "you may cast two target instant or sorcery cards from an opponent's graveyard without paying their mana costs",
    "you may cast target creature card from an opponent's graveyard without paying its mana cost",
    "you may cast target instant or sorcery card from an opponent's graveyard without paying its mana cost and draw a card",
    "you may cast target instant or sorcery card from an opponent's graveyard without paying its mana cost this turn",
    "you may cast target instant or sorcery card from an opponent's graveyard without paying its mana cost. if that spell would be put into a graveyard, exile it instead",
  ],
  parse: single(
    ID,
    sequence(
      optional(spanned(literal('you may ')), null),
      literal('cast '),
      satisfy(
        family<IrNoun>('noun', { only: ['noun.target-graveyard-card'] }),
        (noun) =>
          noun.filter.controller === 'opponent' &&
          noun.count === undefined &&
          !noun.upTo &&
          !noun.plural &&
          isInstantOrSorcery(noun.filter),
      ),
      literal(' without paying its mana cost'),
      pattern(/(?=\.|$)/u),
    ),
    ([may, , objects]) => ({
      verb: 'castCard',
      args: {
        objects,
        may: flag(ID, may !== null, objects.span),
        free: flag(ID, true, objects.span),
        exileInstead: flag(ID, false, objects.span),
      },
    }),
  ),
});

export const OPPONENT_GRAVEYARD_CAST_EFFECT_RULES = [EFFECT_CAST_OPPONENT_GRAVEYARD_CARD_FREE].map(
  quietly,
);
