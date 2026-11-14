// The Gisa deck (issue 41), group 5 (D-478 to D-482): the lines of Crowded Crypt, Jadar, Gempalm Polluter and Woe Strider, and decayed as a keyword. The first lines of each block are
// the real Oracle text of the acceptance cards of the golden corpus read through the whole pipeline; the other lines are SYNTHETIC siblings and the near misses the grammar must not
// read. The engine runs what is lowered in convert-grammar-engine-gisa-g5.test.ts.
import { describe, expect, test } from 'vitest';
import { dropped, read, readAll } from './parser-p5-helpers';

const ZOMBIE = {
  name: 'Zombie',
  manaCost: null,
  supertypes: [],
  types: ['creature'],
  subtypes: ['Zombie'],
  colors: ['B'],
  power: 2,
  toughness: 2,
  loyalty: null,
  defense: null,
  oracleText: '',
  abilities: [{ kind: 'keyword', keyword: { kind: 'decayed' } }],
} as const;
const DECAYED = { kind: 'keyword', keyword: { kind: 'decayed' } } as const;

describe('decayed as a keyword (CR 702.147a)', () => {
  test('a keyword line, alone or in a list', () => {
    expect(readAll('Decayed', 'creature').abilities).toEqual([DECAYED]);
    expect(readAll('Flying, decayed', 'creature').abilities).toEqual([
      { kind: 'keyword', keyword: { kind: 'flying' } },
      DECAYED,
    ]);
  });

  test('granted: "Target creature gains decayed until end of turn" (SYNTHETIC)', () => {
    expect(readAll('Target creature gains decayed until end of turn.', 'sorcery').spell).toEqual({
      targets: [
        {
          id: 't1',
          what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
        },
      ],
      effect: {
        kind: 'grantKeyword',
        objects: { kind: 'target', id: 't1' },
        keyword: { kind: 'decayed' },
        duration: 'untilEndOfTurn',
      },
    });
  });

  test('a decayed counter is a keyword counter (CR 122.1b) (SYNTHETIC)', () => {
    expect(readAll('Put a decayed counter on target creature.', 'sorcery').spell?.effect).toEqual({
      kind: 'addCounters',
      objects: { kind: 'target', id: 't1' },
      counter: 'decayed',
      count: 1,
    });
  });

  test('a creature with decayed in a count and a condition: "if you control no creatures with decayed"', () => {
    const parsed = readAll(
      'At the beginning of your end step, if you control no creatures with decayed, you gain 1 life.',
      'creature',
    );
    expect(parsed.abilities[0]).toMatchObject({
      kind: 'triggered',
      interveningIf: {
        kind: 'not',
        term: {
          kind: 'controlsAtLeast',
          filter: { types: ['creature'], keywords: ['decayed'] },
          count: 1,
        },
      },
    });
  });

  test.each([
    ['Decayed 2', 'creature'],
    ['Decay', 'creature'],
    ['Target creature gains decayed and decayed until end of turn.', 'sorcery'],
  ] as const)('another wording is not read as the keyword (SYNTHETIC): %s', (text, type) => {
    expect(read(text, type).unparsed.length).toBeGreaterThan(0);
  });
});

describe('Crowded Crypt: "Create a 2/2 black Zombie creature token with decayed for each corpse counter on ~."', () => {
  const LINE =
    '{4}{B}{B}, {T}, Sacrifice ~: Create a 2/2 black Zombie creature token with decayed for each corpse counter on ~.';

  test('the real line: a token for each counter, read from the permanent that was sacrificed to pay the cost (CR 113.7a)', () => {
    const parsed = readAll(LINE, 'artifact');
    expect(parsed.abilities).toEqual([
      {
        kind: 'activated',
        cost: [
          { kind: 'mana', symbols: ['4', 'B', 'B'] },
          { kind: 'tap' },
          { kind: 'sacrifice', what: { kind: 'this' } },
        ],
        effect: {
          kind: 'createToken',
          token: { kind: 'custom', definition: ZOMBIE },
          count: { kind: 'countersOn', of: { kind: 'this' }, counter: 'corpse' },
        },
      },
    ]);
  });

  test('the other line of the card: a corpse counter when a creature you control dies', () => {
    const parsed = readAll(
      'Whenever a creature you control dies, put a corpse counter on this artifact.',
      'artifact',
    );
    expect(parsed.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'dies', what: { types: ['creature'], controller: 'you' } },
        effect: { kind: 'addCounters', objects: { kind: 'this' }, counter: 'corpse', count: 1 },
      },
    ]);
  });

  test.each([
    ['a 2/2 black Zombie creature token with decayed', 1],
    ['two 2/2 black Zombie creature tokens with decayed', 2],
  ])('the token of a plain count (SYNTHETIC): %s', (token, count) => {
    const parsed = readAll(`When ~ enters, create ${token}.`, 'creature');
    expect(parsed.abilities[0]).toMatchObject({
      effect: { kind: 'createToken', token: { kind: 'custom', definition: ZOMBIE }, count },
    });
  });

  test.each([
    // a keyword the engine does not run for a token, or twice
    'When ~ enters, create a 2/2 black Zombie creature token with decayed and decayed.',
    'When ~ enters, create a 2/2 black Zombie creature token with decay.',
    'When ~ enters, create a 2/2 black Zombie creature token with decayed 2.',
  ])('another wording is not read (SYNTHETIC): %s', (text) => {
    expect(read(text, 'creature').unparsed.length).toBeGreaterThan(0);
  });
});

