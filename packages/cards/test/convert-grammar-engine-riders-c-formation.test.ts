// Unbreakable Formation of the Riders of Rohan deck (group C), run as written: "Creatures you control gain indestructible until end of turn. Addendum — If you cast this spell during
// your main phase, put a +1/+1 counter on each of those creatures and they gain vigilance until end of turn." (CR 207.2c, 608.2c, 611.2c). A SYNTHETIC card imported through the grammar
// and played with three seats.
import { getView } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;
const BEARS = 'Grizzly Bears';

const FORMATION = parsed(
  'SYNTHETIC Parsed Formation',
  'Instant',
  'Creatures you control gain indestructible until end of turn.\nAddendum — If you cast this spell during your main phase, put a +1/+1 counter on each of those creatures and they gain vigilance until end of turn.',
  { manaCost: '{2}{W}', colors: ['W'] },
);

const keywordsOf = (g: ScenarioGame, label: string): readonly string[] => {
  const id = g.id(label);
  return getView(g.state, 0).battlefield.find((o) => o.id === id)?.keywords ?? [];
};

const board = (step: 'precombatMain' | 'declareAttackers') =>
  scenario({ seats: 3 })
    .define(FORMATION)
    .seat(0)
    .battlefield(BEARS, { label: 'bear' })
    .battlefield('Llanowar Elves', { label: 'elves' })
    .battlefield('Plains', 'Plains', 'Plains')
    .hand(FORMATION.name, { label: 'spell' })
    .library(...FILLER)
    .seat(1)
    .battlefield(BEARS, { label: 'theirs' })
    .library(...FILLER)
    .seat(2)
    .library(...FILLER)
    .at(step, { active: 0, turn: 3 })
    .build();

describe('Unbreakable Formation as written (CR 207.2c, 608.2c)', () => {
  test('cast in my main phase: indestructible, a +1/+1 counter and vigilance for each creature I control', () => {
    const g = board('precombatMain');
    g.act(0).cast('spell', { pay: true });
    g.passAll();
    for (const label of ['bear', 'elves']) {
      expect(keywordsOf(g, label)).toEqual(expect.arrayContaining(['indestructible', 'vigilance']));
      g.expect.counters(label, { '+1/+1': 1 });
    }
    // Not the creature of an opponent.
    expect(keywordsOf(g, 'theirs')).not.toContain('indestructible');
    g.expect.counters('theirs', {});
    g.expect.invariants();
  });

  test('cast outside my main phase: only indestructible', () => {
    const g = board('declareAttackers');
    g.act(0).cast('spell', { pay: true });
    g.passAll();
    expect(keywordsOf(g, 'bear')).toContain('indestructible');
    expect(keywordsOf(g, 'bear')).not.toContain('vigilance');
    g.expect.counters('bear', {});
  });
});
