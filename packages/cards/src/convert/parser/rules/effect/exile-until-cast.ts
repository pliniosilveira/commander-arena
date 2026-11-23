/**
 * Effect rules of Strago and Relm (deck support issue 97): "Target opponent exiles cards from the top of their library until they exile an instant, sorcery, or creature card. You may
 * cast that card without paying its mana cost. If you cast a creature spell this way, it gains haste and "At the beginning of the end step, sacrifice this creature."".
 */
import { literal, optional, satisfy, sequence } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { defineRule, family } from '../registry';
import { readQuotedAbility } from '../static/quoted';
import { type Clauses, single } from './operands';

/**
 * `effect.player-exiles-until-cast`: "target opponent exiles cards from the top of their library until they exile an instant, sorcery, or creature card. You may cast that card without
 * paying its mana cost." with, optionally, "If you cast a creature spell this way, it gains haste and "<an ability>"" (CR 701.13, 608.2g, 118.9, 613.1f): the three sentences are one
 * instruction that `splitSentences` keeps together. The engine's `exileUntilFound` of the library of that player, then the `castFree` of the card found by the controller, with the
 * abilities the creature spell gives the permanent it becomes (`creatureGains`). Not read: another player (the target is one opponent or one player), another place, another count,
 * another way to cast it, no "you may", another rider than haste and one ability in quotes.
 */
export const EFFECT_PLAYER_EXILES_UNTIL_CAST = defineRule<Clauses>({
  id: 'effect.player-exiles-until-cast',
  family: 'effect',
  leading: ['target'],
  cites: [
    'CR 701.13 (Exile)',
    'CR 608.2g (Resolving Spells and Abilities)',
    'CR 118.9 (Alternative Costs)',
    'CR 613.1f (Interaction of Continuous Effects)',
  ],
  examples: [
    'target opponent exiles cards from the top of their library until they exile an instant, sorcery, or creature card. You may cast that card without paying its mana cost. If you cast a creature spell this way, it gains haste and "At the beginning of the end step, sacrifice ~."',
    'target opponent exiles cards from the top of their library until they exile an instant, sorcery, or creature card. You may cast that card without paying its mana cost',
    'target player exiles cards from the top of their library until they exile a nonland card. You may cast that card without paying its mana cost',
    'target opponent exiles cards from the top of their library until they exile a creature card. You may cast that card without paying its mana cost. If you cast a creature spell this way, it gains haste and "At the beginning of the end step, sacrifice ~."',
  ],
  rejects: [
    'target opponent exiles cards from the top of their library until they exile an instant, sorcery, or creature card',
    'target opponent exiles cards from the top of their library until they exile an instant, sorcery, or creature card. You may cast that card',
    'target opponent exiles cards from the top of their library until they exile an instant, sorcery, or creature card. You may cast that card by paying its mana cost',
    'target opponent exiles cards from the top of their library until they exile an instant, sorcery, or creature card. Cast that card without paying its mana cost',
    'each opponent exiles cards from the top of their library until they exile an instant, sorcery, or creature card. You may cast that card without paying its mana cost',
    'target opponent exiles cards from their graveyard until they exile an instant, sorcery, or creature card. You may cast that card without paying its mana cost',
    'target opponent exiles cards from the top of their library until they exile an instant, sorcery, or creature card. You may cast that card without paying its mana cost. If you cast a creature spell this way, it gains haste',
    'target opponent exiles cards from the top of their library until they exile an instant, sorcery, or creature card. You may cast that card without paying its mana cost. If you cast a creature spell this way, it gains flying and "At the beginning of the end step, sacrifice ~."',
    'target opponent exiles cards from the top of their library until they exile an instant, sorcery, or creature card. You may cast that card without paying its mana cost. If you cast a creature spell this way, it gains haste and "At the beginning of the end step, sacrifice ~." Draw a card',
  ],
  parse: single(
    'effect.player-exiles-until-cast',
    sequence(
      // One player the ability targets: "target opponent" or "target player".
      satisfy(
        family<IrNoun>('noun', { only: ['noun.player'] }),
        (noun) => noun.det === 'target' && noun.anyNumber !== true,
      ),
      literal(' exiles cards from the top of their library until they exile '),
      family<IrNoun>('noun', { only: ['noun.library-card'] }),
      literal('. you may cast that card without paying its mana cost'),
      optional(
        sequence(
          literal('. if you cast a creature spell this way, it gains haste and '),
          (ctx, pos) => readQuotedAbility(ctx, pos, { mana: false }),
        ),
        null,
      ),
    ),
    ([player, , card, , rider]) => ({
      verb: 'exileUntilCastFree',
      args: {
        player,
        card: { ...card, upTo: false, plural: false },
        ...(rider === null ? {} : { quoted: rider[1] }),
      },
    }),
  ),
});

export const EXILE_UNTIL_CAST_EFFECT_RULES = [EFFECT_PLAYER_EXILES_UNTIL_CAST];
