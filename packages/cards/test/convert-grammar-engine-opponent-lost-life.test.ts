// Sygg, River Cutthroat (deck support issue 578): "At the beginning of each end step, if an opponent lost 3 or more life this turn, you may draw a card." (CR 119.3, 102.2, 603.4).
// The card name is SYNTHETIC; the Oracle text is the real wording of the ability.
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const watcher = parsed(
  'SYNTHETIC Parsed Watcher',
  'Legendary Creature — Merfolk Rogue',
  'At the beginning of each end step, if an opponent lost 3 or more life this turn, you may draw a card.',
  { manaCost: '{U/B}{U/B}', power: '1', toughness: '3', colors: ['U', 'B'] },
);

describe('"if an opponent lost 3 or more life this turn"', () => {
  test('is an intervening if on the end step trigger of each player, for opponents only', () => {
    expect(watcher.faces[0]?.abilities[0]).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'endStep', whose: 'each' },
      interveningIf: { kind: 'aPlayerLostLifeThisTurn', atLeast: 3, opponent: true },
    });
  });
});
