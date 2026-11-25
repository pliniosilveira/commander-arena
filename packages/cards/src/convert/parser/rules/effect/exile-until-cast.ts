/**
 * Effect rules of Strago and Relm (deck support issue 97): "Target opponent exiles cards from the top of their library until they exile an instant, sorcery, or creature card. You may
 * cast that card without paying its mana cost. If you cast a creature spell this way, it gains haste and "At the beginning of the end step, sacrifice this creature."".
 */
import { literal, optional, pattern, satisfy, sequence } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { defineRule, family } from '../registry';
import { readQuotedAbility } from '../static/quoted';
import { type Clauses, single } from './operands';

/**
 * `effect.exile-until-cast-free`: "Exile cards from the top of your library until you exile a nonland card. You may cast that card without paying its mana cost." (Sarevok's Tome, CR 701.13,
 * 608.2g, 118.9): the cards before the one found stay exiled. The two sentences are one instruction that `splitSentences` keeps together. The engine's `exileUntilFound` of the controller's
 * library, then the `castFree` of the card found. Not read: another player, another place, "if you don't", a rider.
 */
export const EFFECT_EXILE_UNTIL_CAST_FREE = defineRule<Clauses>({
  id: 'effect.exile-until-cast-free',
  family: 'effect',
  leading: ['exile'],
  cites: [
    'CR 701.13 (Exile)',
    'CR 608.2g (Resolving Spells and Abilities)',
    'CR 118.9 (Alternative Costs)',
  ],
  examples: [
    'exile cards from the top of your library until you exile a nonland card. You may cast that card without paying its mana cost',
    'exile cards from the top of your library until you exile an instant or sorcery card. You may cast that card without paying its mana cost',
  ],
  rejects: [
    'exile cards from the top of your library until you exile a nonland card',
    'exile cards from the top of your library until you exile a nonland card. You may cast that card',
    'exile cards from the top of your library until you exile a nonland card. Cast that card without paying its mana cost',
    "exile cards from the top of your library until you exile a nonland card. You may cast that card without paying its mana cost. If you don't, put it into your hand",
    "exile cards from the top of target player's library until you exile a nonland card. You may cast that card without paying its mana cost",
    'exile cards from the top of your library until you exile a nonland card. You may cast it without paying its mana cost',
  ],
  parse: single(
    'effect.exile-until-cast-free',
    sequence(
      pattern(/exile cards from the top of your library until you exile /iu),
      family<IrNoun>('noun', { only: ['noun.library-card'] }),
      pattern(/\. you may cast that card without paying its mana cost(?![\p{L}\p{N}])/iu),
    ),
    ([, card]) => ({
      verb: 'exileUntilCastFree',
      args: {
        player: {
          kind: 'noun',
          det: 'you',
          filter: { raw: 'you' },
          upTo: false,
          plural: false,
          other: false,
          span: { start: 0, end: 0 },
          rule: 'effect.exile-until-cast-free',
        } satisfies IrNoun,
        card: { ...card, upTo: false, plural: false },
      },
    }),
  ),
});

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

/**
 * `effect.that-player-exiles-until-cast`: "that player exiles cards from the top of their library until they exile an instant or sorcery card. You may cast that card without paying its mana
 * cost. Then that player puts the exiled cards that weren't cast this way on the bottom of their library in a random order." (Gríma, Saruman's Footman; CR 701.13, 608.2g, 118.9, 401.4): the
 * three sentences are one instruction that `splitSentences` keeps together. The engine's `exileUntilFound` of the library of the player the trigger is about, the `castFree` of the card found
 * by the controller, and a `moveToZone` of the cards still exiled to the bottom of that library in a random order. Not read: another player than "that player", another place, no
 * "you may", another way to cast, another place for the rest.
 */
