// Agatha deck (issue 345), group 5: Invigorating Hot Spring.
// "Modified creatures you control have haste." (CR 700.9: a counter, an Equipment, or an Aura its controller controls modifies a permanent; CR 702.10 haste; CR 613.1f layer 6)
// and "Remove a +1/+1 counter from ~: Put a +1/+1 counter on target creature you control. Activate only as a sorcery and only once each turn." (CR 602.5b, 602.5d, 122.1).
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';
import { parsed } from './convert-grammar-helpers';

const SPRING = real('Invigorating Hot Spring');
const BLADE = real("Hero's Blade");
const BEAR = parsed('SYNTHETIC Bear', 'Creature — Bear', '', {
  manaCost: '{1}',
  power: '2',
  toughness: '2',
});
const OTHER = parsed('SYNTHETIC Other', 'Creature — Bear', '', {
  manaCost: '{1}',
  power: '2',
  toughness: '2',
});
const AURA = parsed('SYNTHETIC Boon', 'Enchantment — Aura', 'Enchant creature', {
  manaCost: '{1}',
});

const base = () => scenario().define(SPRING).define(BLADE).define(BEAR).define(OTHER).define(AURA);

describe('Invigorating Hot Spring: modified creatures have haste', () => {
  test('a creature with a counter, an Equipment or an Aura of its controller has haste; a plain one does not', () => {
    const g = base()
      .seat(0)
      .battlefield(SPRING.name, { counters: { '+1/+1': 4 } })
      .battlefield(BEAR.name, { counters: { '+1/+1': 1 } })
      .battlefield(OTHER.name)
      .seat(1)
      .library('Forest')
      .build();
    g.expect.derived(BEAR.name, { keywords: ['haste'] });
    g.expect.derived(OTHER.name, { keywords: [] });
  });

  test('an Equipment attached makes the creature modified', () => {
    const g = base()
      .seat(0)
      .battlefield(SPRING.name, { counters: { '+1/+1': 4 } })
      .battlefield(OTHER.name)
      .battlefield(BLADE.name, { attachedTo: OTHER.name })
      .seat(1)
      .library('Forest')
      .build();
    g.expect.derived(OTHER.name, { keywords: ['haste'] });
  });

  test('an Aura its controller controls makes it modified; an Aura an opponent controls does not', () => {
    const mine = base()
      .seat(0)
      .battlefield(SPRING.name, { counters: { '+1/+1': 4 } })
      .battlefield(OTHER.name)
      .battlefield(AURA.name, { attachedTo: OTHER.name })
      .seat(1)
      .library('Forest')
      .build();
    mine.expect.derived(OTHER.name, { keywords: ['haste'] });
    const theirs = base()
      .seat(0)
      .battlefield(SPRING.name, { counters: { '+1/+1': 4 } })
      .battlefield(OTHER.name)
      .seat(1)
      .battlefield(AURA.name, { attachedTo: OTHER.name })
      .library('Forest')
      .build();
    theirs.expect.derived(OTHER.name, { keywords: [] });
  });

  test('a modified creature an opponent controls does not get haste', () => {
    const g = base()
      .seat(0)
      .battlefield(SPRING.name, { counters: { '+1/+1': 4 } })
      .seat(1)
      .battlefield(BEAR.name, { counters: { '+1/+1': 1 } })
      .library('Forest')
      .build();
    g.expect.derived(BEAR.name, { keywords: [] });
  });
});

describe('Invigorating Hot Spring: moving a counter', () => {
  const game = () =>
    base()
      .seat(0)
      .battlefield(SPRING.name, { counters: { '+1/+1': 4 } })
      .battlefield(BEAR.name)
      .seat(1)
      .library('Forest')
      .build();

  test('removes a counter from the Spring and puts one on the target creature', () => {
    const g = game();
    g.act(0).activate(SPRING.name).targets([BEAR.name]);
    g.passAll();
    g.expect.counters(SPRING.name, { '+1/+1': 3 });
    g.expect.counters(BEAR.name, { '+1/+1': 1 });
    g.expect.invariants();
  });

  test('only once each turn', () => {
    const g = game();
    g.act(0).activate(SPRING.name).targets([BEAR.name]);
    g.passAll();
    expect(g.act(0).try.activate(SPRING.name).ok).toBe(false);
  });

  test('only as a sorcery: not while the stack is not empty and not on the opponent turn', () => {
    const g = base()
      .seat(0)
      .battlefield(SPRING.name, { counters: { '+1/+1': 4 } })
      .battlefield(BEAR.name)
      .seat(1)
      .library('Forest')
      .at('precombatMain', { active: 1, priority: 0 })
      .build();
    expect(g.act(0).try.activate(SPRING.name).ok).toBe(false);
  });
});
