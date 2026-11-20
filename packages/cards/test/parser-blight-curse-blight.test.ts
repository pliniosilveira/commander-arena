// The Blight Curse deck, the "blight" group (Lorwyn Eclipsed, CR 701.68a): the three places the keyword action is written. As an instruction ("draw a card and blight 1"), as the optional
// additional cost of a spell ("As an additional cost to cast ~, you may blight 1.") with the condition that reads it ("If ~'s additional cost was paid, exile the top three cards
// instead."), and as the cost of Ward ("Ward—Blight 2."). The first line of each block is the real Oracle text of the acceptance cards of the golden corpus; the other lines are SYNTHETIC
// siblings and the near misses the grammar must not read. The engine runs what is lowered in convert-grammar-engine-blight-curse.test.ts.
import { describe, expect, test } from 'vitest';
import { parsed, parseOnly, spellCard } from './convert-grammar-helpers';
import { read, readAll } from './parser-p5-helpers';

const YOU = { kind: 'you' } as const;

describe('"blight N" as an instruction (CR 701.68a)', () => {
  test('the real text of Sinister Gnarlbark: a draw and a blight in the end step trigger', () => {
    expect(
      readAll('At the beginning of your end step, draw a card and blight 1.', 'creature').abilities,
    ).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'endStep', whose: 'you' },
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'draw', player: YOU, count: 1 },
            { kind: 'blight', count: 1 },
          ],
        },
      },
    ]);
  });

  test.each([
    ['Blight 2.', 2],
    ['Draw a card, then blight 3.', 3],
  ])('SYNTHETIC: %s', (text, count) => {
    const parsedFace = readAll(text, 'sorcery');
    expect(JSON.stringify(parsedFace.spell)).toContain(`{"kind":"blight","count":${count}}`);
  });

  test.each([
    'Blight X.',
    'Blight 0.',
    'Blight.',
    'Blight 1 creature.',
    'Target player blights 1.',
    'Each opponent blights 1.',
    'You may blight 1.',
    'Blight it.',
  ])('not read: %s', (text) => {
    const face = read(text, 'sorcery');
    expect(JSON.stringify(face.spell)).not.toContain('"blight"');
    expect(face.unparsed).toHaveLength(1);
  });
});