describe('Jadar: "At the beginning of your end step, if you control no creatures with decayed, create a 2/2 black Zombie creature token with decayed."', () => {
  test('the real line: an end step trigger with the intervening "if" and the token', () => {
    const parsed = readAll(
      'At the beginning of your end step, if you control no creatures with decayed, create a 2/2 black Zombie creature token with decayed.',
      'creature',
    );
    expect(parsed.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'endStep', whose: 'you' },
        interveningIf: {
          kind: 'not',
          term: {
            kind: 'controlsAtLeast',
            filter: { types: ['creature'], keywords: ['decayed'] },
            count: 1,
          },
        },
        effect: {
          kind: 'createToken',
          token: { kind: 'custom', definition: ZOMBIE },
          count: 1,
        },
      },
    ]);
  });

  test('"if you control no creatures with flying": the same condition for another keyword (SYNTHETIC)', () => {
    const parsed = readAll(
      'At the beginning of your end step, if you control no creatures with flying, draw a card.',
      'creature',
    );
    expect(parsed.abilities[0]).toMatchObject({
      interveningIf: {
        kind: 'not',
        term: { kind: 'controlsAtLeast', filter: { types: ['creature'], keywords: ['flying'] } },
      },
    });
  });
});

describe('Gempalm Polluter: "When you cycle this card, you may have target player lose life equal to the number of Zombies on the battlefield."', () => {
  const LINE =
    'When you cycle this card, you may have target player lose life equal to the number of Zombies on the battlefield.';

  test('the real line: an optional life loss for a target player, counted on the battlefield', () => {
    const parsed = readAll(LINE, 'creature', ['Zombie']);
    expect(parsed.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'cycled' },
        targets: [{ id: 't1', what: { kind: 'player', filter: 'any' } }],
        effect: {
          kind: 'loseLife',
          player: { kind: 'target', id: 't1' },
          amount: { kind: 'countOf', filter: { subtypes: ['Zombie'] } },
        },
        optional: true,
      },
    ]);
  });

  test.each([
    [
      'When you cycle this card, you may have target opponent lose 2 life.',
      { kind: 'loseLife', amount: 2 },
    ],
    [
      'When you cycle this card, you may have each opponent lose 1 life.',
      { kind: 'loseLife', player: { kind: 'eachOpponent' }, amount: 1 },
    ],
    [
      'When you cycle this card, you may have target player gain 3 life.',
      { kind: 'gainLife', amount: 3 },
    ],
  ])('the same "have" with another player or verb (SYNTHETIC): %s', (text, effect) => {
    const parsed = readAll(text, 'creature');
    expect(parsed.abilities[0]).toMatchObject({ trigger: { kind: 'cycled' }, effect });
  });

  test.each([
    'When you cycle this card, you may have target player loses 2 life.',
    'When you cycle this card, you may have target creature lose 2 life.',
    'When you cycle this card, you may have you lose 2 life.',
    'When you cycle this card, you may have target player lose life.',
  ])('another wording is not read (SYNTHETIC): %s', (text) => {
    expect(read(text, 'creature').unparsed.length).toBeGreaterThan(0);
  });

  test('without "you may" the instruction is mandatory (SYNTHETIC)', () => {
    const parsed = readAll('When you cycle this card, have target player lose 2 life.', 'creature');
    expect(parsed.abilities[0]).not.toHaveProperty('optional');
  });
});

describe('Woe Strider: "This creature escapes with two +1/+1 counters on it."', () => {
  const LINE = '~ escapes with two +1/+1 counters on it.';

  test('the real line: the counters of a permanent that escaped, a replacement as it enters (CR 702.138c)', () => {
    const parsed = read(LINE, 'creature');
    expect(parsed.unparsed).toEqual([]);
    expect(parsed.abilities).toEqual([
      {
        kind: 'replacement',
        replacement: { kind: 'entersWithCounters', counter: '+1/+1', count: 2, ifEscaped: true },
      },
    ]);
  });

  test.each([
    ['~ escapes with a +1/+1 counter on it.', '+1/+1', 1],
    ['~ escapes with three charge counters on it.', 'charge', 3],
  ])('other counts and kinds (SYNTHETIC): %s', (text, counter, count) => {
    expect(readAll(text, 'creature').abilities).toEqual([
      {
        kind: 'replacement',
        replacement: { kind: 'entersWithCounters', counter, count, ifEscaped: true },
      },
    ]);
  });

  test.each([
    '~ escapes with X +1/+1 counters on it.',
    '~ escapes with a +1/+1 counter on it for each creature you control.',
    '~ escapes with two +1/+1 counters.',
    '~ escapes with flying.',
    '~ escapes tapped.',
  ])('another wording is dropped, never half read (SYNTHETIC): %s', (text) => {
    expect(dropped(text, 'creature')).toMatchObject({ reason: 'unrecognised' });
  });
});
