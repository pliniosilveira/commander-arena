// Issue 104 (God-Pharaoh's Gift, The Scarab God): the grammar reads "you may exile a creature card from your graveyard. If you do, create a token that's a copy of that card, except it's a
// 4/4 black Zombie. It gains haste until end of turn." The lines are the real Oracle text of God-Pharaoh's Gift and The Scarab God (names replaced by ~); the siblings and the near misses
// are SYNTHETIC. The engine plays what is lowered in convert-grammar-engine-graveyard-copy.test.ts and in scenario-xx-graveyard-copy.test.ts (engine package).
import { describe, expect, test } from 'vitest';
import { dropped, readAll } from './parser-p5-helpers';

const GIFT =
  'At the beginning of combat on your turn, you may exile a creature card from your graveyard. If you do, create a token that’s a copy of that card, except it’s a 4/4 black Zombie. It gains haste until end of turn.';
const SCARAB_ACTIVATED =
  '{2}{U}{B}: Exile target creature card from a graveyard. Create a token that’s a copy of it, except it’s a 4/4 black Zombie.';

const ZOMBIE_COPY = (object: unknown) => ({
  kind: 'createToken',
  token: {
    kind: 'copyOf',
    object,
    setPt: { power: 4, toughness: 4 },
    setColors: ['B'],
    setCreatureTypes: ['Zombie'],
  },
  count: 1,
});

const OFFER = (types: readonly string[] | undefined) => ({
  kind: 'moveToZone',
  objects: {
    kind: 'choose',
    filter: { zone: 'graveyard', ...(types === undefined ? {} : { types }), controller: 'you' },
    optional: true,
  },
  to: 'exile',
});

describe('"you may exile a creature card from your graveyard. If you do, create a token that\'s a copy of that card, except it\'s a 4/4 black Zombie. It gains haste until end of turn."', () => {
  test("the real text of God-Pharaoh's Gift is the offer, the copy of the card moved if it was exiled, and the haste of the token", () => {
    expect(readAll(GIFT, 'artifact').abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'step', step: 'beginCombat', whose: 'you' },
        effect: {
          kind: 'sequence',
          effects: [
            OFFER(['creature']),
            {
              kind: 'conditional',
              condition: { kind: 'didPrevious' },
              effect: ZOMBIE_COPY({ kind: 'moved' }),
            },
            {
              kind: 'grantKeyword',
              objects: { kind: 'moved' },
              keyword: { kind: 'haste' },
              duration: 'untilEndOfTurn',
            },
          ],
        },
      },
    ]);
  });

  test('without the haste sentence the copy is the last instruction', () => {
    const text = GIFT.replace(' It gains haste until end of turn.', '');
    const [ability] = readAll(text, 'artifact').abilities;
    expect(JSON.stringify(ability)).not.toContain('grantKeyword');
    expect(JSON.stringify(ability)).toContain('"copyOf"');
  });

  test('another kind of card and another instruction after "If you do" are read the same way (SYNTHETIC siblings)', () => {
    const [ability] = readAll(
      'At the beginning of combat on your turn, you may exile an artifact card from your graveyard. If you do, draw a card.',
      'artifact',
    ).abilities;
    expect(ability).toEqual({
      kind: 'triggered',
      trigger: { kind: 'step', step: 'beginCombat', whose: 'you' },
      effect: {
        kind: 'sequence',
        effects: [
          OFFER(['artifact']),
          {
            kind: 'conditional',
            condition: { kind: 'didPrevious' },
            effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
          },
        ],
      },
    });
  });

  test('a copy of a target keeps "It gains haste" on the token, not on the target (SYNTHETIC)', () => {
    const [ability] = readAll(
      'At the beginning of combat on your turn, create a token that’s a copy of target creature, except it’s a 4/4 black Zombie. It gains haste until end of turn.',
      'artifact',
    ).abilities;
    expect(JSON.stringify(ability)).toContain(
      '{"kind":"grantKeyword","objects":{"kind":"moved"},"keyword":{"kind":"haste"}',
    );
  });

  test.each([
    // Any graveyard, more than one card, a card of the hand: another statement.
    'At the beginning of combat on your turn, you may exile a creature card from a graveyard. If you do, create a token that’s a copy of that card, except it’s a 4/4 black Zombie.',
    'At the beginning of combat on your turn, you may exile two creature cards from your graveyard. If you do, create a token that’s a copy of that card, except it’s a 4/4 black Zombie.',
    'At the beginning of combat on your turn, you may exile a creature card from your hand. If you do, create a token that’s a copy of that card, except it’s a 4/4 black Zombie.',
  ])('is not read: %s', (text) => {
    expect(dropped(text, 'artifact').reason).toBeDefined();
  });
});

describe('"{2}{U}{B}: Exile target creature card from a graveyard. Create a token that\'s a copy of it, except it\'s a 4/4 black Zombie."', () => {
  test('the real text of The Scarab God is the exile of the target and the copy of it', () => {
    expect(readAll(SCARAB_ACTIVATED, 'creature', ['Zombie', 'God']).abilities).toEqual([
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['2', 'U', 'B'] }],
        targets: [
          {
            id: 't1',
            what: { kind: 'object', filter: { zone: 'graveyard', types: ['creature'] } },
          },
        ],
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'exile', objects: { kind: 'target', id: 't1' } },
            ZOMBIE_COPY({ kind: 'target', id: 't1' }),
          ],
        },
      },
    ]);
  });

  test('the upkeep ability reads the Zombies you control', () => {
    const [ability] = readAll(
      'At the beginning of your upkeep, each opponent loses X life and you scry X, where X is the number of Zombies you control.',
      'creature',
      ['Zombie', 'God'],
    ).abilities;
    expect(ability).toEqual({
      kind: 'triggered',
      trigger: { kind: 'upkeep', whose: 'you' },
      effect: {
        kind: 'sequence',
        effects: [
          {
            kind: 'loseLife',
            player: { kind: 'eachOpponent' },
            amount: { kind: 'countOf', filter: { subtypes: ['Zombie'], controller: 'you' } },
          },
          {
            kind: 'scry',
            count: { kind: 'countOf', filter: { subtypes: ['Zombie'], controller: 'you' } },
          },
        ],
      },
    });
  });
});
