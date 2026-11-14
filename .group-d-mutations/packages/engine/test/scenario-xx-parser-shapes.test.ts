// The shapes the Oracle parser must write for the Dinosaurs deck texts that need no new primitive (D-145): they run on the engine's existing
// effects, so the tests pin that those shapes do what the texts say.
// Pins: CR 406.3 and 400.7 (exile a card of a graveyard; "if it was a creature card" reads the card as it was), CR 608.2h (X is that
// creature's power, read as the effect resolves), CR 603.2 (a trigger), CR 205.3m ("another"), CR 611.2a (until end of turn), CR 702.19
// (trample), CR 700.? none. Cards are SYNTHETIC (src/cards/fixtures/synthetic-parser-shapes.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const SCAVENGER = 'SYNTHETIC Graveyard Scavenger';
const THICKET = 'SYNTHETIC Thicket Growth';
const SAGE = 'SYNTHETIC Trampling Sage';
const MENTOR = 'SYNTHETIC Counter Mentor';
const BRUTE = 'SYNTHETIC Surging Brute';
const BEARS = 'Grizzly Bears'; // 2/2
const ANGEL = 'Serra Angel'; // 4/4
const BOLT = 'Lightning Bolt';
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

describe('the cards are valid', () => {
  test.each([SCAVENGER, THICKET, SAGE, MENTOR, BRUTE])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

describe('exile a card from a graveyard, then more if it was a creature card', () => {
  const game = () =>
    scenario()
      .seat(0)
      .battlefield(SCAVENGER, { label: 'ooze' })
      .battlefield('Forest', 'Forest')
      .graveyard(BEARS, BOLT)
      .seat(1)
      .graveyard(ANGEL)
      .build();

  test('a creature card: it is exiled, the Scavenger gets a counter and its controller gains 1 life', () => {
    const g = game();
    g.act(0).activate('ooze', { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'exile', { seat: 0 });
    g.expect.counters('ooze', { '+1/+1': 1 });
    g.expect.life(0, 41);
  });

  test("a card from an opponent's graveyard is a legal target too", () => {
    const g = game();
    g.act(0).activate('ooze', { targets: [ANGEL], pay: true });
    g.passAll();
    g.expect.zone(ANGEL, 'exile', { seat: 1 });
    g.expect.counters('ooze', { '+1/+1': 1 });
  });

  test('a card that is not a creature card: exiled and nothing more', () => {
    const g = game();
    g.act(0).activate('ooze', { targets: [BOLT], pay: true });
    g.passAll();
    g.expect.zone(BOLT, 'exile', { seat: 0 });
    g.expect.counters('ooze', {});
    g.expect.life(0, 40);
  });
});

describe('"put X +1/+1 counters on target creature, where X is that creature\'s power" and the end step draw for the greatest power', () => {
  const game = (theirs: readonly string[] = []) => {
    const b = scenario()
      .seat(0)
      .hand(THICKET)
      .battlefield('Forest', 'Forest', 'Forest', 'Forest')
      .battlefield(BEARS, { label: 'mine' })
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY);
    for (const name of theirs) b.battlefield(name, { label: 'theirs' });
    return b.build();
  };

  test('the counters are as many as the power of the target, which doubles it', () => {
    const g = game();
    g.act(0).cast(THICKET, { pay: true });
    g.passAll();
    g.act(0).chooseTargets('mine');
    g.passAll();
    g.expect.counters('mine', { '+1/+1': 2 });
    g.expect.pt('mine', 4, 4);
  });

  test('the target may be the creature itself: 3 counters on a 3/3', () => {
    const g = game();
    g.act(0).cast(THICKET, { pay: true });
    g.passAll();
    g.act(0).chooseTargets(THICKET);
    g.passAll();
    g.expect.counters(THICKET, { '+1/+1': 3 });
  });

  test('at the end step the controller draws two when they control the creature with the greatest power', () => {
    const g = game();
    g.act(0).cast(THICKET, { pay: true });
    g.passAll();
    g.act(0).chooseTargets('mine');
    g.passAll();
    const before = g.state.seats[0]?.hand.length ?? 0;
    g.advanceTo('end');
    g.passAll();
    expect((g.state.seats[0]?.hand.length ?? 0) - before).toBe(2);
  });

  test('tied for the greatest power still counts', () => {
    const g = game([ANGEL]);
    g.act(0).cast(THICKET, { pay: true });
    g.passAll();
    g.act(0).chooseTargets('mine');
    g.passAll();
    const before = g.state.seats[0]?.hand.length ?? 0;
    g.advanceTo('end');
    g.passAll();
    expect((g.state.seats[0]?.hand.length ?? 0) - before).toBe(2);
  });

  test('not when an opponent has a creature with more power', () => {
    const g = game(['SYNTHETIC Vanilla 5/5']);
    g.act(0).cast(THICKET, { pay: true });
    g.passAll();
    g.act(0).chooseTargets('mine');
    g.passAll();
    const before = g.state.seats[0]?.hand.length ?? 0;
    g.advanceTo('end');
    g.passAll();
    expect((g.state.seats[0]?.hand.length ?? 0) - before).toBe(0);
  });
});

describe('"Another target creature gets +2/+0 and gains trample until end of turn"', () => {
  const game = () =>
    scenario()
      .seat(0)
      .battlefield(SAGE, { label: 'sage' })
      .battlefield(BEARS, { label: 'bears' })
      .battlefield('Forest', 'Forest', 'Forest')
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .build();

  test('the other creature gets the power and the keyword', () => {
    const g = game();
    g.act(0).activate('sage', { targets: ['bears'], pay: true });
    g.passAll();
    g.expect.pt('bears', 4, 2);
    g.expect.derived('bears', { keywords: ['trample'] });
  });

  test('the creature itself is not a legal target ("another")', () => {
    const g = game();
    g.act(0).activate('sage');
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error(`expected targets, got ${d?.kind}`);
    const legal = d.specs[0]?.legal.map((t) => (t.kind === 'object' ? t.id : '')) ?? [];
    expect(legal).toEqual([g.id('bears')]);
  });

  test('it ends with the turn', () => {
    const g = game();
    g.act(0).activate('sage', { targets: ['bears'], pay: true });
    g.passAll();
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.pt('bears', 2, 2);
  });
});

describe('"put a +1/+1 counter on each of up to two target creatures"', () => {
  const game = () =>
    scenario()
      .seat(0)
      .hand(MENTOR)
      .battlefield('Forest', 'Forest', 'Forest')
      .battlefield(BEARS, { label: 'a' })
      .battlefield(ANGEL, { label: 'b' })
      .seat(1)
      .build();

  test('two targets: a counter on each', () => {
    const g = game();
    g.act(0).cast(MENTOR, { pay: true });
    g.passAll();
    g.act(0).chooseTargets('a', 'b');
    g.passAll();
    g.expect.counters('a', { '+1/+1': 1 });
    g.expect.counters('b', { '+1/+1': 1 });
  });

  test('none is allowed', () => {
    const g = game();
    g.act(0).cast(MENTOR, { pay: true });
    g.passAll();
    g.act(0).chooseTargets();
    g.passAll();
    g.expect.counters('a', {});
  });
});

describe('"each creature you control with power 4 or greater gets +1/+1 and gains trample until end of turn"', () => {
  test('only the creatures with power 4 or greater, the attacker included', () => {
    const g = scenario()
      .seat(0)
      .battlefield(BRUTE, { label: 'brute' })
      .battlefield(ANGEL, { label: 'angel' })
      .battlefield(BEARS, { label: 'bears' })
      .seat(1)
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack('brute', { player: 1 });
    g.passAll();
    g.expect.pt('brute', 6, 6);
    g.expect.pt('angel', 5, 5);
    g.expect.pt('bears', 2, 2);
    g.expect.derived('angel', { keywords: ['flying', 'vigilance', 'trample'] });
    g.expect.derived('bears', { keywords: [] });
  });
});
