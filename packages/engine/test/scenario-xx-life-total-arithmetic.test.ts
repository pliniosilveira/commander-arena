import { expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const SPELL = 'SYNTHETIC Life Total Arithmetic';

test('life totals are read as each instruction resolves, with half rounded up', () => {
  const definition = syntheticCard(SPELL);
  expect(validateCard(definition)).toEqual([]);

  const g = scenario()
    .seat(0)
    .life(7)
    .hand(SPELL)
    .battlefield('Plains', 'Swamp', 'Swamp')
    .seat(1)
    .life(5)
    .library('Plains')
    .build();

  g.act(0).cast(SPELL, { targets: [{ player: 1 }], pay: true });
  g.passAll();

  g.expect.life(0, 14);
  g.expect.life(1, 2);
  g.expect.invariants();
});

test('life-gain replacements still apply to the gain that sets a higher total', () => {
  const g = scenario()
    .seat(0)
    .life(7)
    .hand(SPELL)
    .battlefield('Plains', 'Swamp', 'Swamp', 'SYNTHETIC Doubling Angel')
    .seat(1)
    .life(5)
    .library('Plains')
    .build();

  g.act(0).cast(SPELL, { targets: [{ player: 1 }], pay: true });
  g.passAll();

  g.expect.life(0, 21);
  g.expect.life(1, 2);
  g.expect.invariants();
});
