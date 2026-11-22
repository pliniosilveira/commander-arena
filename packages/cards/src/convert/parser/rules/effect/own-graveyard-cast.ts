/**
 * Effect rule of group G of the Scions & Spellcraft deck: casting an instant or sorcery card of your own graveyard, paying its mana cost, with the rider "If that spell would be
 * put into your graveyard, exile it instead".
 */
import { literal, optional, pattern, satisfy, sequence } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { defineRule, family, quietly, spanned } from '../registry';
import { flag } from './dragons';
import { EXILE_INSTEAD, isInstantOrSorcery } from './f144';
import { type Clauses, single } from './operands';

const ID = 'effect.cast-own-graveyard-card';

/**
 * `effect.cast-own-graveyard-card`: "you may cast target instant or sorcery card from your graveyard", with the rider "If that spell would be put into your graveyard, exile it
 * instead" (CR 115.1, 601.2, 608.2g, 614.1a). The engine's `castCard` on one target card of the controller's own graveyard, paying its mana cost, as
 * `effect.cast-graveyard-card` reads one of any graveyard and `effect.cast-own-graveyard-card-free` reads one cast for free. "You may" is the choice the effect asks for itself.
 * Not read: a graveyard that is not yours, several cards, "up to", a card that is not an instant or sorcery, a cast that is not optional, any other words joined to the clause.
 */
export const EFFECT_CAST_OWN_GRAVEYARD_CARD = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['cast', 'you'],
  cites: [
    'CR 115.1 (Targets)',
    'CR 601.2 (Casting Spells)',
    'CR 608.2g (Resolving Spells and Abilities)',
    'CR 614.1a (Replacement Effects)',
  ],
  examples: [
    'you may cast target instant or sorcery card from your graveyard',
    'you may cast target instant or sorcery card from your graveyard. if that spell would be put into your graveyard, exile it instead',
    'you may cast target sorcery card from your graveyard. if that spell would be put into your graveyard, exile it instead',
  ],
  rejects: [
    'you may cast target instant or sorcery card from a graveyard',
    "you may cast target instant or sorcery card from an opponent's graveyard",
    'you may cast up to one target instant or sorcery card from your graveyard',
    'you may cast two target instant or sorcery cards from your graveyard',
    'you may cast target creature card from your graveyard',
    'you may cast target card from your graveyard',
    'you may cast target instant or sorcery card from your graveyard and draw a card',
    'you may cast target instant or sorcery card from your graveyard without paying its mana cost',
    'you may cast target instant or sorcery card from your graveyard. if that spell would be put into a graveyard, exile it instead',
    'you may cast target instant or sorcery card from your graveyard. if that spell would be put into your graveyard, exile it instead, then draw a card',
    'you may cast target instant or sorcery card from your graveyard this turn',
  ],
  parse: single(
    ID,
    sequence(
      optional(spanned(literal('you may ')), null),
      literal('cast '),
      satisfy(
        family<IrNoun>('noun', { only: ['noun.target-graveyard-card'] }),
        (noun) =>
          noun.filter.controller === 'you' &&
          noun.count === undefined &&
          !noun.upTo &&
          !noun.plural &&
          isInstantOrSorcery(noun.filter),
      ),
      optional(spanned(EXILE_INSTEAD), null),
      // Nothing joined to the clause: a join says a second instruction, which is not read.
      pattern(/(?=\.|$)/u),
    ),
    ([may, , objects, exileInstead]) => ({
      verb: 'castCard',
      args: {
        objects,
        may: flag(ID, may !== null, objects.span),
        anyManaType: flag(ID, false, objects.span),
        free: flag(ID, false, objects.span),
        exileInstead: flag(ID, exileInstead !== null, objects.span),
      },
    }),
  ),
});

export const OWN_GRAVEYARD_CAST_EFFECT_RULES = [EFFECT_CAST_OWN_GRAVEYARD_CARD].map(quietly);
