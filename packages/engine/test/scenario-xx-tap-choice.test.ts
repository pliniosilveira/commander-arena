// "Whenever this creature attacks, you may tap X untapped Myr you control. If you do, this creature gets +X/+0 until end of turn and deals X
// damage to the player or planeswalker it's attacking." (D-139): `tap` with a `choose` selector (`anyNumber` or `count`), the `thisWay`
// `tapped` amount, `didPrevious` after a tap and the `dealDamage.to` `attackedBy` recipient.
// Pins: CR 701.26a (Tap), CR 608.2d (the controller chooses), CR 302.6 (summoning sickness is about {T} abilities, not being tapped by an
// effect), CR 508.1b and 506.3 (what a creature attacks), CR 120.3 (damage), CR 120.3c (damage to a planeswalker removes loyalty).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-tap-choice.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { twoSeatGame } from './two-seat-helpers';

const SPHERE = 'SYNTHETIC Swarm Sphere'; // 4/7 Myr Construct: four Myr tokens; attacks: tap X untapped Myr, +X/+0 and X damage to what it attacks
const WARBAND = 'SYNTHETIC Goblin Warband'; // 2/2: the same for Goblins
const SCRIBE = 'SYNTHETIC Idle Scribe'; // 1/1: attacks: tap any number of untapped creatures you control; if you do, draw a card
const RUNE = 'SYNTHETIC Chilling Rune'; // {1}: tap target creature; gain 1 life for each creature tapped this way
const DROVER = 'SYNTHETIC Weary Drover'; // 1/1: attacks: tap two untapped creatures you control; if you do, draw
const MYR = 'SYNTHETIC Copper Myr'; // 1/1 artifact Myr
const MITE = 'SYNTHETIC Iron Mite'; // 1/1 artifact Insect
const GOBLIN = 'Raging Goblin';
const PW = 'SYNTHETIC Vanilla Planeswalker'; // loyalty 4
const BEARS = 'Grizzly Bears';

/** Attacks with `attacker` (at the player, or at `target`) and lets the "attacks" trigger resolve up to its question. */
function attackAndAsk(g: ReturnType<typeof twoSeatGame>, attacker: string, target?: string) {
  g.advanceTo('declareAttackers');
  g.act(0).declareAttackers([{ attacker, ...(target === undefined ? {} : { target }) }]);
  g.passAll();
}

