// The First Flight starter Commander decks, Warden of Evos Isle: "Creature spells with flying you cast cost {1} less to cast." (the real line from the golden corpus), its
// SYNTHETIC siblings ("without flying", other numbers, other types) and the near misses the grammar must not read. The engine runs what is lowered in
// convert-grammar-engine-first-flight-warden.test.ts. Pins: CR 118.7a (only generic mana), CR 601.2f (the cost is determined with the spell as it is on the stack), CR 702.9a (flying).
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { read as readFace } from './parser-p5-helpers';

const read = (text: string, type: Parameters<typeof readFace>[1] = 'creature') =>
  readFace(text, type);

const NOT_READ = (text: string) => {
  const parsed = read(text);
  expect(parsed.abilities, text).toEqual([]);
  expect(parsed.unparsed, text).toHaveLength(1);
};

const reduction = (spells: object, amount: number) => [
  { kind: 'static', static: { kind: 'costReduction', spells, amount } },
];

describe('"Creature spells with flying you cast cost {1} less to cast." (Warden of Evos Isle; CR 601.2f, 118.7a)', () => {
  test('the real line: the creature spells with flying of the controller', () => {
    const parsed = read('Creature spells with flying you cast cost {1} less to cast.');
    expect(parsed.unparsed).toEqual([]);
    expect(parsed.abilities).toEqual(
      reduction({ types: ['creature'], keywords: ['flying'], controller: 'you' }, 1),
    );
  });

  test('another amount and another keyword (SYNTHETIC)', () => {
    expect(read('Creature spells with flying you cast cost {2} less to cast.').abilities).toEqual(
      reduction({ types: ['creature'], keywords: ['flying'], controller: 'you' }, 2),
    );
    expect(read('Creature spells with haste you cast cost {1} less to cast.').abilities).toEqual(
      reduction({ types: ['creature'], keywords: ['haste'], controller: 'you' }, 1),
    );
  });

  test('"without flying" and a color before the type (SYNTHETIC)', () => {
    expect(
      read('Creature spells without flying you cast cost {1} less to cast.').abilities,
    ).toEqual(reduction({ types: ['creature'], notKeywords: ['flying'], controller: 'you' }, 1));
    expect(
      read('Blue creature spells with flying you cast cost {1} less to cast.').abilities,
    ).toEqual(
      reduction({ types: ['creature'], colors: ['U'], keywords: ['flying'], controller: 'you' }, 1),
    );
  });

  test('the real card face: flying and the reduction', () => {
    const parsed = read('Flying\nCreature spells with flying you cast cost {1} less to cast.');
    expect(parsed.unparsed).toEqual([]);
    expect(parsed.abilities).toHaveLength(2);
  });

  test.each([
    'Creature spells with flying you cast cost {1} less to cast',
    'Creature spells with flying cost {1} less to cast.',
    'Creature spells with flying your opponents cast cost {1} less to cast.',
    'Creature spells with flying you cast cost {W} less to cast.',
    'Creature spells with flying you cast cost {1} more to cast.',
    'Creature spells with flying or reach you cast cost {1} less to cast.',
    'Creature spells with flying and haste you cast cost {1} less to cast.',
    'Creature spells with flying and flash you cast cost {X} less to cast.',
    'Creature spells with unflying you cast cost {1} less to cast.',
    'Creature spells with flyingly you cast cost {1} less to cast.',
    'Creature spells you cast with flying cost {1} less to cast.',
  ])('is not read: %s', (text) => {
    NOT_READ(text);
  });
});
