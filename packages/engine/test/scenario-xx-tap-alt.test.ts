// "You may pay {W} and tap four untapped creatures you control with flying rather than pay this spell's mana cost" and "Other creatures you
// control with flying have indestructible" (D-149).
// Pins: CR 118.9 and 118.9a (an alternative cost: one per spell, chosen as the spell is cast), CR 118.3 (a cost that cannot be paid cannot be
// paid: with fewer than four untapped fliers the cast is not offered), CR 601.2f-h (the total cost is determined, then every part of it is
// paid, in any order), CR 302.6 (a creature that came under its controller's control this turn may be tapped for a cost: only its own {T}
// ability is held back), CR 613.1f and 613.8a (an effect that reads a keyword depends on the effects that give keywords, so it applies after
// them), CR 702.12 (Indestructible). Cards are SYNTHETIC (src/cards/fixtures/synthetic-tap-alt.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { applyAction, getLegalActions, getView, syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const BLADE = 'SYNTHETIC Sky Blade Angel'; // {4}{W}{W}{W} 7/7 flying lifelink; the alternative cost is {W} and tapping four fliers
const BIRD = 'SYNTHETIC Mana Bird'; // {W} 0/1 flying, {T}: add {W}
const CALLER = 'SYNTHETIC Wind Caller'; // creatures you control without flying have flying
const HAWK = "Healer's Hawk"; // {W} 1/1 flying lifelink
const BEARS = 'Grizzly Bears';
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');
const plains = { name: 'Plains', zone: 'battlefield' as const, seat: 0 as const, nth: 0 };
const hawk = (nth: number) => ({ name: HAWK, zone: 'battlefield' as const, seat: 0 as const, nth });

