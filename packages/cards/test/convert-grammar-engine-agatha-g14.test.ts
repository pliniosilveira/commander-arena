// Agatha deck (issue 345), group 14: Agatha of the Vile Cauldron.
// "Activated abilities of creatures you control cost {X} less to activate, where X is ~'s power. This effect can't reduce the mana in that cost to less than one mana." (CR 601.2f,
// 118.7, 602.2b) and "{4}{R}{G}: Other creatures you control get +1/+1 and gain trample and haste until end of turn." (CR 611.2a, 611.2c, 613.1f, 613.4c).
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';
import { parsed } from './convert-grammar-helpers';

const AGATHA = real('Agatha of the Vile Cauldron');
const SAGE = parsed('SYNTHETIC Sage', 'Creature — Human', '{3}: You gain 1 life.', {
  manaCost: '{1}',
  power: '1',
  toughness: '1',
});
const PENNY = parsed('SYNTHETIC Penny', 'Creature — Human', '{1}: You gain 1 life.', {
  manaCost: '{1}',
  power: '1',
  toughness: '1',
});
const ARTIFACT = parsed('SYNTHETIC Gear', 'Artifact', '{3}: You gain 1 life.', {
  manaCost: '{1}',
});

const game = (lands: number, power = 0) => {
  const b = scenario()
    .define(AGATHA)
    .define(SAGE)
    .define(PENNY)
    .define(ARTIFACT)
    .seat(0)
    .battlefield(AGATHA.name, power > 0 ? { counters: { '+1/+1': power } } : {})
    .battlefield(SAGE.name)
    .battlefield(PENNY.name)
    .battlefield(ARTIFACT.name);
  for (let i = 0; i < lands; i++) b.battlefield('Forest');
  return b.seat(1).library('Forest').build();
};

const canActivate = (g: ReturnType<typeof game>, name: string) => g.act(0).try.activate(name).ok;

describe('Agatha: activated abilities of creatures cost less', () => {
  test('a creature ability costs {X} less, X being the power of Agatha', () => {
    expect(canActivate(game(1), SAGE.name)).toBe(false);
    expect(canActivate(game(2), SAGE.name)).toBe(true);
    // With power 2 (a counter) the {3} ability costs {1}.
    expect(canActivate(game(1, 1), SAGE.name)).toBe(true);
  });

  test('never below one mana: a {1} ability still needs one mana', () => {
    expect(canActivate(game(0, 3), PENNY.name)).toBe(false);
    expect(canActivate(game(1, 3), PENNY.name)).toBe(true);
    // And {3} with power 5 costs {1}, not nothing.
    expect(canActivate(game(0, 5), SAGE.name)).toBe(false);
    expect(canActivate(game(1, 5), SAGE.name)).toBe(true);
  });

  test('an artifact that is not a creature is not helped', () => {
    expect(canActivate(game(2), ARTIFACT.name)).toBe(false);
    expect(canActivate(game(3), ARTIFACT.name)).toBe(true);
  });
});

describe('Agatha: the pump of the other creatures', () => {
  test('other creatures get +1/+1, trample and haste until end of turn; Agatha does not', () => {
    const g = scenario()
      .define(AGATHA)
      .define(SAGE)
      .seat(0)
      .battlefield(AGATHA.name)
      .battlefield(SAGE.name)
      .battlefield('Mountain', 'Forest', 'Forest', 'Forest', 'Forest')
      .seat(1)
      .library('Forest')
      .build();
    // {4}{R}{G} costs {1} less because Agatha is a creature of its controller with power 1: five lands pay it.
    g.act(0).activate(AGATHA.name, { ability: 1 }).pay();
    g.passAll();
    g.expect.pt(SAGE.name, 2, 2);
    g.expect.derived(SAGE.name, { keywords: ['trample', 'haste'] });
    g.expect.pt(AGATHA.name, 1, 1);
    g.expect.derived(AGATHA.name, { keywords: [] });
    g.expect.invariants();
  });
});
