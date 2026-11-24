// Felisa, Fang of Silverquill (Party Time deck, issue 170): "Whenever a nontoken creature you control dies, if it had counters on it, create X tapped 2/1 white and black Inkling
// creature tokens with flying, where X is the number of counters it had on it."
// Pins: CR 603.10a (a leaves-the-battlefield trigger looks back in time), CR 113.7a and 608.2h (the counters the creature had as it last existed, of every kind added together),
// CR 603.4 (the intervening "if" is checked as it triggers) and that only a nontoken creature of the controller triggers it.
// Cards: the SYNTHETIC "Counter Mourner" of this file and the real Grizzly Bears and Murder.
import { describe, expect, test } from 'vitest';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const MOURNER = 'SYNTHETIC Counter Mourner';
const BEARS = 'Grizzly Bears';

const mourner = singleFaceCard({
  name: MOURNER,
  manaCost: ['1', 'W', 'B'],
  types: ['creature'],
  subtypes: ['Vampire'],
  colors: ['W', 'B'],
  colorIdentity: ['W', 'B'],
  power: 3,
  toughness: 3,
  oracleText:
    'Whenever a nontoken creature you control dies, if it had counters on it, create X tapped 2/1 white and black Inkling creature tokens with flying, where X is the number of counters it had on it.',
  abilities: [
    {
      kind: 'triggered',
      trigger: {
        kind: 'dies',
        what: { types: ['creature'], token: false, controller: 'you', hasCounter: true },
      },
      effect: {
        kind: 'createToken',
        token: {
          kind: 'custom',
          definition: {
            name: 'Inkling',
            manaCost: null,
            supertypes: [],
            types: ['creature'],
            subtypes: ['Inkling'],
            colors: ['W', 'B'],
            power: 2,
            toughness: 1,
            loyalty: null,
            defense: null,
            oracleText: '',
            abilities: [{ kind: 'keyword', keyword: { kind: 'flying' } }],
          },
        },
        count: { kind: 'countersOn', of: { kind: 'triggerSubject' } },
        tapped: true,
      },
    },
  ],
});

/** Seat 0 controls the Mourner and a Bears (with `counters`) and kills the Bears of `victimSeat`. */
const killBears = (counters: Record<string, number>, victimSeat: 0 | 1 = 0) => {
  const bears = (seat: 0 | 1) => (seat === victimSeat ? [BEARS, { counters }] : [BEARS]);
  const g = scenario()
    .seat(0)
    .define(mourner)
    .hand('Murder')
    .battlefield('Swamp', { count: 3 })
    .battlefield(MOURNER)
    .battlefield(...(bears(0) as [string]))
    .seat(1)
    .battlefield(...(bears(1) as [string]))
    .build();
  g.act(0).cast('Murder', { targets: [{ name: BEARS, seat: victimSeat }], pay: true });
  g.passAll();
  g.passAll();
  return g;
};

describe('Felisa: "create X tapped Inkling tokens, where X is the number of counters it had on it"', () => {
  test('a creature with counters of two kinds dies: X is all of them added together, and the tokens enter tapped', () => {
    const g = killBears({ '+1/+1': 2, stun: 1 });
    const tokens = g.find({ name: 'Inkling', zone: 'battlefield' });
    expect(tokens).toHaveLength(3);
    for (const t of tokens) expect(t.tapped).toBe(true);
    g.expect.invariants();
  });

  test('a creature with no counters dies: nothing triggers (the intervening "if", CR 603.4)', () => {
    const g = killBears({});
    expect(g.find({ name: 'Inkling', zone: 'battlefield' })).toHaveLength(0);
  });

  test("an opponent's creature with counters dies: it is not a creature you control", () => {
    const g = killBears({ '+1/+1': 2 }, 1);
    expect(g.find({ name: 'Inkling', zone: 'battlefield' })).toHaveLength(0);
  });
});
