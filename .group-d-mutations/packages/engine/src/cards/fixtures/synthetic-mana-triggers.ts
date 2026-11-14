/**
 * SYNTHETIC CARDS FOR TRIGGERED MANA ABILITIES (CR 605.1b). NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of D-139 (the Artifacts slice): "Whenever you tap a permanent for {C}, add an additional {C}", over several
 * permanents (any, a land type) and several types of mana (colorless, green, and a different type than the one tapped for). Names start with
 * "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { ObjectFilter } from '../../ast/types';
import type { ManaColor } from '../../mana/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const amplifier = (
  name: string,
  what: ObjectFilter,
  mana: ManaColor | undefined,
  adds: ManaColor,
  oracle: string,
): CardDefinition =>
  singleFace({
    name,
    manaCost: ['3'],
    types: ['artifact'],
    colors: [],
    // The colored mana the text names is part of the color identity (CR 903.4).
    colorIdentity: adds === 'C' ? [] : [adds],
    oracleText: oracle,
    abilities: [
      {
        kind: 'triggered',
        trigger: {
          kind: 'tappedForMana',
          what,
          by: 'you',
          ...(mana === undefined ? {} : { mana }),
        },
        effect: { kind: 'addMana', mana: { kind: 'fixed', mana: [adds] } },
      },
    ],
  });

export const SYNTHETIC_MANA_TRIGGERS_LIST: readonly CardDefinition[] = [
  amplifier(
    'SYNTHETIC Echo Monument',
    {},
    'C',
    'C',
    'Whenever you tap a permanent for {C}, add an additional {C}.',
  ),
  amplifier(
    'SYNTHETIC Green Cairn',
    { types: ['land'], subtypes: ['Forest'] },
    'G',
    'G',
    'Whenever you tap a Forest for {G}, add an additional {G}.',
  ),
  amplifier(
    'SYNTHETIC Spark Totem',
    { types: ['creature'] },
    undefined,
    'R',
    'Whenever you tap a creature for mana, add {R}.',
  ),
  // A mana ability that is not tapped for: tapping a permanent for mana is activating an ability with {T} in its cost (CR 106.12).
  singleFace({
    name: 'SYNTHETIC Pain Stone',
    manaCost: ['1'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText: 'Pay 1 life: Add {C}.',
    abilities: [
      {
        kind: 'mana',
        cost: [{ kind: 'payLife', amount: 1 }],
        production: { kind: 'fixed', mana: ['C'] },
      },
    ],
  }),
];
