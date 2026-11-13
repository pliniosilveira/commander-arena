// "At the beginning of each of your postcombat main phases, there is an additional beginning phase after this phase" (D-1130, Hashaton deck group 7): the effect
// `extraBeginningPhase`, a whole beginning phase added after the postcombat main phase.
// Pins: CR 500.8 and 500.10 (the phase is added directly after the specified phase and the turn goes on with the phase after it, the ending phase; the most recently
// created one occurs first), CR 502.1 and 502.3 (the untap step: phased-out permanents of the active player phase in, the active player untaps, no priority), CR 503
// and 504 (the upkeep and draw steps give priority, the draw is a turn-based action), CR 103.8a (only the first draw step of the first turn is skipped), CR 603.2b
// ("at the beginning of" triggers fire again in the added steps), CR 505.1 (there is no second postcombat main phase, so the trigger does not recur on its own).
// Cards: SYNTHETIC Second Sun Sphinx (src/cards/fixtures/synthetic-hashaton-g7.ts), the step watchers and Phase Guard (SYNTHETIC) and real fixtures.
import { describe, expect, test } from 'vitest';
import { stepWatcherName } from '../src/cards/fixtures/synthetic-triggers-more';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const SPHINX = 'SYNTHETIC Second Sun Sphinx';
const UPKEEP = stepWatcherName('upkeep', 'you');
const DRAW = stepWatcherName('draw', 'you');
const MAIN2 = stepWatcherName('main2', 'you');
const PHASE_GUARD = 'SYNTHETIC Phase Guard';
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

type Game = ReturnType<ReturnType<typeof scenario>['build']>;

/** The steps that began, in order, from the log of events. */
const steps = (g: Game): string[] =>
  g.events.flatMap((e) => (e.kind === 'stepBegan' ? [e.step] : []));

/** Seat 0 controls `mine` on the battlefield, the game is in the precombat main phase of turn 3 (seat 0's). */
function start(mine: readonly string[], opts: { readonly turn?: number } = {}) {
  return scenario()
    .seat(0)
    .life(20)
    .battlefield(...mine)
    .library(...LIBRARY)
    .seat(1)
    .library(...LIBRARY)
    .at('precombatMain', { active: 0, turn: opts.turn ?? 3 })
    .build();
}

/** Answers an order-triggers question, if one is pending, and passes until the step is reached. */
function walkTo(
  g: Game,
  step: Parameters<Game['advanceTo']>[0],
  opts?: Parameters<Game['advanceTo']>[1],
): void {
  for (let i = 0; i < 40 && !(g.state.turn.step === step); i += 1) {
    if (g.state.pending?.kind === 'orderTriggers') {
      g.act(g.state.pending.seat).orderTriggers(0, 1);
      continue;
    }
    g.advanceTo(step, opts);
    return;
  }
}

describe('the card is valid and the effect is refused where no postcombat main phase is going on', () => {
  test('the Sphinx is valid', () => {
    expect(validateCard(syntheticCard(SPHINX))).toEqual([]);
  });

  test('the shapes that are refused', () => {
    const card = syntheticCard(SPHINX);
    const face = card.faces[0];
    if (face === undefined) throw new Error('no face');
    const withAbility = (ability: unknown) =>
      ({ ...card, faces: [{ ...face, abilities: [ability] }] }) as never;
    const effect = { kind: 'extraBeginningPhase' };
    const on = (trigger: unknown) => withAbility({ kind: 'triggered', trigger, effect });
    expect(validateCard(on({ kind: 'step', step: 'main2', whose: 'you' }))).toEqual([]);
    expect(validateCard(on({ kind: 'step', step: 'main2', whose: 'each' }))).toEqual([]);
    // the steps and phases that precede or follow it, and the upkeep and the end step, are refused
    for (const trigger of [
      { kind: 'step', step: 'main1', whose: 'you' },
      { kind: 'step', step: 'draw', whose: 'you' },
      { kind: 'step', step: 'endStep', whose: 'you' },
      { kind: 'upkeep', whose: 'you' },
      { kind: 'attacks', what: { kind: 'this' } },
      { kind: 'entersBattlefield', what: { kind: 'this' } },
    ]) {
      expect(validateCard(on(trigger)).length, JSON.stringify(trigger)).toBeGreaterThan(0);
    }
    // not in a spell
    const spell = { ...card, faces: [{ ...face, abilities: [], spell: { effect } }] } as never;
    expect(validateCard(spell).length).toBeGreaterThan(0);
  });
});

