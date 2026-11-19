// The agents and Rooms (CR 709.5): the Casual and the Heuristic agent unlock a locked half of a Room of their own with the mana left after their spells (the special action of CR
// 709.5e); the dearest half they can pay for goes first; they never unlock outside their own main phase with an empty stack, and only a half the engine offers (the cost can be paid).
// They pay the cost when asked, and they cast a Room as any permanent spell, either half. The cards are SYNTHETIC (the engine's synthetic-rooms.ts).
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { CasualAgent, HeuristicAgent } from '../src/index';
import { answer, expectLegal } from './casual-helpers';
import { askHeuristic } from './heuristic-helpers';

const WATCH = 'SYNTHETIC Watch Room // Vault Room'; // {1}{W} | {2}{B}
const PLAIN = 'SYNTHETIC Plain Room // Bare Room'; // {W} | {1}{U}
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;
type Builder = ReturnType<typeof scenario>;

function main(
  place: (b: Builder) => Builder,
  step: Parameters<Builder['at']>[0] = 'precombatMain',
) {
  return place(
    scenario()
      .seat(0)
      .life(20)
      .library(...FILLER),
  )
    .seat(1)
    .life(20)
    .library(...FILLER)
    .at(step, { active: 0, turn: 3 })
    .build();
}

describe('the Casual agent', () => {
  test('unlocks the locked half of its Room when it can pay', async () => {
    const g = main((b) =>
      b
        .seat(0)
        .battlefield(WATCH, { unlocked: [0] })
        .battlefield('Swamp', { count: 3 })
        .seat(0),
    );
    const action = await answer(g);
    expect(action).toEqual({ kind: 'unlockDoor', object: g.id(WATCH), door: 1 });
    expectLegal(g, action);
  });

  test('the dearest half it can pay goes first', async () => {
    const g = main((b) =>
      b
        .seat(0)
        .battlefield(PLAIN)
        .battlefield('Plains', { count: 1 })
        .battlefield('Island', { count: 2 })
        .seat(0),
    );
    // {W} and {1}{U} can both be paid: the right half costs more.
    expect(await answer(g)).toEqual({ kind: 'unlockDoor', object: g.id(PLAIN), door: 1 });
  });

  test('does nothing when no locked half can be paid for', async () => {
    const g = main((b) =>
      b
        .seat(0)
        .battlefield(WATCH, { unlocked: [0] })
        .battlefield('Swamp', { count: 2 })
        .seat(0),
    );
    expect(await answer(g)).toEqual({ kind: 'pass' });
  });

  test('not in the opponent’s turn or in combat: the engine offers no option and the agent passes', async () => {
    const combat = main(
      (b) =>
        b
          .seat(0)
          .battlefield(WATCH, { unlocked: [0] })
          .battlefield('Swamp', { count: 3 })
          .seat(0),
      'beginningOfCombat',
    );
    expect(await answer(combat)).toEqual({ kind: 'pass' });
  });

  test('pays the cost when asked (payAuto) and the half is unlocked afterwards', async () => {
    const g = main((b) =>
      b
        .seat(0)
        .battlefield(WATCH, { unlocked: [0] })
        .battlefield('Swamp', { count: 3 })
        .seat(0),
    );
    const agent = new CasualAgent({ seed: 1 });
    g.choose(await answer(g, agent));
    expect(g.state.pending?.kind).toBe('payMana');
    expect(await answer(g, agent)).toEqual({ kind: 'payAuto' });
    g.choose({ kind: 'payAuto' });
    expect(g.state.objects[g.id(WATCH)]?.unlockedDoors).toEqual([0, 1]);
  });

  test('casts a Room from its hand as a permanent spell (either half the mana pays for)', async () => {
    const g = main((b) => b.seat(0).hand(WATCH).battlefield('Plains', { count: 2 }).seat(0));
    const action = await answer(g);
    expect(action).toMatchObject({ kind: 'castSpell', object: g.id(WATCH), face: 0 });
    expectLegal(g, action);
  });
});

describe('the Heuristic agent', () => {
  test('unlocks the locked half with the mana left', async () => {
    const g = main((b) =>
      b
        .seat(0)
        .battlefield(WATCH, { unlocked: [0] })
        .battlefield('Swamp', { count: 3 })
        .seat(0),
    );
    const choice = await askHeuristic(g, new HeuristicAgent({ seed: 1 }));
    expect(choice).toEqual({ kind: 'unlockDoor', object: g.id(WATCH), door: 1 });
  });
});
