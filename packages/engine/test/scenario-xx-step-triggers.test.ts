// "At the beginning of ..." triggers for every step and phase (D-111): the `step` trigger kind.
// Pins: CR 500.2 (a step begins: its turn-based action, then priority), CR 503 to 514 (the steps),
// CR 504.1 and 504.2 (the draw step's turn-based draw comes first, then the active player gets
// priority), CR 507 (beginning of combat happens even with no attacker), CR 511 (end of combat),
// CR 603.2 and 603.3 (a trigger waits until a player would receive priority), CR 603.3b (APNAP and
// each player orders their own). Cards are SYNTHETIC (src/cards/fixtures/synthetic-triggers-more.ts).
import { describe, expect, test } from 'vitest';
import { TRIGGER_STEPS, type TriggerStep } from '../src/ast/types';
import { stepWatcherName } from '../src/cards/fixtures/synthetic-triggers-more';
import type { StepId } from '../src/index';
import { scenario } from '../src/testing/index';

const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;
const STEP_ID: Record<TriggerStep, StepId> = {
  upkeep: 'upkeep',
  draw: 'draw',
  main1: 'precombatMain',
  beginCombat: 'beginningOfCombat',
  combatEnd: 'endOfCombat',
  main2: 'postcombatMain',
  endStep: 'end',
};
const WHOSE = ['you', 'each', 'opponent'] as const;

/** Whether a watcher of seat 0 triggers in a step of `active`'s turn (CR 503 to 514, 603.2). */
function triggersFor(whose: (typeof WHOSE)[number], active: 0 | 1): boolean {
  if (whose === 'each') return true;
  return whose === 'you' ? active === 0 : active === 1;
}

/** Seat 0 controls the watcher; the game is in the postcombat main phase of the other turn. */
function toStep(step: TriggerStep, whose: (typeof WHOSE)[number], active: 0 | 1) {
  const g = scenario()
    .seat(0)
    .life(20)
    .battlefield(stepWatcherName(step, whose))
    .library(...FILLER)
    .seat(1)
    .library(...FILLER)
    .at('postcombatMain', { active: active === 0 ? 1 : 0, turn: 2 })
    .build();
  g.advanceTo(STEP_ID[step], { turn: 'next' });
  return g;
}

describe('every step and phase, on both players turns (CR 503 to 514, 603.2)', () => {
  for (const step of TRIGGER_STEPS) {
    for (const whose of WHOSE) {
      for (const active of [0, 1] as const) {
        const expected = triggersFor(whose, active);
        test(`${step} / ${whose} on seat ${active}'s turn: ${expected ? 'triggers' : 'does not trigger'}`, () => {
          const g = toStep(step, whose, active);
          g.expect.step(STEP_ID[step], { active });
          g.expect.stack(expected ? [`${stepWatcherName(step, whose)} (ability)`] : []);
          if (expected) {
            // CR 603.3: it went on the stack before the active player received priority.
            g.expect.pending('priority', active);
            // The watcher also triggered in the step of the turn walked through on the way: read the life now.
            const before = g.state.seats[0]?.life ?? 0;
            g.pass();
            g.pass();
            g.expect.life(0, before + 1);
          }
          g.expect.invariants();
        });
      }
    }
  }
});

describe('the beginning of combat with no attack (CR 507, 508.8)', () => {
  test('triggers although no creature attacks, and the combat goes on to its end', () => {
    const g = toStep('beginCombat', 'you', 0);
    g.expect.stack(['SYNTHETIC Step Watcher beginCombat you (ability)']);
    g.pass();
    g.pass();
    g.expect.life(0, 21);
    // No creature can attack: declare attackers is skipped by the engine, then the end of combat.
    g.advanceTo('endOfCombat');
    g.expect.life(0, 21);
  });

  test('a creature that can attack still gets its declaration after the trigger resolved', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield('SYNTHETIC Step Watcher beginCombat you', 'Grizzly Bears')
      .seat(1)
      .at('precombatMain')
      .build();
    g.advanceTo('beginningOfCombat');
    g.expect.stack(['SYNTHETIC Step Watcher beginCombat you (ability)']);
    g.pass();
    g.pass();
    g.expect.life(0, 21);
    g.pass();
    g.pass();
    g.expect.pending('declareAttackers', 0);
  });
});

