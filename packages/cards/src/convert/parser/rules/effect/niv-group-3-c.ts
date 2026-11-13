/**
 * Effect rules of group 3-c of the Niv-Mizzet deck (issue 25, D-990 to D-994): "you may cast target instant or sorcery card from a graveyard, and mana of any type
 * can be spent to cast that spell. If that spell would be put into a graveyard, exile it instead". ("Blue Magic —" before it is an ability word, which has no rules
 * meaning.)
 */
import { literal, optional, pattern, satisfy, sequence } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { BOUNDARY } from '../noun/phrases';
import { defineRule, family, quietly, spanned } from '../registry';
import { flag } from './dragons';
import { type Clauses, single } from './operands';

/** ", and mana of any type can be spent to cast that spell": the first rider, said in the same sentence (CR 609.4b). */
const ANY_MANA_TYPE = pattern(
  new RegExp(`, and mana of any type can be spent to cast that spell${BOUNDARY}`, 'iu'),
);

/** ". If that spell would be put into a graveyard, exile it instead": the second rider, the next sentence, taken with the clause (CR 614.1a). */
const EXILE_INSTEAD = pattern(
  new RegExp(
    `\\. if that spell would be put into a graveyard, exile it instead${BOUNDARY}(?!,| and\\b| then\\b)`,
    'iu',
  ),
);

const ID = 'effect.cast-graveyard-card';

/**
 * `effect.cast-graveyard-card`: "(you may) cast target instant or sorcery card from a graveyard", with the riders "and mana of any type can be spent to cast that
 * spell" and "If that spell would be put into a graveyard, exile it instead" (CR 608.2g: a spell cast as an effect resolves, paying its mana cost, with no timing
 * restriction; CR 601.2: the steps of casting; CR 609.4b: mana spent as though it were mana of any type; CR 614.1a: the replacement of the move to a graveyard by one to
 * exile, for that spell only; CR 115.1: the card is a target, in a graveyard of any player). The engine's `castCard`. "You may" is the choice the effect asks for itself:
 * the sentence's own "you may" (a trigger's body, where it comes before the clause) or the words of the rule are the same thing, and a cast that is not optional is not
 * read. Only one target card from "a graveyard" (not "your graveyard", not "an opponent's graveyard", not several, not "up to"), with at most these two riders.
 */
export const EFFECT_CAST_GRAVEYARD_CARD = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['cast', 'you'],
  cites: [
    'CR 608.2g (Resolving Spells and Abilities)',
    'CR 601.2 (Casting Spells)',
    'CR 609.4b (Effects)',
    'CR 614.1a (Replacement Effects)',
    'CR 115.1 (Targets)',
  ],
  examples: [
    'cast target instant or sorcery card from a graveyard',
    'you may cast target instant or sorcery card from a graveyard',
    'cast target instant or sorcery card from a graveyard, and mana of any type can be spent to cast that spell',
    'cast target instant or sorcery card from a graveyard, and mana of any type can be spent to cast that spell. if that spell would be put into a graveyard, exile it instead',
    'you may cast target instant or sorcery card from a graveyard, and mana of any type can be spent to cast that spell. if that spell would be put into a graveyard, exile it instead',
    'cast target instant or sorcery card from a graveyard. if that spell would be put into a graveyard, exile it instead',
    'cast target sorcery card from a graveyard',
  ],
  rejects: [
    'cast target instant or sorcery card from your graveyard',
    "cast target instant or sorcery card from an opponent's graveyard",
    'cast up to one target instant or sorcery card from a graveyard',
    'cast two target instant or sorcery cards from a graveyard',
    'cast target instant or sorcery card from a graveyard, and mana of any type can be spent to cast it',
    'cast target instant or sorcery card from a graveyard, and mana of any color can be spent to cast that spell',
    'cast target instant or sorcery card from a graveyard and draw a card',
    'cast target instant or sorcery card from a graveyard, and mana of any type can be spent to cast that spell and draw a card',
    'cast target instant or sorcery card from a graveyard without paying its mana cost',
    'cast target instant or sorcery card from a graveyard. if that spell would be put into a graveyard, exile it instead, then draw a card',
    'cast target instant or sorcery card',
    'cast target creature from a graveyard',
    'cast a spell from a graveyard',
    'you may cast target instant or sorcery card from a graveyard this turn',
  ],
  parse: single(
    ID,
    sequence(
      optional(spanned(literal('you may ')), null),
      literal('cast '),
      satisfy(
        family<IrNoun>('noun', { only: ['noun.target-graveyard-card'] }),
        (noun) =>
          noun.filter.controller === undefined &&
          noun.count === undefined &&
          !noun.upTo &&
          !noun.plural,
      ),
      optional(spanned(ANY_MANA_TYPE), null),
      optional(spanned(EXILE_INSTEAD), null),
      // Nothing joined to the clause: a join says a second instruction, which is not read.
      pattern(/(?=\.|$)/u),
    ),
    ([may, , objects, anyType, exileInstead]) => ({
      verb: 'castCard',
      args: {
        objects,
        may: flag(ID, may !== null, objects.span),
        anyManaType: flag(ID, anyType !== null, objects.span),
        exileInstead: flag(ID, exileInstead !== null, objects.span),
      },
    }),
  ),
});

export const NIV_GROUP_3_C_EFFECT_RULES = [EFFECT_CAST_GRAVEYARD_CARD].map(quietly);
