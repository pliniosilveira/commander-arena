// Counter Blitz deck, group D: Kimahri, Valiant Guardian, read from its real Oracle text and run by the engine.
// "At the beginning of combat on your turn, put a +1/+1 counter on Kimahri and tap target creature an opponent controls. Then you may have Kimahri become a copy of that creature, except its name
// is Kimahri, Valiant Guardian and it has vigilance and this ability." (CR 707.2 and 707.9 (a copy and its exceptions), CR 613.2a (layer 1), CR 122.6 (counters stay), CR 701.21/ tapping.)
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';

const KIMAHRI = real('Kimahri, Valiant Guardian');

describe('Kimahri, Valiant Guardian', () => {
  test('parses: counter, tap, and an offered permanent copy that keeps the name, has vigilance and this ability', () => {
    const trigger = KIMAHRI.faces[0]?.abilities.find((a) => a.kind === 'triggered');
    expect(trigger).toMatchObject({
      trigger: { kind: 'step', step: 'beginCombat', whose: 'you' },
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'addCounters', counter: '+1/+1' },
          { kind: 'tap' },
          {
            kind: 'may',
            effect: {
              kind: 'becomeCopy',
              duration: 'permanent',
              keepName: true,
              withThisAbility: true,
              abilities: [{ kind: 'keyword', keyword: { kind: 'vigilance' } }],
            },
          },
        ],
      },
    });
  });

  const combat = () => {
    const g = scenario()
      .define(KIMAHRI)
      .seat(0)
      .library('Island', { count: 6 })
      .battlefield(KIMAHRI.name)
      .seat(1)
      .library('Island', { count: 6 })
      .battlefield('Giant Spider')
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('beginningOfCombat');
    return g;
  };

  test('the counter is put, the creature is tapped, and declining the copy leaves Kimahri as it is', () => {
    const g = combat();
    g.passAll();
    g.act(0).decline();
    g.expect.counters(KIMAHRI.name, { '+1/+1': 1 });
    g.expect.pt(KIMAHRI.name, 4, 4);
    g.expect.tapped('Giant Spider');
  });

  test('accepting: Kimahri is a copy of the creature (its counter stays), keeps its name, has vigilance and this ability', () => {
    const g = combat();
    g.passAll();
    g.act(0).accept();
    g.expect.counters(KIMAHRI.name, { '+1/+1': 1 });
    // A Giant Spider is a 2/4 with reach; with the counter it is 3/5.
    g.expect.pt(KIMAHRI.name, 3, 5);
    g.expect.derived(KIMAHRI.name, {
      types: ['creature'],
      subtypes: ['Spider'],
      keywords: ['reach', 'vigilance'],
    });
    g.expect.invariants();
  });

  test('the copy has the ability: next turn it triggers again, with a new counter', () => {
    const g = combat();
    g.passAll();
    g.act(0).accept();
    g.advanceTo('beginningOfCombat', { turn: 'next' });
    g.advanceTo('beginningOfCombat', { turn: 'next' });
    g.passAll();
    expect(g.find({ name: KIMAHRI.name, zone: 'battlefield' }).length).toBe(1);
    g.expect.counters(KIMAHRI.name, { '+1/+1': 2 });
  });
});
