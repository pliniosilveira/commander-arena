// "Can't be blocked except by three or more creatures" (Hosts of Mordor deck, Troll of Khazad-dûm). Pins: CR 509.1b (a blocking restriction is read as blockers are declared; a
// declaration that breaks it is illegal), CR 702.111b (Menace, the same rule with two blockers), CR 509.1a (a creature blocks one attacker). The CR text was not available in this
// environment: the numbers are the ones the engine's comments cite. The card is SYNTHETIC.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { getLegalActions, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const TROLL = singleFace({
  name: 'SYNTHETIC Three Blocker Troll',
  manaCost: ['4', 'B'],
  types: ['creature'],
  subtypes: ['Troll'],
  colors: ['B'],
  colorIdentity: ['B'],
  power: 4,
  toughness: 4,
  oracleText: "SYNTHETIC: this creature can't be blocked except by three or more creatures.",
  abilities: [
    {
      kind: 'static',
      static: {
        kind: 'restriction',
        subject: { kind: 'this' },
        restriction: 'cantBeBlockedExceptByThreeOrMore',
      },
    },
  ],
});
const BLOCKERS = ['Grizzly Bears', 'SYNTHETIC Vanilla 3/3', 'SYNTHETIC Vanilla 2/2'] as const;

function attacked(defenders: number): ScenarioGame {
  const b = scenario().define(TROLL).seat(0).battlefield(TROLL.name).seat(1);
  for (const name of BLOCKERS.slice(0, defenders)) b.battlefield(name);
  const g = b.at('precombatMain', { active: 0 }).build();
  g.advanceTo('declareAttackers');
  g.act(0).attack([TROLL.name]);
  g.advanceTo('declareBlockers');
  return g;
}

describe('can not be blocked except by three or more creatures (CR 509.1b)', () => {
  test('the card is valid', () => {
    expect(validateCard(TROLL)).toEqual([]);
  });

  test('one or two blockers are refused and not listed; the decision asks for three', () => {
    const g = attacked(3);
    const d = g.state.pending;
    if (d?.kind !== 'declareBlockers') throw new Error('expected declareBlockers');
    expect(d.attackers.map((a) => a.minBlockers)).toEqual([3]);
    const block = (n: number) =>
      BLOCKERS.slice(0, n).map((blocker) => ({ blocker, attacker: TROLL.name }));
    const before = g.hash();
    for (const n of [1, 2]) {
      expect(g.act(1).try.declareBlockers(block(n))).toEqual({
        ok: false,
        error: 'That attacker needs 3 or more blockers',
      });
    }
    g.expect.hash(before);
    const legal = getLegalActions(g.state, 1).filter((a) => a.kind === 'declareBlockers');
    expect(legal.some((a) => a.blocks.length === 1 || a.blocks.length === 2)).toBe(false);
  });

  test('three blockers are accepted', () => {
    const g = attacked(3);
    const blocks = BLOCKERS.map((blocker) => ({ blocker, attacker: TROLL.name }));
    expect(g.act(1).try.declareBlockers(blocks)).toMatchObject({ ok: true });
  });

  test('with fewer than three creatures to block, it is as if unblockable', () => {
    const g = attacked(2);
    const legal = getLegalActions(g.state, 1).filter((a) => a.kind === 'declareBlockers');
    expect(legal.every((a) => a.blocks.length === 0)).toBe(true);
  });
});
