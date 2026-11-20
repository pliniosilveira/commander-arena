// The Jarad, Golgari Lich Lord lines (CR 701.21a, 118.3, 602.2c, 113.7a): the real wording of the two abilities read through the whole pipeline, the SYNTHETIC variants that share their
// grammar and the near misses the grammar must not read. The engine runs what is lowered in convert-grammar-engine-jarad.test.ts.
import { describe, expect, test } from 'vitest';
import { dropped, readAll, read as readFace } from './parser-p5-helpers';

const NOT_READ = (text: string, type: Parameters<typeof readFace>[1] = 'creature') => {
  const parsed = readFace(text, type);
  expect(parsed.abilities, text).toEqual([]);
  expect(parsed.unparsed, text).toHaveLength(1);
};

const SWAMP = { subtypes: ['Swamp'] };
const FOREST = { subtypes: ['Forest'] };

describe('"Each opponent loses life equal to the sacrificed creature\'s power" (CR 602.2c, 113.7a)', () => {
  const LINE =
    "{1}{B}{G}, Sacrifice another creature: Each opponent loses life equal to the sacrificed creature's power.";

  test('the real line: the life lost is the power of the permanent the cost sacrificed', () => {
    expect(readAll(LINE, 'creature').abilities).toEqual([
      {
        kind: 'activated',
        cost: [
          { kind: 'mana', symbols: ['1', 'B', 'G'] },
          { kind: 'sacrifice', what: { types: ['creature'], other: true } },
        ],
        effect: {
          kind: 'loseLife',
          player: { kind: 'eachOpponent' },
          amount: { kind: 'powerOf', of: { kind: 'sacrificedCost' } },
        },
      },
    ]);
  });

  test('the toughness and the curly apostrophe say the same (SYNTHETIC variants)', () => {
    expect(
      readAll(
        '{B}, Sacrifice a creature: Each opponent loses life equal to the sacrificed creature’s toughness.',
        'creature',
      ).abilities,
    ).toHaveLength(1);
    expect(
      readAll(
        '{B}, Sacrifice a creature: You gain life equal to the sacrificed creature’s power.',
        'creature',
      ).abilities,
    ).toHaveLength(1);
  });
});

describe('"Sacrifice a Swamp and a Forest: ..." (CR 701.21a, 118.3, 602.2b)', () => {
  test('the real line: a sacrifice with one part for each land, an ability of the card that works from the graveyard', () => {
    expect(
      readAll(
        'Sacrifice a Swamp and a Forest: Return this card from your graveyard to your hand.',
        'creature',
      ).abilities,
    ).toEqual([
      {
        kind: 'activated',
        cost: [{ kind: 'sacrifice', what: SWAMP, alongside: [FOREST] }],
        effect: { kind: 'moveToZone', objects: { kind: 'this' }, to: 'hand' },
        functionsIn: 'graveyard',
      },
    ]);
  });

  test('other parts, and the same cost on the battlefield (SYNTHETIC)', () => {
    const [ability] = readAll(
      '{1}, Sacrifice a creature and a land: Draw a card.',
      'creature',
    ).abilities;
    expect(ability).toMatchObject({
      kind: 'activated',
      cost: [
        { kind: 'mana', symbols: ['1'] },
        {
          kind: 'sacrifice',
          what: { types: ['creature'] },
          alongside: [{ types: ['land'] }],
        },
      ],
    });
    expect(ability).not.toHaveProperty('functionsIn');
  });

  test('one sacrifice of a filter is paid from the graveyard too, the card itself is not', () => {
    expect(
      readAll('Sacrifice a land: Return this card from your graveyard to your hand.', 'creature')
        .abilities,
    ).toMatchObject([{ kind: 'activated', functionsIn: 'graveyard' }]);
    NOT_READ('Sacrifice ~: Return this card from your graveyard to your hand.');
  });

  test('the near misses are not read', () => {
    // a part that is not "a ...", an unfinished list, two sacrifices and a cost that is not a cost of an ability
    NOT_READ(
      'Sacrifice a Swamp and two Forests: Return this card from your graveyard to your hand.',
    );
    NOT_READ('Sacrifice a Swamp and: Return this card from your graveyard to your hand.');
    NOT_READ('Sacrifice ~ and a Forest: Return this card from your graveyard to your hand.');
    NOT_READ('Sacrifice a Swamp and a Forest: Draw a card. Sacrifice a land: Draw a card.');
    expect(
      dropped('Sacrifice a Swamp and an opponent’s Forest: Draw a card.', 'creature'),
    ).toBeDefined();
  });

  test('as an additional cost of a spell the several parts are not run: the line is dropped whole', () => {
    NOT_READ(
      'As an additional cost to cast this spell, sacrifice a Swamp and a Forest.',
      'instant',
    );
  });
});
