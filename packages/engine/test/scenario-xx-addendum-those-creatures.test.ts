// Unbreakable Formation (Party Time deck, issue 170): "Creatures you control gain indestructible until end of turn. Addendum — If you cast this spell during your main phase, put a +1/+1
// counter on each of those creatures and they gain vigilance until end of turn."
// Pins: CR 207.2c (Addendum is an ability word: only the condition has meaning), CR 608.2c ("those creatures" are the creatures the first sentence affected), CR 122.1 (counters),
// CR 702.12b and 702.20b (indestructible, vigilance as keywords the creatures have), and the main-phase condition (cast at another time, only the first sentence happens).
// Cards: the SYNTHETIC "Formation Rite" of this file and the real Grizzly Bears and Healer's Hawk.
import { describe, test } from 'vitest';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const RITE = 'SYNTHETIC Formation Rite';
const BEARS = 'Grizzly Bears';
const HAWK = "Healer's Hawk";

const MINE = {
  kind: 'each',
  filter: { zone: 'battlefield', types: ['creature'], controller: 'you' },
} as const;

const rite = singleFaceCard({
  name: RITE,
  manaCost: ['2', 'W'],
  types: ['instant'],
  colors: ['W'],
  colorIdentity: ['W'],
  oracleText:
    'Creatures you control gain indestructible until end of turn.\nAddendum — If you cast this spell during your main phase, put a +1/+1 counter on each of those creatures and they gain vigilance until end of turn.',
  spell: {
    effect: {
      kind: 'sequence',
      effects: [
        {
          kind: 'grantKeyword',
          objects: MINE,
          keyword: { kind: 'indestructible' },
          duration: 'untilEndOfTurn',
        },
        {
          kind: 'conditional',
          condition: { kind: 'castInOwnMainPhase' },
          effect: {
            kind: 'sequence',
            effects: [
              { kind: 'addCounters', objects: MINE, counter: '+1/+1', count: 1 },
              {
                kind: 'grantKeyword',
                objects: MINE,
                keyword: { kind: 'vigilance' },
                duration: 'untilEndOfTurn',
              },
            ],
          },
        },
      ],
    },
  },
});

const table = () =>
  scenario()
    .seat(0)
    .define(rite)
    .hand(RITE)
    .battlefield('Plains', { count: 3 })
    .battlefield(BEARS, HAWK)
    .seat(1)
    .battlefield(BEARS)
    .build();

const keywords = (g: ReturnType<typeof table>, name: string, seat = 0) =>
  g.view(0).battlefield.find((o) => o.name === name && o.controller === seat)?.keywords ?? [];

describe('Addendum: "put a +1/+1 counter on each of those creatures and they gain vigilance"', () => {
  test("cast in my main phase: every creature I control gets indestructible, a +1/+1 counter and vigilance; the opponent's creature gets nothing", () => {
    const g = table();
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    g.expect.pt(HAWK, 2, 2);
    g.expect.pt({ name: BEARS, seat: 0 }, 3, 3);
    g.expect.pt({ name: BEARS, seat: 1 }, 2, 2);
    for (const name of [BEARS, HAWK]) {
      const kws = keywords(g, name);
      if (!kws.includes('indestructible') || !kws.includes('vigilance')) {
        throw new Error(`${name} has ${kws.join(',')}`);
      }
    }
    if (keywords(g, BEARS, 1).includes('indestructible')) throw new Error('opponent affected');
    g.expect.invariants();
  });

  test('cast during combat: indestructible only, no counter and no vigilance', () => {
    const g = table();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([HAWK]);
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    g.expect.pt(HAWK, 1, 1);
    const kws = keywords(g, HAWK);
    if (!kws.includes('indestructible') || kws.includes('vigilance')) {
      throw new Error(`Hawk has ${kws.join(',')}`);
    }
  });
});
