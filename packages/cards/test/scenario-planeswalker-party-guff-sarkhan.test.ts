// Commodore Guff (the Planeswalker Party commander): "At the beginning of your end step, put a loyalty counter on another target planeswalker you control." after the +1 of Sarkhan the
// Masterless. CR 205.1a: the walkers on the battlefield when the +1 resolves are creatures and no longer planeswalkers, Guff among them, for the rest of the turn, so there is no
// "another target planeswalker" and the trigger is removed from the stack (CR 603.3d); CR 611.2c: a planeswalker that enters later is not changed by the +1 and is a legal target.
import { scenario } from '@commander-arena/engine/testing';
import { describe, test } from 'vitest';
import { real } from './agatha-helpers';
import { parsed } from './convert-grammar-helpers';

const SARKHAN = real('Sarkhan the Masterless');
const GUFF = parsed(
  'Commodore Guff',
  'Legendary Planeswalker — Guff',
  'At the beginning of your end step, put a loyalty counter on another target planeswalker you control.\n+1: Create a 1/1 red Wizard creature token with "{T}: Add {R}. Spend this mana only to cast a planeswalker spell."\n−3: You draw X cards and Commodore Guff deals X damage to each opponent, where X is the number of planeswalkers you control.\nCommodore Guff can be your commander.',
  { manaCost: '{1}{U}{R}{W}', loyalty: '5' },
);
const WALKER = 'SYNTHETIC Loyalty Walker';
const LIBRARY = Array.from({ length: 8 }, () => 'Plains');

describe('Commodore Guff and Sarkhan the Masterless', () => {
  const NEW = 'SYNTHETIC Animate Walker';
  const build = () =>
    scenario({ seats: 2 })
      .define(SARKHAN)
      .define(GUFF)
      .seat(0)
      .library(...LIBRARY)
      .hand(NEW)
      .battlefield('Plains', 'Plains', 'Plains', 'Plains')
      .battlefield(SARKHAN.name, { counters: { loyalty: 5 } })
      .battlefield(GUFF.name, { counters: { loyalty: 5 } })
      .battlefield(WALKER, { counters: { loyalty: 3 } })
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('after the +1 every walker is a creature: the end step trigger has no planeswalker to target and leaves the stack', () => {
    const g = build();
    g.act(0).activate(SARKHAN.name, { ability: 1 });
    g.passAll();
    g.advanceTo('end');
    g.expect.counters(WALKER, { loyalty: 3 });
    g.expect.counters(GUFF.name, { loyalty: 5 });
  });

  test('a planeswalker that enters after the +1 is not changed by it: the trigger puts a loyalty counter on it', () => {
    const g = build();
    g.act(0).activate(SARKHAN.name, { ability: 1 });
    g.passAll();
    g.act(0).cast(NEW, { pay: true });
    g.passAll();
    g.expect.derived(NEW, { types: ['planeswalker'] });
    g.advanceTo('end');
    // The only legal target is chosen by the engine: the trigger is on the stack.
    g.passAll();
    g.expect.counters(NEW, { loyalty: 5 });
  });
});