describe('one Sphinx: a beginning phase after the postcombat main phase (CR 500.8, 500.10)', () => {
  test('the steps are the untap, upkeep and draw steps of a new beginning phase, then the end step', () => {
    const g = start([SPHINX]);
    g.advanceTo('postcombatMain');
    // CR 603.2b: it triggered as the postcombat main phase began and is on the stack before a player has priority.
    g.expect.stack([`${SPHINX} (ability)`]);
    const before = steps(g).length;
    g.advanceTo('end');
    expect(steps(g).slice(before)).toEqual(['untap', 'upkeep', 'draw', 'end']);
    // the turn is still turn 3 of seat 0 and then goes to the opponent: nothing else was added
    g.expect.step('end', { active: 0 });
    expect(g.state.turn.number).toBe(3);
    expect(g.state.turn.addedPhases).toBeUndefined();
    expect(g.state.turn.addedAfter).toBeUndefined();
    g.expect.invariants();
  });

  test('the trigger does not recur: the turn goes on to the end step, the cleanup step and the opponent', () => {
    const g = start([SPHINX]);
    g.advanceTo('postcombatMain');
    g.advanceTo('end');
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.step('upkeep', { active: 1 });
    expect(g.state.turn.number).toBe(4);
    // exactly one beginning phase was added in the whole of seat 0's turn: untap, upkeep and draw happened twice
    const turn3 = steps(g).slice(0, steps(g).lastIndexOf('untap'));
    expect(turn3.filter((s) => s === 'untap')).toHaveLength(1);
    expect(turn3.filter((s) => s === 'postcombatMain')).toHaveLength(1);
  });

  test('the Sphinx does not trigger in the opponent’s postcombat main phase (each of YOUR postcombat main phases)', () => {
    const g = start([SPHINX]);
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('postcombatMain');
    g.expect.step('postcombatMain', { active: 1 });
    g.expect.stack([]);
    const before = steps(g).length;
    g.advanceTo('end');
    expect(steps(g).slice(before)).toEqual(['end']);
  });

  test('it triggers in each of my turns', () => {
    const g = start([SPHINX]);
    g.advanceTo('postcombatMain');
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('postcombatMain', { turn: 'next' });
    g.expect.step('postcombatMain', { active: 0 });
    expect(g.state.turn.number).toBe(5);
    g.expect.stack([`${SPHINX} (ability)`]);
    const before = steps(g).length;
    g.advanceTo('end');
    expect(steps(g).slice(before)).toEqual(['untap', 'upkeep', 'draw', 'end']);
  });

  test('the added phase has priority in the upkeep and the draw step, and none in the untap step (CR 502.4)', () => {
    const g = start([SPHINX]);
    g.advanceTo('postcombatMain');
    g.passAll();
    // the trigger resolved; both players pass in the postcombat main phase; the untap step gives no priority, so the upkeep is next
    g.pass();
    g.pass();
    g.expect.step('upkeep', { active: 0 });
    g.expect.pending('priority', 0);
    g.pass();
    g.pass();
    g.expect.step('draw', { active: 0 });
    g.expect.pending('priority', 0);
    g.pass();
    g.pass();
    g.expect.step('end', { active: 0 });
  });
});

