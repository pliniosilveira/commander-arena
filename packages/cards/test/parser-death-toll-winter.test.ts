// Death Toll deck: the delirium ability of Winter, Cynical Opportunist, read through the whole pipeline: "At the beginning of your end step, you may exile any number of cards from your
// graveyard with four or more card types among them. If you do, put a permanent card from among them onto the battlefield with a finality counter on it." The line is the real Oracle
// text; the near misses are what the grammar must not read. The engine runs what is lowered in convert-grammar-engine-death-toll-winter.test.ts (CR 205.2a, 608.2c, 608.2d, 122.6).
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { DECLARED_NEEDS } from '../src/convert/parser/index';
import { BLOCKED } from './blocked-features';
import { dropped, read, readAll, withoutFeature } from './parser-p5-helpers';

const PERMANENT = ['artifact', 'creature', 'enchantment', 'land', 'planeswalker', 'battle'].map(
  (t) => ({ types: [t] }),
);

const LINE =
  'At the beginning of your end step, you may exile any number of cards from your graveyard with four or more card types among them. If you do, put a permanent card from among them onto the battlefield with a finality counter on it.';

const exile = (types: number) => ({
  kind: 'moveToZone',
  objects: {
    kind: 'choose',
    filter: { zone: 'graveyard', controller: 'you' },
    anyNumber: true,
    optional: true,
    minCardTypes: types,
  },
  to: 'exile',
});

describe('the delirium ability of Winter', () => {
  test('the real line reads completely, as the exile of a set of cards with four card types and the put among them', () => {
    const parsed = readAll(LINE, 'creature');
    expect(parsed.abilities).toHaveLength(1);
    expect(parsed.abilities[0]).toEqual({
      kind: 'triggered',
      trigger: { kind: 'endStep', whose: 'you' },
      effect: {
        kind: 'sequence',
        effects: [
          exile(4),
          {
            kind: 'conditional',
            condition: { kind: 'didPrevious' },
            effect: {
              kind: 'moveToZone',
              objects: {
                kind: 'choose',
                filter: { anyOf: PERMANENT, zone: 'exile', controller: 'you' },
                fromMoved: true,
              },
              to: 'battlefield',
              controller: 'you',
              withCounters: { counter: 'finality', count: 1 },
            },
          },
        ],
      },
    });
  });

  test('with the ability word Delirium as printed', () => {
    const parsed = readAll(`Delirium — ${LINE}`, 'creature');
    expect(parsed.abilities).toHaveLength(1);
  });

  test('another number of card types and no counter read the same way', () => {
    const parsed = readAll(
      'At the beginning of your end step, you may exile any number of cards from your graveyard with three or more card types among them. If you do, put a permanent card from among them onto the battlefield.',
      'creature',
    );
    expect(JSON.stringify(parsed.abilities[0])).toContain('"minCardTypes":3');
    expect(JSON.stringify(parsed.abilities[0])).not.toContain('withCounters');
  });
});

describe('near misses are not read (never guessed)', () => {
  test.each([
    // Not an offer: the engine's answer "none" is the offer itself.
    [
      'At the beginning of your end step, exile any number of cards from your graveyard with four or more card types among them. If you do, put a permanent card from among them onto the battlefield.',
    ],
    // "From among them" after something that did not exile cards.
    [
      'At the beginning of your end step, you may put a permanent card from among them onto the battlefield.',
    ],
    [
      'At the beginning of your end step, mill a card. You may put a permanent card from among them onto the battlefield.',
    ],
    // Another place, another number.
    [
      'At the beginning of your end step, you may exile any number of cards from your graveyard with four or more card types among them. If you do, put a permanent card from among them into your hand.',
    ],
    [
      'At the beginning of your end step, you may exile any number of cards from your graveyard with four card types among them. If you do, put a permanent card from among them onto the battlefield.',
    ],
    [
      'At the beginning of your end step, you may exile any number of cards from an opponent’s graveyard with four or more card types among them. If you do, put a permanent card from among them onto the battlefield.',
    ],
  ])('%s', (line) => {
    expect(read(line, 'creature').unparsed).not.toEqual([]);
  });
});

describe('the line names the feature the engine lacks (D-068)', () => {
  test('without ability:chooseMinCardTypes', () => {
    const missing = withoutFeature('ability:chooseMinCardTypes', LINE, 'creature');
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain('ability:chooseMinCardTypes');
  });

  test('a blocked line leaves the face with no ability (never half-executed)', () => {
    BLOCKED.clear();
    BLOCKED.add('ability:chooseMinCardTypes');
    try {
      expect(read(LINE, 'creature').abilities).toEqual([]);
      expect(dropped(LINE, 'creature')).toMatchObject({ reason: 'notRunnable' });
    } finally {
      BLOCKED.clear();
    }
  });

  test('the feature is declared', () => {
    expect(DECLARED_NEEDS).toContain('ability:chooseMinCardTypes');
  });
});
