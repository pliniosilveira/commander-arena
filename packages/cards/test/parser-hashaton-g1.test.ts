// The Hashaton deck, group 1 (issue 31, D-372 to D-374): the grammar reads a player's verbs joined by a bare comma, "to a player or planeswalker" for combat
// damage, and "you cycle or discard another card". The lines are the real Oracle text of the four cards (names replaced by ~), the nodes the grammar
// produces, siblings over other numbers and verbs, and the near misses a rule must not read (flagged, never half run). Every sibling is SYNTHETIC.
// The engine runs what is lowered in convert-grammar-engine-hashaton-g1.test.ts.
import { describe, expect, test } from 'vitest';
import { dropped, readAll } from './parser-p5-helpers';

const YOU = { kind: 'you' } as const;
const T1 = { kind: 'target', id: 't1' } as const;

describe("a player's verbs joined by commas (D-372, CR 608.2c)", () => {
  test('"You gain 2 life, draw two cards, then discard two cards." is one sequence in order', () => {
    const parsed = readAll('You gain 2 life, draw two cards, then discard two cards.', 'instant');
    expect(parsed.spell).toMatchObject({
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'gainLife', player: YOU, amount: 2 },
          { kind: 'draw', player: YOU, count: 2 },
          { kind: 'discard', player: YOU, count: 2 },
        ],
      },
    });
  });

  test('a target player: "sacrifices ..., discards a card, and loses 3 life"', () => {
    const parsed = readAll(
      'Target opponent sacrifices a creature or planeswalker of their choice, discards a card, and loses 3 life. You draw a card and gain 3 life.',
      'sorcery',
    );
    expect(parsed.spell).toMatchObject({
      effect: {
        kind: 'sequence',
        effects: [
          {
            kind: 'sacrifice',
            objects: {
              kind: 'choose',
              filter: { anyOf: [{ types: ['creature'] }, { types: ['planeswalker'] }] },
            },
            player: T1,
          },
          { kind: 'discard', player: T1, count: 1 },
          { kind: 'loseLife', player: T1, amount: 3 },
          { kind: 'draw', player: YOU, count: 1 },
          { kind: 'gainLife', player: YOU, amount: 3 },
        ],
      },
    });
  });

  test('siblings: two verbs with a comma, three with a comma and "and", the subject kept', () => {
    expect(
      readAll('Target opponent discards a card, loses 3 life.', 'sorcery').spell,
    ).toMatchObject({
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'discard', player: T1, count: 1 },
          { kind: 'loseLife', player: T1, amount: 3 },
        ],
      },
    });
    expect(
      readAll('Each opponent discards a card, loses 2 life, and mills two cards.', 'sorcery').spell,
    ).toMatchObject({
      effect: {
        kind: 'sequence',
        effects: [{ kind: 'discard' }, { kind: 'loseLife' }, { kind: 'mill' }],
      },
    });
  });

  test.each([
    // The verb after a comma agrees with the one subject of the list, and is a verb, not a new subject or a noun.
    ['You draw a card, discards a card.', 'discards a card.'],
    ['You draw a card, you discard a card.', 'you discard a card.'],
    ['Target opponent discards a card, discard a card.', 'discard a card.'],
    ['Target opponent discards a card, then.', 'then.'],
    ['Target opponent discards a card, and.', 'and.'],
  ])('"%s" is not read whole', (text, stoppedAt) => {
    const first = dropped(text, 'sorcery');
    expect(first.reason).toBe('unrecognised');
    expect(first.stoppedAt).toBe(stoppedAt);
  });
});

describe('combat damage "to a player or planeswalker" (D-373, CR 120.2a, 510.2)', () => {
  test('"Whenever ~ deals combat damage to a player or planeswalker, draw a card." is the engine\'s playerOrPlaneswalker', () => {
    const parsed = readAll(
      'Whenever ~ deals combat damage to a player or planeswalker, draw a card.',
      'creature',
    );
    expect(parsed.abilities[0]).toMatchObject({
      kind: 'triggered',
      trigger: {
        kind: 'dealsCombatDamage',
        what: { kind: 'this' },
        to: 'playerOrPlaneswalker',
      },
      effect: { kind: 'draw', player: YOU, count: 1 },
    });
  });

  test('another creature of yours, too', () => {
    const parsed = readAll(
      'Whenever a creature you control deals combat damage to a player or planeswalker, you gain 1 life.',
      'enchantment',
    );
    expect(parsed.abilities[0]).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'dealsCombatDamage', to: 'playerOrPlaneswalker' },
    });
  });

  test('"to a player" alone is still the player trigger, which has "that player"', () => {
    const parsed = readAll('Whenever ~ deals combat damage to a player, draw a card.', 'creature');
    expect(parsed.abilities[0]).toMatchObject({
      trigger: { kind: 'dealsCombatDamage', to: 'player' },
    });
  });

  test('"that player" after a hit that may have been a planeswalker is not read (it would have no meaning)', () => {
    const first = dropped(
      'Whenever ~ deals combat damage to a player or planeswalker, that player discards a card.',
      'creature',
    );
    expect(first.reason).not.toBeUndefined();
  });

  test.each([
    'Whenever ~ deals combat damage to a player or a planeswalker, draw a card.',
    'Whenever ~ deals combat damage to an opponent or planeswalker, draw a card.',
    'Whenever ~ deals combat damage to a creature or planeswalker, draw a card.',
    'Whenever ~ deals combat damage to a planeswalker or player, draw a card.',
  ])('"%s" is not read', (text) => {
    expect(dropped(text, 'creature').reason).toBe('unrecognised');
  });
});

describe('"you cycle or discard another card" (D-374, CR 702.29a, 702.29d, 701.9a)', () => {
  test('"another card" is the discarded trigger with `another`', () => {
    const parsed = readAll(
      'Whenever you cycle or discard another card, put a -1/-1 counter on each creature your opponents control.',
      'creature',
    );
    expect(parsed.abilities[0]).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'discarded', who: 'you', another: true },
      effect: {
        kind: 'addCounters',
        objects: { kind: 'each', filter: { types: ['creature'], controller: 'opponent' } },
        counter: '-1/-1',
        count: 1,
      },
    });
  });

  test('"a card" is the same trigger with no `another`', () => {
    const parsed = readAll('Whenever you cycle or discard a card, draw a card.', 'creature');
    const trigger = (parsed.abilities[0] as { trigger: Record<string, unknown> }).trigger;
    expect(trigger).toEqual({ kind: 'discarded', who: 'you' });
  });

  test('"you discard a card" is unchanged: no `another`', () => {
    const parsed = readAll('Whenever you discard a card, draw a card.', 'creature');
    const trigger = (parsed.abilities[0] as { trigger: Record<string, unknown> }).trigger;
    expect(trigger).toEqual({ kind: 'discarded', who: 'you' });
  });

  test.each([
    'Whenever you cycle or discard a creature card, draw a card.',
    'Whenever you cycle or discard one or more cards, draw a card.',
    'Whenever you cycle or discard another creature card, draw a card.',
    'Whenever an opponent cycles or discards a card, draw a card.',
    'Whenever you cycled or discarded another card, draw a card.',
  ])('"%s" is not read', (text) => {
    expect(dropped(text, 'creature').text).toContain('cycle');
  });
});
