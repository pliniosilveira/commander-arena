// Counting phrases and amounts (issue 104, the Zombie deck): the lines of Corpse Augur, Rot Hulk and Prophet of the Scarab, and the near misses the grammar must not read. The real
// lines are the Oracle text of cards of the golden corpus; the other lines are SYNTHETIC siblings. The engine runs what is lowered in convert-grammar-engine-counting.test.ts.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { read, readAll, withoutFeature } from './parser-p5-helpers';

const ZOMBIES_YOU_CONTROL = { subtypes: ['Zombie'], controller: 'you' };
const ZOMBIE_CARDS_IN_YOUR_GRAVEYARD = {
  zone: 'graveyard',
  subtypes: ['Zombie'],
  controller: 'you',
};

describe('"..., whichever is greater" (CR 608.2c): the greater of two amounts', () => {
  test('the real line of Prophet of the Scarab', () => {
    expect(
      readAll(
        'When ~ enters, draw cards equal to the number of Zombies you control or the number of Zombie cards in your graveyard, whichever is greater.',
        'creature',
      ).abilities,
    ).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: {
          kind: 'draw',
          player: { kind: 'you' },
          count: {
            kind: 'extreme',
            pick: 'greater',
            of: [
              { kind: 'countOf', filter: ZOMBIES_YOU_CONTROL },
              { kind: 'countOf', filter: ZOMBIE_CARDS_IN_YOUR_GRAVEYARD },
            ],
          },
        },
      },
    ]);
  });

  test('"whichever is less" is the lesser (SYNTHETIC)', () => {
    expect(
      readAll(
        'When ~ enters, you gain life equal to the number of creatures you control or the number of cards in your hand, whichever is less.',
        'creature',
      ).abilities,
    ).toMatchObject([
      {
        effect: {
          kind: 'gainLife',
          amount: {
            kind: 'extreme',
            pick: 'lesser',
            of: [{ kind: 'countOf' }, { kind: 'countOf' }],
          },
        },
      },
    ]);
  });

  test('a sum on one side is one of the two amounts (SYNTHETIC)', () => {
    expect(
      readAll(
        'When ~ enters, draw cards equal to the number of lands you control plus the number of artifacts you control or the number of cards in your hand, whichever is greater.',
        'creature',
      ).abilities,
    ).toMatchObject([
      {
        effect: {
          count: {
            kind: 'extreme',
            pick: 'greater',
            of: [
              { kind: 'sum', of: [{ kind: 'countOf' }, { kind: 'countOf' }] },
              { kind: 'countOf' },
            ],
          },
        },
      },
    ]);
  });

  test.each([
    // No "whichever" clause: an "or" alone chooses between things, not numbers.
    'When ~ enters, draw cards equal to the number of Zombies you control or the number of Zombie cards in your graveyard.',
    'When ~ enters, draw cards equal to the number of Zombies you control or the number of Zombie cards in your graveyard, whichever is smaller.',
    'When ~ enters, draw cards equal to the number of Zombies you control, whichever is greater.',
  ])('not read: %s', (text) => {
    const parsed = read(text, 'creature');
    expect(parsed.abilities, text).toEqual([]);
    expect(parsed.unparsed, text).toHaveLength(1);
  });

  test('a card whose engine lacks the amount is not supported, never run half (CR 608.2c)', () => {
    expect(
      withoutFeature(
        'amount:extreme',
        'When ~ enters, draw cards equal to the number of Zombies you control or the number of Zombie cards in your graveyard, whichever is greater.',
      ).needs,
    ).toContain('amount:extreme');
  });
});

