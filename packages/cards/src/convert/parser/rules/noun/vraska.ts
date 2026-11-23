/**
 * Noun rules of the Vraska deck (stage P50, D-207): "target triggered ability or colorless spell" (CR 113.3c, 603.1, 115.1).
 */
import { literal, map, pattern, sequence } from '../../combinators';
import type { IrFilter, IrNoun } from '../../ir/types';
import { defineRule, node } from '../registry';
import { spellPhrase } from './phrases';

/**
 * `noun.target-triggered-ability-or-spell`: "target triggered ability or colorless spell", "target triggered ability or creature spell" (CR 113.3c, 603.3,
 * 115.1, 601.2c: a triggered ability on the stack is an object like a spell, and either may be the one target). One target, chosen on the stack among the
 * triggered abilities and the spells the words describe; the filter is a choice (`anyOf`) of the two kinds. Not read: an activated ability, "ability" alone,
 * the plural, a count, "spell or ability".
 */
export const NOUN_TARGET_TRIGGERED_ABILITY_OR_SPELL = defineRule<IrNoun>({
  id: 'noun.target-triggered-ability-or-spell',
  family: 'noun',
  leading: ['target'],
  cites: [
    'CR 113.3c (Abilities)',
    'CR 603.3 (Handling Triggered Abilities)',
    'CR 115.1 (Targets)',
    'CR 601.2c (Casting Spells)',
  ],
  examples: [
    'target triggered ability or colorless spell',
    'target triggered ability or creature spell',
    'target triggered ability or noncreature spell',
  ],
  rejects: [
    'target triggered ability',
    'target activated ability or colorless spell',
    'target ability or colorless spell',
    'target triggered abilities or colorless spells',
    'target spell or triggered ability',
    'two target triggered abilities or colorless spells',
    'target triggered ability or spell or ability',
    'target triggered ability or colorless',
  ],
  parse: node<IrFilter, IrNoun>(
    'noun.target-triggered-ability-or-spell',
    map(
      sequence(literal('target triggered ability or '), spellPhrase()),
      ([, spell]): IrFilter => ({
        raw: `triggered ability or ${spell.raw}`,
        zone: 'stack',
        anyOf: [{ stackKind: 'triggeredAbility', raw: 'triggered ability' }, spell],
      }),
    ),
    (filter) => ({
      kind: 'noun',
      det: 'target',
      filter,
      upTo: false,
      plural: false,
      other: false,
    }),
  ),
});

/**
 * `noun.each-player-discarded`: "each player who discarded a card this way" (stage P52, D-210, CR 701.9, 101.4): the players that discarded a card to the
 * instruction before it, in turn order. The engine's `PlayerSelector` `discardedThisWay`. Not read: "each opponent who discarded", another verb, "this way" missing, a
 * single player.
 */
export const NOUN_EACH_PLAYER_DISCARDED = defineRule<IrNoun>({
  id: 'noun.each-player-discarded',
  family: 'noun',
  leading: ['each'],
  cites: [
    'CR 701.9 (Discard)',
    'CR 101.4 (Handling Simultaneous Decisions)',
    'CR 608.2c (Resolving Spells and Abilities)',
  ],
  examples: [
    'each player who discarded a card this way',
    'Each player who discarded a card this way',
  ],
  rejects: [
    'each opponent who discarded a card this way',
    'each player who discarded a card',
    'each player who discarded this way',
    'each player who drew a card this way',
    'each player who discarded two cards this way',
    'each players who discarded a card this way',
    'a player who discarded a card this way',
  ],
  parse: node<string, IrNoun>(
    'noun.each-player-discarded',
    map(literal('each player who discarded a card this way'), (raw) => raw),
    (raw) => ({
      kind: 'noun',
      det: 'discardedThisWay',
      filter: { raw },
      upTo: false,
      plural: true,
      other: false,
    }),
  ),
});

