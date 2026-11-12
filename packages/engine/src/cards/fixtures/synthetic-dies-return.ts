/**
 * SYNTHETIC CARDS FOR "WHEN THIS CREATURE DIES, YOU MAY RETURN IT TO THE BATTLEFIELD ... AT THE BEGINNING OF YOUR NEXT UPKEEP". NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of D-982 (the dies-and-return slice of the soulbond work): a triggered ability of a creature that, when the creature dies, may create a
 * delayed triggered ability that returns the card the creature became (CR 603.7, 603.7c, 400.7, 603.10a). The names start with "SYNTHETIC "; oracleId is null.
 * The texts describe what the AST does; they are not Oracle text, and these are not the definitions of real cards.
 */
import type { Ability } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

/** "When this creature dies, you may return it to the battlefield under its owner's control at the beginning of your next upkeep." */
export const DIES_RETURN_ABILITY: Extract<Ability, { kind: 'triggered' }> = {
  kind: 'triggered',
  trigger: { kind: 'dies', what: { kind: 'this' } },
  optional: true,
  effect: {
    kind: 'delayedTrigger',
    at: { step: 'upkeep', whose: 'you' },
    effect: {
      kind: 'moveToZone',
      objects: { kind: 'triggerCard' },
      to: 'battlefield',
      controller: 'owner',
    },
  },
};

/** The same, returned under the control of whoever controlled the ability as it resolves ("under your control"). */
const DIES_RETURN_YOURS: Ability = {
  kind: 'triggered',
  trigger: { kind: 'dies', what: { kind: 'this' } },
  optional: true,
  effect: {
    kind: 'delayedTrigger',
    at: { step: 'upkeep', whose: 'you' },
    effect: {
      kind: 'moveToZone',
      objects: { kind: 'triggerCard' },
      to: 'battlefield',
      controller: 'you',
    },
  },
};

export const SYNTHETIC_DIES_RETURN_LIST: readonly CardDefinition[] = [
  singleFace({
    name: 'SYNTHETIC Ember Cub',
    manaCost: ['1', 'R'],
    types: ['creature'],
    subtypes: ['Elemental'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 2,
    toughness: 2,
    oracleText:
      "When this creature dies, you may return it to the battlefield under its owner's control at the beginning of your next upkeep.",
    abilities: [DIES_RETURN_ABILITY],
  }),
  singleFace({
    name: 'SYNTHETIC Grave Thief',
    manaCost: ['1', 'B'],
    types: ['creature'],
    subtypes: ['Elemental'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 2,
    toughness: 2,
    oracleText:
      'When this creature dies, you may return it to the battlefield under your control at the beginning of your next upkeep.',
    abilities: [DIES_RETURN_YOURS],
  }),
];
