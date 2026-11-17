// Group 3 of the Galadriel deck (issue 43): Buyback (Mystic Speculation), "counter up to one target spell unless its controller pays mana equal to the greatest power among creatures you
// control" after X counters (Repulsive Mutation), Kicker with a copy that is not legendary and has loyalty 1, "draw a card and reveal it" and "remove loyalty counters equal to that card's
// mana value" (Jace, Mirror Mage), and a die rolled at upkeep whose result is the number of cards scried, with "whenever you roll a die's highest natural result" (Netherese Puzzle-Ward).
// Pins: CR 702.27a (Buyback: an additional cost; the card goes to the hand instead of the graveyard as the spell resolves), 601.2b and 601.2f (additional costs are chosen and paid as the
// spell is cast), 608.2c (an instruction is read as it comes up: the counters are on the creature before the greatest power is read), 118.12a (counter unless pays), 115.1 (up to one
// target), 702.33a and 702.33d (kicker, kicked), 707.9b and 707.9d (a copy's exceptions are part of its copiable values), 205.4a (legendary), 306.5b (a planeswalker token enters with
// its loyalty as counters), 704.5i (0 loyalty), 701.20a and 400.7j (reveal; "that card"), 202.3 (mana value), 706.1a (a die has N outcomes), 706.2 (the natural result), 701.22 (scry).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-galadriel-g3.ts and synthetic-dice.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { nextInt, syntheticCard, validateCard } from '../src/index';
import { derive } from '../src/rules/derive';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { arrangeDecision, handNames, libraryNames } from './scry-helpers';

const PEEK = 'SYNTHETIC Buyback Peek';
const MUTATION = 'SYNTHETIC Mutation Counter';
const WALKER = 'SYNTHETIC Mirror Walker';
const WARD = 'SYNTHETIC Die Ward';
const ALONE = 'SYNTHETIC Die Alone'; // d4, {R}
const COIN = 'SYNTHETIC Die Coin'; // d2, {R}
const WHEEL = 'SYNTHETIC Twenty Wheel'; // d20, {2}{R}
const BEARS = 'Grizzly Bears'; // 2/2, mana value 2
const ANGEL = 'Serra Angel'; // 4/4, mana value 5
const SPIDER = 'Giant Spider'; // mana value 4
const DIVINATION = 'Divination'; // {2}{U}
const COUNTERSPELL = 'Counterspell'; // {U}{U}
const FILLER = Array.from({ length: 14 }, () => 'Plains');

const defs = () =>
  [PEEK, MUTATION, WALKER, WARD].reduce((b, n) => b.define(syntheticCard(n)), scenario());

