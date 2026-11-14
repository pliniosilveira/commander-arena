// Soulbond and pairing (D-285, D-286), CR 702.95: the two triggered abilities the keyword stands for, the pairing they make, and the choice of the controller.
// Pins: CR 702.95a (the two abilities and their intervening "if"), 702.95b (a paired creature), 702.95c (the re-check as the ability resolves), 702.95d (a
// creature is paired with one other creature only), 603.4 (an intervening "if" is read when the event happens and again on resolution), 603.5 (the "may" is
// answered on resolution), 603.6a (creatures entering together), 603.3b (the controller orders his triggers), 400.7 (a new object is unpaired).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-soulbond.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { applyAction, getLegalActions, syntheticCard, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { choosePermanentDecision } from './pending-helpers';

const SQUIRE = 'SYNTHETIC Soulbound Squire'; // soulbond, 2/2
const SERAPH = 'SYNTHETIC Soulbound Seraph';
const BEARS = 'Grizzly Bears';
const SERRA = 'Serra Angel';
const UNSUMMON = 'Unsummon';

const LIBRARY = ['Island', 'Island', 'Island', 'Island'] as const;

/** Seat 0 holds a Squire and has Plains, Forests and the given permanents (labeled 'bears' and 'serra'); seat 1 has Islands, an Unsummon and a Bears of its own. */
function game(mine: readonly string[] = [BEARS], lands = 4) {
  let b = scenario()
    .seat(0)
    .hand(SQUIRE)
    .battlefield('Plains', { count: lands })
    .battlefield('Forest', { count: 2 });
  for (const name of mine) b = b.battlefield(name, { label: name === BEARS ? 'bears' : 'serra' });
  return b
    .library(...LIBRARY)
    .seat(1)
    .battlefield('Island', { count: 3 })
    .battlefield(BEARS, { label: 'theirs' })
    .hand(UNSUMMON)
    .library(...LIBRARY)
    .at('precombatMain', { active: 0, turn: 3 })
    .build();
}

/** Casts the Squire and lets the spell resolve: it enters, and its ability (if its "if" holds) is on the stack. */
function enter(g: ScenarioGame) {
  g.act(0).cast(SQUIRE, { pay: true });
  g.pass();
  g.pass();
}

const resolveTop = (g: ScenarioGame) => {
  g.pass();
  g.pass();
};

describe('the cards are valid', () => {
  test('validateCard finds nothing wrong', () => {
    for (const name of [
      SQUIRE,
      SERAPH,
      'SYNTHETIC Soulbound Giant',
      'SYNTHETIC Soulbound Glider',
      'SYNTHETIC Bonded Hound',
    ]) {
      expect(validateCard(syntheticCard(name))).toEqual([]);
    }
  });
});

describe('the enters ability: "you may pair this creature with another unpaired creature" (CR 702.95a)', () => {
  test('it is asked on resolution: each other unpaired creature of yours, or none (CR 603.5)', () => {
    const g = game([BEARS, SERRA]);
    enter(g);
    g.expect.stack([`${SQUIRE} (ability)`]); // no target: nothing is chosen as it goes on the stack
    resolveTop(g);
    const d = choosePermanentDecision(g);
    expect(d.purpose).toBe('soulbond');
    expect(d.min).toBe(0);
    expect(d.max).toBe(1);
    expect(d.seat).toBe(0);
    expect(d.subject).toBe(g.id(SQUIRE));
    expect([...d.legal].sort()).toEqual([g.id('bears'), g.id('serra')].sort());
    // The opponent's creature and the creature itself are not offered.
    expect(d.legal).not.toContain(g.id('theirs'));
    expect(d.legal).not.toContain(g.id(SQUIRE));
  });

  test('legal actions: one answer for each creature, the empty answer (none) and concede', () => {
    const g = game([BEARS, SERRA]);
    enter(g);
    resolveTop(g);
    const answers = getLegalActions(g.state, 0).filter((a) => a.kind === 'choosePermanents');
    expect(
      answers.map((a) => (a.kind === 'choosePermanents' ? a.objects.length : -1)).sort(),
    ).toEqual([0, 1, 1]);
  });

  test('choosing a creature pairs both: the link is on both objects and the event is logged', () => {
    const g = game();
    enter(g);
    resolveTop(g);
    g.act(0).choosePermanents('bears');
    g.expect.paired(SQUIRE, 'bears');
    g.expect.paired('bears', SQUIRE);
    g.expect.eventLog([{ kind: 'creaturesPaired', a: g.id(SQUIRE), b: g.id('bears'), by: 0 }]);
    g.expect.invariants();
  });

  test('choosing none pairs nobody (the "may"), and the empty answer is not asked again', () => {
    const g = game();
    enter(g);
    resolveTop(g);
    g.act(0).choosePermanents();
    g.expect.unpaired(SQUIRE);
    g.expect.unpaired('bears');
    g.expect.noEvent({ kind: 'creaturesPaired' });
    expect(g.state.pending?.kind).toBe('priority');
  });

  test('a single candidate is still asked (min 0), not paired by the engine', () => {
    const g = game();
    enter(g);
    resolveTop(g);
    expect(choosePermanentDecision(g).legal).toEqual([g.id('bears')]);
  });

  test('no other creature of yours: the intervening "if" is false and the ability never goes on the stack (CR 603.4)', () => {
    const g = game([]);
    enter(g);
    g.expect.stack([]);
    g.expect.unpaired(SQUIRE);
  });

  test('the answer must be one of the creatures offered: the opponent creature and a second answer are refused', () => {
    const g = game();
    enter(g);
    resolveTop(g);
    const answer = (...objects: string[]) =>
      applyAction(g.state, 0, { kind: 'choosePermanents', objects: objects.map((o) => g.id(o)) })
        .ok;
    expect(answer('theirs')).toBe(false);
    expect(answer('bears', SQUIRE)).toBe(false);
    expect(answer(SQUIRE)).toBe(false);
    g.act(0).choosePermanents('bears');
    g.expect.paired(SQUIRE, 'bears');
  });

  test('a creature that is already paired is not offered (CR 702.95d)', () => {
    const g = scenario()
      .seat(0)
      .hand(SQUIRE)
      .battlefield('Plains', { count: 4 })
      .battlefield(BEARS, { label: 'a', pairedWith: 'b' })
      .battlefield(SERRA, { label: 'b' })
      .battlefield('Grizzly Bears', { label: 'c' })
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    enter(g);
    resolveTop(g);
    expect(choosePermanentDecision(g).legal).toEqual([g.id('c')]);
  });

  test('every creature of yours is paired: nothing to pair with, the ability does not trigger', () => {
    const g = scenario()
      .seat(0)
      .hand(SQUIRE)
      .battlefield('Plains', { count: 4 })
      .battlefield(BEARS, { label: 'a', pairedWith: 'b' })
      .battlefield(SERRA, { label: 'b' })
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    enter(g);
    g.expect.stack([]);
    g.expect.unpaired(SQUIRE);
  });
});

