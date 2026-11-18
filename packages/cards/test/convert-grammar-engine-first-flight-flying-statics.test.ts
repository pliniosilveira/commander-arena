// The First Flight starter Commander decks, the group of statics that name "with flying" or "without flying" (D-149): the REAL Oracle lines of Empyrean Eagle, Favorable
// Winds, Gravitational Shift, Thunderclap Wyvern and Skycat Sovereign go through the grammar as cards with no override and are played through applyAction. The cards are
// not in the golden corpus yet, so the card names, costs and types here are SYNTHETIC stand-ins (named so); only the ability lines are the real text. Pins: CR 613.1f
// (layer 6), 613.4c (layer 7c), 613.8 (a "+N/+N" reads the keywords after layer 6, whatever the order on the battlefield), 611.3a (a static ability follows the board),
// 702.9a (flying).
import { type CardDefinition, getView } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const EAGLE = parsed(
  'SYNTHETIC Empyrean Eagle',
  'Creature — Bird',
  'Flying\nOther creatures you control with flying get +1/+1.',
  { manaCost: '{1}{W}', power: '2', toughness: '2' },
);
const WINDS = parsed(
  'SYNTHETIC Favorable Winds',
  'Enchantment',
  'Creatures you control with flying get +1/+1.',
  { manaCost: '{1}{U}' },
);
const SHIFT = parsed(
  'SYNTHETIC Gravitational Shift',
  'Enchantment',
  'Creatures with flying get +2/+0.\nCreatures without flying get -2/-0.',
  { manaCost: '{2}{U}' },
);
const WYVERN = parsed(
  'SYNTHETIC Thunderclap Wyvern',
  'Creature — Drake',
  'Flash\nFlying\nOther creatures you control with flying get +1/+1.',
  { manaCost: '{3}{W}{U}', power: '3', toughness: '3' },
);
const SKYCAT = parsed(
  'SYNTHETIC Skycat Sovereign',
  'Creature — Cat Bird',
  'Flying\nThis creature gets +1/+1 for each other creature you control with flying.\n{2}{W}{U}: Create a 1/1 white Cat Bird creature token with flying.',
  { manaCost: '{3}{W}', power: '1', toughness: '1' },
);
const BEAR = parsed('SYNTHETIC Ground Bear', 'Creature — Bear', '', {
  manaCost: '{1}',
  power: '2',
  toughness: '2',
});
const BIRD = parsed('SYNTHETIC Small Bird', 'Creature — Bird', 'Flying', {
  manaCost: '{1}',
  power: '1',
  toughness: '1',
});
const LORD = parsed(
  'SYNTHETIC Wing Lord',
  'Creature — Bird',
  'Creatures you control have flying.',
  { manaCost: '{1}', power: '1', toughness: '1' },
);
const GUST = parsed(
  'SYNTHETIC Gust',
  'Instant',
  'Target creature gains flying until end of turn.',
  { manaCost: '{U}' },
);

const FILLER = Array.from({ length: 10 }, () => 'Island');
const build = (cards: readonly CardDefinition[]) => {
  const b = scenario()
    .seat(0)
    .library(...FILLER);
  for (const card of cards) b.define(card);
  return b;
};

describe('Favorable Winds', () => {
  test('a Bird I control gets +1/+1, a Bear does not, nor does an opposing Bird (CR 613.4c)', () => {
    const b = build([WINDS, BEAR, BIRD]);
    b.seat(0).battlefield(WINDS.name).battlefield(BEAR.name, { label: 'bear' });
    b.battlefield(BIRD.name, { label: 'bird' });
    b.seat(1)
      .battlefield(BIRD.name, { label: 'foe' })
      .library(...FILLER);
    const g = b.at('precombatMain', { active: 0, turn: 1 }).build();
    g.expect.pt('bird', 2, 2);
    g.expect.pt('bear', 2, 2);
    g.expect.pt('foe', 1, 1);
    g.expect.invariants();
  });

  test('a Bear that has flying from a static ability that comes later on the battlefield gets it too (layer 6 before 7c)', () => {
    const b = build([WINDS, BEAR, LORD]);
    b.seat(0).battlefield(WINDS.name).battlefield(BEAR.name, { label: 'bear' });
    b.battlefield(LORD.name, { label: 'lord' });
    const g = b.at('precombatMain', { active: 0, turn: 1 }).build();
    g.expect.pt('bear', 3, 3);
    g.expect.pt('lord', 2, 2);
  });

  test('a Bear that gains flying until end of turn gets +1/+1 until it ends', () => {
    const b = build([WINDS, BEAR, GUST]);
    b.seat(0)
      .hand(GUST.name)
      .battlefield('Island')
      .battlefield(WINDS.name)
      .battlefield(BEAR.name, { label: 'bear' });
    const g = b.at('precombatMain', { active: 0, turn: 1 }).build();
    g.expect.pt('bear', 2, 2);
    g.act(0).cast(GUST.name, { targets: ['bear'], pay: true });
    g.passAll();
    g.expect.pt('bear', 3, 3);
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.pt('bear', 2, 2);
  });
});

