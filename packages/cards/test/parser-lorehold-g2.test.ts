// The Lorehold Spirit deck (issue 86), group 2 (D-618 and later, provisional): the lines of Fateful Tempest and Quintorius, Loremaster. The real lines are the Oracle text of the
// acceptance cards of the golden corpus read through the whole pipeline; the other lines are SYNTHETIC siblings and the near misses the grammar must not read. The engine runs what is
// lowered in convert-grammar-engine-lorehold-g2.test.ts.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { readAll as readAllFace, read as readFace } from './parser-p5-helpers';

type Type = Parameters<typeof readFace>[1];

const read = (text: string, type: Type = 'sorcery') => readFace(text, type);
const readAll = (text: string, type: Type = 'sorcery') => readAllFace(text, type);

const NOT_READ = (text: string, type: Type = 'sorcery') => {
  const parsed = read(text, type);
  expect(parsed.abilities, text).toEqual([]);
  expect(parsed.spell, text).toBeFalsy();
  expect(parsed.unparsed, text).toHaveLength(1);
};

const YOU = { kind: 'you' } as const;
const VOTE = { kind: 'vote', options: ['past', 'present'], startingWith: 'you' } as const;
const PAST = { kind: 'votesFor', option: 'past' } as const;
const PRESENT = { kind: 'votesFor', option: 'present' } as const;
const MILLED_VALUE = { kind: 'thisWay', what: 'milledValue' } as const;
const EACH_OPPONENT = { kind: 'eachOpponent' } as const;

describe('the votes counted by "for each": "You mill a card for each past vote" (CR 701.38a, 701.38b, 608.2c)', () => {
  test('the real text of Fateful Tempest: the vote, the mill, the damage, the exile and the permission to play', () => {
    expect(
      readAll(
        'Starting with you, each player votes for past or present. You mill a card for each past vote, then ~ deals damage to each opponent equal to the total mana value of cards milled this way. Exile the top card of your library for each present vote. Until the end of your next turn, you may play the exiled cards.',
      ).spell,
    ).toEqual({
      effect: {
        kind: 'sequence',
        effects: [
          VOTE,
          { kind: 'mill', player: YOU, count: PAST },
          { kind: 'dealDamage', amount: MILLED_VALUE, to: EACH_OPPONENT },
          { kind: 'exileTop', count: PRESENT },
          { kind: 'mayPlay', objects: { kind: 'moved' }, lasts: 'endOfYourNextTurn' },
        ],
      },
    });
  });

  test('another option and another number of cards (SYNTHETIC)', () => {
    expect(
      readAll(
        'Starting with you, each player votes for gold, iron or ash. You mill two cards for each ash vote. Exile the top card of your library for each gold vote.',
      ).spell,
    ).toEqual({
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'vote', options: ['gold', 'iron', 'ash'], startingWith: 'you' },
          {
            kind: 'mill',
            player: YOU,
            count: { kind: 'multiple', factor: 2, of: { kind: 'votesFor', option: 'ash' } },
          },
          { kind: 'exileTop', count: { kind: 'votesFor', option: 'gold' } },
        ],
      },
    });
  });

  test('exiling the top cards for each vote: a number of cards for each vote multiplies it (SYNTHETIC)', () => {
    expect(
      readAll(
        'Starting with you, each player votes for past or present. Exile the top two cards of your library for each present vote.',
      ).spell,
    ).toMatchObject({
      effect: {
        effects: [
          VOTE,
          {
            kind: 'exileTop',
            count: { kind: 'multiple', factor: 2, of: PRESENT },
          },
        ],
      },
    });
  });

  test('"for each ... vote" reads the votes of the vote before it (the engine refuses one with no vote or another option)', () => {
    expect(readAll('You mill a card for each past vote.').spell).toEqual({
      effect: { kind: 'mill', player: YOU, count: PAST },
    });
  });

  test.each([
    'You mill a card for each vote.',
    'You mill a card for each past votes.',
    'You mill a card for each Past vote.',
    'You mill a card for each extra vote.',
    'You mill a card for each player vote.',
    'You mill a card for each past or present vote.',
    'You mill a card for every past vote.',
    'Exile the top X cards of your library for each present vote.',
    'Exile the top card of your library for each vote.',
  ])('near miss: %s', (text) => {
    NOT_READ(text);
  });
});

