// The Prismari deck (issue 87), group 2: Brazen Borrower, "This creature can block only creatures with flying." (SYNTHETIC Skittish Borrower, src/cards/fixtures/synthetic-prismari-g2.ts).
// Pins: CR 509.1a and 509.1b (a restriction on what a creature can block is part of the rules for declaring blockers: a declaration that breaks it is illegal), CR 702.9b (flying: a
// creature with flying can't be blocked except by creatures with flying or reach: the restriction of the attacker and the one of the blocker both apply), CR 604.1 (a static
// ability of the creature itself), CR 613.1f and 613.11 (an effect that removes all abilities removes the static restriction), CR 509.1c (a requirement to block is obeyed only as far as
// the restrictions allow).
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const BORROWER = 'SYNTHETIC Skittish Borrower'; // 3/1 flash flying, can block only creatures with flying
const BEARS = 'Grizzly Bears'; // 2/2
const ANGEL = 'Serra Angel'; // 4/4 flying vigilance
const SPIDER = 'Giant Spider'; // 2/4 reach
const LIBRARY = Array.from({ length: 6 }, () => 'Island');

function build(attackers: readonly string[]) {
  const b = scenario()
    .seat(0)
    .library(...LIBRARY);
  attackers.forEach((name, i) => b.battlefield(name, { label: `att${i}` }));
  return b
    .seat(1)
    .library(...LIBRARY)
    .battlefield(BORROWER)
    .battlefield(BEARS)
    .at('precombatMain', { active: 0 });
}

const borrower = { name: BORROWER, seat: 1 } as const;
const bears = { name: BEARS, seat: 1 } as const;

describe('the card is valid', () => {
  test(BORROWER, () => {
    expect(validateCard(syntheticCard(BORROWER))).toEqual([]);
  });
});

describe('can block only creatures with flying (CR 509.1b)', () => {
  test('a creature with flying can be blocked by it', () => {
    const g = build([ANGEL]).build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(ANGEL);
    g.advanceTo('declareBlockers');
    g.expect.canBlock(borrower, { name: ANGEL, seat: 0 }, true);
    g.act(1).declareBlockers([{ blocker: borrower, attacker: ANGEL }]);
    g.expect.invariants();
  });

  test('a creature without flying cannot: not a candidate, and the declaration is refused', () => {
    const g = build([BEARS]).build();
    g.advanceTo('declareAttackers');
    g.act(0).attack({ name: BEARS, seat: 0 });
    g.advanceTo('declareBlockers');
    g.expect.canBlock(borrower, { name: BEARS, seat: 0 }, false);
    // Another creature of the same player is not restricted.
    g.expect.canBlock(bears, { name: BEARS, seat: 0 }, true);
    expect(() =>
      g.act(1).declareBlockers([{ blocker: borrower, attacker: { name: BEARS, seat: 0 } }]),
    ).toThrow();
    g.act(1).declareBlockers([{ blocker: bears, attacker: { name: BEARS, seat: 0 } }]);
  });

  test('a creature with reach is not a creature with flying: it cannot be blocked by it', () => {
    const g = build([SPIDER]).build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(SPIDER);
    g.advanceTo('declareBlockers');
    g.expect.canBlock(borrower, { name: SPIDER, seat: 0 }, false);
  });

  test('two attackers: it may block the one with flying and not the other', () => {
    const g = build([ANGEL, BEARS]).build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(['att0', 'att1']);
    g.advanceTo('declareBlockers');
    g.expect.canBlock(borrower, 'att0', true);
    g.expect.canBlock(borrower, 'att1', false);
  });

  test('an attacker that gains flying until end of turn can be blocked by it', () => {
    const g = build([BEARS]).seat(0).hand('SYNTHETIC Gust of Wings').battlefield('Island').build();
    g.advanceTo('declareAttackers');
    g.act(0).attack({ name: BEARS, seat: 0 });
    g.act(0).cast('SYNTHETIC Gust of Wings', { pay: true, targets: [{ name: BEARS, seat: 0 }] });
    g.passAll();
    g.advanceTo('declareBlockers');
    g.expect.canBlock(borrower, { name: BEARS, seat: 0 }, true);
  });

  test('a creature that loses all abilities loses the restriction (CR 613.1f)', () => {
    const g = build([BEARS])
      .seat(1)
      .hand('SYNTHETIC Frog Hex')
      .battlefield('Island', { count: 2 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack({ name: BEARS, seat: 0 });
    g.act(0).pass();
    g.act(1).cast('SYNTHETIC Frog Hex', { pay: true, targets: [borrower] });
    g.passAll();
    g.advanceTo('declareBlockers');
    // A 1/1 Frog with no abilities: it can block a creature that does not fly (and no longer flies itself).
    g.expect.canBlock(borrower, { name: BEARS, seat: 0 }, true);
  });
});