describe('"..., where X is the number of creature cards in target player\'s graveyard" (CR 115.1, 603.3d, 107.3c)', () => {
  test('the real line of Corpse Augur: one target player, counted as the ability resolves', () => {
    const counted = {
      kind: 'countOf',
      filter: { zone: 'graveyard', types: ['creature'], owner: { kind: 'target', id: 't1' } },
    };
    expect(
      readAll(
        'When ~ dies, you draw X cards and you lose X life, where X is the number of creature cards in target player’s graveyard.',
        'creature',
      ).abilities,
    ).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'dies', what: { kind: 'this' } },
        targets: [{ id: 't1', what: { kind: 'player', filter: 'any' } }],
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'draw', player: { kind: 'you' }, count: counted },
            { kind: 'loseLife', player: { kind: 'you' }, amount: counted },
          ],
        },
      },
    ]);
  });

  test('"target opponent\'s graveyard" names an opponent (SYNTHETIC)', () => {
    expect(
      readAll(
        'When ~ enters, you gain X life, where X is the number of cards in target opponent’s graveyard.',
        'creature',
      ).abilities,
    ).toMatchObject([
      {
        targets: [{ id: 't1', what: { kind: 'player', filter: 'opponent' } }],
        effect: {
          kind: 'gainLife',
          amount: {
            kind: 'countOf',
            filter: { zone: 'graveyard', owner: { kind: 'target', id: 't1' } },
          },
        },
      },
    ]);
  });

  test.each([
    'When ~ dies, you draw X cards, where X is the number of creature cards in target opponents’ graveyard.',
    'When ~ dies, you draw X cards, where X is the number of creature cards in target creature’s graveyard.',
    'When ~ dies, you draw X cards, where X is the number of creature cards in target player’s library.',
  ])('not read: %s', (text) => {
    expect(read(text, 'creature').abilities, text).toEqual([]);
  });
});

describe('"up to X target ... cards from your graveyard, where X is the number of opponents you have" (CR 107.3c, 603.3d, 102.2)', () => {
  test('the real line of Rot Hulk: up to as many targets as the opponents you have', () => {
    expect(
      readAll(
        'When ~ enters, return up to X target Zombie cards from your graveyard to the battlefield, where X is the number of opponents you have.',
        'creature',
      ).abilities,
    ).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        targets: [
          {
            id: 't1',
            what: { kind: 'object', filter: ZOMBIE_CARDS_IN_YOUR_GRAVEYARD },
            upToAmount: { kind: 'opponentCount' },
          },
        ],
        effect: {
          kind: 'moveToZone',
          objects: { kind: 'target', id: 't1' },
          to: 'battlefield',
          controller: 'you',
        },
      },
    ]);
  });

  test('another amount defines the X (SYNTHETIC)', () => {
    expect(
      readAll(
        'When ~ enters, return up to X target creature cards from your graveyard to the battlefield, where X is the number of lands you control.',
        'creature',
      ).abilities,
    ).toMatchObject([
      {
        targets: [
          { upToAmount: { kind: 'countOf', filter: { types: ['land'], controller: 'you' } } },
        ],
      },
    ]);
  });

  test.each([
    // X is not defined by the text: it would be the X of a spell, which a triggered ability does not announce.
    'When ~ enters, return up to X target Zombie cards from your graveyard to the battlefield.',
    // Not a triggered ability's number of targets read as it triggers.
    'When ~ enters, return up to X target Zombie cards from a graveyard to the battlefield, where X is the number of opponents you have.',
    'When ~ enters, return up to X target Zombie card from your graveyard to the battlefield, where X is the number of opponents you have.',
    'When ~ enters, return up to X target Zombie cards from your graveyard to the battlefield, where X is the number of opponents.',
  ])('not read: %s', (text) => {
    expect(read(text, 'creature').abilities, text).toEqual([]);
  });

  test('a spell\'s "up to X" is not read (the X of a spell is the announced X, D-386)', () => {
    expect(
      read(
        'Return up to X target Zombie cards from your graveyard to the battlefield, where X is the number of opponents you have.',
        'sorcery',
      ).abilities,
    ).toEqual([]);
  });

  test('the engine lacks the target count: not supported', () => {
    expect(
      withoutFeature(
        'selector:upToAmount',
        'When ~ enters, return up to X target Zombie cards from your graveyard to the battlefield, where X is the number of opponents you have.',
      ).needs,
    ).toContain('selector:upToAmount');
  });
});
