// "{T}, Discard a card: Draw a card. If the discarded card was a creature card, amass Orcs 1." (Moria Scavenger): the condition `discardedAsCostMatches` reads the card
// the cost of the activated ability discarded.
// Pins: CR 602.2b (the cost is paid as the ability is activated and the ability remembers it), CR 701.9a (discard: from the hand to the graveyard), CR 608.2h (the card is read
// as it last was once it has left the graveyard), CR 701.47a (amass), CR 205.2a (card types).
// The cards are SYNTHETIC, defined in this file (a synthetic fixture of this shape would change the derive digests).
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { getView, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const SCAVENGER = 'SYNTHETIC Discard Scavenger';
const BEAR = 'Grizzly Bears';
const BOLT = 'Lightning Bolt';

const SCAVENGER_CARD = singleFace({
  name: SCAVENGER,
  manaCost: ['1', 'B'],
  types: ['creature'],
  subtypes: ['Goblin'],
  colors: ['B'],
  colorIdentity: ['B'],
  power: 1,
  toughness: 1,
  oracleText:
    '{T}, Discard a card: Draw a card. If the discarded card was a creature card, amass Orcs 1.',
  abilities: [
    {
      kind: 'activated',
      cost: [{ kind: 'tap' }, { kind: 'discard', count: 1 }],
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'draw', player: { kind: 'you' }, count: 1 },
          {
            kind: 'conditional',
            condition: { kind: 'discardedAsCostMatches', filter: { types: ['creature'] } },
            effect: { kind: 'amass', subtype: 'Orc', count: 1 },
          },
        ],
      },
    },
  ],
});

function start(...hand: string[]) {
  return scenario()
    .define(SCAVENGER_CARD)
    .seat(0)
    .library('Island', { count: 4 })
    .hand(...hand)
    .battlefield(SCAVENGER)
    .seat(1)
    .library('Island', { count: 4 })
    .build();
}

const armies = (g: ReturnType<typeof start>) =>
  getView(g.state, 0).battlefield.filter((o) => o.subtypes.includes('Army'));

describe('"If the discarded card was a creature card"', () => {
  test('the card is valid', () => {
    expect(validateCard(SCAVENGER_CARD)).toEqual([]);
  });

  test('a creature card discarded: the draw happens and the Orc Army is amassed', () => {
    const g = start(BEAR);
    g.act(0).activate(SCAVENGER);
    g.expect.zone(BEAR, 'graveyard', { seat: 0 });
    g.passAll();
    g.expect.handSize(0, 1);
    expect(armies(g)).toHaveLength(1);
    expect(armies(g)[0]).toMatchObject({ name: 'Orc Army', counters: { '+1/+1': 1 } });
    g.expect.invariants();
  });

  test('a card that is not a creature: the draw happens and nothing is amassed', () => {
    const g = start(BOLT);
    g.act(0).activate(SCAVENGER);
    g.passAll();
    g.expect.handSize(0, 1);
    expect(armies(g)).toHaveLength(0);
  });

  test('an activated ability without a discard cost may not read it', () => {
    const bad = singleFace({
      name: 'SYNTHETIC Bad Reader',
      manaCost: ['1'],
      types: ['creature'],
      colors: [],
      colorIdentity: [],
      oracleText: 'SYNTHETIC: tap, read the discarded card without a discard cost.',
      power: 1,
      toughness: 1,
      abilities: [
        {
          kind: 'activated',
          cost: [{ kind: 'tap' }],
          effect: {
            kind: 'conditional',
            condition: { kind: 'discardedAsCostMatches', filter: { types: ['creature'] } },
            effect: { kind: 'amass', subtype: 'Orc', count: 1 },
          },
        },
      ],
    });
    expect(validateCard(bad).length).toBeGreaterThan(0);
  });
});