/**
 * `noun.each-player-discarded-their-hand`: "each opponent who discarded their hand this way", "each player who discarded their hand this way" (Snort, CR 701.9a, 101.4, 102.2): the
 * players of the group whose discard of their hand in the instruction before it ran, in turn order; one who discarded an empty hand has discarded their hand. The engine's
 * `PlayerSelector` `discardedThisWay` with `hand` and `of`. Not read: "each opponent who discarded a card" (another rule), another verb, "this way" missing, a single player.
 */
export const NOUN_EACH_PLAYER_DISCARDED_HAND = defineRule<IrNoun>({
  id: 'noun.each-player-discarded-their-hand',
  family: 'noun',
  leading: ['each'],
  cites: ['CR 701.9 (Discard)', 'CR 101.4 (Handling Simultaneous Decisions)', 'CR 102.2 (Players)'],
  examples: [
    'each opponent who discarded their hand this way',
    'each player who discarded their hand this way',
    'Each opponent who discarded their hand this way',
  ],
  rejects: [
    'each opponent who discarded their hand',
    'each opponent who discarded a card this way',
    'each opponent who discarded your hand this way',
    'each opponent who drew their hand this way',
    'each opponents who discarded their hand this way',
    'target opponent who discarded their hand this way',
    'an opponent who discarded their hand this way',
  ],
  parse: node<string[], IrNoun>(
    'noun.each-player-discarded-their-hand',
    map(
      pattern(/each (opponent|player) who discarded their hand this way(?![\p{L}\p{N}'’])/iu),
      (m) => [...m].map((part) => part ?? ''),
    ),
    (m) => ({
      kind: 'noun',
      det: 'discardedThisWay',
      filter: { raw: m[0] ?? '' },
      upTo: false,
      plural: true,
      other: false,
      discardedHand: true,
      whoGroup: (m[1] ?? '').toLowerCase() === 'opponent' ? 'eachOpponent' : 'eachPlayer',
    }),
  ),
});

/**
 * `noun.each-player-cant-sacrifice`: "each player who can't" (CR 701.21a, 101.4, Plaguecrafter: "each player sacrifices a creature or planeswalker of their choice. Each
 * player who can't discards a card"): the players for whom the sacrifice before it found nothing to sacrifice, in turn order. The engine's `PlayerSelector`
 * `couldntSacrificeThisWay`; only after a sacrifice of the same text (the lowering checks it). Not read: "each opponent who can't", "each player who can", another verb
 * than "can't" or a single player.
 */
export const NOUN_EACH_PLAYER_CANT_SACRIFICE = defineRule<IrNoun>({
  id: 'noun.each-player-cant-sacrifice',
  family: 'noun',
  leading: ['each'],
  cites: ['CR 701.21 (Sacrifice)', 'CR 101.4 (Handling Simultaneous Decisions)'],
  examples: ["each player who can't", 'Each player who can’t'],
  rejects: [
    "each opponent who can't",
    'each player who can',
    'each player who cant',
    "each player that can't",
    "a player who can't",
    "each players who can't",
  ],
  parse: node<string, IrNoun>(
    'noun.each-player-cant-sacrifice',
    map(pattern(/each player who can(?:'|’)t(?![\p{L}\p{N}])/iu), (m) => m[0]),
    (raw) => ({
      kind: 'noun',
      det: 'couldntSacrificeThisWay',
      filter: { raw },
      upTo: false,
      plural: true,
      other: false,
    }),
  ),
});

export const VRASKA_NOUN_RULES = [NOUN_TARGET_TRIGGERED_ABILITY_OR_SPELL];

/** Before `noun.player`, which would read "each player" and stop there. */
export const VRASKA_EARLY_NOUN_RULES = [
  NOUN_EACH_PLAYER_DISCARDED,
  NOUN_EACH_PLAYER_DISCARDED_HAND,
  NOUN_EACH_PLAYER_CANT_SACRIFICE,
];
