// Counter Blitz deck, group D: single-card wordings read from the real Oracle text and run by the engine.
// Path of Discovery: "Whenever a creature you control enters, it explores." (CR 701.44a: Explore)
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';

const PATH = real('Path of Discovery');

describe('Path of Discovery', () => {
  test('parses as an enters trigger whose creature explores', () => {
    expect(PATH.faces[0]?.abilities[0]).toMatchObject({
      kind: 'triggered',
      effect: { kind: 'explore', objects: { kind: 'triggerSubject' } },
    });
  });

  test('a land revealed goes to the hand', () => {
    const g = scenario()
      .define(PATH)
      .seat(0)
      .battlefield(PATH.name, 'Forest', 'Forest')
      .hand('Grizzly Bears')
      .library('Island', { count: 4 })
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast('Grizzly Bears', { pay: true });
    g.passAll();
    g.passAll();
    expect(g.find({ name: 'Island', zone: 'hand', seat: 0 }).length).toBe(1);
    g.expect.invariants();
  });

  test('a nonland revealed gives the entering creature a +1/+1 counter', () => {
    const g = scenario()
      .define(PATH)
      .seat(0)
      .battlefield(PATH.name, 'Forest', 'Forest')
      .hand('Grizzly Bears')
      .library('Giant Spider', { count: 4 })
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast('Grizzly Bears', { pay: true });
    g.passAll();
    g.passAll();
    g.expect.counters('Grizzly Bears', { '+1/+1': 1 });
    g.expect.invariants();
  });
});
