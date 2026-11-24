// Counter Blitz deck, group D: Luminous Broodmoth, read from its real Oracle text and run by the engine.
// "Whenever a creature you control without flying dies, return it to the battlefield under its owner's control with a flying counter on it."
// CR 603.10a (leaves-the-battlefield triggers look back), CR 400.7 (a new object), CR 122.1b (keyword counters), CR 614.1c (enters with counters).
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';
import { parsed } from './convert-grammar-helpers';

const BROODMOTH = real('Luminous Broodmoth');
const FLIER = parsed('SYNTHETIC Test Flier', 'Creature — Bird', 'Flying', {
  manaCost: '{1}{U}',
  power: '1',
  toughness: '1',
  colors: ['U'],
});

describe('Luminous Broodmoth', () => {
  test('parses: the card of the dying creature returns under its owner with a flying counter', () => {
    expect(BROODMOTH.faces[0]?.abilities[1]).toMatchObject({
      kind: 'triggered',
      effect: {
        kind: 'moveToZone',
        objects: { kind: 'triggerCard' },
        to: 'battlefield',
        controller: 'owner',
        withCounters: { counter: 'flying', count: 1 },
      },
    });
  });

  const bolt = (target: string, seat: 0 | 1 = 0) => {
    const g = scenario()
      .define(BROODMOTH)
      .define(FLIER)
      .seat(0)
      .battlefield(BROODMOTH.name, 'Mountain')
      .hand('Lightning Bolt')
      .seat(seat === 0 ? 0 : 1)
      .battlefield(target)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast('Lightning Bolt', { targets: [target], pay: true });
    g.passAll();
    return g;
  };

  test('a creature without flying dies and comes back with a flying counter, so it has flying', () => {
    const g = bolt('Grizzly Bears');
    g.passAll();
    g.expect.zone('Grizzly Bears', 'battlefield');
    g.expect.counters('Grizzly Bears', { flying: 1 });
    g.expect.derived('Grizzly Bears', { keywords: ['flying'] });
    g.expect.invariants();
  });

  test('a creature with flying that dies stays in the graveyard', () => {
    const g = bolt(FLIER.name);
    g.passAll();
    g.expect.zone(FLIER.name, 'graveyard');
  });

  test('a creature an opponent controls that dies is not returned', () => {
    const g = bolt('Grizzly Bears', 1);
    g.passAll();
    g.expect.zone('Grizzly Bears', 'graveyard');
  });
});
