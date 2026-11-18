// The First Flight starter Commander decks, the Jubilant Skybonder group (D-149): the REAL line `Creatures you control with flying have "Spells your opponents cast that target this
// creature cost {2} more to cast."` (CR 613.1f, 604.1: a static ability a group has; CR 601.2f, 601.2c: the tax is added to the cost after the targets are chosen) and the statement
// inside the quotation, with SYNTHETIC siblings and the near misses the grammar must not read. The engine runs what is lowered in
// convert-grammar-engine-first-flight-skybonder.test.ts, and the real card is read in full through `importCard` there.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { read as readFace } from './parser-p5-helpers';

const read = (text: string, type: Parameters<typeof readFace>[1] = 'creature') =>
  readFace(text, type);

const NOT_READ = (text: string, type: Parameters<typeof read>[1] = 'creature') => {
  const parsed = read(text, type);
  expect(parsed.abilities, text).toEqual([]);
  expect(parsed.unparsed, text).toHaveLength(1);
};

const tax = (amount: number) => ({
  kind: 'static',
  static: {
    kind: 'costIncrease',
    spells: { controller: 'opponent', targetsObject: { isSource: true } },
    amount,
  },
});

const flyers = (extra: object = {}) => ({
  kind: 'filter',
  filter: { types: ['creature'], keywords: ['flying'], ...extra },
});

describe('"Spells your opponents cast that target ~ cost {2} more to cast." (CR 601.2f, 601.2c)', () => {
  test('the line of a permanent: the engine`s cost increase on the spells that target it', () => {
    const parsed = read('Spells your opponents cast that target ~ cost {2} more to cast.');
    expect(parsed.unparsed).toEqual([]);
    expect(parsed.abilities).toEqual([tax(2)]);
  });

  test('another amount (SYNTHETIC)', () => {
    expect(
      read('Spells your opponents cast that target ~ cost {3} more to cast.').abilities,
    ).toEqual([tax(3)]);
  });

  test.each([
    'Spells your opponents cast that target ~ cost {2} more to cast',
    'Spells you cast that target ~ cost {2} more to cast.',
    'Spells that target ~ cost {2} more to cast.',
    'Spells your opponents cast that target ~ cost {2} less to cast.',
    'Spells your opponents cast that target ~ cost {X} more to cast.',
    'Spells your opponents cast that target ~ cost {W} more to cast.',
    'Spells your opponents cast that target ~ cost {2}{W} more to cast.',
    'Spells your opponents cast that target ~ cost {2} more to activate.',
    'Spells your opponents cast that target a creature cost {2} more to cast.',
    'Creature spells your opponents cast that target ~ cost {2} more to cast.',
    'Spells your opponents cast that target ~ cost {2} more to cast if you control a Wizard.',
  ])('near miss: %s', (text) => NOT_READ(text));
});

describe('a group that has the tax (Jubilant Skybonder, the real line; CR 613.1f, 604.1)', () => {
  const LINE =
    'Creatures you control with flying have "Spells your opponents cast that target ~ cost {2} more to cast."';

  test('the real line: each creature the controller has with flying has the cost increase', () => {
    const parsed = read(LINE);
    expect(parsed.unparsed).toEqual([]);
    expect(parsed.abilities).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'grantAbility',
          subject: flyers({ controller: 'you' }),
          ability: tax(2),
        },
      },
    ]);
  });

  test('another group and amount (SYNTHETIC)', () => {
    const parsed = read(
      'Other creatures you control with flying have "Spells your opponents cast that target ~ cost {1} more to cast."',
    );
    expect(parsed.unparsed).toEqual([]);
    expect(parsed.abilities).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'grantAbility',
          subject: { ...flyers({ controller: 'you' }), other: true },
          ability: tax(1),
        },
      },
    ]);
  });

  test('a group with no keyword (SYNTHETIC)', () => {
    const parsed = read(
      'Creatures you control have "Spells your opponents cast that target ~ cost {2} more to cast."',
    );
    expect(parsed.unparsed).toEqual([]);
  });

  test.each([
    // The quoted line is not the tax.
    'Creatures you control with flying have "Spells your opponents cast cost {2} more to cast."',
    'Creatures you control with flying have "Spells you cast that target ~ cost {2} more to cast."',
    'Creatures you control with flying have "Spells your opponents cast that target ~ cost {2} more to cast"',
    // The tax is read only as a quotation a group has, never as a granted ability of the pair or of an attached permanent.
    'Enchanted creature has "Spells your opponents cast that target ~ cost {2} more to cast."',
  ])('near miss: %s', (text) => NOT_READ(text));
});