describe('"As an additional cost to cast ~, you may blight 1." and "if ~\'s additional cost was paid" (CR 118.8, 601.2b, 701.68a)', () => {
  const REAL =
    "As an additional cost to cast this spell, you may blight 1. (You may put a -1/-1 counter on a creature you control.)\nExile the top two cards of your library. If this spell's additional cost was paid, exile the top three cards instead. Until the end of your next turn, you may play those cards.";

  test('the real text of Burning Curiosity: the optional cost, and a conditional exile whose cards may be played', () => {
    const card = parsed('Burning Curiosity', 'Sorcery', REAL, { manaCost: '{2}{R}' });
    const face = card.faces[0];
    expect(face?.additionalCosts).toEqual([{ kind: 'blight', count: 1, optional: true }]);
    expect(face?.spell?.effect).toEqual({
      kind: 'sequence',
      effects: [
        {
          kind: 'conditional',
          condition: { kind: 'additionalCostPaid' },
          effect: { kind: 'exileTop', count: 3 },
          else: { kind: 'exileTop', count: 2 },
        },
        { kind: 'mayPlay', objects: { kind: 'moved' }, lasts: 'endOfYourNextTurn' },
      ],
    });
  });

  test('SYNTHETIC: two counters, and a different effect for the condition', () => {
    const card = parsed(
      'SYNTHETIC Blight Study',
      'Sorcery',
      "As an additional cost to cast ~, you may blight 2.\nDraw a card. If ~'s additional cost was paid, draw three cards instead.",
    );
    expect(card.faces[0]?.additionalCosts).toEqual([{ kind: 'blight', count: 2, optional: true }]);
    expect(card.faces[0]?.spell?.effect).toEqual({
      kind: 'conditional',
      condition: { kind: 'additionalCostPaid' },
      effect: { kind: 'draw', player: YOU, count: 3 },
      else: { kind: 'draw', player: YOU, count: 1 },
    });
  });

  test.each([
    ['a mandatory blight', 'As an additional cost to cast ~, blight 1.\nDraw a card.'],
    [
      'a choice of costs',
      'As an additional cost to cast ~, you may blight 1 or pay {2}.\nDraw a card.',
    ],
    [
      'an optional blight with another cost',
      'As an additional cost to cast ~, you may blight 1 and discard a card.\nDraw a card.',
    ],
    ['X counters', 'As an additional cost to cast ~, you may blight X.\nDraw a card.'],
  ])('not supported: %s', (_why, text) => {
    const card = parseOnly(
      spellCard('SYNTHETIC Refused', text.replaceAll('~', 'SYNTHETIC Refused'), {
        type: 'Sorcery',
      }),
    );
    expect(card.support.status).not.toBe('supported');
  });

  test('the condition with no optional blight cost on the face is not supported (the engine refuses it)', () => {
    const card = parseOnly(
      spellCard(
        'SYNTHETIC No Cost',
        "Draw a card. If SYNTHETIC No Cost's additional cost was paid, draw two cards instead.",
        { type: 'Sorcery' },
      ),
    );
    expect(card.support.status).not.toBe('supported');
  });

  test.each([
    'Exile the top three cards.',
    "Draw a card. If ~'s additional cost was paid, exile the top three cards instead.",
    "Exile the top card of target player's library. If ~'s additional cost was paid, exile the top three cards instead.",
    "Exile the top two cards of your library face down. If ~'s additional cost was paid, exile the top three cards instead.",
  ])('"exile the top three cards" with no library said is not read alone: %s', (text) => {
    const card = parseOnly(
      spellCard('SYNTHETIC Refused', text.replaceAll('~', 'SYNTHETIC Refused'), {
        type: 'Sorcery',
      }),
    );
    expect(card.support.status).not.toBe('supported');
  });

  test('the condition is not read in an ability of a permanent or about another object', () => {
    for (const text of [
      "When ~ enters, if ~'s additional cost was paid, draw a card.",
      "Draw a card. If that spell's additional cost was paid, draw two cards instead.",
      'Draw a card. If its additional cost was paid, draw two cards instead.',
    ]) {
      expect(read(text, 'sorcery').unparsed, text).toHaveLength(1);
    }
  });
});

describe('"Ward—Blight 2." (CR 702.21a, 701.68a)', () => {
  test('the real line of Auntie Ool, Cursewretch: a ward keyword whose only cost is a blight', () => {
    expect(
      readAll(
        'Ward—Blight 2. (To blight 2, a player puts two -1/-1 counters on a creature they control.)',
        'creature',
      ).abilities,
    ).toEqual([
      { kind: 'keyword', keyword: { kind: 'ward', cost: [{ kind: 'blight', count: 2 }] } },
    ]);
  });

  test('SYNTHETIC: one counter, without the final period', () => {
    expect(readAll('Ward—Blight 1', 'creature').abilities).toEqual([
      { kind: 'keyword', keyword: { kind: 'ward', cost: [{ kind: 'blight', count: 1 }] } },
    ]);
  });

  test.each([
    'Ward—Blight X.',
    'Ward—Blight 0.',
    'Ward—Blight.',
    'Ward—Blight 2, Pay 2 life.',
    'Ward—{2}, Blight 2.',
    'Ward—Blight 2..',
    'Ward Blight 2.',
    'Flying, ward—Blight 2.',
  ])('not read: %s', (text) => {
    const face = read(text, 'creature');
    expect(face.abilities, text).toEqual([]);
    expect(face.unparsed, text).toHaveLength(1);
  });

  test('a blight is not the cost of an equip, a cycling or any other keyword', () => {
    for (const text of [
      'Equip—Blight 1',
      'Cycling—Blight 1',
      'Flashback—Blight 1',
      'Echo—Blight 1',
    ]) {
      expect(read(text, 'creature').abilities, text).toEqual([]);
    }
  });
});
