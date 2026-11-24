// Frontline Medic of the Riders of Rohan deck (group C), run as written: "Whenever ~ and at least two other creatures attack" (battalion, CR 508.1, 603.2c) and "Counter target
// spell with {X} in its mana cost unless its controller pays {3}" (CR 107.3, 701.6). A SYNTHETIC card imported through the grammar and played with three seats.
import { getView } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;
const BEARS = 'Grizzly Bears';

const keywordsOf = (g: ScenarioGame, label: string, seat: 0 | 1 | 2 = 0): readonly string[] => {
  const id = g.id(label);
  return getView(g.state, seat).battlefield.find((o) => o.id === id)?.keywords ?? [];
};

const MEDIC = parsed(
  'SYNTHETIC Parsed Medic',
  'Creature — Human Cleric',
  'Battalion — Whenever ~ and at least two other creatures attack, creatures you control gain indestructible until end of turn.\nSacrifice ~: Counter target spell with {X} in its mana cost unless its controller pays {3}.',
  { manaCost: '{2}{W}', colors: ['W'], power: '3', toughness: '3' },
);
const BLAST = parsed('SYNTHETIC Parsed Blast', 'Instant', '~ deals X damage to any target.', {
  manaCost: '{X}{R}',
  colors: ['R'],
});

describe('Frontline Medic as written (CR 508.1, 603.2c, 701.6)', () => {
  const board = () =>
    scenario({ seats: 3 })
      .define(MEDIC)
      .seat(0)
      .battlefield(MEDIC.name, { label: 'medic' })
      .battlefield(BEARS, { label: 'bear1' })
      .battlefield('Llanowar Elves', { label: 'elves' })
      .battlefield('Giant Spider', { label: 'spider' })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .seat(2)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('the Medic and two other creatures attack: every creature I control gains indestructible', () => {
    const g = board();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(['medic', 'bear1', 'elves'], { player: 1 });
    g.passAll();
    // Including the one that did not attack.
    for (const label of ['medic', 'bear1', 'elves', 'spider']) {
      expect(keywordsOf(g, label)).toContain('indestructible');
    }
    g.expect.invariants();
  });

  test('the attackers need not attack the same player (the ruling)', () => {
    const g = board();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([
      { attacker: 'medic', target: { player: 1 } },
      { attacker: 'bear1', target: { player: 2 } },
      { attacker: 'elves', target: { player: 1 } },
    ]);
    g.passAll();
    expect(keywordsOf(g, 'spider')).toContain('indestructible');
  });

  test('the Medic and only one other creature: nothing', () => {
    const g = board();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(['medic', 'bear1'], { player: 1 });
    g.passAll();
    expect(keywordsOf(g, 'bear1')).not.toContain('indestructible');
  });

  test('three creatures attack without the Medic: nothing, it counts only when it attacks itself', () => {
    const g = board();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(['bear1', 'elves', 'spider'], { player: 1 });
    g.passAll();
    expect(keywordsOf(g, 'bear1')).not.toContain('indestructible');
    expect(keywordsOf(g, 'medic')).not.toContain('indestructible');
  });

  test("an opponent's attack with three creatures is not mine", () => {
    const g = scenario({ seats: 3 })
      .define(MEDIC)
      .seat(0)
      .battlefield(MEDIC.name, { label: 'medic' })
      .library(...FILLER)
      .seat(1)
      .battlefield(BEARS, { label: 'a' })
      .battlefield('Llanowar Elves', { label: 'b' })
      .battlefield('Giant Spider', { label: 'c' })
      .library(...FILLER)
      .seat(2)
      .library(...FILLER)
      .at('precombatMain', { active: 1, turn: 3 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(1).attack(['a', 'b', 'c'], { player: 2 });
    g.passAll();
    expect(keywordsOf(g, 'medic')).not.toContain('indestructible');
  });
});

describe('Frontline Medic: "Counter target spell with {X} in its mana cost unless its controller pays {3}"', () => {
  const fight = (mountains: number) => {
    const g = scenario({ seats: 3 })
      .define(MEDIC)
      .define(BLAST)
      .seat(0)
      .battlefield(MEDIC.name, { label: 'medic' })
      .library(...FILLER)
      .seat(1)
      .hand(BLAST.name, { label: 'blast' })
      .battlefield(...Array.from({ length: mountains }, () => 'Mountain'))
      .library(...FILLER)
      .seat(2)
      .library(...FILLER)
      .at('precombatMain', { active: 1, turn: 2 })
      .build();
    g.act(1).cast('blast', { targets: [{ player: 0 }], x: 1, pay: true });
    return g;
  };

  test('sacrificing the Medic offers the caster to pay {3} for a spell with {X} in its mana cost', () => {
    const g = fight(5);
    g.act(1).pass();
    g.act(2).pass();
    g.act(0).activate('medic', { targets: ['blast'], pay: true });
    g.expect.zone(MEDIC.name, 'graveyard', { seat: 0 });
    g.passAll();
    g.expect.pending('confirmOptional', 1);
    const d = g.state.pending;
    if (d?.kind !== 'confirmOptional') throw new Error('expected confirmOptional');
    expect(d.cost).toEqual([{ kind: 'mana', symbols: ['3'] }]);
  });

  test('declining counters the spell', () => {
    const g = fight(5);
    g.act(1).pass();
    g.act(2).pass();
    g.act(0).activate('medic', { targets: ['blast'], pay: true });
    g.passAll();
    g.act(1).decline();
    g.expect.noObject(BLAST.name, { zone: 'stack' });
    g.expect.life(0, 40);
  });

  test('paying {3} lets the spell resolve', () => {
    const g = fight(5);
    g.act(1).pass();
    g.act(2).pass();
    g.act(0).activate('medic', { targets: ['blast'], pay: true });
    g.passAll();
    g.act(1).accept();
    g.act(1).payAuto();
    g.passAll();
    g.expect.life(0, 39);
  });

  test('a spell with no {X} in its mana cost is not a legal target', () => {
    const g = scenario({ seats: 3 })
      .define(MEDIC)
      .seat(0)
      .battlefield(MEDIC.name, { label: 'medic' })
      .library(...FILLER)
      .seat(1)
      .hand('Lightning Bolt', { label: 'bolt' })
      .battlefield('Mountain')
      .library(...FILLER)
      .seat(2)
      .library(...FILLER)
      .at('precombatMain', { active: 1, turn: 2 })
      .build();
    g.act(1).cast('bolt', { targets: [{ player: 0 }], pay: true });
    g.act(1).pass();
    g.act(2).pass();
    expect(() => g.act(0).activate('medic', { targets: ['bolt'], pay: true })).toThrow();
  });
});
