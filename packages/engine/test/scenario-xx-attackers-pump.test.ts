// Jazal Goldmane (Party Time deck, issue 170): "{3}{W}{W}: Attacking creatures you control get +X/+X until end of turn, where X is the number of attacking creatures."
// Pins: CR 508.1k and 506.4 (an attacking creature is one declared as an attacker and still in combat; the count includes every player's attackers, here only mine attack),
// CR 608.2h (X is read as the ability resolves) and CR 613.4c (layer 7c: +X/+X).
// Cards: the SYNTHETIC "Pump Leader" of this file and the real Grizzly Bears (2/2), Healer's Hawk (1/1) and Llanowar Elves (1/1).
import { describe, test } from 'vitest';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const LEADER = 'SYNTHETIC Pump Leader';
const BEARS = 'Grizzly Bears';
const HAWK = "Healer's Hawk";
const ELVES = 'Llanowar Elves';

const COUNT_ATTACKING = {
  kind: 'countOf',
  filter: { types: ['creature'], attacking: true },
} as const;

const leader = singleFaceCard({
  name: LEADER,
  manaCost: ['2', 'W', 'W'],
  types: ['creature'],
  subtypes: ['Human'],
  colors: ['W'],
  colorIdentity: ['W'],
  power: 3,
  toughness: 3,
  oracleText:
    '{3}{W}{W}: Attacking creatures you control get +X/+X until end of turn, where X is the number of attacking creatures.',
  abilities: [
    {
      kind: 'activated',
      cost: [{ kind: 'mana', symbols: ['3', 'W', 'W'] }],
      effect: {
        kind: 'modifyPt',
        objects: {
          kind: 'each',
          filter: { zone: 'battlefield', types: ['creature'], controller: 'you', attacking: true },
        },
        power: COUNT_ATTACKING,
        toughness: COUNT_ATTACKING,
        duration: 'untilEndOfTurn',
      },
    },
  ],
});

const attacked = (...attackers: readonly string[]) => {
  const g = scenario()
    .seat(0)
    .define(leader)
    .battlefield('Plains', { count: 5 })
    .battlefield(LEADER, BEARS, HAWK, ELVES)
    .seat(1)
    .battlefield(BEARS)
    .build();
  g.advanceTo('declareAttackers', { attack: false });
  g.act(0).attack([...attackers]);
  return g;
};

describe('"Attacking creatures you control get +X/+X, where X is the number of attacking creatures"', () => {
  test("three attackers: each gets +3/+3; a creature that does not attack and the opponent's creature get nothing", () => {
    const g = attacked(BEARS, HAWK, ELVES);
    g.act(0).activate(LEADER, { pay: true });
    g.passAll();
    g.expect.pt(HAWK, 4, 4);
    g.expect.pt(ELVES, 4, 4);
    g.expect.pt(LEADER, 3, 3);
    g.expect.pt({ name: BEARS, seat: 0 }, 5, 5);
    g.expect.pt({ name: BEARS, seat: 1 }, 2, 2);
    g.expect.invariants();
  });

  test('X counts the attackers, not my creatures: one attacker gets +1/+1', () => {
    const g = attacked(HAWK);
    g.act(0).activate(LEADER, { pay: true });
    g.passAll();
    g.expect.pt(HAWK, 2, 2);
    g.expect.pt({ name: BEARS, seat: 0 }, 2, 2);
    g.expect.pt({ name: BEARS, seat: 1 }, 2, 2);
  });
});