describe('the cards are valid', () => {
  test.each([SPHERE, WARBAND, DROVER, SCRIBE, RUNE])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

describe('you may tap X untapped creatures of a type (CR 701.26a, 608.2d)', () => {
  const sphere = () =>
    twoSeatGame((b) =>
      b
        .battlefield(SPHERE)
        .battlefield(MYR, { label: 'm1' })
        .battlefield(MYR, { label: 'm2' })
        .battlefield(MYR, { label: 'm3' })
        .battlefield(MITE, { label: 'mite' }),
    );

  test('the question offers only untapped Myr you control, from none to all of them', () => {
    const g = sphere();
    attackAndAsk(g, SPHERE);
    const d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error('expected a choice of permanents');
    expect(d).toMatchObject({ seat: 0, purpose: 'effect', min: 0, max: 3 });
    expect(d.legal).toHaveLength(3);
  });

  test('tapping two: they are tapped, the Sphere gets +2/+0 and deals 2 damage to the player, then combat damage', () => {
    const g = sphere();
    attackAndAsk(g, SPHERE);
    g.act(0).choosePermanents('m1', 'm2');
    g.expect.tapped('m1');
    g.expect.tapped('m2');
    g.expect.tapped('m3', false);
    g.expect.tapped('mite', false);
    g.expect.life(1, 18);
    g.expect.pt(SPHERE, 6, 7);
    g.expect.invariants();
    g.advanceTo('combatDamage');
    g.expect.life(1, 12);
  });

  test('tapping none: nothing happens ("if you do" is not true for 0)', () => {
    const g = sphere();
    attackAndAsk(g, SPHERE);
    g.act(0).choosePermanents();
    g.expect.tapped('m1', false);
    g.expect.life(1, 20);
    g.expect.pt(SPHERE, 4, 7);
    g.advanceTo('combatDamage');
    g.expect.life(1, 16);
  });

  test('a Myr that is already tapped is not a candidate', () => {
    const g = twoSeatGame((b) =>
      b
        .battlefield(SPHERE)
        .battlefield(MYR, { label: 'm1', tapped: true })
        .battlefield(MYR, { label: 'm2' }),
    );
    attackAndAsk(g, SPHERE);
    const d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error('expected a choice of permanents');
    expect(d.max).toBe(1);
  });

  test('with no untapped Myr the trigger does nothing and asks nothing', () => {
    const g = twoSeatGame((b) => b.battlefield(SPHERE).battlefield(MITE));
    attackAndAsk(g, SPHERE);
    expect(g.state.pending?.kind).not.toBe('choosePermanent');
    g.expect.life(1, 20);
  });

  test("a creature of the opponent's is not a candidate", () => {
    const g = twoSeatGame(
      (b) => b.battlefield(SPHERE).battlefield(MYR, { label: 'mine' }),
      (b) => b.battlefield(MYR, { label: 'theirs' }),
    );
    attackAndAsk(g, SPHERE);
    const d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error('expected a choice of permanents');
    expect(d.max).toBe(1);
    g.act(0).choosePermanents('mine');
    g.expect.tapped('theirs', false);
  });

  test('the answer must be among the legal permanents', () => {
    const g = sphere();
    attackAndAsk(g, SPHERE);
    expect(() => g.act(0).choosePermanents('mite')).toThrow(/legal|choose/i);
  });

  test('the same effect works for another creature type, and Myr do not count for it', () => {
    const g = twoSeatGame((b) =>
      b.battlefield(WARBAND).battlefield(GOBLIN, { label: 'g1' }).battlefield(MYR, { label: 'm1' }),
    );
    attackAndAsk(g, WARBAND);
    const d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error('expected a choice of permanents');
    expect(d.max).toBe(1);
    g.act(0).choosePermanents('g1');
    g.expect.life(1, 19);
    g.expect.pt(WARBAND, 3, 2);
  });
});

describe('the player or planeswalker it is attacking (CR 508.1b, 120.3c)', () => {
  test('a creature attacking a planeswalker deals the damage to the planeswalker, not to the player', () => {
    const g = twoSeatGame(
      (b) => b.battlefield(SPHERE).battlefield(MYR, { label: 'm1' }),
      (b) => b.battlefield(PW),
    );
    attackAndAsk(g, SPHERE, PW);
    g.act(0).choosePermanents('m1');
    g.expect.counters(PW, { loyalty: 3 });
    g.expect.life(1, 20);
  });
});

describe('"if you do" after tapping any number (CR 608.2c)', () => {
  const scribe = () =>
    twoSeatGame((b) => b.battlefield(SCRIBE).battlefield(BEARS).library('Island', 'Island'));

  test('tapping none is not doing it: no card is drawn', () => {
    const g = scribe();
    attackAndAsk(g, SCRIBE);
    g.act(0).choosePermanents();
    g.expect.handSize(0, 0);
  });

  test('tapping one is doing it: a card is drawn', () => {
    const g = scribe();
    attackAndAsk(g, SCRIBE);
    g.act(0).choosePermanents(BEARS);
    g.expect.tapped(BEARS);
    g.expect.handSize(0, 1);
  });
});

describe('the number tapped by a tap effect, this way (CR 701.26a)', () => {
  test('only a creature that was untapped is tapped by it, and only that counts', () => {
    const g = twoSeatGame(
      (b) => b.battlefield(RUNE).battlefield('Island', { count: 2 }),
      (b) =>
        b
          .battlefield(BEARS, { label: 'fresh' })
          .battlefield(GOBLIN, { label: 'sleepy', tapped: true }),
    );
    g.act(0).activate(RUNE, { targets: ['fresh'], pay: true });
    g.passAll();
    g.expect.life(0, 21);
    g.act(0).activate(RUNE, { targets: ['sleepy'], pay: true });
    g.passAll();
    g.expect.life(0, 21);
  });
});

describe('damage goes to what the creature itself attacks (CR 508.1b)', () => {
  test("two attackers at different targets: the second one hits the player, not the first one's planeswalker", () => {
    const g = twoSeatGame(
      (b) =>
        b
          .battlefield(GOBLIN, { label: 'first' })
          .battlefield(WARBAND)
          .battlefield(GOBLIN, { label: 'spare' }),
      (b) => b.battlefield(PW),
    );
    g.advanceTo('declareAttackers');
    g.act(0).declareAttackers([{ attacker: 'first', target: PW }, { attacker: WARBAND }]);
    g.passAll();
    g.act(0).choosePermanents('spare');
    g.expect.life(1, 19);
    g.expect.counters(PW, { loyalty: 4 });
  });
});

describe('tap a number of creatures (a count, not any number)', () => {
  test('with exactly the number needed, they are tapped without a question and the card is drawn', () => {
    const g = twoSeatGame((b) =>
      b.battlefield(DROVER).battlefield(BEARS).battlefield(MYR).library('Island', 'Island'),
    );
    attackAndAsk(g, DROVER);
    expect(g.state.pending?.kind).not.toBe('choosePermanent');
    g.expect.tapped(BEARS);
    g.expect.tapped(MYR);
    g.expect.handSize(0, 1);
  });

  test('with more candidates the controller chooses exactly that many', () => {
    const g = twoSeatGame((b) =>
      b.battlefield(DROVER).battlefield(BEARS).battlefield(MYR).battlefield(MITE),
    );
    attackAndAsk(g, DROVER);
    const d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error('expected a choice of permanents');
    expect(d).toMatchObject({ min: 2, max: 2 });
    g.act(0).choosePermanents(MYR, MITE);
    g.expect.tapped(BEARS, false);
    g.expect.handSize(0, 1);
  });

  test('with one candidate that one is tapped (as much as possible, CR 608.2c)', () => {
    const g = twoSeatGame((b) => b.battlefield(DROVER).battlefield(BEARS));
    attackAndAsk(g, DROVER);
    g.expect.tapped(BEARS);
    g.expect.handSize(0, 1);
  });

  test('with no candidate nothing is tapped and no card is drawn', () => {
    const g = twoSeatGame((b) => b.battlefield(DROVER));
    attackAndAsk(g, DROVER);
    g.expect.handSize(0, 0);
  });
});

describe('the Sphere makes its Myr', () => {
  test('four 1/1 artifact creature Myr tokens when it enters', () => {
    const g = twoSeatGame((b) => b.battlefield('Plains', { count: 7 }).hand(SPHERE));
    g.act(0).cast(SPHERE, { pay: true });
    g.passAll();
    const myr = g.state.battlefield
      .map((id) => g.state.objects[id])
      .filter((o) => o?.token !== null && o?.token !== undefined);
    expect(myr).toHaveLength(4);
    g.expect.invariants();
  });
});