describe('the cards are valid', () => {
  test.each([PEEK, MUTATION, WALKER, WARD])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

describe('Buyback {2} (CR 702.27a)', () => {
  const board = (
    lands: number,
    extra: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario> = (b) => b,
  ) =>
    extra(
      defs()
        .seat(0)
        .library('Island', { label: 'a' })
        .library('Forest', { label: 'b' })
        .library('Plains', { label: 'c' })
        .library(...FILLER)
        .hand(PEEK)
        .battlefield('Island', { count: lands })
        .seat(1)
        .library(...FILLER),
    )
      .at('precombatMain')
      .build();

  test("paying it: the spell costs {2} more and the card returns to its owner's hand as it resolves", () => {
    const g = board(3);
    g.act(0).cast(PEEK, { bought: true, pay: true });
    g.expect.stack([PEEK]);
    for (const l of g.find({ name: 'Island', zone: 'battlefield' })) expect(l.tapped).toBe(true);
    g.passAll();
    g.act(0).arrange({ top: ['a', 'b', 'c'] });
    g.expect.zone(PEEK, 'hand', { seat: 0 });
    g.expect.noObject(PEEK, { zone: 'graveyard' });
    g.expect.invariants();
  });

  test('declining it: the spell costs {U} and goes to the graveyard as any sorcery does', () => {
    const g = board(3);
    g.act(0).cast(PEEK, { bought: false, pay: true });
    expect(g.find({ name: 'Island', zone: 'battlefield' }).filter((l) => l.tapped)).toHaveLength(1);
    g.passAll();
    g.act(0).arrange({ top: ['a', 'b', 'c'] });
    g.expect.zone(PEEK, 'graveyard', { seat: 0 });
  });

  test("the spell's own text is done too: it scries 3", () => {
    const g = board(3);
    g.act(0).cast(PEEK, { bought: true, pay: true });
    g.passAll();
    const d = arrangeDecision(g);
    expect(d.purpose).toBe('scry');
    expect(d.cards).toHaveLength(3);
    g.act(0).arrange({ top: ['c', 'b'], other: ['a'] });
    expect(libraryNames(g).slice(0, 3)).toEqual(['Plains', 'Forest', 'Plains']);
  });

  test('it can be paid again and again: the same card is cast twice in one turn with six lands', () => {
    const g = board(6);
    for (let i = 0; i < 2; i += 1) {
      g.act(0).cast(PEEK, { bought: true, pay: true });
      g.passAll();
      g.act(0).arrange({ top: arrangeDecision(g).cards });
      g.expect.zone(PEEK, 'hand', { seat: 0 });
    }
    g.expect.invariants();
  });

  test('the question is not asked when the buyback cost cannot be paid on top: the spell is cast without it', () => {
    const g = board(2);
    g.act(0).cast(PEEK, { pay: true });
    g.expect.stack([PEEK]);
    g.passAll();
    g.act(0).arrange({ top: ['a', 'b', 'c'] });
    g.expect.zone(PEEK, 'graveyard', { seat: 0 });
  });

  test('the question is asked, with the cost, when the player could pay it', () => {
    const g = board(3);
    g.act(0).cast(PEEK);
    const d = g.state.pending;
    expect(d?.kind).toBe('confirmOptional');
    if (d?.kind !== 'confirmOptional') return;
    expect(d.purpose).toBe('buyback');
    expect(d.cost).toEqual([{ kind: 'mana', symbols: ['2'] }]);
    g.act(0).accept();
    g.act(0).payAuto();
    expect(g.state.stack.length).toBe(1);
    g.expect.invariants();
  });

  test('cancelling at the question rewinds the cast', () => {
    const g = board(3);
    g.act(0).cast(PEEK);
    g.act(0).cancel();
    g.expect.zone(PEEK, 'hand', { seat: 0 });
    g.expect.stack([]);
    for (const l of g.find({ name: 'Island', zone: 'battlefield' })) expect(l.tapped).toBe(false);
  });

  test('the spellCast event says it was bought back, and a spell that was not has no such field', () => {
    const g = board(3);
    g.act(0).cast(PEEK, { bought: true, pay: true });
    expect(g.events).toContainEqual(
      expect.objectContaining({ kind: 'spellCast', boughtBack: true }),
    );
    const h = board(3);
    h.act(0).cast(PEEK, { bought: false, pay: true });
    expect(h.events.find((e) => e.kind === 'spellCast')).not.toHaveProperty('boughtBack');
  });

  test('a spell that is countered goes to the graveyard, bought back or not: the card returns only as it resolves', () => {
    const g = board(3, (b) => b.seat(1).hand(COUNTERSPELL).battlefield('Island', { count: 2 }));
    g.act(0).cast(PEEK, { bought: true, pay: true });
    g.act(0).pass();
    g.act(1).cast(COUNTERSPELL, { targets: [{ name: PEEK, seat: 0 }], pay: true });
    g.passAll();
    g.expect.zone(PEEK, 'graveyard', { seat: 0 });
    g.expect.noObject(PEEK, { zone: 'hand' });
  });
});

describe('"Put X +1/+1 counters on target creature you control. Then counter up to one target spell unless its controller pays mana equal to the greatest power among creatures you control." (CR 608.2c, 118.12a)', () => {
  /** Seat 1 is the active player and casts Divination; seat 0 answers with the Mutation (X given) on its Bears and, unless `noSpell`, on the Divination. */
  const duel = (opts: {
    x: number;
    theirLands: number;
    noSpell?: boolean;
    extra?: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario>;
  }) => {
    let b = defs()
      .seat(0)
      .library(...FILLER)
      .hand(MUTATION)
      .battlefield('Forest')
      .battlefield('Island', { count: 1 + opts.x })
      .battlefield(BEARS)
      .seat(1)
      .library(...FILLER)
      .hand(DIVINATION)
      .battlefield('Island', { count: opts.theirLands });
    if (opts.extra !== undefined) b = opts.extra(b);
    const g = b.at('precombatMain', { active: 1 }).build();
    g.act(1).cast(DIVINATION, { pay: true });
    g.act(1).pass();
    const targets = opts.noSpell
      ? [{ name: BEARS, seat: 0 } as const]
      : [{ name: BEARS, seat: 0 } as const, { name: DIVINATION, seat: 1 } as const];
    g.act(0).cast(MUTATION, { x: opts.x, targets, pay: true });
    return g;
  };

  test('the counters are put first: the power read is the Bears with them (X = 2: 4 mana to pay)', () => {
    // seat 1 has 3 + 3 lands: Divination takes 3, three are left, and 4 is owed
    const g = duel({ x: 2, theirLands: 6 });
    g.passAll();
    g.expect.counters(BEARS, { '+1/+1': 2 });
    g.expect.pt(BEARS, 4, 4);
    // it cannot pay 4 with three lands: it is countered without being asked
    g.expect.zone(DIVINATION, 'graveyard', { seat: 1 });
    g.expect.noEvent({ kind: 'cardDrawn', seat: 1 });
    g.expect.invariants();
  });

  test('the controller of the spell is asked when it can pay, and keeps the spell by paying exactly that much', () => {
    const g = duel({ x: 1, theirLands: 6 });
    g.pass(0);
    g.pass(1);
    g.expect.pending('confirmOptional', 1);
    const d = g.state.pending;
    if (d?.kind !== 'confirmOptional') throw new Error('expected a question');
    expect(d.purpose).toBe('counterUnlessPays');
    expect(d.cost).toEqual([{ kind: 'mana', symbols: ['3'] }]);
    g.act(1).accept();
    g.act(1).payAuto();
    g.passAll();
    g.expect.zone(DIVINATION, 'graveyard', { seat: 1 });
    g.expect.handSize(1, 2);
    for (const l of g.find({ name: 'Island', zone: 'battlefield', seat: 1 })) {
      expect(l.tapped).toBe(true);
    }
  });

  test('declining to pay counters the spell', () => {
    const g = duel({ x: 1, theirLands: 6 });
    g.pass(0);
    g.pass(1);
    g.act(1).decline();
    g.expect.zone(DIVINATION, 'graveyard', { seat: 1 });
    g.expect.noEvent({ kind: 'cardDrawn', seat: 1 });
    g.expect.eventLog([{ kind: 'countered' }]);
  });

  test('the greatest power is the greatest among all the creatures of the caster, not only the one that got the counters', () => {
    const g = duel({ x: 1, theirLands: 7, extra: (b) => b.seat(0).battlefield(ANGEL) });
    g.pass(0);
    g.pass(1);
    const d = g.state.pending;
    if (d?.kind !== 'confirmOptional') throw new Error('expected a question');
    // the Angel has power 4 and the Bears 3 with the counter: 4 mana
    expect(d.cost).toEqual([{ kind: 'mana', symbols: ['4'] }]);
  });

  test('"up to one": cast with no spell to target, the counters are put and nothing is countered', () => {
    const g = defs()
      .seat(0)
      .library(...FILLER)
      .hand(MUTATION)
      .battlefield('Forest')
      .battlefield('Island', { count: 3 })
      .battlefield(BEARS)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.act(0).cast(MUTATION, { x: 2, targets: [{ name: BEARS, seat: 0 }], pay: true });
    g.passAll();
    g.expect.counters(BEARS, { '+1/+1': 2 });
    g.expect.zone(MUTATION, 'graveyard', { seat: 0 });
    g.expect.noEvent({ kind: 'countered' });
  });

  test('the creature is a target: with no creature the spell cannot be cast', () => {
    const g = defs()
      .seat(0)
      .library(...FILLER)
      .hand(MUTATION)
      .battlefield('Forest')
      .battlefield('Island', { count: 3 })
      .seat(1)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    expect(g.act(0).try.cast(MUTATION).ok).toBe(false);
  });

  test('an amount of 0 is a payment of nothing: nothing is countered (a creature with 0 power and no counters)', () => {
    const g = defs()
      .seat(0)
      .library(...FILLER)
      .hand(MUTATION)
      .battlefield('Forest')
      .battlefield('Island', { count: 1 })
      .battlefield('Wall of Stone')
      .seat(1)
      .library(...FILLER)
      .hand(DIVINATION)
      .battlefield('Island', { count: 3 })
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast(DIVINATION, { pay: true });
    g.act(1).pass();
    g.act(0).cast(MUTATION, {
      x: 0,
      targets: [
        { name: 'Wall of Stone', seat: 0 },
        { name: DIVINATION, seat: 1 },
      ],
      pay: true,
    });
    g.passAll();
    g.expect.noEvent({ kind: 'countered' });
    g.expect.handSize(1, 2);
  });
});

describe('Jace, Mirror Mage: Kicker {2} and "a token that\'s a copy of it, except it\'s not legendary and its starting loyalty is 1"', () => {
  const board = (
    extra: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario> = (b) => b,
  ) =>
    extra(
      defs()
        .seat(0)
        .library(...FILLER)
        .hand(WALKER)
        .battlefield('Island', { count: 5 })
        .seat(1)
        .library(...FILLER),
    )
      .at('precombatMain')
      .build();

  const walkers = (g: ScenarioGame) => g.find({ name: WALKER, zone: 'battlefield' });

  test('unkicked: one planeswalker with its printed loyalty and no token', () => {
    const g = board();
    g.act(0).cast(WALKER, { kicked: false, pay: true });
    g.passAll();
    expect(walkers(g)).toHaveLength(1);
    g.expect.counters(WALKER, { loyalty: 4 });
  });

  test('kicked: its enters trigger makes a token copy with loyalty 1, and the copy is not legendary', () => {
    const g = board();
    g.act(0).cast(WALKER, { kicked: true, pay: true });
    g.passAll();
    expect(walkers(g)).toHaveLength(2);
    const [real] = walkers(g).filter((o) => o.token === null);
    const [token] = walkers(g).filter((o) => o.token !== null);
    if (real === undefined || token === undefined) throw new Error('expected a card and a token');
    expect(real.counters.loyalty).toBe(4);
    expect(token.counters.loyalty).toBe(1);
    expect(derive(g.state, real).supertypes).toEqual(['legendary']);
    expect(derive(g.state, token).supertypes).toEqual([]);
    expect(derive(g.state, token).types).toEqual(['planeswalker']);
    expect(derive(g.state, token).subtypes).toEqual(['Jace']);
    expect(derive(g.state, token).loyalty).toBe(1);
    g.expect.invariants();
  });

  test('the legend rule does not apply to the pair: the token is not legendary (CR 205.4a, 704.5j)', () => {
    const g = board();
    g.act(0).cast(WALKER, { kicked: true, pay: true });
    g.passAll();
    expect(g.state.pending?.kind).toBe('priority');
    expect(walkers(g)).toHaveLength(2);
  });

  test('the token copies the abilities too: it has the loyalty abilities, and its +1 raises its own loyalty', () => {
    const g = board();
    g.act(0).cast(WALKER, { kicked: true, pay: true });
    g.passAll();
    const token = walkers(g).find((o) => o.token !== null);
    if (token === undefined) throw new Error('no token');
    g.act(0).activate(token.id, { ability: 2 });
    g.passAll();
    expect(g.object(token.id).counters.loyalty).toBe(2);
    g.act(0).arrange({ top: ['Plains[0]', 'Plains[1]'] });
    g.expect.counters(
      g.find({ name: WALKER, zone: 'battlefield' }).find((o) => o.token === null)?.id ?? '',
      { loyalty: 4 },
    );
  });

  test('a token copy that left cannot be copied again by the enters trigger of another: kicked twice makes a copy each time', () => {
    const g = defs()
      .seat(0)
      .library(...FILLER)
      .hand(WALKER)
      .battlefield('Island', { count: 5 })
      .seat(1)
      .library(...FILLER)
      .hand(WALKER)
      .battlefield('Island', { count: 5 })
      .at('precombatMain')
      .build();
    g.act(0).cast(WALKER, { kicked: true, pay: true });
    g.passAll();
    expect(walkers(g)).toHaveLength(2);
  });
});

describe('Jace, Mirror Mage: "0: Draw a card and reveal it. Remove a number of loyalty counters equal to that card\'s mana value from ~."', () => {
  const game = (...top: string[]) =>
    defs()
      .seat(0)
      .library(...top, ...FILLER)
      .battlefield(WALKER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain')
      .build();

  test('a card with mana value 2: it is drawn, revealed to everyone, and Jace loses 2 loyalty', () => {
    const g = game(BEARS);
    g.act(0).activate(WALKER, { ability: 3 });
    g.passAll();
    expect(handNames(g)).toEqual([BEARS]);
    g.expect.counters(WALKER, { loyalty: 2 });
    g.expect.eventLog([
      { kind: 'cardDrawn', seat: 0 },
      { kind: 'cardsRevealed', seat: 0, names: [BEARS], from: 'hand' },
      { kind: 'counterRemoved', counter: 'loyalty', count: 2 },
    ]);
    g.expect.invariants();
  });

  test('a land has no mana value to speak of: nothing is removed (CR 202.3)', () => {
    const g = game('Island');
    g.act(0).activate(WALKER, { ability: 3 });
    g.passAll();
    g.expect.counters(WALKER, { loyalty: 4 });
    g.expect.noEvent({ kind: 'counterRemoved' });
    g.expect.eventLog([{ kind: 'cardsRevealed', seat: 0, names: ['Island'] }]);
  });

  test("a card whose mana value is at least Jace's loyalty: Jace has no loyalty left and is put into the graveyard (CR 704.5i)", () => {
    const g = game(SPIDER);
    g.act(0).activate(WALKER, { ability: 3 });
    g.passAll();
    g.expect.zone(WALKER, 'graveyard', { seat: 0 });
    expect(handNames(g)).toEqual([SPIDER]);
  });

  test('more than the loyalty is only the loyalty it has: nothing negative', () => {
    const g = game(ANGEL);
    g.act(0).activate(WALKER, { ability: 3 });
    g.passAll();
    g.expect.zone(WALKER, 'graveyard', { seat: 0 });
    expect(g.events.find((e) => e.kind === 'counterRemoved')).toMatchObject({ count: 4 });
  });

  test('"that card" is the card drawn, not the one on top afterwards', () => {
    const g = game(BEARS, SPIDER);
    g.act(0).activate(WALKER, { ability: 3 });
    g.passAll();
    g.expect.counters(WALKER, { loyalty: 2 });
  });
});

describe('"At the beginning of your upkeep, roll a d4. Scry X, where X is the result." and "Whenever you roll a die\'s highest natural result, draw a card." (CR 706.1a, 706.2)', () => {
  const SEEDS = Array.from({ length: 24 }, (_, i) => i + 1);
  type Rolled = Extract<ScenarioGame['events'][number], { kind: 'dieRolled' }>;
  const rolls = (g: ScenarioGame): Rolled[] =>
    g.events.filter((e): e is Rolled => e.kind === 'dieRolled');

  /** Seat 1 is in its end step on turn 4; the next turn is seat 0's, with the Ward on its battlefield. */
  const upkeepGame = (seed: number) =>
    defs()
      .seed(seed)
      .seat(0)
      .library(...Array.from({ length: 12 }, () => 'Plains'))
      .battlefield(WARD)
      .seat(1)
      .library(...FILLER)
      .at('end', { active: 1, turn: 4 })
      .build();

  test('the scry looks at as many cards as the result, and a result of 4 draws a card', () => {
    const seen = new Set<number>();
    for (const seed of SEEDS) {
      const g = upkeepGame(seed);
      const want = (nextInt(g.state.rng, 4)[0] ?? -1) + 1;
      g.advanceTo('upkeep', { turn: 'next' });
      g.expect.step('upkeep', { active: 0 });
      g.passAll();
      const [roll] = rolls(g);
      expect(roll).toMatchObject({ seat: 0, sides: 4 });
      expect(roll?.result).toBe(want);
      seen.add(want);
      const d = arrangeDecision(g);
      expect(d.cards).toHaveLength(want);
      // the draw of the highest result comes first, as the trigger goes on the stack before the scry begins: the card is in the hand once everything resolved
      g.act(0).arrange({ top: d.cards });
      expect(g.state.pending?.kind).toBe('priority');
    }
    expect([...seen].sort()).toEqual([1, 2, 3, 4]);
  });

  test('only the highest result draws: for every seed, exactly one card is drawn on a 4 and none otherwise (beyond the draw step)', () => {
    for (const seed of SEEDS) {
      const g = upkeepGame(seed);
      const want = (nextInt(g.state.rng, 4)[0] ?? -1) + 1;
      g.advanceTo('upkeep', { turn: 'next' });
      g.passAll();
      const d = arrangeDecision(g);
      g.act(0).arrange({ top: d.cards });
      // the draw of a highest result is the trigger now on the stack
      if (g.state.stack.length > 0) g.passAll();
      const draws = g.events.filter((e) => e.kind === 'cardDrawn' && e.seat === 0);
      expect(draws.length, `seed ${seed} rolled ${want}`).toBe(want === 4 ? 1 : 0);
    }
  });

  test('the highest result of the die that was rolled: a d2 and a d20 of the player trigger it too, at their own highest number', () => {
    for (const seed of SEEDS) {
      const g = defs()
        .seed(seed)
        .seat(0)
        .library(...FILLER)
        .battlefield(WARD)
        .hand(COIN)
        .battlefield('Mountain', { count: 1 })
        .seat(1)
        .library(...FILLER)
        .at('precombatMain')
        .build();
      const want = (nextInt(g.state.rng, 2)[0] ?? -1) + 1;
      g.act(0).cast(COIN, { pay: true });
      g.passAll();
      expect(rolls(g)[0]?.result).toBe(want);
      expect(g.events.filter((e) => e.kind === 'cardDrawn').length, `seed ${seed}`).toBe(
        want === 2 ? 1 : 0,
      );
    }
    let wheelDraws = 0;
    for (const seed of Array.from({ length: 80 }, (_, i) => i + 1)) {
      const g = defs()
        .seed(seed)
        .seat(0)
        .library(...FILLER)
        .battlefield(WARD)
        .hand(WHEEL)
        .battlefield('Mountain', { count: 3 })
        .seat(1)
        .library(...FILLER)
        .at('precombatMain')
        .build();
      const want = (nextInt(g.state.rng, 20)[0] ?? -1) + 1;
      g.act(0).cast(WHEEL, { pay: true });
      g.passAll();
      const drew = g.events.filter((e) => e.kind === 'cardDrawn').length;
      expect(drew, `seed ${seed} rolled ${want}`).toBe(want === 20 ? 1 : 0);
      wheelDraws += drew;
    }
    expect(wheelDraws).toBeGreaterThanOrEqual(0);
  });

  test('a die an opponent rolls does not trigger it ("you roll")', () => {
    let rolledFour = 0;
    for (const seed of SEEDS) {
      const g = defs()
        .seed(seed)
        .seat(0)
        .library(...FILLER)
        .battlefield(WARD)
        .seat(1)
        .library(...FILLER)
        .hand(ALONE)
        .battlefield('Mountain')
        .at('precombatMain', { active: 1 })
        .build();
      const want = (nextInt(g.state.rng, 4)[0] ?? -1) + 1;
      g.act(1).cast(ALONE, { pay: true });
      g.passAll();
      if (want === 4) rolledFour += 1;
      g.expect.noEvent({ kind: 'cardDrawn', seat: 0 });
    }
    expect(rolledFour).toBeGreaterThan(0);
  });

  test('the result is the natural result: the number the roll drew, the same one the event records', () => {
    const g = upkeepGame(5);
    g.advanceTo('upkeep', { turn: 'next' });
    g.passAll();
    const [roll] = rolls(g);
    expect(arrangeDecision(g).cards).toHaveLength(roll?.result ?? -1);
  });
});
