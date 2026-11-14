// The scenario builder for combat positions: creatures with damage, counters, tapped and fresh, and
// valid planeswalker and battle objects (CR 306.5b, 310.4b, 310.9), refusing impossible setups.
import { describe, expect, test } from 'vitest';
import { checkInvariants, ScenarioError, scenario } from './dsl-helpers';

describe('planeswalkers and battles are built as when they enter the battlefield', () => {
  test('a planeswalker has loyalty counters equal to the printed loyalty (CR 306.5b)', () => {
    const g = scenario().seat(1).battlefield('SYNTHETIC Vanilla Planeswalker').build();
    g.expect.counters('SYNTHETIC Vanilla Planeswalker', { loyalty: 4 });
    expect(checkInvariants(g.state)).toEqual([]);
    expect(g.object('SYNTHETIC Vanilla Planeswalker').protector).toBeNull();
  });

  test('loyalty can be set with counters', () => {
    const g = scenario()
      .seat(1)
      .battlefield('SYNTHETIC Vanilla Planeswalker', { counters: { loyalty: 2 } })
      .build();
    g.expect.counters('SYNTHETIC Vanilla Planeswalker', { loyalty: 2 });
  });

  test('a battle has defense counters equal to the printed defense (CR 310.4b)', () => {
    const g = scenario().seat(0).battlefield('SYNTHETIC Vanilla Battle').build();
    g.expect.counters('SYNTHETIC Vanilla Battle', { defense: 5 });
    expect(checkInvariants(g.state)).toEqual([]);
  });

  test('defense can be set with counters', () => {
    const g = scenario()
      .seat(0)
      .battlefield('SYNTHETIC Vanilla Battle', { counters: { defense: 1 } })
      .build();
    g.expect.counters('SYNTHETIC Vanilla Battle', { defense: 1 });
  });

  test('a battle is protected by the opponent of its controller (CR 310.9, 310.12a)', () => {
    const mine = scenario().seat(0).battlefield('SYNTHETIC Vanilla Battle').build();
    expect(mine.object('SYNTHETIC Vanilla Battle').protector).toBe(1);
    expect(mine.object('SYNTHETIC Vanilla Battle').controller).toBe(0);
    const theirs = scenario().seat(1).battlefield('SYNTHETIC Vanilla Battle').build();
    expect(theirs.object('SYNTHETIC Vanilla Battle').protector).toBe(0);
  });

  test('a protector can be named, and must not be the controller', () => {
    const g = scenario().seat(0).battlefield('SYNTHETIC Vanilla Battle', { protector: 1 }).build();
    expect(g.object('SYNTHETIC Vanilla Battle').protector).toBe(1);
    expect(() =>
      scenario().seat(0).battlefield('SYNTHETIC Vanilla Battle', { protector: 0 }).build(),
    ).toThrow(/protector is an opponent of its controller/);
  });

  test('a stolen battle keeps its protector rule against the controlling seat', () => {
    const g = scenario().seat(0).battlefield('SYNTHETIC Vanilla Battle', { controller: 1 }).build();
    expect(g.object('SYNTHETIC Vanilla Battle').controller).toBe(1);
    expect(g.object('SYNTHETIC Vanilla Battle').protector).toBe(0);
  });

  test('loyalty, defense and protector are refused on cards that cannot have them', () => {
    expect(() =>
      scenario()
        .seat(0)
        .battlefield('Grizzly Bears', { counters: { loyalty: 3 } })
        .build(),
    ).toThrow(ScenarioError);
    expect(() =>
      scenario()
        .seat(0)
        .battlefield('Grizzly Bears', { counters: { defense: 3 } })
        .build(),
    ).toThrow(/defense counters only belong on a battle/);
    expect(() => scenario().seat(0).battlefield('Grizzly Bears', { protector: 1 }).build()).toThrow(
      /only a battle has a protector/,
    );
    expect(() =>
      scenario()
        .seat(0)
        .hand('SYNTHETIC Vanilla Battle', { protector: 1 } as never)
        .build(),
    ).toThrow(/only apply to the battlefield/);
  });

  test('a spell card cannot be placed on the battlefield (CR 110.1)', () => {
    expect(() => scenario().seat(0).battlefield('Lightning Bolt').build()).toThrow(
      /not a permanent card/,
    );
  });
});

describe('creatures in combat positions', () => {
  test('damage, counters, tapped and fresh are written to the object', () => {
    const g = scenario()
      .seat(0)
      .battlefield('Grizzly Bears', { damage: 1, counters: { '+1/+1': 2 }, tapped: true })
      .battlefield('Serra Angel', { fresh: true })
      .build();
    g.expect.damage('Grizzly Bears', 1);
    g.expect.counters('Grizzly Bears', { '+1/+1': 2 });
    g.expect.tapped('Grizzly Bears');
    g.expect.tapped('Serra Angel', false);
    expect(g.view(0).battlefield.find((o) => o.name === 'Serra Angel')?.summoningSick).toBe(true);
    expect(g.view(0).battlefield.find((o) => o.name === 'Grizzly Bears')?.summoningSick).toBe(
      false,
    );
  });

  test('a fresh creature with haste is not summoning sick', () => {
    const g = scenario().seat(0).battlefield('Raging Goblin', { fresh: true }).build();
    expect(g.view(0).battlefield.find((o) => o.name === 'Raging Goblin')?.summoningSick).toBe(
      false,
    );
  });

  test('a creature already carrying lethal damage dies when state-based actions run', () => {
    const g = scenario()
      .seat(0)
      .battlefield('Grizzly Bears', { damage: 2 })
      .at('precombatMain', { active: 0 })
      .build({ settle: true });
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
  });

  test('commander damage already taken is part of the position (CR 903.10a)', () => {
    const g = scenario()
      .seat(0)
      .commander('Yargle, Glutton of Urborg')
      .seat(1)
      .commanderDamageTaken('Yargle, Glutton of Urborg', 12)
      .build();
    g.expect.commanderDamage(1, 'Yargle, Glutton of Urborg', 12);
    g.expect.commanderDamage(0, 'Yargle, Glutton of Urborg', 0);
  });
});
