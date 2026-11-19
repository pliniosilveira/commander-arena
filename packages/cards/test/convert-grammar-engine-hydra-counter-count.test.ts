// Primordial Hydra (Quandrix Unlimited deck): the REAL line "This creature has trample as long as it has ten or more +1/+1 counters on it." goes through the grammar and is played
// through applyAction. The card name, cost and type are SYNTHETIC stand-ins; only the ability line is the real text. Pins: CR 122.1 (counters), 611.3a (a static ability follows the
// board: the count is read each time), 613.1f (layer 6), 613.8 (counters belong to no layer), 702.19b (trample).
import type { CardDefinition } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

// `parsed` requires the whole text to lower with nothing unparsed: the card is supported.
const HYDRA = parsed(
  'SYNTHETIC Counter Hydra',
  'Creature — Hydra',
  '~ has trample as long as it has ten or more +1/+1 counters on it.\n{1}: Remove a +1/+1 counter from this creature.',
  { manaCost: '{G}{G}', power: '0', toughness: '0' },
);
const FEWER = parsed(
  'SYNTHETIC Counter Wurm',
  'Creature — Wurm',
  '~ has trample as long as it has two or fewer charge counters on it.',
  { manaCost: '{G}{G}', power: '2', toughness: '2' },
);
const FILLER = Array.from({ length: 10 }, () => 'Forest');
const build = (cards: readonly CardDefinition[]) => {
  const b = scenario()
    .seat(0)
    .library(...FILLER);
  for (const card of cards) b.define(card);
  return b;
};
const hydraWith = (n: number, extra: readonly CardDefinition[] = []) => {
  const b = build([HYDRA, ...extra]);
  b.seat(0).battlefield(HYDRA.name, { label: 'hydra', counters: { '+1/+1': n } });
  return b;
};

describe('"~ has trample as long as it has ten or more +1/+1 counters on it"', () => {
  test('ten counters give trample (CR 702.19b), nine do not', () => {
    const ten = hydraWith(10).at('precombatMain', { active: 0, turn: 1 }).build();
    ten.expect.derived('hydra', { keywords: ['trample'] });
    ten.expect.pt('hydra', 10, 10);
    const nine = hydraWith(9).at('precombatMain', { active: 0, turn: 1 }).build();
    nine.expect.derived('hydra', { keywords: [] });
    const twelve = hydraWith(12).at('precombatMain', { active: 0, turn: 1 }).build();
    twelve.expect.derived('hydra', { keywords: ['trample'] });
  });

  test('removing a counter takes trample away again (CR 611.3a)', () => {
    const b = hydraWith(10);
    b.seat(0).battlefield('Forest');
    const g = b.at('precombatMain', { active: 0, turn: 1 }).build();
    g.expect.derived('hydra', { keywords: ['trample'] });
    g.act(0).activate('hydra').pay();
    g.passAll();
    g.expect.pt('hydra', 9, 9);
    g.expect.derived('hydra', { keywords: [] });
  });

  test('"two or fewer" reads the other direction', () => {
    const b = build([FEWER]);
    b.seat(0)
      .battlefield(FEWER.name, { label: 'two', counters: { charge: 2 } })
      .battlefield(FEWER.name, { label: 'three', counters: { charge: 3 } });
    const g = b.at('precombatMain', { active: 0, turn: 1 }).build();
    g.expect.derived('two', { keywords: ['trample'] });
    g.expect.derived('three', { keywords: [] });
  });
});
