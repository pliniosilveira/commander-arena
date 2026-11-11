/**
 * SYNTHETIC CARDS FOR "TARGET CREATURE YOU CONTROL DEALS DAMAGE EQUAL TO ITS POWER TO TARGET CREATURE YOU DON'T CONTROL. IF THE CREATURE YOU
 * CONTROL HAS TRAMPLE, EXCESS DAMAGE IS DEALT TO THAT CREATURE'S CONTROLLER INSTEAD". NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of D-145 (the Dinosaurs slice): a one-sided "bite" with `trampleExcess`, and the same spell without it as the
 * baseline. Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text, and none of these
 * is the definition of a real card.
 */
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const bite = (name: string, trampleExcess: boolean, words: string): CardDefinition =>
  singleFace({
    name,
    manaCost: ['1', 'G'],
    types: ['sorcery'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText: words,
    spell: {
      targets: [
        { id: 't1', what: { kind: 'object', filter: { types: ['creature'], controller: 'you' } } },
        {
          id: 't2',
          what: { kind: 'object', filter: { types: ['creature'], controller: 'opponent' } },
        },
      ],
      effect: {
        kind: 'dealDamage',
        amount: { kind: 'powerOf', of: { kind: 'target', id: 't1' } },
        from: { kind: 'target', id: 't1' },
        to: { kind: 'target', id: 't2' },
        ...(trampleExcess ? { trampleExcess: true as const } : {}),
      },
    },
  });

/** The same bite at a creature or a planeswalker: the excess is dealt only for a creature recipient. */
const biteAtEither = singleFace({
  name: 'SYNTHETIC Trample Bite Either',
  manaCost: ['1', 'G'],
  types: ['sorcery'],
  colors: ['G'],
  colorIdentity: ['G'],
  oracleText:
    "Target creature you control deals damage equal to its power to target creature or planeswalker you don't control. If the creature you control has trample, excess damage is dealt to that creature's controller instead.",
  spell: {
    targets: [
      { id: 't1', what: { kind: 'object', filter: { types: ['creature'], controller: 'you' } } },
      {
        id: 't2',
        what: {
          kind: 'object',
          filter: {
            controller: 'opponent',
            anyOf: [{ types: ['creature'] }, { types: ['planeswalker'] }],
          },
        },
      },
    ],
    effect: {
      kind: 'dealDamage',
      amount: { kind: 'powerOf', of: { kind: 'target', id: 't1' } },
      from: { kind: 'target', id: 't1' },
      to: { kind: 'target', id: 't2' },
      trampleExcess: true,
    },
  },
});

export const SYNTHETIC_BITE_EXCESS_LIST: readonly CardDefinition[] = [
  biteAtEither,
  bite(
    'SYNTHETIC Trample Bite',
    true,
    "Target creature you control deals damage equal to its power to target creature you don't control. If the creature you control has trample, excess damage is dealt to that creature's controller instead.",
  ),
  bite(
    'SYNTHETIC Plain Bite',
    false,
    "Target creature you control deals damage equal to its power to target creature you don't control.",
  ),
];