describe('the cards are valid', () => {
  test.each([BLADE, BIRD, CALLER])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

const tapAlt = (g: ReturnType<ReturnType<typeof scenario>['build']>, seat = 0) =>
  getLegalActions(g.state, seat).filter(
    (a) => a.kind === 'castSpell' && a.alternative === 'tapPermanents',
  );

/** Seat 0 has the Angel in hand and `mine` on the battlefield. */
const game = (...mine: string[]) =>
  scenario()
    .seat(0)
    .library(...LIBRARY)
    .hand(BLADE)
    .battlefield(...mine)
    .seat(1)
    .library(...LIBRARY)
    .build();

describe('what is offered (CR 118.3, 118.9a)', () => {
  test('{W} and four untapped fliers: the alternative cast is offered, the ordinary one is not', () => {
    const g = game('Plains', HAWK, HAWK, HAWK, HAWK);
    g.expect.legal(0, { cast: BLADE, alternative: 'tapPermanents' });
    g.expect.illegal(0, { cast: BLADE });
  });

  test('three fliers are not enough', () => {
    const g = game('Plains', HAWK, HAWK, HAWK);
    expect(tapAlt(g)).toEqual([]);
  });

  test('a tapped flier does not count', () => {
    const tapped = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(BLADE)
      .battlefield('Plains')
      .battlefield(HAWK, { count: 3 })
      .battlefield(HAWK, { tapped: true })
      .seat(1)
      .build();
    expect(tapAlt(tapped)).toEqual([]);
  });

  test('creatures without flying do not count', () => {
    const g = game('Plains', HAWK, HAWK, HAWK, BEARS);
    expect(tapAlt(g)).toEqual([]);
  });

  test('without the {W} the cost cannot be paid', () => {
    const g = game(HAWK, HAWK, HAWK, HAWK);
    expect(tapAlt(g)).toEqual([]);
  });

  test('with enough lands the ordinary cast is offered besides the alternative one', () => {
    const g = game(
      'Plains',
      'Plains',
      'Plains',
      'Plains',
      'Plains',
      'Plains',
      'Plains',
      HAWK,
      HAWK,
      HAWK,
      HAWK,
    );
    g.expect.legal(0, { cast: BLADE });
    g.expect.legal(0, { cast: BLADE, alternative: 'tapPermanents' });
  });

  test('the view shows what the alternative cost is', () => {
    const g = game('Plains', HAWK, HAWK, HAWK, HAWK);
    const card = getView(g.state, 0).seats[0]?.hand?.find((o) => o.name === BLADE);
    const alt = card?.alternativeCosts?.find((a) => a.kind === 'tapPermanents');
    expect(alt?.cost).toEqual(['W']);
    expect(alt?.tap?.count).toBe(4);
    expect(alt?.tap?.filter.keywords).toEqual(['flying']);
  });

  test('a land card with the cost, or a card without it, has no such option', () => {
    const g = scenario().seat(0).hand(BEARS).battlefield('Plains', HAWK, HAWK, HAWK, HAWK).build();
    g.expect.illegal(0, { cast: BEARS, alternative: 'tapPermanents' });
  });
});

describe('paying it (CR 601.2f-h, 302.6)', () => {
  test('exactly four fliers: they are tapped without a question, with the land, and the Angel is on the stack', () => {
    const g = game('Plains', HAWK, HAWK, HAWK, HAWK);
    g.act(0).cast(BLADE, { alternative: 'tapPermanents', pay: true });
    g.expect.stack([BLADE]);
    for (const n of [0, 1, 2, 3]) g.expect.tapped(hawk(n), true);
    g.expect.tapped(plains, true);
    expect(
      g.events.some((e) => e.kind === 'permanentsChosen' && e.purpose === 'tap' && e.automatic),
    ).toBe(true);
  });

  test('the Angel resolves as an ordinary creature spell', () => {
    const g = game('Plains', HAWK, HAWK, HAWK, HAWK);
    g.act(0).cast(BLADE, { alternative: 'tapPermanents', pay: true });
    g.passAll();
    g.expect.zone(BLADE, 'battlefield', { seat: 0 });
  });

  test('five fliers: the caster chooses four, and the other stays untapped', () => {
    const g = game('Plains', HAWK, HAWK, HAWK, HAWK, HAWK);
    g.act(0).cast(BLADE, { alternative: 'tapPermanents', pay: true });
    const d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error(`expected choosePermanent, got ${d?.kind}`);
    expect(d.purpose).toBe('tap');
    expect(d.forCost).toBe(true);
    expect([d.min, d.max, d.legal.length]).toEqual([4, 4, 5]);
    g.act(0).choosePermanents(hawk(0), hawk(1), hawk(2), hawk(4));
    g.expect.stack([BLADE]);
    g.expect.tapped(hawk(3), false);
    for (const n of [0, 1, 2, 4]) g.expect.tapped(hawk(n), true);
  });

  test('a choice of three, or of a creature that cannot be tapped, is refused', () => {
    const g = game('Plains', HAWK, HAWK, HAWK, HAWK, HAWK);
    g.act(0).cast(BLADE, { alternative: 'tapPermanents', pay: true });
    const ids = g
      .find({ name: HAWK, zone: 'battlefield' })
      .slice(0, 3)
      .map((o) => o.id);
    expect(g.act(0).try.action({ kind: 'choosePermanents', objects: ids }).ok).toBe(false);
    g.expect.pending('choosePermanent', 0);
  });

  test('cancelling the question takes the whole cast back, the land included (CR 733)', () => {
    const g = game('Plains', HAWK, HAWK, HAWK, HAWK, HAWK);
    g.act(0).cast(BLADE, { alternative: 'tapPermanents', pay: true });
    g.act(0).cancel();
    g.expect.zone(BLADE, 'hand', { seat: 0 });
    g.expect.tapped(plains, false);
    for (const n of [0, 1, 2, 3, 4]) g.expect.tapped(hawk(n), false);
  });

  test('the creatures the cost taps do not pay for the mana: a flier that makes mana is left to tap', () => {
    // Four fliers (three Hawks and the Bird) and one Plains: the Plains must pay the {W}, or the cost could not tap four.
    const g = game('Plains', HAWK, HAWK, HAWK, BIRD);
    g.expect.legal(0, { cast: BLADE, alternative: 'tapPermanents' });
    g.act(0).cast(BLADE, { alternative: 'tapPermanents', pay: true });
    g.expect.stack([BLADE]);
    g.expect.tapped(BIRD, true);
    g.expect.tapped(plains, true);
    for (const n of [0, 1, 2]) g.expect.tapped(hawk(n), true);
  });

  test('a flier that makes mana pays the {W} when the cost has four others to tap', () => {
    const g = game(HAWK, HAWK, HAWK, HAWK, BIRD);
    g.expect.legal(0, { cast: BLADE, alternative: 'tapPermanents' });
    g.act(0).cast(BLADE, { alternative: 'tapPermanents', pay: true });
    g.expect.stack([BLADE]);
    for (const n of [0, 1, 2, 3]) g.expect.tapped(hawk(n), true);
  });

  test('four fliers with a mana ability and no other source: the {W} would tap one of them, so it is not offered', () => {
    const g = game(HAWK, HAWK, HAWK, BIRD);
    expect(tapAlt(g)).toEqual([]);
  });

  test('a payment by hand that taps a flier the cost needs is refused; one that taps the land is not', () => {
    const g = game('Plains', HAWK, HAWK, HAWK, BIRD);
    g.act(0).cast(BLADE, { alternative: 'tapPermanents' });
    g.expect.pending('payMana', 0);
    const d = g.state.pending;
    if (d?.kind !== 'payMana') throw new Error('expected payMana');
    const tapOf = (name: string) => {
      const obj = g.find({ name, zone: 'battlefield', seat: 0 })[0];
      const source = d.manaSources.find((m) => m.object === obj?.id);
      if (obj === undefined || source === undefined) throw new Error(`no source ${name}`);
      return { object: obj.id, abilityIndex: source.abilityIndex };
    };
    const refused = applyAction(g.state, 0, { kind: 'payManual', taps: [tapOf(BIRD)] });
    expect(refused.ok ? 'paid' : refused.error).toBe(
      'That payment would leave too few permanents to tap for the cost',
    );
    const paid = applyAction(g.state, 0, { kind: 'payManual', taps: [tapOf('Plains')] });
    expect(paid.ok).toBe(true);
  });

  test('a creature that came under control this turn may be tapped for it (CR 302.6)', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(BLADE)
      .battlefield('Plains')
      .battlefield(HAWK, { count: 4, fresh: true })
      .seat(1)
      .build();
    g.expect.legal(0, { cast: BLADE, alternative: 'tapPermanents' });
  });

  test('the Angel cast this way is not cast for its mana cost: no tax for commander, no other alternative', () => {
    const g = game('Plains', HAWK, HAWK, HAWK, HAWK);
    g.act(0).cast(BLADE, { alternative: 'tapPermanents', pay: true });
    g.passAll();
    const angel = g.find({ name: BLADE, zone: 'battlefield' })[0];
    expect(angel).toBeDefined();
  });
});

describe('"Other creatures you control with flying have indestructible" (CR 613.8a)', () => {
  const hawkKeywords = ['flying', 'lifelink'];

  test('a flier of the controller has indestructible; one without flying has not', () => {
    const g = game(BLADE, HAWK, BEARS);
    g.expect.derived(HAWK, { keywords: [...hawkKeywords, 'indestructible'] });
    g.expect.derived(BEARS, { keywords: [] });
  });

  test('the Angel itself does not have it ("other")', () => {
    const g = game(BLADE);
    g.expect.derived(
      { name: BLADE, zone: 'battlefield', seat: 0 },
      { keywords: ['flying', 'lifelink'] },
    );
  });

  test("an opponent's flier does not have it", () => {
    const g = scenario().seat(0).battlefield(BLADE).seat(1).battlefield(HAWK).build();
    g.expect.derived(HAWK, { keywords: hawkKeywords });
  });

  test('without the Angel the flier has no indestructible', () => {
    const g = scenario().seat(0).battlefield(HAWK).seat(1).build();
    g.expect.derived(HAWK, { keywords: hawkKeywords });
  });

  test('a creature that gets flying from another effect gets indestructible, in every order on the battlefield', () => {
    for (const mine of [
      [BLADE, CALLER, BEARS],
      [CALLER, BLADE, BEARS],
      [BEARS, CALLER, BLADE],
    ]) {
      const g = game(...mine);
      g.expect.derived(BEARS, { keywords: ['flying', 'indestructible'] });
    }
  });

  test('a creature with flying that is destroyed survives (CR 702.12b)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(BLADE, HAWK)
      .seat(1)
      .hand('Murder')
      .battlefield('Swamp', 'Swamp', 'Swamp')
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast('Murder', { targets: [HAWK], pay: true });
    g.passAll();
    g.expect.zone(HAWK, 'battlefield', { seat: 0 });
  });
});