describe('the other ability: "whenever another creature you control enters" (CR 702.95a)', () => {
  const withSquire = (hand: readonly string[]) =>
    scenario()
      .seat(0)
      .hand(...hand)
      .battlefield('Plains', { count: 2 })
      .battlefield('Forest', { count: 2 })
      .battlefield(SQUIRE)
      .library(...LIBRARY)
      .seat(1)
      .battlefield('Island', { count: 3 })
      .hand(UNSUMMON)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('a creature of yours that enters may be paired with it, and is the only candidate', () => {
    const g = withSquire([BEARS]);
    g.act(0).cast(BEARS, { pay: true });
    g.pass();
    g.pass();
    g.expect.stack([`${SQUIRE} (ability)`]);
    resolveTop(g);
    const d = choosePermanentDecision(g);
    expect(d.purpose).toBe('soulbond');
    expect(d.subject).toBe(g.id(SQUIRE));
    expect(d.legal).toEqual([g.id(BEARS)]);
    g.act(0).choosePermanents(BEARS);
    g.expect.paired(SQUIRE, BEARS);
    g.expect.invariants();
  });

  test('declining leaves both unpaired, and nothing is asked again for the same event', () => {
    const g = withSquire([BEARS]);
    g.act(0).cast(BEARS, { pay: true });
    g.pass();
    g.pass();
    resolveTop(g);
    g.act(0).choosePermanents();
    g.expect.unpaired(SQUIRE);
    g.expect.unpaired(BEARS);
  });

  test('a creature that enters under the control of an opponent triggers nothing of yours', () => {
    const g = scenario()
      .seat(0)
      .battlefield(SQUIRE)
      .library(...LIBRARY)
      .seat(1)
      .battlefield('Forest', { count: 2 })
      .hand(BEARS)
      .library(...LIBRARY)
      .at('precombatMain', { active: 1, turn: 4 })
      .build();
    g.act(1).cast(BEARS, { pay: true });
    g.pass();
    g.pass();
    g.expect.stack([]);
    g.expect.unpaired(SQUIRE);
  });

  test('the soulbond creature is paired already: another creature entering does not trigger it (the "if" is false)', () => {
    const g = scenario()
      .seat(0)
      .hand(BEARS)
      .battlefield('Forest', { count: 4 })
      .battlefield(SQUIRE, { label: 'sq', pairedWith: 'pal' })
      .battlefield(SERRA, { label: 'pal' })
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(BEARS, { pay: true });
    g.pass();
    g.pass();
    g.expect.stack([]);
    g.expect.paired('sq', 'pal');
  });

  test('after the pairing the state is consistent', () => {
    const g = withSquire([BEARS]);
    g.act(0).cast(BEARS, { pay: true });
    g.pass();
    g.pass();
    resolveTop(g);
    g.act(0).choosePermanents(BEARS);
    g.expect.paired(SQUIRE, BEARS);
    g.expect.invariants();
  });
});
