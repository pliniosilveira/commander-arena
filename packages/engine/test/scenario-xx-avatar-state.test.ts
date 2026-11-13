// "Until end of turn, target creature you control becomes an Avatar in addition to its other types and gains flying, first strike, lifelink, and hexproof." (D-371,
// group 4 of the Hashaton deck): one additive `setTypes` and four `grantKeyword` on one target, chosen once.
// Pins: CR 205.1b and 613.1d (the type is added in layer 4, the creature types it has stay), CR 613.1f (the keywords, layer 6), CR 611.2a and 514.2 (until end of turn),
// CR 611.2c (what they apply to is fixed as the effect begins: the target), CR 702.11b (hexproof: an opponent's spell or ability can't target it), CR 608.2b (a target
// that is gone when the spell resolves is skipped).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-hashaton-group-4.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { expireEndOfTurnEffects } from '../src/rules/continuous';
import { derive } from '../src/rules/derive';
import { scenario } from '../src/testing/index';

const SURGE = 'SYNTHETIC Avatar Surge'; // {W} instant — Lesson: the real card's effect
const BEAR = 'SYNTHETIC Winged Bear'; // 2/2 Bear with flying
const WATCHER = 'SYNTHETIC Amass Watcher'; // 1/3 Zombie Wizard
const BEARS = 'Grizzly Bears'; // 2/2 vanilla
const BOLT = 'Lightning Bolt';
const FOUR = ['flying', 'firstStrike', 'lifelink', 'hexproof'];

test('the card is valid', () => {
  expect(validateCard(syntheticCard(SURGE))).toEqual([]);
});

describe('the target becomes an Avatar in addition to its other types and gains the four keywords', () => {
  const start = () =>
    scenario()
      .seat(0)
      .library('Island', { count: 4 })
      .hand(SURGE)
      .battlefield('Plains', BEARS, WATCHER)
      .seat(1)
      .library('Island', { count: 4 })
      .battlefield(BEARS)
      .build();

  test('a vanilla Bear gets the type besides Bear and the four keywords (CR 205.1b, 613.1f)', () => {
    const g = start();
    g.act(0).cast(SURGE, { targets: [{ name: BEARS, seat: 0 }], pay: true });
    g.passAll();
    g.expect.derived(
      { name: BEARS, seat: 0 },
      {
        types: ['creature'],
        subtypes: ['Bear', 'Avatar'],
        keywords: FOUR,
      },
    );
    g.expect.pt({ name: BEARS, seat: 0 }, 2, 2);
    g.expect.invariants();
  });

  test('a creature with several types keeps them all', () => {
    const g = start();
    g.act(0).cast(SURGE, { targets: [WATCHER], pay: true });
    g.passAll();
    g.expect.derived(WATCHER, { subtypes: ['Zombie', 'Wizard', 'Avatar'], keywords: FOUR });
  });

  test('only the target: the other creatures are untouched', () => {
    const g = start();
    g.act(0).cast(SURGE, { targets: [WATCHER], pay: true });
    g.passAll();
    g.expect.derived({ name: BEARS, seat: 0 }, { subtypes: ['Bear'], keywords: [] });
    g.expect.derived({ name: BEARS, seat: 1 }, { subtypes: ['Bear'], keywords: [] });
  });

  test('a keyword it has already is not given twice, and the others come as they are', () => {
    const g = scenario()
      .seat(0)
      .library('Island', { count: 4 })
      .hand(SURGE)
      .battlefield('Plains', BEAR)
      .build();
    g.act(0).cast(SURGE, { targets: [BEAR], pay: true });
    g.passAll();
    g.expect.derived(BEAR, { subtypes: ['Bear', 'Avatar'], keywords: FOUR });
  });

  test('it all ends at the cleanup step (CR 514.2)', () => {
    const g = start();
    g.act(0).cast(SURGE, { targets: [{ name: BEARS, seat: 0 }], pay: true });
    g.passAll();
    const cleaned = expireEndOfTurnEffects(g.state).state;
    const bears = cleaned.objects[g.id({ name: BEARS, seat: 0 })];
    expect(bears).toBeDefined();
    if (bears === undefined) return;
    const d = derive(cleaned, bears);
    expect(d.subtypes).toEqual(['Bear']);
    expect(d.abilities.filter((a) => a.kind === 'keyword')).toEqual([]);
  });

  test('the keywords work: the creature has hexproof, so the opponent cannot target it with a spell (CR 702.11b)', () => {
    const g = scenario()
      .seat(0)
      .library('Island', { count: 4 })
      .hand(SURGE)
      .battlefield('Plains', WATCHER)
      .seat(1)
      .library('Island', { count: 4 })
      .hand(BOLT)
      .battlefield('Mountain')
      .build();
    g.act(0).cast(SURGE, { targets: [WATCHER], pay: true });
    g.passAll();
    g.act(0).pass();
    g.act(1).cast(BOLT);
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error(`expected targets, got ${d?.kind}`);
    const legal = d.specs[0]?.legal ?? [];
    expect(legal.some((t) => t.kind === 'object' && t.id === g.id(WATCHER))).toBe(false);
  });
});

describe('the target is chosen once and only a creature you control can be it (CR 115.1, 601.2c)', () => {
  test("the opponent's creature is not offered, and neither is your Plains", () => {
    const g = scenario()
      .seat(0)
      .library('Island', { count: 4 })
      .hand(SURGE)
      .battlefield('Plains', BEARS)
      .seat(1)
      .library('Island', { count: 4 })
      .battlefield(BEARS)
      .build();
    g.act(0).cast(SURGE);
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error(`expected targets, got ${d?.kind}`);
    const legal = d.specs[0]?.legal ?? [];
    expect(legal.flatMap((t) => (t.kind === 'object' ? [t.id] : []))).toEqual([
      g.id({ name: BEARS, seat: 0 }),
    ]);
  });

  test('a target that left the battlefield: the spell does not resolve, and nothing else gets the keywords (CR 608.2b)', () => {
    const g = scenario()
      .seat(0)
      .library('Island', { count: 4 })
      .hand(SURGE, BOLT)
      .battlefield('Plains', 'Mountain', BEARS, WATCHER)
      .build();
    g.act(0).cast(SURGE, { targets: [WATCHER], pay: true });
    g.act(0).cast(BOLT, { targets: [WATCHER], pay: true });
    g.passAll();
    g.passAll();
    g.expect.zone(WATCHER, 'graveyard', { seat: 0 });
    g.expect.derived(BEARS, { subtypes: ['Bear'], keywords: [] });
    g.expect.invariants();
  });
});
