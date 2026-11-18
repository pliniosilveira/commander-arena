/**
 * Effect rules of the Diluvian Primordial group (First Flight deck): "for each opponent, you may cast up to one target instant or sorcery card from that player's graveyard
 * without paying its mana cost. If a spell cast this way would be put into a graveyard, exile it instead."
 */
import { literal, optional, pattern, sequence } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { BOUNDARY, graveyardPhrase } from '../noun/phrases';
import { defineRule, quietly, spanned } from '../registry';
import { flag } from './dragons';
import { type Clauses, makeClause } from './operands';

/** ". If a spell cast this way would be put into a graveyard, exile it instead": the rider, the next sentence, taken with the clause (CR 614.1a). */
const EXILE_INSTEAD = pattern(
  new RegExp(
    `\\. if a spell cast this way would be put into a graveyard, exile it instead${BOUNDARY}(?!,| and\\b| then\\b)`,
    'iu',
  ),
);

const ID = 'effect.cast-per-opponent-graveyard-free';
const HEAD = 'for each opponent, you may cast up to one target ';

/**
 * `effect.cast-per-opponent-graveyard-free`: "for each opponent, you may cast up to one target <card> from that player's graveyard without paying its mana cost", with the rider
 * "If a spell cast this way would be put into a graveyard, exile it instead" (CR 115.1, 601.2c: one target slot that takes at most one card of each opponent, in that
 * opponent's graveyard, "up to one" letting a player choose none; CR 608.2g: the spells are cast as the ability resolves, one after the other; CR 118.9: without paying the mana
 * cost; CR 614.1a: the replacement of the move to a graveyard by one to exile, for that spell only). The engine's `castCard` with `free` over a slot of `onePerOpponent`. "Up to
 * one" and "you may" are the words of the rule, and "that player's graveyard" is the graveyard of the opponent each target is for. Not read: a card without "up to", another
 * count, a graveyard that is yours or any, "each player", paying the mana cost or another cost, a cast not "without paying its mana cost", another thing done to the spell.
 */
export const EFFECT_CAST_PER_OPPONENT_GRAVEYARD_FREE = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['for'],
  cites: [
    'CR 115.1 (Targets)',
    'CR 601.2c (Casting Spells)',
    'CR 608.2g (Resolving Spells and Abilities)',
    'CR 118.9 (Alternative Costs)',
    'CR 614.1a (Replacement Effects)',
  ],
  examples: [
    "for each opponent, you may cast up to one target instant or sorcery card from that player's graveyard without paying its mana cost",
    "for each opponent, you may cast up to one target instant or sorcery card from that player's graveyard without paying its mana cost. if a spell cast this way would be put into a graveyard, exile it instead",
    "For each opponent, you may cast up to one target instant or sorcery card from that player's graveyard without paying its mana cost. If a spell cast this way would be put into a graveyard, exile it instead",
    "for each opponent, you may cast up to one target sorcery card from that player's graveyard without paying its mana cost",
  ],
  rejects: [
    "for each opponent, you may cast target instant or sorcery card from that player's graveyard without paying its mana cost",
    "for each opponent, you may cast up to two target instant or sorcery cards from that player's graveyard without paying its mana cost",
    'for each opponent, you may cast up to one target instant or sorcery card from your graveyard without paying its mana cost',
    'for each opponent, you may cast up to one target instant or sorcery card from a graveyard without paying its mana cost',
    "for each opponent, you may cast up to one target instant or sorcery card from an opponent's graveyard without paying its mana cost",
    "for each player, you may cast up to one target instant or sorcery card from that player's graveyard without paying its mana cost",
    "for each opponent, cast up to one target instant or sorcery card from that player's graveyard without paying its mana cost",
    "for each opponent, you may cast up to one target instant or sorcery card from that player's graveyard",
    "for each opponent, you may cast up to one target instant or sorcery card from that player's graveyard by paying its mana cost",
    "for each opponent, you may cast up to one target instant or sorcery card from that player's graveyard without paying its mana cost and draw a card",
    "for each opponent, you may cast up to one target instant or sorcery card from that player's graveyard without paying its mana cost. if that spell would be put into a graveyard, exile it instead",
    "for each opponent, you may cast up to one target instant or sorcery card from that player's graveyard without paying its mana cost. if a spell cast this way would be put into a graveyard, exile it instead, then draw a card",
    "for each opponent, you may cast up to one target instant or sorcery card from that player's graveyard without paying its mana cost this turn",
    "you may cast up to one target instant or sorcery card from that player's graveyard without paying its mana cost",
  ],
  parse: (ctx, pos) => {
    const head = literal(HEAD)(ctx, pos);
    if (!head.ok) return head;
    const phrase = spanned(graveyardPhrase(false, 'fromThatPlayer'))(ctx, head.pos);
    if (!phrase.ok) return phrase;
    const tail = sequence(
      literal(' without paying its mana cost'),
      optional(spanned(EXILE_INSTEAD), null),
      // Nothing joined to the clause: a join says a second instruction, which is not read.
      pattern(/(?=\.|$)/u),
    )(ctx, phrase.pos);
    if (!tail.ok) return tail;
    const [, exileInstead] = tail.value;
    const nounAt = pos + 'for each opponent, you may cast '.length;
    const oneAt = nounAt + 'up to '.length;
    const noun: IrNoun = {
      kind: 'noun',
      det: 'target',
      filter: phrase.value.value,
      count: { kind: 'number', value: 1, span: { start: oneAt, end: oneAt + 'one'.length } },
      upTo: true,
      plural: false,
      other: false,
      perOpponent: true,
      span: { start: nounAt, end: phrase.pos },
      rule: ID,
    };
    const span = { start: pos, end: tail.pos };
    return {
      ok: true,
      value: [
        makeClause(
          ID,
          'castCard',
          {
            objects: noun,
            may: flag(ID, true, span),
            free: flag(ID, true, span),
            exileInstead: flag(ID, exileInstead !== null, span),
          },
          span,
        ),
      ],
      pos: tail.pos,
    };
  },
});

export const PRIMORDIAL_EFFECT_RULES = [EFFECT_CAST_PER_OPPONENT_GRAVEYARD_FREE].map(quietly);
