/**
 * `effect.reveal-top-duel`: "you and target opponent each reveal the top card of your library. You each lose life equal to the mana value of the card revealed by the other player. You
 * each put the card you revealed into your hand." (CR 701.20a Reveal, 119.3 Life, 202.3 Mana Value; the three sentences are kept together by the segmenter, `segment.ts`): the
 * engine's `revealTopDuel`. The players are you and one target opponent, so "the other player" names one player. Not read: another player word, another number of cards, another
 * library, another amount of life, a card that goes anywhere but the hand, a sentence missing or added.
 */
import { pattern, satisfy, sequence } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { defineRule, family } from '../registry';
import { type Clauses, single } from './operands';

const REST =
  / reveal the top card of your library\.\s+you each lose life equal to the mana value of the card revealed by the other player\.\s+you each put the card you revealed into your hand(?![\p{L}\p{N}])(?!\s*(?:,|and\b|then\b))/iu;

export const EFFECT_REVEAL_TOP_DUEL = defineRule<Clauses>({
  id: 'effect.reveal-top-duel',
  family: 'effect',
  leading: ['you'],
  cites: [
    'CR 701.20a (Reveal)',
    'CR 119.3 (Life)',
    'CR 202.3 (Mana Value)',
    'CR 101.4 (Handling Simultaneous Decisions)',
  ],
  examples: [
    'you and target opponent each reveal the top card of your library. You each lose life equal to the mana value of the card revealed by the other player. You each put the card you revealed into your hand',
  ],
  rejects: [
    'you and target opponent each reveal the top card of your library',
    'you and target player each reveal the top card of your library. You each lose life equal to the mana value of the card revealed by the other player. You each put the card you revealed into your hand',
    'you and each opponent each reveal the top card of your library. You each lose life equal to the mana value of the card revealed by the other player. You each put the card you revealed into your hand',
    'you and target opponent each reveal the top two cards of your library. You each lose life equal to the mana value of the card revealed by the other player. You each put the card you revealed into your hand',
    'you and target opponent each reveal the top card of your library. You each lose life equal to the mana value of the card you revealed. You each put the card you revealed into your hand',
    'you and target opponent each reveal the top card of your library. You each lose life equal to the mana value of the card revealed by the other player. You each put the card you revealed into your graveyard',
    'you and target opponent each reveal the top card of your library. You each lose life equal to the mana value of the card revealed by the other player. You each put the card you revealed into your hand and draw a card',
    'you and target opponent each reveal the top card of your library. You each put the card you revealed into your hand',
  ],
  parse: single(
    'effect.reveal-top-duel',
    sequence(
      // "Target opponent", not "target player": the other player may not be you.
      satisfy(
        family<IrNoun>('noun', { only: ['noun.you-and-player'] }),
        (noun) => noun.members?.[1]?.filter.player === 'opponent',
      ),
      pattern(REST),
    ),
    ([players]) => ({ verb: 'revealTopDuel', args: { players } }),
  ),
});

export const REVEAL_TOP_DUEL_EFFECT_RULES = [EFFECT_REVEAL_TOP_DUEL];