describe('damage to each opponent for the milled value (CR 120.3, 202.3, 608.2c)', () => {
  test('"equal to the total mana value of cards milled this way" after a mill reads as the milled value', () => {
    expect(
      readAll(
        'Mill three cards, then ~ deals damage to each opponent equal to the total mana value of the cards milled this way.',
      ).spell,
    ).toEqual({
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'mill', player: YOU, count: 3 },
          { kind: 'dealDamage', amount: MILLED_VALUE, to: EACH_OPPONENT },
        ],
      },
    });
  });

  test('"those cards" is the same count and now reaches each opponent too', () => {
    expect(
      readAll(
        'Mill three cards, then ~ deals damage to each opponent equal to the total mana value of those cards.',
      ).spell,
    ).toMatchObject({
      effect: { effects: [{ kind: 'mill' }, { kind: 'dealDamage', to: EACH_OPPONENT }] },
    });
  });

  test.each([
    // The cards of no mill before it.
    '~ deals damage to each opponent equal to the total mana value of cards milled this way.',
    // A count would be counted again for each opponent: not read.
    'Mill three cards, then ~ deals damage to each opponent equal to the number of cards in your hand.',
    'Mill three cards, then ~ deals damage to each opponent equal to the total mana value of cards exiled this way.',
    'Mill three cards, then ~ deals damage to each player equal to the total mana value of cards milled this way.',
    'Mill three cards, then ~ deals damage to each creature equal to the total mana value of cards milled this way.',
    'Mill three cards, then ~ deals damage to each opponent equal to the total mana value of cards milled.',
  ])('near miss: %s', (text) => {
    NOT_READ(text);
  });
});

describe('"exile target noncreature, nonland card from your graveyard" (CR 404.1, 115.1, 205.2a)', () => {
  test('a card of your graveyard that is none of the two types', () => {
    expect(
      readAll(
        'At the beginning of your end step, exile target noncreature, nonland card from your graveyard.',
        'creature',
      ).abilities,
    ).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'endStep', whose: 'you' },
        targets: [
          {
            id: 't1',
            what: {
              kind: 'object',
              filter: { zone: 'graveyard', notTypes: ['creature', 'land'], controller: 'you' },
            },
          },
        ],
        effect: { kind: 'exile', objects: { kind: 'target', id: 't1' } },
      },
    ]);
  });

  test('one "non" word is read as well (SYNTHETIC)', () => {
    expect(readAll('Exile target nonland card from your graveyard.').spell).toMatchObject({
      targets: [{ what: { filter: { zone: 'graveyard', notTypes: ['land'], controller: 'you' } } }],
    });
  });

  test.each([
    'Exile target nonland card from a graveyard.',
    "Exile target noncreature, nonland card from an opponent's graveyard.",
    'Exile target nontoken card from your graveyard.',
    'Exile target nonland creature card from your graveyard.',
    'Exile target nonland nonland card from your graveyard.',
    'Exile two target noncreature, nonland cards from your graveyard.',
    'Exile up to one target noncreature, nonland card from your graveyard.',
  ])('near miss: %s', (text) => {
    NOT_READ(text);
  });
});

