// Counter Blitz deck, group D: Gatta and Luzzu, read from its real Oracle text and run by the engine.
// "When Gatta and Luzzu enters, choose target creature you control. If damage would be dealt to that creature this turn, prevent that damage and put that many +1/+1 counters on it."
// CR 615.1 and 615.5 (a prevention effect and its additional effect), CR 122.6 (counters put), CR 514.2 (this turn), CR 120.3.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';

const GATTA = real('Gatta and Luzzu');

describe('Gatta and Luzzu', () => {
  test('parses: a shield for all damage to the chosen creature that puts counters equal to the damage prevented', () => {
    const trigger = GATTA.faces[0]?.abilities.find((a) => a.kind === 'triggered');
    expect(trigger).toMatchObject({
      trigger: { kind: 'entersBattlefield' },
      targets: [{ what: { kind: 'object', filter: { controller: 'you', types: ['creature'] } } }],
      effect: {
        kind: 'preventDamage',
        scope: 'all',
        amount: 'all',
        duration: 'untilEndOfTurn',
        to: { kind: 'target' },
        countersPrevented: '+1/+1',
      },
    });
  });

  const play = () => {
    const g = scenario()
      .define(GATTA)
      .seat(0)
      .library('Island', { count: 6 })
      .hand(GATTA.name, 'Lightning Bolt', 'Lightning Bolt')
      .battlefield(
        'Grizzly Bears',
        'Giant Spider',
        'Plains',
        'Plains',
        'Plains',
        'Mountain',
        'Mountain',
      )
      .seat(1)
      .library('Island', { count: 6 })
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(GATTA.name, { pay: true });
    g.passAll();
    g.act(0).chooseTargets('Grizzly Bears');
    g.passAll();
    return g;
  };

  test('lightning on the chosen creature is prevented and becomes three +1/+1 counters', () => {
    const g = play();
    g.act(0).cast('Lightning Bolt[0]', { targets: ['Grizzly Bears'], pay: true });
    g.passAll();
    g.expect.counters('Grizzly Bears', { '+1/+1': 3 });
    g.expect.damage('Grizzly Bears', 0);
    g.expect.pt('Grizzly Bears', 5, 5);
    g.expect.invariants();
  });

  test('each damage event this turn is prevented and counted again: a second bolt adds three more', () => {
    const g = play();
    g.act(0).cast('Lightning Bolt[0]', { targets: ['Grizzly Bears'], pay: true });
    g.passAll();
    g.act(0).cast('Lightning Bolt', { targets: ['Grizzly Bears'], pay: true });
    g.passAll();
    g.expect.counters('Grizzly Bears', { '+1/+1': 6 });
  });

  test('damage to a creature that was not chosen is dealt as usual', () => {
    const g = play();
    g.act(0).cast('Lightning Bolt[0]', { targets: ['Giant Spider'], pay: true });
    g.passAll();
    g.expect.damage('Giant Spider', 3);
    g.expect.counters('Giant Spider', {});
  });

  test('it ends with the turn (CR 514.2): next turn the damage is dealt again', () => {
    const g = play();
    g.advanceTo('upkeep', { turn: 'next' });
    g.act(1).pass();
    g.act(0).cast('Lightning Bolt[0]', { targets: ['Grizzly Bears'], pay: true });
    g.passAll();
    g.expect.counters('Grizzly Bears', {});
    g.expect.zone('Grizzly Bears', 'graveyard');
  });
});
