// Stage P69 (D-256, D-257): the Bruna deck program (issue 5), the cards that read the life they gained. The lines are the real Oracle text of the acceptance cards of
// the golden corpus, with the nodes the grammar produces; the other lines are SYNTHETIC siblings and the near misses the grammar must not read.
import { describe, expect, test } from 'vitest';
import { dropped, read, readAll } from './parser-p5-helpers';

const YOU = { kind: 'you' } as const;

describe('"that many" of a life gain trigger and "Do this only once each turn" (D-256)', () => {
  test('Nykthos Paragon', () => {
    const parsed = readAll(
      'Whenever you gain life, you may put that many +1/+1 counters on each creature you control. Do this only once each turn.',
      'creature',
    );
    expect(parsed.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'lifeGained', who: 'you' },
        effect: {
          kind: 'addCounters',
          objects: {
            kind: 'each',
            filter: { zone: 'battlefield', types: ['creature'], controller: 'you' },
          },
          counter: '+1/+1',
          count: { kind: 'triggerDamage' },
        },
        optional: true,
        doOnlyOnceEachTurn: true,
      },
    ]);
  });

  test('without "you may" and "Do this only once each turn" (SYNTHETIC)', () => {
    const parsed = readAll(
      'Whenever you gain life, put that many +1/+1 counters on ~.',
      'creature',
    );
    expect(parsed.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'lifeGained', who: 'you' },
        effect: {
          kind: 'addCounters',
          objects: { kind: 'this' },
          counter: '+1/+1',
          count: { kind: 'triggerDamage' },
        },
      },
    ]);
  });

  test('"This ability triggers only once each turn" stays the other limit (SYNTHETIC)', () => {
    const parsed = readAll(
      'Whenever you gain life, put that many +1/+1 counters on ~. This ability triggers only once each turn.',
      'creature',
    );
    expect(parsed.abilities).toMatchObject([{ oncePerTurn: true }]);
    expect(JSON.stringify(parsed.abilities)).not.toContain('doOnlyOnceEachTurn');
  });

  test('"that many" is the life gained for a gain by anyone too (SYNTHETIC)', () => {
    const parsed = readAll(
      'Whenever an opponent gains life, put that many +1/+1 counters on ~.',
      'creature',
    );
    expect(JSON.stringify(parsed.abilities)).toContain('"triggerDamage"');
  });

  test('the near misses are not read (SYNTHETIC)', () => {
    // "that many" in another trigger has nothing it counts
    expect(
      dropped('Whenever ~ dies, put that many +1/+1 counters on target creature.', 'creature')
        .reason,
    ).toBeDefined();
    // the limit is the last sentence, and a spell has no ability to limit
    expect(
      dropped(
        'Whenever you gain life, you may put that many +1/+1 counters on ~. Do this only once each turn. You gain 1 life.',
        'creature',
      ).reason,
    ).toBeDefined();
    expect(dropped('Do this only once each turn.', 'instant').reason).toBeDefined();
    // a number is not "that many"
    expect(
      dropped('Whenever you gain life, put that much +1/+1 counters on ~.', 'creature').reason,
    ).toBeDefined();
  });

  test('"that many" still counts what a sacrifice did in a life gain trigger (SYNTHETIC)', () => {
    const parsed = readAll(
      'Whenever you gain life, sacrifice a creature, then draw that many cards.',
      'enchantment',
    );
    expect(JSON.stringify(parsed.abilities)).toContain('"thisWay"');
    expect(JSON.stringify(parsed.abilities)).not.toContain('triggerDamage');
  });

  test('"that many" after any earlier quantity of the body is not the life gained (SYNTHETIC)', () => {
    // Each of these gave "that many" a different meaning (the life gained) than the text has (the cards milled, the card discarded).
    for (const text of [
      'Whenever you gain life, mill two cards, then draw that many cards.',
      'Whenever you gain life, you may discard a card. If you do, draw that many cards.',
      'Whenever you gain life, draw a card, then put that many +1/+1 counters on ~.',
      'Whenever you gain life, you gain 2 life. Put that many +1/+1 counters on ~.',
      'Whenever you gain life, put a +1/+1 counter on ~ and draw that many cards.',
    ]) {
      const parsed = read(text, 'creature');
      expect(JSON.stringify(parsed.abilities), text).not.toContain('triggerDamage');
    }
  });
});

describe('"you may pay {X}, where X is less than or equal to the amount of life you gained" (D-257)', () => {
  test('Well of Lost Dreams', () => {
    const parsed = readAll(
      'Whenever you gain life, you may pay {X}, where X is less than or equal to the amount of life you gained. If you do, draw X cards.',
      'artifact',
    );
    expect(parsed.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'lifeGained', who: 'you' },
        effect: {
          kind: 'payAnyAmount',
          symbol: '1',
          atMost: { kind: 'triggerDamage' },
          ifPaid: { kind: 'draw', player: YOU, count: { kind: 'x' } },
        },
      },
    ]);
  });

  test('what it buys is the sentence after it (SYNTHETIC: a Treasure-less one, gain X life)', () => {
    const parsed = readAll(
      'Whenever you gain life, you may pay {X}, where X is less than or equal to the amount of life you gained. If you do, you gain X life.',
      'artifact',
    );
    expect(parsed.abilities).toMatchObject([
      { effect: { kind: 'payAnyAmount', ifPaid: { kind: 'gainLife', amount: { kind: 'x' } } } },
    ]);
  });

  test('the near misses are not read (SYNTHETIC)', () => {
    const text = (offer: string, buys = 'If you do, draw X cards.') =>
      `Whenever you gain life, ${offer} ${buys}`;
    const offer =
      'you may pay {X}, where X is less than or equal to the amount of life you gained.';
    // no "If you do"
    expect(dropped(`Whenever you gain life, ${offer}`, 'artifact').reason).toBeDefined();
    // what it buys does not read X
    expect(dropped(text(offer, 'If you do, draw a card.'), 'artifact').reason).toBeDefined();
    // not a life gain trigger: nothing says what "the amount of life you gained" is
    expect(
      dropped(`Whenever ~ is dealt damage, ${offer} If you do, draw X cards.`, 'artifact').reason,
    ).toBeDefined();
    // a payment that is not offered
    expect(
      dropped(
        'Whenever you gain life, pay {X}, where X is less than or equal to the amount of life you gained. If you do, draw X cards.',
        'artifact',
      ).reason,
    ).toBeDefined();
    // another amount than the life gained
    expect(
      dropped(
        'Whenever you gain life, you may pay {X}, where X is less than or equal to the amount of life you lost. If you do, draw X cards.',
        'artifact',
      ).reason,
    ).toBeDefined();
  });
});
