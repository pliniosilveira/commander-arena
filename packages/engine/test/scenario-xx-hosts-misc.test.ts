// The Hosts of Mordor deck (issue 150), small primitives. Cards are SYNTHETIC (src/cards/fixtures/synthetic-hosts-misc.ts).
// Relic of Sauron: "Add two mana in any combination of {U}, {B}, and/or {R}." (CR 106.1b, 605.3b, 106.4, 601.2g).
import { describe, expect, test } from 'vitest';
import { SUPPORTED_FEATURES, syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

type Game = ReturnType<ReturnType<typeof scenario>['build']>;

const game = (build: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario>): Game =>
  build(
    scenario()
      .seat(0)
      .library(...LIBRARY),
  )
    .seat(1)
    .library(...LIBRARY)
    .at('precombatMain')
    .build();

/** The zone the object with this label (or name) is in now. */
const zoneOf = (g: Game, ref: string): string | undefined => g.state.objects[g.id(ref)]?.zone;

describe('"Add two mana in any combination of {U}, {B}, and/or {R}" (CR 106.1b, 605.3b)', () => {
  const RELIC = 'SYNTHETIC Tricolor Relic';
  const offered = (g: Game): string[] =>
    g
      .legalActions(0)
      .flatMap((a) =>
        a.kind === 'activateAbility' && a.source === g.id(RELIC) && a.combination
          ? [a.combination.join('')]
          : [],
      );

  test('the card is valid and the feature is listed', () => {
    expect(validateCard(syntheticCard(RELIC))).toEqual([]);
    expect(SUPPORTED_FEATURES.abilityFeatures).toContain('manaColorSubset');
  });

  test('the six combinations of two of U, B, R are on offer; white, green, colorless are not', () => {
    const g = game((b) => b.battlefield(RELIC));
    expect(offered(g).sort()).toEqual(['UU', 'UB', 'UR', 'BB', 'BR', 'RR'].sort());
  });

  test('the chosen combination goes to the pool; a color twice is allowed', () => {
    const g = game((b) => b.battlefield(RELIC));
    g.act(0).tapForMana(RELIC, { combination: 'RR' });
    g.expect.pool(0, 'RR');
    g.expect.tapped(RELIC);
    g.expect.stack([]);
  });

  test.each([['WU'], ['GR'], ['UC'], ['CC'], ['U'], ['UBR']])(
    'the combination %s is refused: nothing is tapped',
    (combination) => {
      const g = game((b) => b.battlefield(RELIC));
      const r = g.act(0).try.tapForMana(RELIC, { combination });
      expect(r.ok, combination).toBe(false);
      g.expect.tapped(RELIC, false);
      g.expect.pool(0, '');
    },
  );

  test('validation: two to four different colors of the five', () => {
    const withColors = (colors: unknown) => ({
      ...syntheticCard(RELIC),
      faces: [
        {
          ...syntheticCard(RELIC).faces[0],
          abilities: [
            {
              kind: 'mana',
              cost: [{ kind: 'tap' }],
              production: { kind: 'anyCombination', count: 2, colors },
            },
          ],
        },
      ],
    });
    expect(validateCard(withColors(['U', 'B']) as never)).toEqual([]);
    for (const bad of [['U'], ['U', 'U'], ['U', 'X'], [], 'UB']) {
      expect(validateCard(withColors(bad) as never).length, JSON.stringify(bad)).toBeGreaterThan(0);
    }
  });
});

describe('"you may pay {5}. If you do, tap all creatures your opponents control, then put a stun counter on each of those creatures" (CR 701.26a, 122.1d, 608.2c)', () => {
  const LEVIATHAN = 'SYNTHETIC Frost Leviathan';
  const BEARS = 'Grizzly Bears';
  const board = () =>
    scenario({ seats: 3 })
      .seat(0)
      .library(...LIBRARY)
      .hand(LEVIATHAN)
      .battlefield('Island', 'Island', 'Island', 'Island', 'Island', 'Island')
      .battlefield('Island', 'Island', 'Island', 'Island', 'Island', 'Island')
      .battlefield(BEARS, { label: 'mine' })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'theirs1' })
      .battlefield(BEARS, { label: 'theirs1b', tapped: true })
      .seat(2)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'theirs2' })
      .at('precombatMain', { active: 0 })
      .build();

  const stun = (g: Game, label: string): number =>
    g.state.objects[g.id(label)]?.counters?.stun ?? 0;
  const tapped = (g: Game, label: string): boolean | undefined =>
    g.state.objects[g.id(label)]?.tapped;

  test('the card is valid', () => {
    expect(validateCard(syntheticCard(LEVIATHAN))).toEqual([]);
  });

  test('paid: every creature of every opponent is tapped and gets one stun counter, yours is untouched', () => {
    const g = board();
    g.act(0).cast(LEVIATHAN, { pay: true });
    g.passAll();
    g.act(0).accept();
    g.act(0).payAuto();
    g.passAll();
    for (const l of ['theirs1', 'theirs1b', 'theirs2']) {
      expect(tapped(g, l), l).toBe(true);
      expect(stun(g, l), l).toBe(1);
    }
    expect(tapped(g, 'mine')).toBe(false);
    expect(stun(g, 'mine')).toBe(0);
  });

  test('not paid: nothing is tapped and no counter is placed', () => {
    const g = board();
    g.act(0).cast(LEVIATHAN, { pay: true });
    g.passAll();
    g.act(0).decline();
    g.passAll();
    for (const l of ['theirs1', 'theirs2']) {
      expect(tapped(g, l), l).toBe(false);
      expect(stun(g, l), l).toBe(0);
    }
  });
});

