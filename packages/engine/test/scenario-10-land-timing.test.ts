// Scenario 10 (SPEC 12): when a land can be played.
// Pins: CR 305.1 (Lands): a player with priority may play a land from hand during a main phase of
// their turn with an empty stack; CR 305.2 and 305.2b: one land per turn unless an effect adds
// more; CR 305.3: never when it isn't their turn. CR 116.2a: playing a land is a special action.
// Every rejection is checked twice: applyAction returns an error AND the option is absent from
// getLegalActions (g.expect.illegal does both and checks the state is unchanged).
import { describe, expect, test } from 'vitest';
import type { StepId } from '../src/index';
import { scenario } from '../src/testing/index';

const NO_LAND_STEPS: StepId[] = [
  'upkeep',
  'draw',
  'beginningOfCombat',
  'declareAttackers',
  'endOfCombat',
  'end',
];

describe('CR 305.1 (Lands): the phase and the stack', () => {
  test.each(['precombatMain', 'postcombatMain'] as const)(
    'a land can be played in the %s with an empty stack',
    (step) => {
      const g = scenario().seat(0).hand('Forest').seat(1).at(step).build();
      g.expect.legal(0, { playLand: 'Forest' });
      g.act(0).playLand('Forest');
      g.expect.zone('Forest', 'battlefield', { seat: 0 });
      g.expect.zone('Forest', 'hand', { count: 0 });
    },
  );

  test.each(NO_LAND_STEPS)('a land cannot be played in the %s step', (step) => {
    const g = scenario().seat(0).hand('Forest').seat(1).at(step).build();
    g.expect.illegal(0, { playLand: 'Forest' });
    g.expect.zone('Forest', 'hand', { seat: 0 });
  });

  test('a land cannot be played during combat: beginning of combat, with priority', () => {
    const g = scenario().seat(0).hand('Forest').seat(1).at('beginningOfCombat').build();
    g.expect.illegal(0, { playLand: 'Forest' });
    // The same land is playable in the main phase of the same turn, once it comes round.
    g.advanceTo('postcombatMain');
    g.act(0).playLand('Forest');
    g.expect.zone('Forest', 'battlefield', { seat: 0 });
  });

  test('a land cannot be played with a non-empty stack, even in a main phase', () => {
    const g = scenario()
      .seat(0)
      .hand('Lightning Bolt', 'Forest')
      .battlefield('Mountain')
      .seat(1)
      .build();
    g.act(0).cast('Lightning Bolt', { targets: [{ player: 1 }], pay: true });
    g.expect.stack(['Lightning Bolt']);
    g.expect.illegal(0, { playLand: 'Forest' });
    // Once the Bolt resolves and the stack is empty, the land is legal again.
    g.passAll();
    g.expect.stack([]);
    g.act(0).playLand('Forest');
  });

  test('a land cannot be played while a spell is being cast (not a priority decision)', () => {
    const g = scenario()
      .seat(0)
      .hand('Lightning Bolt', 'Forest')
      .battlefield('Mountain')
      .seat(1)
      .build();
    g.act(0).cast('Lightning Bolt');
    g.expect.pending('targets', 0);
    g.expect.illegal(0, { playLand: 'Forest' });
  });

  test('a card that is not a land cannot be played as a land', () => {
    const g = scenario().seat(0).hand('Grizzly Bears').build();
    g.expect.illegal(0, { playLand: 'Grizzly Bears' });
  });
});

describe('CR 305.3 (Lands): not on the opponent turn', () => {
  test('the non-active seat with priority in its opponent main phase cannot play a land', () => {
    const g = scenario()
      .seat(0)
      .seat(1)
      .hand('Plains')
      .at('precombatMain', { active: 0, priority: 1 })
      .build();
    g.expect.pending('priority', 1);
    g.expect.illegal(1, { playLand: 'Plains' });
  });

  test('the active seat cannot act while the opponent holds the decision', () => {
    const g = scenario()
      .seat(0)
      .hand('Forest')
      .seat(1)
      .at('precombatMain', { active: 0, priority: 1 })
      .build();
    g.expect.illegal(0, { playLand: 'Forest' });
  });

  test('passing priority gives the opponent priority in the main phase but no land play', () => {
    const g = scenario().seat(0).seat(1).hand('Plains').build();
    g.act(0).pass();
    g.expect.pending('priority', 1);
    g.expect.illegal(1, { playLand: 'Plains' });
  });

  test('in their own turn the other seat can play a land', () => {
    const g = scenario()
      .seat(0)
      .seat(1)
      .hand('Plains')
      .at('precombatMain', { active: 1, turn: 4 })
      .build();
    g.act(1).playLand('Plains');
    g.expect.zone('Plains', 'battlefield', { seat: 1 });
  });
});

describe('CR 305.2 (Lands): one land per turn', () => {
  test('a second land in one turn is rejected', () => {
    const g = scenario().seat(0).hand('Forest', 'Plains').seat(1).build();
    g.act(0).playLand('Forest');
    g.expect.illegal(0, { playLand: 'Plains' });
    g.expect.zone('Plains', 'hand', { seat: 0 });
    expect(g.state.seats[0]?.landsPlayedThisTurn).toBe(1);
  });

  test('a land played earlier this turn counts (lands played = 1 at build)', () => {
    const g = scenario().seat(0).hand('Forest').landsPlayed(1).seat(1).build();
    g.expect.illegal(0, { playLand: 'Forest' });
  });

  test('the count is for the turn: the land drop comes back next turn (CR 305.2)', () => {
    const g = scenario()
      .seat(0)
      .hand('Forest', 'Plains')
      .library('Island', { count: 3 })
      .seat(1)
      .library('Island', { count: 3 })
      .build();
    g.act(0).playLand('Forest');
    g.expect.illegal(0, { playLand: 'Plains' });
    g.advanceTo('precombatMain', { turn: 5 });
    g.expect.legal(0, { playLand: 'Plains' });
    g.act(0).playLand('Plains');
  });

  test('an effect that grants an extra land drop makes the second land legal (CR 305.2)', () => {
    const g = scenario()
      .seat(0)
      .hand('Forest', 'Plains', 'Swamp')
      .seat(1)
      .at('precombatMain', { extraLandDrops: 1 })
      .build();
    g.act(0).playLand('Forest');
    g.expect.legal(0, { playLand: 'Plains' });
    g.act(0).playLand('Plains');
    // Two drops used, two allowed: the third is rejected (CR 305.2b).
    g.expect.illegal(0, { playLand: 'Swamp' });
  });

  test('the extra drop does not carry into the next turn', () => {
    const g = scenario()
      .seat(0)
      .hand('Forest', 'Plains', 'Swamp')
      .library('Island', { count: 3 })
      .seat(1)
      .library('Island', { count: 3 })
      .at('precombatMain', { extraLandDrops: 1 })
      .build();
    g.advanceTo('precombatMain', { turn: 5 });
    g.act(0).playLand('Forest');
    g.expect.illegal(0, { playLand: 'Plains' });
  });

  test('a land does not use the stack, so the opponent never gets to respond (CR 305.1)', () => {
    const g = scenario().seat(0).hand('Forest').seat(1).build();
    g.act(0).playLand('Forest');
    g.expect.stack([]);
    g.expect.pending('priority', 0);
    g.expect.noEvent({ kind: 'priorityPassed' });
    g.expect.eventLog([
      { kind: 'zoneChanged', toZone: 'battlefield' },
      { kind: 'landPlayed', seat: 0 },
    ]);
  });
});
