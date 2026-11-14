/**
 * Noun rules of group 3 of the Gisa deck (issue 41, D-486): "any number of target players" as the subject of a player verb (Priest of Forgotten Gods).
 */
import { map, pattern, satisfy, sequence } from '../../combinators';
import type { IrFilter, IrNoun } from '../../ir/types';
import { defineRule, node } from '../registry';
import { BOUNDARY, permanentPhrase, withoutZone } from './phrases';

/**
 * `noun.any-number-target-players`: "any number of target players each" (CR 115.1, 102.1: none, one or several target players, and each of them does what the verb says, in the
 * order of CR 101.4). The "each" is part of the phrase, and the verbs that follow have no "s", as they have none for "you". One slot of targets, none at least and every
 * player at most (the engine's `anyNumber`). Not read: a number, "up to", opponents only ("any number of target opponents"), the singular, no "each".
 */
export const NOUN_ANY_NUMBER_TARGET_PLAYERS = defineRule<IrNoun>({
  id: 'noun.any-number-target-players',
  family: 'noun',
  leading: ['any'],
  cites: ['CR 115.1 (Targets)', 'CR 102.1 (Players)', 'CR 101.4 (Handling Simultaneous Decisions)'],
  examples: ['any number of target players each', 'Any number of target players each'],
  rejects: [
    'any number of target players',
    'any number of target player each',
    'any number of target opponents each',
    'any number of players each',
    'any number of target players every',
    'up to two target players each',
    'any number of other target players each',
    'any target player each',
    'any number of target players each other',
  ],
  parse: node<string, IrNoun>(
    'noun.any-number-target-players',
    map(pattern(new RegExp(`any number of target players each${BOUNDARY}`, 'iu')), (m) => m[0]),
    (raw) => ({
      kind: 'noun',
      det: 'target',
      filter: { player: 'any', raw },
      upTo: false,
      plural: true,
      other: false,
      anyNumber: true,
    }),
  ),
});

/**
 * `noun.x-permanents`: "X creatures", "X artifacts", "X permanents" (CR 107.3a, 701.21a: the number of permanents is the X announced for the ability, and the player chooses
 * them among the permanents that match, as in "Sacrifice X creatures"). Plural, with a count of X and no "other" (a lord's "X other creatures" is not read). Read as the cost of
 * a sacrifice only (`cost.sacrifice`): an effect that sacrifices X permanents is another instruction. Not read: a number, "X target creatures", one creature, "X" alone.
 */
export const NOUN_X_PERMANENTS = defineRule<IrNoun>({
  id: 'noun.x-permanents',
  family: 'noun',
  leading: ['x'],
  cites: [
    'CR 107.3a (Numbers and Symbols)',
    'CR 701.21a (Sacrifice)',
    'CR 602.2b (Activating Activated Abilities)',
  ],
  examples: ['X creatures', 'X artifacts', 'X permanents', 'X Zombies', 'X nonland permanents'],
  rejects: [
    'X creature',
    'X',
    'X target creatures',
    'X other creatures',
    'two creatures',
    'X creatures an opponent controls',
    'X cards',
    'x',
    'X creatures you control',
    'a creature',
  ],
  parse: node<IrFilter, IrNoun>(
    'noun.x-permanents',
    map(
      sequence(
        satisfy(pattern(/X /u), () => true),
        // Only your own permanents can be sacrificed (CR 701.21a): the phrase says no controller.
        satisfy(
          map(permanentPhrase(true, 'all'), withoutZone),
          (filter) => filter.controller === undefined,
        ),
      ),
      ([, filter]) => filter,
    ),
    (filter) => ({
      kind: 'noun',
      det: 'a',
      filter,
      count: { kind: 'x', span: { start: 0, end: 0 } },
      upTo: false,
      plural: true,
      other: false,
    }),
  ),
});

export const GISA_G3_NOUN_RULES = [NOUN_ANY_NUMBER_TARGET_PLAYERS, NOUN_X_PERMANENTS];
