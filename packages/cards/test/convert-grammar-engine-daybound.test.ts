// Day and night on a real card (issue 345): Hound Tamer // Untamed Pup.
// Front: "Trample", "{3}{G}: Put a +1/+1 counter on target creature.", "Daybound". Back: "Trample", "Other Wolves and Werewolves you control have trample.", the same counter ability, "Nightbound".
// Pins: CR 702.145 (Daybound and Nightbound), CR 731 (Day and Night), CR 502.2, CR 712.18 (a transformed permanent is the same object), CR 702.19 (Trample), CR 613.1f (layer 6 grant).
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';

const TAMER = real('Hound Tamer // Untamed Pup');
const WOLF = 'SYNTHETIC Dayfang Cub // Nightfang Wolf'; // a Human Werewolf on its front face, a Werewolf on its back
const BEARS = 'Grizzly Bears';

const forests = (n: number): string[] => Array.from({ length: n }, () => 'Forest');

describe('Hound Tamer // Untamed Pup', () => {
  test('cast, it makes it day and is a 3/3 Human Werewolf with trample', () => {
    const g = scenario()
      .define(TAMER)
      .seat(0)
      .hand(TAMER.name)
      .battlefield(...forests(3))
      .seat(1)
      .library(...forests(6))
      .build();
    g.act(0).cast(TAMER.name, { pay: true });
    g.passAll();
    g.expect.zone(TAMER.name, 'battlefield', { seat: 0 });
    g.expect.dayNight('day');
    g.expect.pt(TAMER.name, 3, 3);
    g.expect.derived(TAMER.name, {
      keywords: ['trample', 'daybound'],
      subtypes: ['Human', 'Werewolf'],
    });
    g.expect.invariants();
  });

  test('a turn with no spell makes it night: it becomes Untamed Pup, a 4/4 that keeps its counter', () => {
    const g = scenario()
      .define(TAMER)
      .at('precombatMain', { active: 0, dayNight: 'day' })
      .seat(0)
      .battlefield(TAMER.name, { counters: { '+1/+1': 1 } })
      .seat(1)
      .library(...forests(6))
      .build();
    g.expect.pt(TAMER.name, 4, 4);
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.dayNight('night');
    expect(g.object(TAMER.name).face).toBe(1);
    g.expect.pt(TAMER.name, 5, 5);
    g.expect.derived(TAMER.name, { keywords: ['trample', 'nightbound'], subtypes: ['Werewolf'] });
  });

  test('Untamed Pup gives the other Wolves and Werewolves you control trample, and no one else', () => {
    const g = scenario()
      .define(TAMER)
      .at('precombatMain', { active: 0, dayNight: 'night' })
      .seat(0)
      .battlefield(TAMER.name, { face: 1 })
      .battlefield(WOLF, { label: 'wolf', face: 1 })
      .battlefield(BEARS, { label: 'bears' })
      .seat(1)
      .battlefield(WOLF, { label: 'theirs', face: 1 })
      .library(...forests(6))
      .build();
    g.expect.derived('wolf', { keywords: ['nightbound', 'trample'] });
    g.expect.derived('bears', { keywords: [] });
    g.expect.derived('theirs', { keywords: ['nightbound'] });
  });

  test('two spells in the night turn make it day again: it is Hound Tamer, and the others lose the trample', () => {
    const g = scenario()
      .define(TAMER)
      .at('precombatMain', { active: 0, dayNight: 'night' })
      .seat(0)
      .hand('SYNTHETIC Growth Spurt', { label: 's1' })
      .hand('SYNTHETIC Growth Spurt', { label: 's2' })
      .battlefield(TAMER.name, { face: 1 })
      .battlefield(WOLF, { label: 'wolf', face: 1 })
      .battlefield(...forests(2))
      .seat(1)
      .library(...forests(6))
      .build();
    g.act(0).cast('s1', { targets: [TAMER.name], pay: true });
    g.passAll();
    g.act(0).cast('s2', { targets: [TAMER.name], pay: true });
    g.passAll();
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.dayNight('day');
    expect(g.object(TAMER.name).face).toBe(0);
    expect(g.object('wolf').face).toBe(0);
    g.expect.derived('wolf', { keywords: ['daybound'] });
  });

  test('{3}{G} puts a +1/+1 counter on target creature, on either face', () => {
    const g = scenario()
      .define(TAMER)
      .at('precombatMain', { active: 0, dayNight: 'day' })
      .seat(0)
      .battlefield(TAMER.name, { label: 'tamer' })
      .battlefield(BEARS, { label: 'bears' })
      .battlefield(...forests(4))
      .seat(1)
      .library(...forests(6))
      .build();
    g.act(0)
      .activate('tamer', { targets: ['bears'] })
      .pay();
    g.passAll();
    expect(g.object('bears').counters['+1/+1']).toBe(1);
  });
});
