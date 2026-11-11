// Scenario 15 (SPEC 12): +1/+1 and -1/-1 counters on the same creature cancel out.
// Pins: CR 704.5q (State-Based Actions): if a permanent has both a +1/+1 counter and a -1/-1
// counter on it, N of each are removed, where N is the smaller of the two numbers; CR 704.3: it is a
// state-based action, so it is done the next time a player would receive priority and as part of
// the one simultaneous check; CR 613.4c (Layer 7c): each +1/+1 counter gives +1/+1 and each -1/-1
// counter -1/-1, so the power and toughness are the same before and after the cancellation;
// CR 704.5f: a creature with toughness 0 or less is put into its graveyard; CR 122.1a: counters are
// not the same as the effects that put them there.
// "SYNTHETIC Rot" and "SYNTHETIC Growth" (invented, defined in this file) put a counter on a target
// creature. Creatures: Grizzly Bears (2/2).
import { describe, test } from 'vitest';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const BEARS = 'Grizzly Bears';
const CREATURE_TARGET = {
  id: 't1',
  what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
} as const;

const counterSpell = (name: string, counter: '+1/+1' | '-1/-1', count: number) =>
  singleFaceCard({
    name,
    manaCost: ['B'],
    types: ['instant'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: `Put ${count} ${counter} counter${count === 1 ? '' : 's'} on target creature.`,
    spell: {
      targets: [CREATURE_TARGET],
      effect: {
        kind: 'addCounters',
        objects: { kind: 'target', id: 't1' },
        counter,
        count,
      },
    },
  });

const ROT = counterSpell('SYNTHETIC Rot', '-1/-1', 1);
const ROT_THREE = counterSpell('SYNTHETIC Deep Rot', '-1/-1', 3);
const GROWTH = counterSpell('SYNTHETIC Growth', '+1/+1', 1);

function board(counters: Record<string, number>, spell: string) {
  return scenario()
    .seat(0)
    .hand(spell)
    .battlefield('Swamp')
    .battlefield(BEARS, { counters })
    .define(ROT)
    .define(ROT_THREE)
    .define(GROWTH)
    .seat(1)
    .build();
}

describe('SPEC scenario 15: +1/+1 and -1/-1 counters cancel (CR 704.5q)', () => {
  test('a -1/-1 counter on a creature with two +1/+1 counters leaves one +1/+1 counter', () => {
    const g = board({ '+1/+1': 2 }, ROT.name);
    g.act(0).cast(ROT.name, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.counters(BEARS, { '+1/+1': 1 });
    g.expect.pt(BEARS, 3, 3);
    g.expect.eventLog([
      { kind: 'counterAdded', counter: '-1/-1', count: 1 },
      { kind: 'counterRemoved', counter: '+1/+1', count: 1 },
      { kind: 'counterRemoved', counter: '-1/-1', count: 1 },
    ]);
    g.expect.invariants();
  });

  test('equal numbers cancel completely: no counters are left and the creature is its printed 2/2', () => {
    const g = board({ '+1/+1': 1 }, ROT.name);
    g.expect.pt(BEARS, 3, 3);
    g.act(0).cast(ROT.name, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.counters(BEARS, {});
    g.expect.pt(BEARS, 2, 2);
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
  });

  test('more -1/-1 counters than +1/+1: the difference of -1/-1 counters stays', () => {
    const g = board({ '+1/+1': 1 }, ROT_THREE.name);
    g.act(0).cast(ROT_THREE.name, { targets: [BEARS], pay: true });
    g.passAll();
    // 1 +1/+1 and 3 -1/-1: one of each goes, two -1/-1 are left: a 0/0 dies (CR 704.5f).
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
  });

  test('the same in the other direction: a +1/+1 counter added to a creature with -1/-1 counters', () => {
    const g = board({ '-1/-1': 1 }, GROWTH.name);
    g.expect.pt(BEARS, 1, 1);
    g.act(0).cast(GROWTH.name, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.counters(BEARS, {});
    g.expect.pt(BEARS, 2, 2);
  });

  test('the check is the state-based action: counters written both ways are removed at the first priority', () => {
    const both = scenario()
      .seat(0)
      .battlefield(BEARS, { counters: { '+1/+1': 2, '-1/-1': 2 } })
      .seat(1)
      .build();
    // Until the check, both kinds are on it, and the net power and toughness is the printed 2/2
    // (CR 613.4c), so the cancellation never changes what the creature is.
    both.expect.counters(BEARS, { '+1/+1': 2, '-1/-1': 2 });
    both.expect.pt(BEARS, 2, 2);
    both.act(0).pass();
    both.expect.counters(BEARS, {});
    both.expect.pt(BEARS, 2, 2);
    both.expect.eventLog([
      { kind: 'counterRemoved', counter: '+1/+1', count: 2 },
      { kind: 'counterRemoved', counter: '-1/-1', count: 2 },
    ]);
  });

  test('other counters are untouched', () => {
    const g = scenario()
      .seat(0)
      .battlefield(BEARS, { counters: { '+1/+1': 1, '-1/-1': 1, charge: 3 } })
      .seat(1)
      .build();
    g.act(0).pass();
    g.expect.counters(BEARS, { charge: 3 });
  });
});
