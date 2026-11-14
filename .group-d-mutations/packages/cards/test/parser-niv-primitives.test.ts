// The Niv-Mizzet deck (issue 25), four primitives (D-318 to D-321): "Activate only if you've cast three or more spells this turn" (Stella Lee, Wild Card),
// two mana of different colors (Firemind Vessel), "Untap ~ during each other player's untap step" (Bender's Waterskin) and "the number of cards in your
// hand minus 4" (Ivory Tower). The lines are the real Oracle text of the acceptance cards of the golden corpus, names replaced by ~, read through the whole
// pipeline; the other lines are SYNTHETIC siblings and the near misses the grammar must not read. The engine runs what is lowered in
// convert-grammar-engine-niv-primitives.test.ts.
import { describe, expect, test } from 'vitest';
import { dropped, readAll } from './parser-p5-helpers';

const COPY_TEXT =
  '{T}: Copy target instant or sorcery spell you control. You may choose new targets for the copy.';

describe('"Activate only if you\'ve cast three or more spells this turn" (Stella Lee, CR 602.5b, 601.2i)', () => {
  test('the real second ability: the copy ability with the restriction as its activateOnlyIf', () => {
    const parsed = readAll(
      `${COPY_TEXT} Activate only if you've cast three or more spells this turn.`,
      'creature',
    );
    expect(parsed.abilities).toEqual([
      expect.objectContaining({
        kind: 'activated',
        cost: [{ kind: 'tap' }],
        activateOnlyIf: { kind: 'spellsCastThisTurn', atLeast: 3 },
      }),
    ]);
  });

  test('the curly apostrophe and "you have cast" read the same (SYNTHETIC)', () => {
    for (const lead of ['you’ve cast', 'you have cast']) {
      const parsed = readAll(
        `${COPY_TEXT} Activate only if ${lead} three or more spells this turn.`,
        'creature',
      );
      expect(JSON.stringify(parsed.abilities)).toContain('"spellsCastThisTurn","atLeast":3');
    }
  });

  test('the threshold is the number of the text (SYNTHETIC: 5)', () => {
    const parsed = readAll(
      "{T}: You gain 1 life. Activate only if you've cast five or more spells this turn.",
      'artifact',
    );
    expect(JSON.stringify(parsed.abilities)).toContain('"atLeast":5');
  });

  test.each([
    "{T}: You gain 1 life. Activate only if you've cast three or more spells.",
    "{T}: You gain 1 life. Activate only if you've cast three or fewer spells this turn.",
    '{T}: You gain 1 life. Activate only if an opponent has cast three or more spells this turn.',
    "{T}: You gain 1 life. Activate only if you've cast three or more instant or sorcery spells this turn.",
    "{T}: You gain 1 life. Activate only if you've cast a spell this turn.",
  ])('another wording is dropped, never half read (SYNTHETIC): %s', (text) => {
    expect(dropped(text, 'artifact').reason).toBe('unrecognised');
  });
});

describe('"Add two mana of different colors" (Firemind Vessel, CR 106.1b, 605.3b)', () => {
  test('the real card: enters tapped, and a mana ability of two mana of different colors', () => {
    const parsed = readAll(
      'This artifact enters tapped.\n{T}: Add two mana of different colors.',
      'artifact',
    );
    expect(parsed.abilities).toEqual([
      expect.objectContaining({ kind: 'replacement' }),
      {
        kind: 'mana',
        cost: [{ kind: 'tap' }],
        production: { kind: 'anyCombination', count: 2, distinct: true },
      },
    ]);
  });

  test('"any combination" keeps its own node: no distinct flag', () => {
    const parsed = readAll('{T}: Add two mana in any combination of colors.', 'artifact');
    expect(parsed.abilities).toEqual([
      {
        kind: 'mana',
        cost: [{ kind: 'tap' }],
        production: { kind: 'anyCombination', count: 2 },
      },
    ]);
  });

  test('three mana of different colors reads with its count (SYNTHETIC)', () => {
    const parsed = readAll('{T}: Add three mana of different colors.', 'artifact');
    expect(parsed.abilities).toEqual([
      {
        kind: 'mana',
        cost: [{ kind: 'tap' }],
        production: { kind: 'anyCombination', count: 3, distinct: true },
      },
    ]);
  });

  test('with a cost and a restriction on the use of the mana (SYNTHETIC)', () => {
    const parsed = readAll(
      '{1}, {T}: Add two mana of different colors. Spend this mana only to cast Dragon spells.',
      'artifact',
    );
    expect(JSON.stringify(parsed.abilities)).toContain('"distinct":true');
  });

  test.each([
    '{T}: Add two mana of different color.',
    '{T}: Add two mana of different types.',
    '{T}: Add one mana of different colors.',
    '{T}: Add four mana of different colors.',
    '{T}: Add two mana of different colors for each creature you control.',
    '{T}: Add two mana of the same color.',
  ])('another wording is dropped, never half read (SYNTHETIC): %s', (text) => {
    expect(dropped(text, 'artifact').reason).toBeDefined();
  });
});

