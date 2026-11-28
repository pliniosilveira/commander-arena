// The Peace Offering deck (issue 112), the gift group: the lines of Jolly Gerbils, Octomancer and Perch Protection. The first line of each block is the real Oracle
// text of the acceptance cards of the golden corpus (reminder text dropped, as the pipeline drops it); the others are SYNTHETIC siblings and near misses. The engine
// runs what is lowered in convert-grammar-engine-peace-offering-gift.test.ts. Pins: CR 702.174c (giving a gift), CR 702.174g (an extra turn), CR 702.174i (an Octopus),
// CR 707.2 (a copy), CR 400.7 (entered this turn).
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { DECLARED_NEEDS } from '../src/convert/parser/index';
import { read, readAll, withoutFeature } from './parser-p5-helpers';

describe('Jolly Gerbils: "Whenever you give a gift, draw a card." (CR 702.174c)', () => {
  test('the real line: the engine trigger `givesGift` of the controller', () => {
    expect(readAll('Whenever you give a gift, draw a card.', 'creature').abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'givesGift', who: 'you' },
        effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
      },
    ]);
  });

  test.each([
    ['Whenever an opponent gives a gift, you gain 1 life.', 'opponent'],
    ['Whenever a player gives a gift, you gain 1 life.', 'any'],
  ])('another player (SYNTHETIC): %s', (text, who) => {
    expect(readAll(text, 'enchantment').abilities[0]).toMatchObject({
      trigger: { kind: 'givesGift', who },
    });
  });

  test('the lowering needs the engine trigger: without it the line is dropped as not runnable', () => {
    const missing = withoutFeature('trigger:givesGift', 'Whenever you give a gift, draw a card.');
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain('trigger:givesGift');
    expect(DECLARED_NEEDS).toContain('trigger:givesGift');
  });

  test.each([
    'Whenever you gave a gift, draw a card.',
    'Whenever you give a gift card, draw a card.',
    'Whenever you give two gifts, draw a card.',
  ])('not read (SYNTHETIC): %s', (text) => {
    expect(read(text, 'creature').unparsed).toHaveLength(1);
  });
});

describe('the Gift keyword: "Gift an Octopus" and "Gift an extra turn" (CR 702.174g, 702.174i)', () => {
  test.each([
    ['Gift an Octopus', 'octopus'],
    ['Gift an extra turn', 'extraTurn'],
  ])('%s', (text, gift) => {
    expect(readAll(text, 'creature').abilities).toEqual([
      { kind: 'keyword', keyword: { kind: 'gift', gift } },
    ]);
  });

  test.each(['Gift a Food', 'Gift a Treasure', 'Gift two extra turns'])('not read: %s', (text) => {
    expect(read(text, 'creature').unparsed).toHaveLength(1);
  });
});

describe('Octomancer: "At the beginning of each end step, create a token that\'s a copy of target creature token that entered the battlefield this turn."', () => {
  const TOKEN_ENTERED = {
    zone: 'battlefield',
    types: ['creature'],
    token: true,
    enteredThisTurn: true,
  } as const;

  test('the real line: each end step, a copy of one target creature token that entered this turn', () => {
    const line =
      "At the beginning of each end step, create a token that's a copy of target creature token that entered the battlefield this turn.";
    expect(readAll(line, 'creature').abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'endStep', whose: 'each' },
        targets: [{ id: 't1', what: { kind: 'object', filter: TOKEN_ENTERED } }],
        effect: {
          kind: 'createToken',
          token: { kind: 'copyOf', object: { kind: 'target', id: 't1' } },
          count: 1,
        },
      },
    ]);
  });

  test('"that entered this turn" is the same filter (SYNTHETIC)', () => {
    const line =
      "At the beginning of your end step, create a token that's a copy of target creature token that entered this turn.";
    expect(readAll(line, 'creature').abilities[0]).toMatchObject({
      targets: [{ id: 't1', what: { kind: 'object', filter: TOKEN_ENTERED } }],
    });
  });

  test('a copy of a target creature token with no other words (SYNTHETIC)', () => {
    const line = "Create a token that's a copy of target creature token.";
    expect(readAll(line).spell?.targets).toEqual([
      {
        id: 't1',
        what: {
          kind: 'object',
          filter: { zone: 'battlefield', types: ['creature'], token: true },
        },
      },
    ]);
  });

  test.each([
    "At the beginning of each end step, create a token that's a copy of target creature tokens that entered this turn.",
    "At the beginning of each end step, create a token that's a copy of target creature token that entered last turn.",
  ])('not read (SYNTHETIC): %s', (text) => {
    expect(read(text, 'creature').unparsed).toHaveLength(1);
  });
});
