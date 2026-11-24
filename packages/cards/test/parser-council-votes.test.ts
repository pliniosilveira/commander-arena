// The Elven Council deck (issue 17), the council cards: the lines of Plea for Power, Sail into the West, Travel Through Caradhras and Galadriel, Elven-Queen, read through the whole
// pipeline, and the near misses the grammar must not read. The real cards are played in convert-grammar-engine-council-votes.test.ts.
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
const VOTE = { kind: 'vote', options: ['gold', 'iron'], startingWith: 'you' } as const;
const VOTE_TEXT = 'Starting with you, each player votes for gold or iron.';

describe('"If gold gets more votes" and "if the vote is tied" (CR 701.38a)', () => {
  test('more votes, with a tie as the other branch', () => {
    expect(
      readAll(
        `${VOTE_TEXT} If gold gets more votes, draw a card. If iron gets more votes or the vote is tied, you gain 3 life.`,
      ).spell,
    ).toEqual({
      effect: {
        kind: 'sequence',
        effects: [
          VOTE,
          {
            kind: 'conditional',
            condition: { kind: 'voteMost', option: 'gold' },
            effect: { kind: 'draw', player: YOU, count: 1 },
          },
          {
            kind: 'conditional',
            condition: {
              kind: 'or',
              terms: [{ kind: 'voteMost', option: 'iron' }, { kind: 'voteTied' }],
            },
            effect: { kind: 'gainLife', player: YOU, amount: 3 },
          },
        ],
      },
    });
  });

  test('the vote is tied alone, and a name with capitals as the option (SYNTHETIC)', () => {
    expect(
      readAll(
        'Starting with you, each player votes for Redhorn Pass or Mines of Moria. If the vote is tied, draw a card. If Mines of Moria gets more votes, draw two cards.',
      ).spell,
    ).toEqual({
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'vote', options: ['Redhorn Pass', 'Mines of Moria'], startingWith: 'you' },
          {
            kind: 'conditional',
            condition: { kind: 'voteTied' },
            effect: { kind: 'draw', player: YOU, count: 1 },
          },
          {
            kind: 'conditional',
            condition: { kind: 'voteMost', option: 'Mines of Moria' },
            effect: { kind: 'draw', player: YOU, count: 2 },
          },
        ],
      },
    });
  });

  test.each([
    `${VOTE_TEXT} If gold gets more votes than iron, draw a card.`,
    `${VOTE_TEXT} If gold gets the most votes, draw a card.`,
    `${VOTE_TEXT} If gold gets fewer votes, draw a card.`,
    `${VOTE_TEXT} If the vote is not tied, draw a card.`,
    `${VOTE_TEXT} If each gets more votes, draw a card.`,
  ])('not read: %s', (text) => NOT_READ(text));
});

describe('"For each Redhorn Pass vote, search ..." repeats the instruction (CR 608.2c, 701.38b)', () => {
  test('a search and a card chosen from the graveyard, for the votes of an option', () => {
    expect(
      readAll(
        'Starting with you, each player votes for Redhorn Pass or Mines of Moria. For each Redhorn Pass vote, search your library for a basic land card and put it onto the battlefield tapped. For each Mines of Moria vote, return a card from your graveyard to your hand.',
      ).spell,
    ).toEqual({
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'vote', options: ['Redhorn Pass', 'Mines of Moria'], startingWith: 'you' },
          {
            kind: 'repeat',
            times: { kind: 'votesFor', option: 'Redhorn Pass' },
            effect: {
              kind: 'search',
              player: YOU,
              filter: { types: ['land'], supertypes: ['basic'] },
              max: 1,
              destinations: [{ zone: 'battlefield', tapped: true, count: 1 }],
              reveal: false,
              shuffle: false,
            },
          },
          {
            kind: 'repeat',
            times: { kind: 'votesFor', option: 'Mines of Moria' },
            effect: {
              kind: 'moveToZone',
              objects: { kind: 'choose', filter: { zone: 'graveyard', controller: 'you' } },
              to: 'hand',
            },
          },
        ],
      },
    });
  });

  test.each([
    `${VOTE_TEXT} For each vote, return a card from your graveyard to your hand.`,
    `${VOTE_TEXT} For each gold vote, you may return a card from your graveyard to your hand.`,
    `${VOTE_TEXT} For each gold vote, return a card from your graveyard to your hand and draw a card.`,
    `${VOTE_TEXT} For each extra vote, return a card from your graveyard to your hand.`,
  ])('not read: %s', (text) => NOT_READ(text));
});

describe('"Each player returns up to two cards from their graveyard to their hand, then you exile this spell" (CR 101.4, 608.2n)', () => {
  test('each player returns, then the spell is exiled', () => {
    expect(
      readAll(
        'Each player returns up to two cards from their graveyard to their hand, then you exile ~.',
        'instant',
      ).spell,
    ).toEqual({
      effect: {
        kind: 'sequence',
        effects: [
          {
            kind: 'forEachPlayer',
            players: { kind: 'eachPlayer' },
            runsAs: 'each',
            effect: {
              kind: 'moveToZone',
              objects: {
                kind: 'choose',
                filter: { zone: 'graveyard', controller: 'you' },
                count: 2,
                optional: true,
              },
              to: 'hand',
            },
          },
          { kind: 'exile', objects: { kind: 'thisSpell' } },
        ],
      },
    });
  });

  test.each([
    'Each player returns two cards from their graveyard to their hand.',
    'Each player returns up to two creature cards from their graveyard to their hand.',
    'Each player returns up to two cards from their graveyard to the battlefield.',
    'Each opponent returns up to two cards from their graveyard to their hand.',
  ])('not read: %s', (text) => NOT_READ(text));
});

describe('"put a +1/+1 counter on your Ring-bearer" (CR 701.54e)', () => {
  test('the counter goes on the Ring-bearer of the controller', () => {
    expect(
      readAll('The Ring tempts you, then you put a +1/+1 counter on your Ring-bearer.').spell,
    ).toEqual({
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'ringTempts' },
          { kind: 'addCounters', objects: { kind: 'ringBearer' }, counter: '+1/+1', count: 1 },
        ],
      },
    });
  });

  test.each([
    'Put a +1/+1 counter on their Ring-bearer.',
    'Put a charge counter on your Ring-bearer.',
    'Put X +1/+1 counters on your Ring-bearer.',
  ])('not read: %s', (text) => NOT_READ(text));
});

describe('"if another Elf entered the battlefield under your control this turn" (CR 400.7, 603.4)', () => {
  test('the intervening if of a beginning of combat trigger leaves out the permanent itself', () => {
    expect(
      readAll(
        'At the beginning of combat on your turn, if another Elf entered the battlefield under your control this turn, draw a card.',
        'creature',
      ).abilities,
    ).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'step', step: 'beginCombat', whose: 'you' },
        effect: { kind: 'draw', player: YOU, count: 1 },
        interveningIf: { kind: 'enteredThisTurn', count: 1, subtypes: ['Elf'], other: true },
      },
    ]);
  });

  test('without "another" the permanent itself counts, as it did', () => {
    const [ability] = readAll(
      'At the beginning of combat on your turn, if an Elf entered the battlefield under your control this turn, draw a card.',
      'creature',
    ).abilities;
    expect(ability).toMatchObject({
      interveningIf: { kind: 'enteredThisTurn', count: 1, subtypes: ['Elf'] },
    });
    expect(JSON.stringify(ability)).not.toContain('other');
  });
});