describe('"When you cycle this card, destroy up to X target artifacts" (CR 702.29a, 107.3, 603.3d)', () => {
  const MAMMOTH = 'SYNTHETIC Artifact Mammoth';
  const RING = 'Sol Ring';
  const board = () =>
    scenario({ seats: 3 })
      .seat(0)
      .library(...LIBRARY)
      .hand(MAMMOTH)
      .battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain', 'Mountain', 'Mountain')
      .battlefield(RING, { label: 'mine' })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(RING, { label: 'theirs1' })
      .seat(2)
      .library(...LIBRARY)
      .battlefield(RING, { label: 'theirs2' })
      .at('precombatMain', { active: 0 })
      .build();

  test('the card and the trigger are valid', () => {
    expect(validateCard(syntheticCard(MAMMOTH))).toEqual([]);
  });

  test('X = 2: up to two artifacts of any players are destroyed, the third survives', () => {
    const g = board();
    g.act(0).activate(MAMMOTH, { x: 2, pay: true });
    g.act(0).chooseTargets('theirs1', 'theirs2');
    g.expect.zone(MAMMOTH, 'graveyard', { seat: 0 });
    g.passAll();
    expect(zoneOf(g, 'theirs1')).toBe('graveyard');
    expect(zoneOf(g, 'theirs2')).toBe('graveyard');
    expect(zoneOf(g, 'mine')).toBe('battlefield');
  });

  test('up to: fewer targets than X is allowed', () => {
    const g = board();
    g.act(0).activate(MAMMOTH, { x: 2, pay: true });
    g.act(0).chooseTargets('theirs2');
    g.passAll();
    expect(zoneOf(g, 'theirs2')).toBe('graveyard');
    expect(zoneOf(g, 'theirs1')).toBe('battlefield');
    expect(zoneOf(g, 'mine')).toBe('battlefield');
  });

  test('more targets than X is refused', () => {
    const g = board();
    g.act(0).activate(MAMMOTH, { x: 1, pay: true });
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error('expected a targets decision');
    expect(d.specs.map((s) => [s.min, s.max])).toEqual([[0, 1]]);
    expect(() => g.act(0).chooseTargets('theirs1', 'theirs2')).toThrow(/room for 1/);
  });

  test('X = 0: the card is cycled and the trigger has no target, so nothing is destroyed (ruling 2023-06-16)', () => {
    const g = board();
    g.act(0).activate(MAMMOTH, { x: 0, pay: true });
    g.expect.zone(MAMMOTH, 'graveyard', { seat: 0 });
    g.passAll();
    for (const l of ['mine', 'theirs1', 'theirs2']) expect(zoneOf(g, l)).toBe('battlefield');
  });
});
