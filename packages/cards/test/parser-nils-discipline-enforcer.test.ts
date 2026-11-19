// Nils, Discipline Enforcer: the two lines the grammar read last. The first line of each block is the real Oracle text (the card is in the golden corpus); the others are
// SYNTHETIC siblings and the near misses the grammar must not read. The engine runs the whole card in convert-grammar-engine-nils-discipline-enforcer.test.ts.
// Pins: CR 115.1, 601.2c, 603.3d (one slot, at most one target of each player), CR 122.6 (counters), CR 508.1d, 508.1h (the cost of attacking), CR 122.1 (counters of any kind).
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { read } from './parser-p5-helpers';

const END = 'At the beginning of your end step, ';
const TAX =
  "Each creature with one or more counters on it can't attack you or planeswalkers you control unless its controller pays {X}, where X is the number of counters on that creature.";

const NOT_READ = (text: string) => {
  const parsed = read(text, 'creature');
  expect(parsed.abilities, text).toEqual([]);
  expect(parsed.unparsed, text).toHaveLength(1);
};

describe('"for each player, put a +1/+1 counter on up to one target creature that player controls" (CR 115.1, 601.2c, 122.6)', () => {
  test('the real line: one slot with at most one creature of each player, a counter on each', () => {
    const parsed = read(
      `${END}for each player, put a +1/+1 counter on up to one target creature that player controls.`,
      'creature',
    );
    expect(parsed.unparsed).toEqual([]);
    expect(parsed.abilities).toHaveLength(1);
    expect(parsed.abilities[0]).toMatchObject({
      kind: 'triggered',
      targets: [
        {
          id: 't1',
          what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
          anyNumber: true,
          differentControllers: true,
        },
      ],
      effect: { kind: 'addCounters', counter: '+1/+1' },
    });
  });

  test('another kind of counter and of permanent (SYNTHETIC)', () => {
    const parsed = read(
      `${END}for each player, put a -1/-1 counter on up to one target artifact that player controls.`,
      'creature',
    );
    expect(parsed.unparsed).toEqual([]);
  });

  test.each([
    'for each player, put a +1/+1 counter on target creature that player controls.',
    'for each player, put a +1/+1 counter on up to two target creatures that player controls.',
    'for each player, put two +1/+1 counters on up to one target creature that player controls.',
    'for each player, put a +1/+1 counter on up to one target creature.',
    'for each player, put a +1/+1 counter on up to one target creature you control.',
    'for each opponent, put a +1/+1 counter on up to one target creature that player controls.',
  ])('not read: %s', (line) => {
    NOT_READ(`${END}${line}`);
  });
});

describe('"Each creature with one or more counters on it can\'t attack you or planeswalkers you control unless its controller pays {X}" (CR 508.1d, 508.1h, 122.1)', () => {
  test('the real line: an attack tax of {1} for each counter, planeswalkers included', () => {
    const parsed = read(TAX, 'creature');
    expect(parsed.unparsed).toEqual([]);
    expect(parsed.abilities).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'attackTax',
          cost: [{ kind: 'mana', symbols: ['1'] }],
          planeswalkers: true,
          perCounter: true,
        },
      },
    ]);
  });

  test.each([
    TAX.replace('{X}', '{2}'),
    TAX.replace('or planeswalkers you control ', ''),
    TAX.replace('one or more counters', 'one or more +1/+1 counters'),
    TAX.replace('its controller', 'you'),
    TAX.replace("can't attack", "can't block"),
  ])('not read: %s', (line) => {
    NOT_READ(line);
  });
});
