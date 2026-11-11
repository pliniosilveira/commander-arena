/**
 * Noun rules of the Vraska deck (stage P50, D-207): "target triggered ability or colorless spell" (CR 113.3c, 603.1, 115.1).
 */
import { literal, map, sequence } from '../../combinators';
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

export const VRASKA_NOUN_RULES = [NOUN_TARGET_TRIGGERED_ABILITY_OR_SPELL];

/** Before `noun.player`, which would read "each player" and stop there. */
export const VRASKA_EARLY_NOUN_RULES = [NOUN_EACH_PLAYER_DISCARDED];
