// Tangletrove Kelp (Deep Clue Sea deck, issue 128): "At the beginning of each combat, other Clues you control become 6/6 Plant creatures in addition to their other types until end of
// turn." Imported through the grammar (never a fixture), defined in an engine scenario and played through applyAction. Names start with "SYNTHETIC"; the wording is that of the real
// card, taken from the golden corpus.
// Rules pinned: CR 613.1d and 613.4b (a type-changing effect in layer 4 and a base power and toughness in layer 7b; the objects keep their types), 611.2c (the group is fixed as the
// effect resolves), 514.2 (the effect ends with the turn), 205.3 (the creature type Plant), 101.4 (three seats: only my Clues).
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const KELP = parsed(
  'SYNTHETIC Parsed Tangletrove Kelp',
  'Artifact Creature — Clue Plant',
  'Ward {2}\nAt the beginning of each combat, other Clues you control become 6/6 Plant creatures in addition to their other types until end of turn.\n{2}, Sacrifice this creature: Draw a card.',
  { manaCost: '{5}{U}{U}', colors: ['U'], power: '6', toughness: '6' },
);
const SLEUTH = parsed('SYNTHETIC Parsed Investigator', 'Sorcery', 'Investigate twice.', {
  manaCost: '{1}{W}',
  colors: ['W'],
});
const FILLER = Array.from({ length: 10 }, () => 'Island');

describe('Tangletrove Kelp: the grammar reads the whole card', () => {
  test('ward, the combat trigger and the sacrifice ability are all abilities of the card', () => {
    expect(KELP.faces[0]?.abilities).toHaveLength(3);
    expect(KELP.faces[0]?.abilities.some((a) => a.kind === 'triggered')).toBe(true);
  });
});

describe('Tangletrove Kelp: played in a three-seat game', () => {
  const board = () =>
    scenario({ seats: 3 })
      .define(KELP)
      .define(SLEUTH)
      .seat(0)
      .library(...FILLER)
      .hand(SLEUTH.name)
      .battlefield('Plains', 'Plains', KELP.name)
      .seat(1)
      .library(...FILLER)
      .seat(2)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('at the beginning of combat my other Clues are 6/6 Plant creatures; the Kelp itself and the opponents are untouched', () => {
    const g = board();
    g.act(0).cast(SLEUTH.name, { pay: true });
    g.passAll();
    g.expect.zone('Clue', 'battlefield', { seat: 0, count: 2 });
    g.advanceTo('beginningOfCombat');
    g.passAll();
    g.expect.pt('Clue[0]', 6, 6);
    g.expect.pt('Clue[1]', 6, 6);
    g.expect.derived('Clue[0]', { types: ['artifact', 'creature'], subtypes: ['Clue', 'Plant'] });
    g.expect.pt(KELP.name, 6, 6);
    g.expect.invariants();
  });

  test('the Clues are artifacts again when the turn ends', () => {
    const g = board();
    g.act(0).cast(SLEUTH.name, { pay: true });
    g.passAll();
    g.advanceTo('beginningOfCombat');
    g.passAll();
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.derived('Clue[0]', { types: ['artifact'], subtypes: ['Clue'] });
  });
});
