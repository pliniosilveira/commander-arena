// "Proliferate" (D-149): choose any number of permanents and/or players that have a counter, then give each one more counter of each kind it has.
// Pins: CR 701.34a (Proliferate), CR 122.6 and 122.6a (counters are put by a player, so "whenever you put one or more counters" counts them),
// CR 704.5c (ten poison counters), CR 306.5 (loyalty counters). Cards are SYNTHETIC (src/cards/fixtures/synthetic-commander-triggers.ts,
// synthetic-life-gain.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { applyAction, syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const SPREAD = 'SYNTHETIC Spreading Growth';
const CHOIR = 'SYNTHETIC Choirmaster';
const GROWING = 'SYNTHETIC Growing Light';
const WALKER = 'SYNTHETIC Vanilla Planeswalker';
const COMMANDER = 'Isamaru, Hound of Konda';
const BEARS = 'Grizzly Bears';
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

describe('the cards are valid', () => {
  test.each([SPREAD, CHOIR])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

const board = () =>
  scenario()
    .seat(0)
    .library(...LIBRARY)
    .hand(SPREAD)
    .battlefield('Forest')
    .battlefield(BEARS, { label: 'mine', counters: { '+1/+1': 1 } })
    .battlefield(WALKER, { label: 'walker', counters: { loyalty: 3 } })
    .battlefield(BEARS, { label: 'plain' })
    .seat(1)
    .poison(4)
    .library(...LIBRARY)
    .battlefield('Serra Angel', { label: 'theirs', counters: { '-1/-1': 1, stun: 1 } })
    .build();

const proliferate = (g: ReturnType<typeof board>) => {
  g.act(0).cast(SPREAD, { pay: true });
  g.passAll();
};

describe('the choice', () => {
  test('only permanents with a counter and players with poison are offered', () => {
    const g = board();
    proliferate(g);
    const d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error(`expected choosePermanent, got ${d?.kind}`);
    expect(d.purpose).toBe('proliferate');
    expect([...d.legal].sort()).toEqual([g.id('mine'), g.id('walker'), g.id('theirs')].sort());
    expect(d.players).toEqual([1]);
    expect(d.min).toBe(0);
  });

  test('everything chosen: each kind of counter on each gets one more', () => {
    const g = board();
    proliferate(g);
    g.choose({
      kind: 'choosePermanents',
      objects: [g.id('mine'), g.id('walker'), g.id('theirs')],
      players: [1],
    });
    g.expect.counters('mine', { '+1/+1': 2 });
    g.expect.counters('walker', { loyalty: 4 });
    g.expect.counters('theirs', { '-1/-1': 2, stun: 2 });
    g.expect.counters('plain', {});
    expect(g.state.seats[1]?.poison).toBe(5);
  });

  test('nothing chosen: nothing changes', () => {
    const g = board();
    proliferate(g);
    g.act(0).choosePermanents();
    g.expect.counters('mine', { '+1/+1': 1 });
    g.expect.counters('theirs', { '-1/-1': 1, stun: 1 });
    expect(g.state.seats[1]?.poison).toBe(4);
  });

  test("a subset: my counter and the opponent's poison, not the opponent's -1/-1", () => {
    const g = board();
    proliferate(g);
    g.choose({ kind: 'choosePermanents', objects: [g.id('mine')], players: [1] });
    g.expect.counters('mine', { '+1/+1': 2 });
    g.expect.counters('theirs', { '-1/-1': 1, stun: 1 });
    expect(g.state.seats[1]?.poison).toBe(5);
  });

  test('a permanent with no counter, a player with no poison and a repeated choice are refused', () => {
    const g = board();
    proliferate(g);
    const seat = g.deciding;
    expect(
      applyAction(g.state, seat, { kind: 'choosePermanents', objects: [g.id('plain')] }).ok,
    ).toBe(false);
    expect(
      applyAction(g.state, seat, { kind: 'choosePermanents', objects: [], players: [0] }).ok,
    ).toBe(false);
    expect(
      applyAction(g.state, seat, {
        kind: 'choosePermanents',
        objects: [g.id('mine'), g.id('mine')],
      }).ok,
    ).toBe(false);
    expect(
      applyAction(g.state, seat, { kind: 'choosePermanents', objects: [g.id('mine')] }).ok,
    ).toBe(true);
  });

  test('the legal actions list the empty choice, everything and each alone', () => {
    const g = board();
    proliferate(g);
    const actions = g.legalActions(0).filter((a) => a.kind === 'choosePermanents');
    expect(actions.some((a) => a.objects.length === 0 && (a.players ?? []).length === 0)).toBe(
      true,
    );
    expect(actions.some((a) => a.objects.length === 3 && (a.players ?? []).length === 1)).toBe(
      true,
    );
    expect(actions.length).toBe(2 + 3 + 1);
  });

  test('nothing has a counter: nobody is asked and nothing happens', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(SPREAD)
      .battlefield('Forest', BEARS)
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.act(0).cast(SPREAD, { pay: true });
    g.passAll();
    g.expect.noEvent({ kind: 'proliferated' });
    expect(g.state.pending?.kind).toBe('priority');
  });

  test('ten poison counters lose the game for the player who got the tenth', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(SPREAD)
      .battlefield('Forest')
      .seat(1)
      .poison(9)
      .library(...LIBRARY)
      .build();
    g.act(0).cast(SPREAD, { pay: true });
    g.passAll();
    g.choose({ kind: 'choosePermanents', objects: [], players: [1] });
    g.expect.hasLost(1, true);
    g.expect.gameOver({ win: 0 });
  });
});

