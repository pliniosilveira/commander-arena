// Serene Sleuth (Deep Clue Sea deck, issue 128): "When this creature enters, investigate." and "At the beginning of combat on your turn, investigate for each goaded creature you control.
// Then each creature you control is no longer goaded." Imported through the grammar (never a fixture), defined in an engine scenario and played through applyAction. Names start with
// "SYNTHETIC"; the wording is that of the real card, taken from the golden corpus.
// Rules pinned: CR 701.15a (goad: the designation ends), 701.16a (investigate: one Clue for each), 608.2c (the count is taken as the effect resolves), 101.4 (three seats).
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const SLEUTH = parsed(
  'SYNTHETIC Parsed Serene Sleuth',
  'Creature — Human Detective',
  'When this creature enters, investigate.\nAt the beginning of combat on your turn, investigate for each goaded creature you control. Then each creature you control is no longer goaded.',
  { manaCost: '{1}{W}', colors: ['W'], power: '2', toughness: '2' },
);
const TAUNT = parsed('SYNTHETIC Parsed Taunt', 'Instant', 'Goad target creature.', {
  manaCost: '{R}',
  colors: ['R'],
});
const BEARS = 'Grizzly Bears';
const FILLER = Array.from({ length: 10 }, () => 'Plains');

const goads = (g: { state: { continuousEffects: readonly { change: { kind: string } }[] } }) =>
  g.state.continuousEffects.filter((e) => e.change.kind === 'goaded').length;

describe('Serene Sleuth: the grammar reads the goad count and the end of the goad', () => {
  test('a Clue for each goaded creature, then no creature is goaded', () => {
    expect(SLEUTH.faces[0]?.abilities[1]).toMatchObject({
      kind: 'triggered',
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'createToken', count: { kind: 'countOf', filter: { goaded: true } } },
          { kind: 'endGoad', objects: { kind: 'each', filter: { controller: 'you' } } },
        ],
      },
    });
  });
});

describe('Serene Sleuth: played in a three-seat game', () => {
  const board = () =>
    scenario({ seats: 3 })
      .define(SLEUTH)
      .define(TAUNT)
      .seat(0)
      .library(...FILLER)
      .hand(TAUNT.name, TAUNT.name)
      .battlefield('Mountain', 'Mountain', SLEUTH.name)
      .battlefield(BEARS, { count: 2 })
      .seat(1)
      .library(...FILLER)
      .battlefield(BEARS, { label: 'theirs' })
      .seat(2)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('two of my creatures goaded: two Clues at the beginning of combat, and nothing stays goaded', () => {
    const g = board();
    g.act(0).cast(`${TAUNT.name}[0]`, { targets: [`${BEARS}[0]`], pay: true });
    g.passAll();
    g.act(0).cast(TAUNT.name, { targets: [`${BEARS}[1]`], pay: true });
    g.passAll();
    expect(goads(g)).toBe(2);
    g.advanceTo('beginningOfCombat');
    g.passAll();
    g.expect.zone('Clue', 'battlefield', { seat: 0, count: 2 });
    expect(goads(g)).toBe(0);
    g.expect.invariants();
  });

  test('a creature of an opponent that is goaded is not counted and stays goaded', () => {
    const g = board();
    g.act(0).cast(`${TAUNT.name}[0]`, { targets: ['theirs'], pay: true });
    g.passAll();
    g.advanceTo('beginningOfCombat');
    g.passAll();
    g.expect.noObject('Clue');
    expect(goads(g)).toBe(1);
  });

  test('with no goaded creature no Clue is made', () => {
    const g = board();
    g.advanceTo('beginningOfCombat');
    g.passAll();
    g.expect.noObject('Clue');
  });
});
