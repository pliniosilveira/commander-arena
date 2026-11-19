// Death Toll deck, group D: "~ gets +X/+0, where X is the greatest power among creature cards in your graveyard." (CR 613.4c, 611.3a, 208.3).
// The wording is that of Carrion Grub; every card name starts with "SYNTHETIC" and no real card's text is claimed beyond that wording.
import { scenario } from '@commander-arena/engine/testing';
import { describe, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const FILLER = ['Island', 'Forest', 'Plains', 'Swamp'] as const;

const grub = parsed(
  'SYNTHETIC Parsed Grub',
  'Creature — Insect',
  '~ gets +X/+0, where X is the greatest power among creature cards in your graveyard.',
  { manaCost: '{3}{B}', power: '0', toughness: '5', colors: ['B'] },
);
const small = parsed('SYNTHETIC Parsed Small', 'Creature — Bear', 'Vigilance', {
  manaCost: '{G}',
  power: '2',
  toughness: '2',
  colors: ['G'],
});
const big = parsed('SYNTHETIC Parsed Big', 'Creature — Giant', 'Vigilance', {
  manaCost: '{4}{G}',
  power: '6',
  toughness: '1',
  colors: ['G'],
});
const star = parsed(
  'SYNTHETIC Parsed Star',
  'Creature — Lhurgoyf',
  "~'s power and toughness are each equal to the number of creature cards in your graveyard.",
  { manaCost: '{1}{G}', power: '*', toughness: '*', colors: ['G'] },
);

const defs = () => scenario().define(grub).define(small).define(big).define(star);

describe('"gets +X/+0, where X is the greatest power among creature cards in your graveyard" (CR 613.4c)', () => {
  test('the largest printed power among the creature cards of your graveyard, a land and another graveyard left out', () => {
    const g = defs()
      .seat(0)
      .library(...FILLER)
      .battlefield(grub.name)
      .graveyard(small.name)
      .graveyard(big.name)
      .graveyard('Forest')
      .seat(1)
      .library(...FILLER)
      .graveyard(big.name, { count: 2 })
      .at('precombatMain', { active: 0 })
      .build();
    g.expect.pt(grub.name, 6, 5);
    g.expect.invariants();
  });

  test('an empty graveyard adds nothing (CR 107.1b: no creature card is 0)', () => {
    const g = defs()
      .seat(0)
      .library(...FILLER)
      .battlefield(grub.name)
      .graveyard('Forest')
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.expect.pt(grub.name, 0, 5);
  });

  test('a creature card with a characteristic-defining power counts as it is in the graveyard (CR 604.3)', () => {
    const g = defs()
      .seat(0)
      .library(...FILLER)
      .battlefield(grub.name)
      .graveyard(star.name)
      .graveyard(small.name)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    // Two creature cards in the graveyard: the Star is 2/2 there, the Small is 2/2: the greatest power is 2.
    g.expect.pt(grub.name, 2, 5);
  });

  test('it follows the graveyard: a creature that dies raises the power (CR 611.3a)', () => {
    const g = defs()
      .seat(0)
      .library(...FILLER)
      .hand('Murder')
      .battlefield('Swamp', { count: 3 })
      .battlefield(grub.name)
      .battlefield(big.name)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.expect.pt(grub.name, 0, 5);
    g.act(0).cast('Murder', { targets: [big.name], pay: true });
    g.passAll();
    g.expect.pt(grub.name, 6, 5);
    g.expect.invariants();
  });
});