describe('what the added steps do (CR 502, 503, 504)', () => {
  test('the active player draws a card in the added draw step', () => {
    const g = start([SPHINX]);
    g.advanceTo('postcombatMain');
    const hand = g.state.seats[0]?.hand.length ?? 0;
    g.advanceTo('draw');
    g.expect.step('draw', { active: 0 });
    expect(g.state.seats[0]?.hand.length).toBe(hand + 1);
    expect(g.state.seats[1]?.hand.length).toBe(0);
  });

  test('"at the beginning of your upkeep" and "of your draw step" trigger again (CR 603.2b)', () => {
    const g = start([SPHINX, UPKEEP, DRAW, MAIN2]);
    // the scenario starts in the first main phase: the turn's own upkeep and draw step are over, so the life is the starting 20
    g.advanceTo('postcombatMain');
    g.expect.life(0, 20);
    // the postcombat main phase watcher and the Sphinx trigger together: the controller orders them (CR 603.3b)
    g.expect.pending('orderTriggers', 0);
    walkTo(g, 'upkeep');
    g.expect.step('upkeep', { active: 0 });
    g.expect.stack([`${UPKEEP} (ability)`]);
    g.expect.life(0, 21); // the postcombat main watcher resolved
    g.pass();
    g.pass();
    g.expect.life(0, 22);
    g.pass();
    g.pass();
    g.expect.step('draw', { active: 0 });
    g.expect.stack([`${DRAW} (ability)`]);
    g.pass();
    g.pass();
    g.expect.life(0, 23);
    g.advanceTo('end');
    // the postcombat main watcher did not trigger again: there is no second postcombat main phase
    g.expect.life(0, 23);
  });

  test('the permanents of the active player untap in the added untap step', () => {
    const g = scenario()
      .seat(0)
      .battlefield(SPHINX)
      .battlefield('Mountain', { tapped: true, label: 'mountain' })
      .battlefield('Grizzly Bears', { tapped: true, label: 'bears' })
      .library(...LIBRARY)
      .seat(1)
      .battlefield('Grizzly Bears', { tapped: true, label: 'theirs' })
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.advanceTo('postcombatMain');
    g.expect.tapped('mountain', true);
    g.expect.tapped('bears', true);
    g.advanceTo('upkeep');
    g.expect.tapped('mountain', false);
    g.expect.tapped('bears', false);
    // CR 502.3: the active player's permanents only
    g.expect.tapped('theirs', true);
    g.expect.invariants();
  });

  test('phased-out permanents of the active player phase in as the added untap step begins (CR 502.1)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(SPHINX)
      .battlefield('Grizzly Bears', { label: 'bears' })
      .battlefield('Plains', 'Plains', 'Plains')
      .hand(PHASE_GUARD)
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(PHASE_GUARD, { pay: true });
    g.passAll();
    g.act(0).chooseTargets('bears');
    g.passAll();
    expect(g.object('bears').zone).toBe('phased');
    g.advanceTo('postcombatMain');
    expect(g.object('bears').zone).toBe('phased');
    g.advanceTo('upkeep');
    // without the Sphinx it would phase in only as my next untap step begins
    expect(g.object('bears').zone).toBe('battlefield');
    g.expect.invariants();
  });

  test('no card is drawn in the opponent’s turn and none in the other steps of mine', () => {
    const g = start([SPHINX]);
    const hand = g.state.seats[0]?.hand.length ?? 0;
    g.advanceTo('postcombatMain');
    expect(g.state.seats[0]?.hand.length).toBe(hand);
    g.advanceTo('draw');
    g.advanceTo('end');
    expect(g.state.seats[0]?.hand.length).toBe(hand + 1);
  });
});

describe('the first turn of a two-player game (CR 103.8a)', () => {
  test('the starting player skips the draw step of the first turn, but the added draw step draws', () => {
    const g = start([SPHINX], { turn: 1 });
    g.advanceTo('postcombatMain');
    const hand = g.state.seats[0]?.hand.length ?? 0;
    g.advanceTo('end');
    expect(g.state.seats[0]?.hand.length).toBe(hand + 1);
  });
});

describe('two Sphinxes: two beginning phases, one after the other (CR 500.8)', () => {
  test('both triggers resolve and the steps of two beginning phases follow, then the end step', () => {
    const g = start([SPHINX, SPHINX]);
    g.advanceTo('postcombatMain');
    g.expect.pending('orderTriggers', 0);
    const before = steps(g).length;
    walkTo(g, 'end');
    expect(steps(g).slice(before)).toEqual([
      'untap',
      'upkeep',
      'draw',
      'untap',
      'upkeep',
      'draw',
      'end',
    ]);
    // two cards drawn
    expect(g.state.seats[0]?.hand.length).toBe(2);
    expect(g.state.turn.addedPhases).toBeUndefined();
    expect(g.state.turn.addedAfter).toBeUndefined();
    g.expect.invariants();
  });

  test('the opponent still gets their turn after the added phases, once', () => {
    const g = start([SPHINX, SPHINX]);
    g.advanceTo('postcombatMain');
    walkTo(g, 'upkeep', { turn: 'next' });
    g.expect.step('upkeep', { active: 1 });
    expect(g.state.turn.number).toBe(4);
  });
});

describe('what a player sees (the view)', () => {
  test('the screen can tell the added beginning phase from the turn’s own, and what a pass leads to', () => {
    const g = start([SPHINX]);
    g.advanceTo('postcombatMain');
    g.passAll();
    // the trigger resolved: a beginning phase waits
    g.expect.step('postcombatMain', { active: 0 });
    expect(g.view(0).nextAddedPhase).toBe('beginning');
    expect(g.view(0).addedPhase).toBeUndefined();
    g.pass();
    g.pass();
    const upkeep = g.view(0);
    expect(upkeep.step).toBe('upkeep');
    expect(upkeep.phase).toBe('beginning');
    expect(upkeep.addedPhase).toBe(true);
    expect(upkeep.nextAddedPhase).toBeUndefined();
    g.advanceTo('end');
    expect(g.view(0).addedPhase).toBeUndefined();
  });

  test('the turn’s own beginning phase is not an added one', () => {
    const g = start([SPHINX]);
    g.advanceTo('upkeep', { turn: 'next' });
    expect(g.view(0).addedPhase).toBeUndefined();
    expect(g.view(0).nextAddedPhase).toBeUndefined();
  });
});
