// Agatha deck (issue 345), group 1: Hero's Blade, "Whenever a legendary creature you control enters, you may attach ~ to it."
// Pins: CR 701.3 (attach), CR 603.2 (the trigger), CR 205.4 (legendary supertype), CR 603.5 (the "may" is asked as the ability resolves).
import { scenario } from '@commander-arena/engine/testing';
import { describe, test } from 'vitest';
import { real } from './agatha-helpers';
import { parsed } from './convert-grammar-helpers';

const BLADE = real("Hero's Blade");
const HERO = parsed('SYNTHETIC Legend', 'Legendary Creature — Human', '', {
  manaCost: '{1}',
  power: '1',
  toughness: '1',
});
const PLAIN = parsed('SYNTHETIC Plain', 'Creature — Human', '', {
  manaCost: '{1}',
  power: '1',
  toughness: '1',
});

const game = (creature: string) =>
  scenario()
    .define(BLADE)
    .define(HERO)
    .define(PLAIN)
    .seat(0)
    .battlefield(BLADE.name)
    .battlefield('Forest')
    .hand(creature)
    .seat(1)
    .library('Forest')
    .build();

describe("Hero's Blade", () => {
  test('a legendary creature entering may be equipped, and is then +3/+2', () => {
    const g = game(HERO.name);
    g.act(0).cast(HERO.name, { pay: true });
    g.passAll();
    g.act(0).accept();
    g.passAll();
    g.expect.attached(BLADE.name, HERO.name);
    g.expect.pt(HERO.name, 4, 3);
    g.expect.invariants();
  });

  test('declining leaves it unattached', () => {
    const g = game(HERO.name);
    g.act(0).cast(HERO.name, { pay: true });
    g.passAll();
    g.act(0).decline();
    g.passAll();
    g.expect.attached(BLADE.name, null);
    g.expect.invariants();
  });

  test('a creature that is not legendary does not trigger it', () => {
    const g = game(PLAIN.name);
    g.act(0).cast(PLAIN.name, { pay: true });
    g.passAll();
    g.expect.attached(BLADE.name, null);
  });
});
