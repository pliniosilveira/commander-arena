// Counter Blitz deck, group D: Chasm Skulker, read from its real Oracle text and run by the engine.
// "When this creature dies, create X 1/1 blue Squid creature tokens with islandwalk, where X is the number of +1/+1 counters on this creature."
// CR 603.10a (a dies trigger looks back), CR 113.7a and 608.2h (last-known information), CR 702.14a (landwalk), CR 111.4 (token abilities).
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';

const SKULKER = real('Chasm Skulker');

describe('Chasm Skulker', () => {
  test('parses: X tokens with islandwalk, X the counters the Skulker had', () => {
    expect(SKULKER.faces[0]?.abilities[1]).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'dies' },
      effect: {
        kind: 'createToken',
        count: { kind: 'countersOn', of: { kind: 'this' }, counter: '+1/+1' },
        token: {
          kind: 'custom',
          definition: {
            name: 'Squid',
            colors: ['U'],
            abilities: [{ kind: 'keyword', keyword: { kind: 'landwalk', landType: 'Island' } }],
          },
        },
      },
    });
  });

  const kill = (counters: number) => {
    const g = scenario()
      .define(SKULKER)
      .seat(0)
      .battlefield(SKULKER.name, { counters: { '+1/+1': counters } })
      .battlefield('Mountain')
      .hand('Lightning Bolt')
      .seat(1)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast('Lightning Bolt', { targets: [SKULKER.name], pay: true });
    g.passAll();
    g.passAll();
    return g;
  };

  test('dying with two counters makes two 1/1 blue Squids with islandwalk (last-known information)', () => {
    const g = kill(2);
    g.expect.zone(SKULKER.name, 'graveyard');
    const squids = g.find({ name: 'Squid', zone: 'battlefield', seat: 0 });
    expect(squids.length).toBe(2);
    g.expect.pt('Squid[1]', 1, 1);
    g.expect.derived('Squid[1]', { colors: ['U'], keywords: ['landwalk'] });
    g.expect.invariants();
  });

  test('dying with no counter makes no token', () => {
    const g = scenario()
      .define(SKULKER)
      .seat(0)
      .battlefield(SKULKER.name, { counters: { '+1/+1': 0 } })
      .battlefield('Mountain')
      .hand('Lightning Bolt')
      .seat(1)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast('Lightning Bolt', { targets: [SKULKER.name], pay: true });
    g.passAll();
    g.passAll();
    expect(g.find({ name: 'Squid', zone: 'battlefield' }).length).toBe(0);
  });

  test('drawing a card puts a +1/+1 counter on it', () => {
    const g = scenario()
      .define(SKULKER)
      .seat(0)
      .battlefield(SKULKER.name)
      .library('Island', { count: 4 })
      .at('upkeep', { active: 0 })
      .build();
    g.advanceTo('precombatMain');
    g.passAll();
    g.expect.counters(SKULKER.name, { '+1/+1': 1 });
  });
});