describe('"Untap ~ during each other player\'s untap step" (Bender\'s Waterskin, CR 502.3)', () => {
  test('the real card: the static ability on the permanent itself and the mana ability', () => {
    const parsed = readAll(
      "Untap ~ during each other player's untap step.\n{T}: Add one mana of any color.",
      'artifact',
    );
    expect(parsed.abilities).toEqual([
      { kind: 'static', static: { kind: 'untapInOthersUntapStep', self: true } },
      expect.objectContaining({ kind: 'mana' }),
    ]);
  });

  test('the creatures of the controller keep their own wording and node (stage P68)', () => {
    const parsed = readAll(
      "Untap all creatures you control during each other player's untap step.",
      'creature',
    );
    expect(parsed.abilities).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'untapInOthersUntapStep',
          what: { types: ['creature'], controller: 'you' },
        },
      },
    ]);
  });

  test.each([
    "Untap ~ during each other player's untap step if you control a Swamp.",
    "Untap ~ during each player's untap step.",
    "Untap it during each other player's untap step.",
    "Untap ~ during each other player's upkeep.",
  ])('another wording is dropped, never half read (SYNTHETIC): %s', (text) => {
    expect(dropped(text, 'artifact').reason).toBe('unrecognised');
  });
});

describe('"the number of cards in your hand minus 4" (Ivory Tower, CR 107.1b)', () => {
  test('the real line: a trigger at your upkeep that gains the hand size less 4', () => {
    const parsed = readAll(
      'At the beginning of your upkeep, you gain X life, where X is the number of cards in your hand minus 4.',
      'artifact',
    );
    expect(parsed.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'upkeep', whose: 'you' },
        effect: {
          kind: 'gainLife',
          player: { kind: 'you' },
          amount: { kind: 'minus', of: expect.objectContaining({ kind: 'countOf' }), by: 4 },
        },
      },
    ]);
  });

  test('the number taken away is the number of the text (SYNTHETIC: 2)', () => {
    const parsed = readAll(
      'At the beginning of your upkeep, you gain X life, where X is the number of cards in your hand minus 2.',
      'artifact',
    );
    expect(JSON.stringify(parsed.abilities)).toContain('"by":2');
  });

  test('"equal to ... minus N" reads the same way (SYNTHETIC)', () => {
    const parsed = readAll(
      'At the beginning of your upkeep, you gain life equal to the number of cards in your hand plus the number of lands you control minus 1.',
      'artifact',
    );
    expect(JSON.stringify(parsed.abilities)).toContain('"minus"');
  });

  test('a sum less a number is a minus of the sum (SYNTHETIC)', () => {
    const parsed = readAll(
      'At the beginning of your upkeep, you gain X life, where X is the number of cards in your hand plus the number of lands you control minus 3.',
      'artifact',
    );
    expect(JSON.stringify(parsed.abilities)).toContain('"kind":"minus","of":{"kind":"sum"');
  });

  test.each([
    'At the beginning of your upkeep, you gain X life, where X is the number of cards in your hand minus.',
    'At the beginning of your upkeep, you gain X life, where X is the number of cards in your hand minus 0.',
    'At the beginning of your upkeep, you gain X life, where X is the number of cards in your hand minus four.',
    'At the beginning of your upkeep, you gain X life, where X is the number of cards in your hand minus X.',
    'At the beginning of your upkeep, you gain X life, where X is the number of cards in your hand minus 4 cards.',
  ])('another wording is dropped, never half read (SYNTHETIC): %s', (text) => {
    expect(dropped(text, 'artifact').reason).toBe('unrecognised');
  });
});