describe('Empyrean Eagle and Thunderclap Wyvern: "Other creatures you control with flying get +1/+1."', () => {
  test.each([EAGLE, WYVERN])(
    '%s leaves itself out and pumps another flyer of mine only',
    (card) => {
      const b = build([card, BIRD, BEAR]);
      b.seat(0).battlefield(card.name, { label: 'lord' }).battlefield(BIRD.name, { label: 'bird' });
      b.battlefield(BEAR.name, { label: 'bear' });
      b.seat(1)
        .battlefield(BIRD.name, { label: 'foe' })
        .library(...FILLER);
      const g = b.at('precombatMain', { active: 0, turn: 1 }).build();
      const own = card === EAGLE ? 2 : 3;
      g.expect.pt('lord', own, own);
      g.expect.pt('bird', 2, 2);
      g.expect.pt('bear', 2, 2);
      g.expect.pt('foe', 1, 1);
    },
  );

  test('two of them pump each other', () => {
    const b = build([EAGLE]);
    b.seat(0).battlefield(EAGLE.name, { label: 'one' }).battlefield(EAGLE.name, { label: 'two' });
    const g = b.at('precombatMain', { active: 0, turn: 1 }).build();
    g.expect.pt('one', 3, 3);
    g.expect.pt('two', 3, 3);
  });
});

describe('Gravitational Shift', () => {
  test('flyers of both players get +2/+0, the others -2/-0', () => {
    const b = build([SHIFT, BEAR, BIRD]);
    b.seat(0).battlefield(SHIFT.name).battlefield(BEAR.name, { label: 'bear' });
    b.battlefield(BIRD.name, { label: 'bird' });
    b.seat(1)
      .battlefield(BIRD.name, { label: 'foe' })
      .battlefield(BEAR.name, { label: 'foeBear' })
      .library(...FILLER);
    const g = b.at('precombatMain', { active: 0, turn: 1 }).build();
    g.expect.pt('bird', 3, 1);
    g.expect.pt('foe', 3, 1);
    g.expect.pt('bear', 0, 2);
    g.expect.pt('foeBear', 0, 2);
  });

  test('a Bear that gains flying is no longer penalised and gets the bonus', () => {
    const b = build([SHIFT, BEAR, GUST]);
    b.seat(0)
      .hand(GUST.name)
      .battlefield('Island')
      .battlefield(SHIFT.name)
      .battlefield(BEAR.name, { label: 'bear' });
    const g = b.at('precombatMain', { active: 0, turn: 1 }).build();
    g.expect.pt('bear', 0, 2);
    g.act(0).cast(GUST.name, { targets: ['bear'], pay: true });
    g.passAll();
    g.expect.pt('bear', 4, 2);
  });
});

describe('Skycat Sovereign', () => {
  test('+1/+1 for each other flyer I control: a Bear, an opposing Bird and itself do not count', () => {
    const b = build([SKYCAT, BEAR, BIRD]);
    b.seat(0).battlefield(SKYCAT.name, { label: 'cat' }).battlefield(BEAR.name);
    b.battlefield(BIRD.name).battlefield(BIRD.name);
    b.seat(1)
      .battlefield(BIRD.name)
      .library(...FILLER);
    const g = b.at('precombatMain', { active: 0, turn: 1 }).build();
    g.expect.pt('cat', 3, 3);
  });

  test('the count follows the board: a Lord that gives every creature flying makes the Bear count (CR 611.3a)', () => {
    const b = build([SKYCAT, BEAR, LORD]);
    b.seat(0).battlefield(SKYCAT.name, { label: 'cat' }).battlefield(BEAR.name);
    const g1 = b.at('precombatMain', { active: 0, turn: 1 }).build();
    g1.expect.pt('cat', 1, 1);
    const c = build([SKYCAT, BEAR, LORD]);
    c.seat(0)
      .battlefield(SKYCAT.name, { label: 'cat' })
      .battlefield(BEAR.name)
      .battlefield(LORD.name);
    const g2 = c.at('precombatMain', { active: 0, turn: 1 }).build();
    g2.expect.pt('cat', 3, 3);
  });

  test('its activated ability makes a 1/1 Cat Bird token with flying, which it then counts (CR 111.1)', () => {
    const b = build([SKYCAT]);
    b.seat(0)
      .battlefield(SKYCAT.name, { label: 'cat' })
      .battlefield('Plains', 'Island', 'Plains', 'Island');
    const g = b.at('precombatMain', { active: 0, turn: 1 }).build();
    g.expect.pt('cat', 1, 1);
    g.expect.legal(0, { activate: 'cat' });
    g.act(0).activate('cat').pay();
    g.passAll();
    expect(getView(g.state, 0).battlefield.filter((o) => o.name === 'Cat Bird')).toHaveLength(1);
    g.expect.pt('cat', 2, 2);
  });
});