describe('the draw step (CR 504.1, 504.2, 603.3)', () => {
  test('the turn-based draw happens first, then the trigger goes on the stack', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield(stepWatcherName('draw', 'you'))
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('endOfCombat', { active: 1, turn: 2 })
      .build();
    const mark = g.mark();
    g.advanceTo('draw', { turn: 'next' });
    g.expect.handSize(0, 1);
    g.expect.stack(['SYNTHETIC Step Watcher draw you (ability)']);
    g.expect.eventLog(
      [
        { kind: 'stepBegan', step: 'draw', seat: 0 },
        { kind: 'cardDrawn', seat: 0 },
        { kind: 'abilityTriggered', seat: 0 },
      ],
      { since: mark },
    );
  });

  test('the draw step trigger of the opponent turn waits for its own draw too', () => {
    const g = toStep('draw', 'opponent', 1);
    g.expect.handSize(1, 1);
    g.expect.stack(['SYNTHETIC Step Watcher draw opponent (ability)']);
  });
});

describe('several step triggers at once (CR 603.3b)', () => {
  test('the active player puts theirs on the stack first, so the other player resolves first', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield(stepWatcherName('beginCombat', 'you'))
      .seat(1)
      .life(20)
      .battlefield(stepWatcherName('beginCombat', 'opponent'))
      .at('precombatMain')
      .build();
    g.advanceTo('beginningOfCombat');
    // Top of the stack first: seat 1's trigger resolves before seat 0's.
    g.expect.stack([
      `${stepWatcherName('beginCombat', 'opponent')} (ability)`,
      `${stepWatcherName('beginCombat', 'you')} (ability)`,
    ]);
    g.pass();
    g.pass();
    g.expect.life(1, 21);
    g.expect.life(0, 20);
    g.pass();
    g.pass();
    g.expect.life(0, 21);
  });

  test('a player with two different triggers orders them', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield(stepWatcherName('beginCombat', 'you'), stepWatcherName('beginCombat', 'each'))
      .seat(1)
      .at('precombatMain')
      .build();
    g.advanceTo('beginningOfCombat');
    g.expect.pending('orderTriggers', 0);
    g.act(0).orderTriggers(
      stepWatcherName('beginCombat', 'each'),
      stepWatcherName('beginCombat', 'you'),
    );
    g.expect.stack([
      `${stepWatcherName('beginCombat', 'you')} (ability)`,
      `${stepWatcherName('beginCombat', 'each')} (ability)`,
    ]);
  });

  test('two copies of the same watcher are two triggers of different sources, so their player orders them', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield(stepWatcherName('main2', 'you'), stepWatcherName('main2', 'you'))
      .seat(1)
      .at('endOfCombat')
      .build();
    g.advanceTo('postcombatMain');
    g.expect.pending('orderTriggers', 0);
    g.act(0).orderTriggers(0, 1);
    g.expect.stack([
      `${stepWatcherName('main2', 'you')} (ability)`,
      `${stepWatcherName('main2', 'you')} (ability)`,
    ]);
  });
});

describe('the older kinds still work next to the new one', () => {
  test('an upkeep watcher and the step form trigger together', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield('SYNTHETIC Upkeep Reader', stepWatcherName('upkeep', 'you'))
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('postcombatMain', { active: 1, turn: 2 })
      .build();
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.pending('orderTriggers', 0);
    g.act(0).orderTriggers(0, 1);
    expect(g.state.stack).toHaveLength(2);
  });
});

describe('determinism and legal actions', () => {
  test('the same scenario twice ends in the same state', () => {
    const run = () => {
      const g = toStep('endStep', 'each', 1);
      g.pass();
      g.pass();
      return g.hash();
    };
    expect(run()).toBe(run());
  });

  test('the legal actions at the step agree with the engine', () => {
    const g = toStep('main1', 'each', 0);
    for (const action of g.legalActions(g.deciding)) {
      const probe = toStep('main1', 'each', 0);
      const result = probe.act(probe.deciding).try.action(action);
      expect(result.ok, JSON.stringify(action)).toBe(true);
    }
  });
});
