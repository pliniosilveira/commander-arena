// "As long as this creature is attacking, creatures can't block unless their controller pays {1} for each of those creatures" (D-149).
// Pins: CR 509.1b (restrictions on blocking, among them "can't block unless ..."), CR 509.1c (a player is never required to pay a cost to
// block), CR 509.1d (the total cost to block is determined once the blockers are chosen, and paid), CR 506.4 (an attacking creature is one
// declared as an attacker that is still in combat), CR 604.1 (a static ability works while its permanent has it), CR 733 (an illegal
// declaration is taken back). Cards are SYNTHETIC (src/cards/fixtures/synthetic-angels-statics.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { applyAction, syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const TITHE = 'SYNTHETIC Tithe Angel';
const BRIDGE = 'SYNTHETIC Toll Bridge';
const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider'; // reach: it can block a flying attacker
const ELVES = 'Llanowar Elves';
const land = (nth: number) => ({
  name: 'Plains',
  zone: 'battlefield' as const,
  seat: 1 as const,
  nth,
});
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

describe('the cards are valid', () => {
  test.each([TITHE, BRIDGE])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

/** Seat 0 attacks with `attackers`; seat 1 has the creatures and lands `theirs` lists. The game waits at seat 1's declaration of blockers. */
const blocked = (attackers: readonly string[], theirs: readonly string[]) => {
  const g = scenario()
    .seat(0)
    .library(...LIBRARY)
    .battlefield(...attackers)
    .seat(1)
    .library(...LIBRARY)
    .battlefield(...theirs)
    .build();
  g.advanceTo('declareAttackers', { attack: false });
  g.act(0).attack(attackers.filter((a) => a !== BRIDGE));
  g.advanceTo('declareBlockers');
  return g;
};

describe('while the Angel is attacking', () => {
  test('the decision says what blocking costs and how many can be paid for', () => {
    const g = blocked([TITHE], [SPIDER, SPIDER, 'Plains']);
    const d = g.state.pending;
    if (d?.kind !== 'declareBlockers') throw new Error(`expected declareBlockers, got ${d?.kind}`);
    expect(d.blockCost?.cost).toEqual(['1']);
    expect(d.blockCost?.affordable).toBe(1);
  });

  test('one blocker is paid for with a land: the payment is asked, then the block is declared', () => {
    const g = blocked([TITHE], [`${SPIDER}`, 'Plains']);
    g.act(1).declareBlockers([{ blocker: SPIDER, attacker: TITHE }]);
    g.expect.pending('payMana', 1);
    g.act(1).payAuto();
    g.expect.combat({ attackers: [TITHE], blocks: [{ blocker: SPIDER, attacker: TITHE }] });
    g.expect.tapped(land(0), true);
  });

  test('two blockers cost {1} each: one land is not enough, so that declaration is refused', () => {
    const g = blocked([TITHE], [SPIDER, SPIDER, 'Plains']);
    const both = [
      { blocker: `${SPIDER}[0]`, attacker: TITHE },
      { blocker: `${SPIDER}[1]`, attacker: TITHE },
    ];
    expect(g.act(1).try.declareBlockers(both).ok).toBe(false);
    g.expect.illegal(1, { declareBlockers: both });
  });

  test('two lands pay for two blockers', () => {
    const g = blocked([TITHE], [SPIDER, SPIDER, 'Plains', 'Plains']);
    g.act(1).declareBlockers([
      { blocker: `${SPIDER}[0]`, attacker: TITHE },
      { blocker: `${SPIDER}[1]`, attacker: TITHE },
    ]);
    g.expect.pending('payMana', 1);
    g.act(1).payAuto();
    g.expect.tapped(land(0), true);
    g.expect.tapped(land(1), true);
  });

  test('no block costs nothing', () => {
    const g = blocked([TITHE], [SPIDER]);
    g.act(1).noBlocks();
    g.expect.combat({ attackers: [TITHE], unblocked: [TITHE] });
  });

  test('with no mana at all no block can be declared, and no block is listed as a legal action', () => {
    const g = blocked([TITHE], [SPIDER]);
    expect(g.act(1).try.declareBlockers([{ blocker: SPIDER, attacker: TITHE }]).ok).toBe(false);
    const listed = g.legalActions(1).filter((a) => a.kind === 'declareBlockers');
    expect(listed).toEqual([{ kind: 'declareBlockers', blocks: [] }]);
  });

  test('cancelling the payment takes the declaration back: the question is asked again', () => {
    const g = blocked([TITHE], [SPIDER, 'Plains']);
    g.act(1).declareBlockers([{ blocker: SPIDER, attacker: TITHE }]);
    g.act(1).cancel();
    g.expect.pending('declareBlockers', 1);
    g.expect.tapped(land(0), false);
  });

  test('paying by hand: tapping the sources of the cost', () => {
    const g = blocked([TITHE], [SPIDER, 'Plains', 'Plains']);
    g.act(1).declareBlockers([{ blocker: SPIDER, attacker: TITHE }]);
    const d = g.state.pending;
    if (d?.kind !== 'payMana') throw new Error(`expected payMana, got ${d?.kind}`);
    expect(d.purpose).toBe('blockTax');
    expect(d.totalCost).toEqual(['1']);
    g.choose({ kind: 'payManual', taps: [{ object: g.id(land(1)), abilityIndex: 0 }] });
    g.expect.tapped(land(1), true);
    g.expect.combat({ attackers: [TITHE], blocks: [{ blocker: SPIDER, attacker: TITHE }] });
  });

  test('a payment that does not cover the cost is refused and the question stays', () => {
    const g = blocked([TITHE], [SPIDER, 'Plains']);
    g.act(1).declareBlockers([{ blocker: SPIDER, attacker: TITHE }]);
    const r = applyAction(g.state, 1, { kind: 'payManual', taps: [] });
    expect(r.ok).toBe(false);
    g.expect.pending('payMana', 1);
  });
});

describe('only while the Angel is attacking', () => {
  test('another creature attacks and the Angel stays home: blocking is free', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(TITHE, BEARS)
      .seat(1)
      .library(...LIBRARY)
      .battlefield('Grizzly Bears')
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([`${BEARS}`]);
    g.advanceTo('declareBlockers');
    const d = g.state.pending;
    if (d?.kind !== 'declareBlockers') throw new Error(`expected declareBlockers, got ${d?.kind}`);
    expect(d.blockCost).toBeUndefined();
    g.act(1).declareBlockers([
      { blocker: { name: BEARS, seat: 1 }, attacker: { name: BEARS, seat: 0 } },
    ]);
    g.expect.combat({
      attackers: [BEARS],
      blocks: [{ blocker: { name: BEARS, seat: 1 }, attacker: { name: BEARS, seat: 0 } }],
    });
  });
});

describe('the Angel leaves combat', () => {
  test('destroyed before blockers are declared: the other attacker is blocked for free', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(TITHE, BEARS)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(SPIDER, 'Swamp', 'Swamp', 'Swamp')
      .hand('Murder')
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([TITHE, BEARS]);
    g.act(0).pass();
    g.act(1).cast('Murder', { targets: [TITHE], pay: true });
    g.passAll();
    g.expect.zone(TITHE, 'graveyard', { seat: 0 });
    g.advanceTo('declareBlockers');
    const d = g.state.pending;
    if (d?.kind !== 'declareBlockers') throw new Error(`expected declareBlockers, got ${d?.kind}`);
    expect(d.blockCost).toBeUndefined();
    g.act(1).declareBlockers([{ blocker: SPIDER, attacker: BEARS }]);
    g.expect.combat({ blocked: [BEARS] });
  });
});