describe('the counters are put by the controller', () => {
  test('"whenever you put one or more +1/+1 counters on this creature" triggers for the permanent proliferated', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(SPREAD)
      .battlefield('Forest')
      .battlefield(GROWING, { counters: { '+1/+1': 1 } })
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.act(0).cast(SPREAD, { pay: true });
    g.passAll();
    g.act(0).choosePermanents(GROWING);
    g.passAll();
    g.expect.counters(GROWING, { '+1/+1': 2 });
    g.expect.handSize(0, 1);
  });

  test('the opponent\'s proliferate does not trigger my "you put"', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(GROWING, { counters: { '+1/+1': 1 } })
      .seat(1)
      .library(...LIBRARY)
      .hand(SPREAD)
      .battlefield('Forest')
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast(SPREAD, { pay: true });
    g.passAll();
    g.choose({ kind: 'choosePermanents', objects: [g.id(GROWING)] });
    g.passAll();
    g.expect.counters(GROWING, { '+1/+1': 2 });
    g.expect.handSize(0, 0);
  });
});

describe('"Whenever a commander you control enters or attacks, proliferate"', () => {
  test('the commander entering asks the controller; the attack does too', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .command(COMMANDER, { commander: true })
      .battlefield(CHOIR, 'Plains')
      .battlefield(BEARS, { label: 'mine', counters: { '+1/+1': 1 } })
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.act(0).cast(COMMANDER, { pay: true });
    g.passAll();
    g.expect.pending('choosePermanent', 0);
    g.act(0).choosePermanents('mine');
    g.expect.counters('mine', { '+1/+1': 2 });
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(CHOIR);
    // The Choirmaster is not a commander: no trigger. The commander is summoning sick this turn, so it does not attack.
    g.passAll();
    g.expect.counters('mine', { '+1/+1': 2 });
  });

  test('the commander attacking proliferates', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(COMMANDER, { commander: true })
      .battlefield(CHOIR)
      .battlefield(BEARS, { label: 'mine', counters: { '+1/+1': 1 } })
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(COMMANDER);
    g.passAll();
    g.expect.pending('choosePermanent', 0);
    g.act(0).choosePermanents('mine');
    g.expect.counters('mine', { '+1/+1': 2 });
  });
});
