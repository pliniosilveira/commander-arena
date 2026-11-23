/**
 * Effect rules of Kefka, Dancing Mad (deck support issue 97): "Exile a card at random from each opponent's graveyard." and "Each player who owns a spell you cast this way loses life equal to
 * its mana value." (CR 701.13, 608.2g, 118.9, 202.3, 119.3, 101.4). Between them is "You may cast any number of spells from among cards exiled this way without paying their mana costs"
 * (`effect.cast-from-among`).
 *
 * - `effect.exile-at-random-each-opponent-graveyard`: the engine's `exile` of the cards of the graveyards of the opponents with `atRandom` and `perOwner`: one seeded pick for each opponent's graveyard.
 * - `effect.owners-lose-life-spells-cast-this-way`: the engine's `loseLifeManaValue` of the spells the cast before it remembered.
 */
import { fail, pattern } from '../../combinators';
import { defineRule } from '../registry';
import { type Clauses, makeClause } from './operands';

/**
 * `effect.exile-at-random-each-opponent-graveyard`. Not read: a card of a type ("a creature card"), "your graveyard", "an opponent's graveyard", more than one card, "at random" left out,
 * "each graveyard", words after it.
 */
export const EFFECT_EXILE_AT_RANDOM_EACH_OPPONENT = defineRule<Clauses>({
  id: 'effect.exile-at-random-each-opponent-graveyard',
  family: 'effect',
  leading: ['exile'],
  cites: ['CR 701.13 (Exile)', 'CR 404.1 (Graveyard)', 'CR 101.4 (APNAP order)'],
  examples: [
    'exile a card at random from each opponent’s graveyard',
    "exile a card at random from each opponent's graveyard",
  ],
  rejects: [
    'exile a card at random from your graveyard',
    "exile a card at random from an opponent's graveyard",
    "exile a creature card at random from each opponent's graveyard",
    "exile a card from each opponent's graveyard",
    "exile two cards at random from each opponent's graveyard",
    'exile a card at random from each graveyard',
    "exile a card at random from each opponent's hand",
    "exile a card at random from each opponent's graveyard and draw a card",
  ],
  parse: (ctx, pos) => {
    const id = 'effect.exile-at-random-each-opponent-graveyard';
    const r = pattern(
      /exile a card at random from each opponent['’]s graveyard(?![\p{L}\p{N}])(?!\s+(?:and|then)(?![\p{L}\p{N}]))/iu,
    )(ctx, pos);
    if (!r.ok) return fail(ctx, pos);
    return {
      ok: true,
      value: [makeClause(id, 'exileAtRandomEachOpponent', {}, { start: pos, end: r.pos })],
      pos: r.pos,
    };
  },
});

/**
 * `effect.owners-lose-life-spells-cast-this-way`: each owner loses life equal to the mana value of their spell (one loss for each spell). Not read: "each opponent", life of another amount,
 * "you cast" without "this way", words after it.
 */
export const EFFECT_OWNERS_LOSE_LIFE_SPELLS_CAST = defineRule<Clauses>({
  id: 'effect.owners-lose-life-spells-cast-this-way',
  family: 'effect',
  leading: ['each'],
  cites: ['CR 202.3 (Mana Value)', 'CR 119.3 (Life)', 'CR 608.2g (Resolving Spells and Abilities)'],
  examples: [
    'each player who owns a spell you cast this way loses life equal to its mana value',
    'Each player who owns a spell you cast this way loses life equal to its mana value',
  ],
  rejects: [
    'each player who owns a spell you cast this way loses 2 life',
    'each opponent who owns a spell you cast this way loses life equal to its mana value',
    'each player who owns a spell you cast this way loses life equal to its power',
    'each player who owns a spell you cast loses life equal to its mana value',
    'each player who owns a spell you cast this way loses life equal to its mana value and draws a card',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.owners-lose-life-spells-cast-this-way';
    const r = pattern(
      /each player who owns a spell you cast this way loses life equal to its mana value(?![\p{L}\p{N}])(?!\s+(?:and|then)(?![\p{L}\p{N}]))/iu,
    )(ctx, pos);
    if (!r.ok) return fail(ctx, pos);
    return {
      ok: true,
      value: [makeClause(id, 'ownersLoseLifeCastSpells', {}, { start: pos, end: r.pos })],
      pos: r.pos,
    };
  },
});

export const KEFKA_EFFECT_RULES = [
  EFFECT_EXILE_AT_RANDOM_EACH_OPPONENT,
  EFFECT_OWNERS_LOSE_LIFE_SPELLS_CAST,
];