describe('a tax that is always on', () => {
  test('a creature that taps for mana may pay for its own block', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(BRIDGE, BEARS)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(ELVES)
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(BEARS);
    g.advanceTo('declareBlockers');
    const d = g.state.pending;
    if (d?.kind !== 'declareBlockers') throw new Error(`expected declareBlockers, got ${d?.kind}`);
    expect(d.blockCost?.affordable).toBe(1);
    g.act(1).declareBlockers([{ blocker: ELVES, attacker: BEARS }]);
    g.act(1).payAuto();
    g.expect.combat({ attackers: [BEARS], blocks: [{ blocker: ELVES, attacker: BEARS }] });
  });

  test('the Bridge taxes every block, with the Angel the cost is {1}{1}', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(TITHE, BRIDGE)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(SPIDER, 'Plains', 'Plains')
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(TITHE);
    g.advanceTo('declareBlockers');
    const d = g.state.pending;
    if (d?.kind !== 'declareBlockers') throw new Error(`expected declareBlockers, got ${d?.kind}`);
    expect(d.blockCost?.cost).toEqual(['1', '1']);
    expect(d.blockCost?.affordable).toBe(1);
    g.act(1).declareBlockers([{ blocker: SPIDER, attacker: TITHE }]);
    g.act(1).payAuto();
    g.expect.tapped(land(0), true);
    g.expect.tapped(land(1), true);
  });

  test('with only the Bridge, blocking costs {1} even when nothing attacks that taxes', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(BRIDGE, ELVES)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, 'Plains')
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(ELVES);
    g.advanceTo('declareBlockers');
    g.act(1).declareBlockers([{ blocker: BEARS, attacker: ELVES }]);
    g.expect.pending('payMana', 1);
  });
});