describe('"choose target card exiled with ~. you may cast that card this turn without paying its mana cost" (CR 607.2a, 601.2, 118.9, 614.1a)', () => {
  const CAST = {
    kind: 'activated',
    cost: [
      { kind: 'mana', symbols: ['1', 'R', 'W'] },
      { kind: 'tap' },
      { kind: 'sacrifice', what: { subtypes: ['Spirit'] } },
    ],
    targets: [
      { id: 't1', what: { kind: 'object', filter: { zone: 'exile', exiledWithSource: true } } },
    ],
    effect: {
      kind: 'mayCast',
      objects: { kind: 'target', id: 't1' },
      duration: 'untilEndOfTurn',
      from: 'exile',
      free: true,
      bottomInstead: true,
    },
  };

  const EXILE_LINE =
    'At the beginning of your end step, exile target noncreature, nonland card from your graveyard.';

  test('the real line of Quintorius, Loremaster, with the three sentences read as one instruction (in the face that exiles with a link)', () => {
    const parsed = readAll(
      `${EXILE_LINE}\n{1}{R}{W}, {T}, Sacrifice a Spirit: Choose target card exiled with ~. You may cast that card this turn without paying its mana cost. If that spell would be put into a graveyard, put it on the bottom of its owner's library instead.`,
      'creature',
    );
    expect(parsed.abilities[1]).toEqual(CAST);
  });

  test('the exile of the first ability is marked linked: the engine remembers what it exiled', () => {
    const parsed = readAll(
      `${EXILE_LINE}\n{1}{R}{W}, {T}, Sacrifice a Spirit: Choose target card exiled with ~. You may cast that card this turn without paying its mana cost. If that spell would be put into a graveyard, put it on the bottom of its owner's library instead.`,
      'creature',
    );
    expect(parsed.abilities[0]).toMatchObject({
      kind: 'triggered',
      effect: { kind: 'exile', objects: { kind: 'target', id: 't1' }, linked: true },
    });
    // The face without the reader leaves the exile as it is.
    expect(readAll(EXILE_LINE, 'creature').abilities[0]).toMatchObject({
      effect: { kind: 'exile' },
    });
    expect(JSON.stringify(readAll(EXILE_LINE, 'creature').abilities)).not.toContain('linked');
  });

  test('without the rider the permission has no bottomInstead (SYNTHETIC)', () => {
    const parsed = readAll(
      `${EXILE_LINE}\n{1}{R}{W}, {T}: Choose target card exiled with ~. You may cast that card this turn without paying its mana cost.`,
      'creature',
    );
    expect(parsed.abilities[1]).toMatchObject({
      kind: 'activated',
      effect: { kind: 'mayCast', from: 'exile', free: true },
    });
    expect(JSON.stringify(parsed.abilities[1])).not.toContain('bottomInstead');
  });

  test('the reader of a face with two abilities that exile is refused: the link would be ambiguous (CR 607.2a)', () => {
    const parsed = read(
      '{T}: Exile target creature card from a graveyard.\nAt the beginning of your end step, exile target noncreature, nonland card from your graveyard.\n{1}{R}{W}, {T}: Choose target card exiled with ~. You may cast that card this turn without paying its mana cost.',
      'creature',
    );
    expect(parsed.abilities).toHaveLength(2);
    expect(parsed.unparsed).toHaveLength(1);
  });

  test('the reader of a face where nothing exiles with a link is refused', () => {
    const parsed = read(
      '{1}{R}{W}, {T}: Choose target card exiled with ~. You may cast that card this turn without paying its mana cost.',
      'creature',
    );
    expect(parsed.abilities).toEqual([]);
    expect(parsed.unparsed).toHaveLength(1);
  });

  test.each([
    '{1}{R}{W}, {T}: Choose target card exiled with it. You may cast that card this turn without paying its mana cost.',
    '{1}{R}{W}, {T}: Choose target card exiled with ~. You may cast it this turn without paying its mana cost.',
    '{1}{R}{W}, {T}: Choose target card exiled with ~. You may cast that card without paying its mana cost.',
    '{1}{R}{W}, {T}: Choose target card exiled with ~. You may cast that card this turn.',
    '{1}{R}{W}, {T}: Choose target card exiled with ~. You may play that card this turn without paying its mana cost.',
    '{1}{R}{W}, {T}: Choose target card exiled with ~. You may cast that card this turn without paying its mana cost. If that spell would be put into a graveyard, exile it instead.',
    '{1}{R}{W}, {T}: Choose target card exiled with ~. You may cast that card this turn without paying its mana cost. If that spell would be put into a graveyard, put it on the bottom of your library instead.',
    '{1}{R}{W}, {T}: Choose target creature card exiled with ~. You may cast that card this turn without paying its mana cost.',
    '{1}{R}{W}, {T}: Choose up to one target card exiled with ~. You may cast that card this turn without paying its mana cost.',
  ])('near miss: %s', (text) => {
    // In the face that exiles with a link, so that the line itself is what is not read.
    const parsed = read(`${EXILE_LINE}\n${text}`, 'creature');
    expect(parsed.abilities, text).toHaveLength(1);
    expect(parsed.unparsed, text).toHaveLength(1);
  });
});