export const EFFECT_THAT_PLAYER_EXILES_UNTIL_CAST = defineRule<Clauses>({
  id: 'effect.that-player-exiles-until-cast',
  family: 'effect',
  leading: ['that'],
  cites: [
    'CR 701.13 (Exile)',
    'CR 608.2g (Resolving Spells and Abilities)',
    'CR 118.9 (Alternative Costs)',
    'CR 401.4 (Library)',
  ],
  examples: [
    "that player exiles cards from the top of their library until they exile an instant or sorcery card. You may cast that card without paying its mana cost. Then that player puts the exiled cards that weren't cast this way on the bottom of their library in a random order",
  ],
  rejects: [
    'that player exiles cards from the top of their library until they exile an instant or sorcery card. You may cast that card without paying its mana cost',
    "that player exiles cards from the top of their library until they exile an instant or sorcery card. You may cast that card. Then that player puts the exiled cards that weren't cast this way on the bottom of their library in a random order",
    "that player exiles cards from the top of their library until they exile an instant or sorcery card. You may cast that card without paying its mana cost. Then that player puts the exiled cards that weren't cast this way into their graveyard",
    "that player exiles cards from the top of their library until they exile an instant or sorcery card. You may cast that card without paying its mana cost. Then that player puts the exiled cards that weren't cast this way on top of their library in a random order",
    "that player exiles cards from their graveyard until they exile an instant or sorcery card. You may cast that card without paying its mana cost. Then that player puts the exiled cards that weren't cast this way on the bottom of their library in a random order",
    "target player exiles cards from the top of their library until they exile an instant or sorcery card. You may cast that card without paying its mana cost. Then that player puts the exiled cards that weren't cast this way on the bottom of their library in a random order",
    "that player exiles cards from the top of their library until they exile an instant or sorcery card. You may cast that card without paying its mana cost. Then that player puts the exiled cards that weren't cast this way on the bottom of their library in a random order. Draw a card",
  ],
  parse: single(
    'effect.that-player-exiles-until-cast',
    sequence(
      family<IrNoun>('noun', { only: ['noun.that-player'] }),
      literal(' exiles cards from the top of their library until they exile '),
      family<IrNoun>('noun', { only: ['noun.library-card'] }),
      literal('. you may cast that card without paying its mana cost. '),
      pattern(
        /then that player puts the exiled cards that weren['’]t cast this way on the bottom of their library in a random order(?![\p{L}\p{N}])/iu,
      ),
    ),
    ([player, , card]) => ({
      verb: 'thatPlayerExilesUntilCast',
      args: { player, card: { ...card, upTo: false, plural: false } },
    }),
  ),
});

/**
 * `effect.target-player-exiles-until-cast-bottom`: "target opponent exiles cards from the top of their library until they exile an instant or sorcery card. You may cast that card without
 * paying its mana cost. Then put the exiled cards that weren't cast this way on the bottom of that library in a random order." (Chaos Wand; CR 701.13, 608.2g, 118.9, 401.4): the
 * three sentences are one instruction, kept together by the segmenter. As `effect.that-player-exiles-until-cast`, for the one player the ability targets. Not read: another player, another
 * place for the rest, the rest on top, no "you may", another way to cast, a fourth sentence.
 */
export const EFFECT_TARGET_PLAYER_EXILES_UNTIL_CAST_BOTTOM = defineRule<Clauses>({
  id: 'effect.target-player-exiles-until-cast-bottom',
  family: 'effect',
  leading: ['target'],
  cites: [
    'CR 701.13 (Exile)',
    'CR 608.2g (Resolving Spells and Abilities)',
    'CR 118.9 (Alternative Costs)',
    'CR 401.4 (Library)',
  ],
  examples: [
    "target opponent exiles cards from the top of their library until they exile an instant or sorcery card. You may cast that card without paying its mana cost. Then put the exiled cards that weren't cast this way on the bottom of that library in a random order",
  ],
  rejects: [
    'target opponent exiles cards from the top of their library until they exile an instant or sorcery card. You may cast that card without paying its mana cost',
    "target opponent exiles cards from the top of their library until they exile an instant or sorcery card. You may cast that card. Then put the exiled cards that weren't cast this way on the bottom of that library in a random order",
    "target opponent exiles cards from the top of their library until they exile an instant or sorcery card. You may cast that card without paying its mana cost. Then put the exiled cards that weren't cast this way into their graveyard",
    "target opponent exiles cards from the top of their library until they exile an instant or sorcery card. You may cast that card without paying its mana cost. Then put the exiled cards that weren't cast this way on top of that library in a random order",
    "each opponent exiles cards from the top of their library until they exile an instant or sorcery card. You may cast that card without paying its mana cost. Then put the exiled cards that weren't cast this way on the bottom of that library in a random order",
    "target opponent exiles cards from the top of their library until they exile an instant or sorcery card. You may cast that card without paying its mana cost. Then put the exiled cards that weren't cast this way on the bottom of that library in a random order. Draw a card",
  ],
  parse: single(
    'effect.target-player-exiles-until-cast-bottom',
    sequence(
      satisfy(
        family<IrNoun>('noun', { only: ['noun.player'] }),
        (noun) => noun.det === 'target' && noun.anyNumber !== true,
      ),
      literal(' exiles cards from the top of their library until they exile '),
      family<IrNoun>('noun', { only: ['noun.library-card'] }),
      literal('. you may cast that card without paying its mana cost. '),
      pattern(
        /then put the exiled cards that weren['’]t cast this way on the bottom of that library in a random order(?![\p{L}\p{N}])/iu,
      ),
    ),
    ([player, , card]) => ({
      verb: 'thatPlayerExilesUntilCast',
      args: { player, card: { ...card, upTo: false, plural: false } },
    }),
  ),
});

export const EXILE_UNTIL_CAST_EFFECT_RULES = [
  EFFECT_TARGET_PLAYER_EXILES_UNTIL_CAST_BOTTOM,
  EFFECT_PLAYER_EXILES_UNTIL_CAST,
  EFFECT_EXILE_UNTIL_CAST_FREE,
  EFFECT_THAT_PLAYER_EXILES_UNTIL_CAST,
];
