// "Whenever one or more creatures an opponent controls attack you and aren't blocked, that player draws two cards and gains control of this artifact. Untap it."
// Pins: CR 509.1h (an attacking creature with no creature declared to block it is unblocked), CR 603.2 (a trigger of the declare blockers step), CR 508.1b (attack you
// as a player), CR 613.1b (a permanent control effect with no duration, layer 2), CR 701.26b (untap). The card is SYNTHETIC (src/cards/fixtures/synthetic-unblocked.ts).
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { controllerOf } from '../src/rules/control';
import { scenario } from '../src/testing/index';

const GEM = 'SYNTHETIC Greedy Gem';
const BEARS = 'Grizzly Bears'; // 2/2
const GOBLIN = 'Raging Goblin'; // 1/1
const WALL = 'SYNTHETIC Brick Wall'; // 0/5 defender
const FILLER = Array.from({ length: 20 }, () => 'Island');

/** Seat 1 attacks seat 0, who owns the (tapped) Gem and what `defence` adds. */
const game = (attackers: readonly string[], defence: readonly string[] = []) => {
  const b = scenario().seat(0).battlefield(GEM, { tapped: true });
  for (const d of defence) b.battlefield(d);
  const s1 = b.library(...FILLER).seat(1);
  for (const a of attackers) s1.battlefield(a);
  const g = s1
    .library(...FILLER)
    .at('precombatMain', { active: 1, turn: 2 })
    .build();
  g.advanceTo('declareAttackers');
  g.act(1).attack(attackers);
  g.advanceTo('declareBlockers');
  return g;
};

describe('the card is valid', () => {
  test(GEM, () => {
    expect(validateCard(syntheticCard(GEM))).toEqual([]);
  });
});

describe('creatures of an opponent attack you and are not blocked (CR 509.1h)', () => {
  test('nothing can block: the attacker draws two, takes the artifact and untaps it', () => {
    const g = game([BEARS]);
    g.passAll();
    g.expect.handSize(1, 2);
    g.expect.tapped(GEM, false);
    expect(controllerOf(g.state, g.object(GEM))).toBe(1);
    g.expect.stack([]);
  });

  test('a declaration with no blockers still triggers', () => {
    const g = game([BEARS], [WALL]);
    g.act(0).declareBlockers([]);
    g.passAll();
    g.expect.handSize(1, 2);
    g.expect.tapped(GEM, false);
  });

  test('a blocked attacker does not trigger it', () => {
    const g = game([BEARS], [WALL]);
    g.act(0).declareBlockers([{ blocker: WALL, attacker: BEARS }]);
    g.passAll();
    g.expect.handSize(1, 0);
    g.expect.tapped(GEM, true);
    expect(controllerOf(g.state, g.object(GEM))).toBe(0);
  });

  test('with one attacker blocked and one not, it triggers once, for the one left', () => {
    const g = game([BEARS, GOBLIN], [WALL]);
    g.act(0).declareBlockers([{ blocker: WALL, attacker: BEARS }]);
    g.expect.stack([`${GEM} (ability)`]);
    g.passAll();
    g.expect.handSize(1, 2);
  });
});

describe('only the creatures of an opponent that attack you count', () => {
  test('my own attack does not trigger it', () => {
    const g = scenario()
      .seat(0)
      .battlefield(GEM, BEARS)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack([BEARS]);
    g.advanceTo('declareBlockers');
    g.expect.stack([]);
    g.expect.handSize(0, 0);
  });
});
