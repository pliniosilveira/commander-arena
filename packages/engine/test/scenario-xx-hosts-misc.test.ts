// The Hosts of Mordor deck (issue 150), small primitives. Cards are SYNTHETIC (src/cards/fixtures/synthetic-hosts-misc.ts).
// Relic of Sauron: "Add two mana in any combination of {U}, {B}, and/or {R}." (CR 106.1b, 605.3b, 106.4, 601.2g).
import { describe, expect, test } from 'vitest';
import { getView, SUPPORTED_FEATURES, syntheticCard, validateCard } from '../src/index';
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

describe('"it deals 3 damage divided as you choose among one, two, or three targets" (CR 601.2d, 603.3d, 115.4)', () => {
  const COLOSSUS = 'SYNTHETIC Ember Colossus';
  const BEARS = 'Grizzly Bears';
  const board = () =>
    scenario({ seats: 3 })
      .seat(0)
      .library(...LIBRARY)
      .hand(COLOSSUS)
      .battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain', 'Mountain', 'Mountain')
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'bears1' })
      .seat(2)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'bears2' })
      .at('precombatMain', { active: 0 })
      .build();

  /** The targets decision of the trigger: the slot, with the total to divide. */
  const slot = (g: Game) => {
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error(`expected a targets decision, got ${d?.kind}`);
    return d.specs[0];
  };

  const divide = (
    g: Game,
    shares: readonly { to: { player: 1 | 2 } | string; share: number }[],
  ) => {
    const targets = shares.map(({ to, share }) =>
      typeof to === 'string'
        ? { kind: 'object' as const, id: g.id(to), specId: 't1', share }
        : { kind: 'player' as const, seat: to.player, specId: 't1', share },
    );
    return g.act(0).try.action({ kind: 'chooseTargets', targets } as never);
  };

  test('the card is valid', () => {
    expect(validateCard(syntheticCard(COLOSSUS))).toEqual([]);
  });

  test('the slot takes one to three targets of any kind and divides 3', () => {
    const g = board();
    g.act(0).cast(COLOSSUS, { pay: true });
    g.passAll();
    expect(slot(g)).toMatchObject({ min: 1, max: 3, divide: 3 });
  });

  test('3 damage to one opponent', () => {
    const g = board();
    g.act(0).cast(COLOSSUS, { pay: true });
    g.passAll();
    expect(divide(g, [{ to: { player: 2 }, share: 3 }]).ok).toBe(true);
    g.passAll();
    g.expect.life(2, 37);
    g.expect.life(1, 40);
  });

  test('1 damage to each of three targets: two different opponents and a creature', () => {
    const g = board();
    g.act(0).cast(COLOSSUS, { pay: true });
    g.passAll();
    expect(
      divide(g, [
        { to: { player: 1 }, share: 1 },
        { to: { player: 2 }, share: 1 },
        { to: 'bears1', share: 1 },
      ]).ok,
    ).toBe(true);
    g.passAll();
    g.expect.life(1, 39);
    g.expect.life(2, 39);
    expect(g.state.objects[g.id('bears1')]?.damage).toBe(1);
  });

  test('2 and 1: a creature takes 2 (it dies) and a player 1', () => {
    const g = board();
    g.act(0).cast(COLOSSUS, { pay: true });
    g.passAll();
    expect(
      divide(g, [
        { to: 'bears2', share: 2 },
        { to: { player: 1 }, share: 1 },
      ]).ok,
    ).toBe(true);
    g.passAll();
    expect(g.state.objects[g.id('bears2')]?.zone).toBe('graveyard');
    g.expect.life(1, 39);
  });

  test.each([
    ['a share of 0', [2, 0, 1]],
    ['shares that add up to 2', [1, 1]],
    ['shares that add up to 4', [2, 2]],
  ])('%s is refused: each target needs at least 1 and all 3 are divided', (_name, shares) => {
    const g = board();
    g.act(0).cast(COLOSSUS, { pay: true });
    g.passAll();
    const to = [{ player: 1 as const }, { player: 2 as const }, 'bears1'];
    const r = divide(
      g,
      shares.map((share, i) => ({ to: to[i] as never, share })),
    );
    expect(r.ok).toBe(false);
  });

  test('four targets are refused', () => {
    const g = board();
    g.act(0).cast(COLOSSUS, { pay: true });
    g.passAll();
    const r = divide(g, [
      { to: { player: 1 }, share: 1 },
      { to: { player: 2 }, share: 1 },
      { to: 'bears1', share: 1 },
      { to: 'bears2', share: 1 },
    ]);
    expect(r.ok).toBe(false);
  });
});

describe('"discard your hand and draw cards equal to the damage dealt to target opponent this turn" (CR 120.3, 608.2d)', () => {
  const DRAKE = 'SYNTHETIC Hoard Drake';
  const BOLT = 'Lightning Bolt';
  const board = () =>
    scenario({ seats: 3 })
      .seat(0)
      .library(...LIBRARY)
      .hand(DRAKE, BOLT, BOLT, 'Grizzly Bears', 'Giant Spider')
      .battlefield(...Array.from({ length: 10 }, () => 'Mountain'))
      .seat(1)
      .library(...LIBRARY)
      .seat(2)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();

  const bolt = (g: Game, seat: 1 | 2) => {
    g.act(0).cast(`${BOLT}[0]`, { targets: [{ player: seat }], pay: true });
    g.passAll();
  };

  const castDrake = (g: Game) => {
    g.act(0).cast(DRAKE, { pay: true });
    g.passAll();
    g.act(0).chooseTargets({ player: 1 });
  };

  test('the card is valid', () => {
    expect(validateCard(syntheticCard(DRAKE))).toEqual([]);
  });

  const handSize = (g: Game): number => g.state.seats[0]?.hand.length ?? -1;

  test('accepted: the hand is discarded, then as many cards are drawn as the damage the target took, not what other opponents took', () => {
    const g = board();
    bolt(g, 1);
    bolt(g, 2);
    castDrake(g);
    g.passAll();
    g.act(0).accept();
    // Bears and Spider are discarded; 3 damage to seat 1 draws 3 (the 3 damage to seat 2 is not counted).
    expect(handSize(g)).toBe(3);
    expect(g.find({ name: 'Grizzly Bears', zone: 'graveyard' })).toHaveLength(1);
    expect(g.find({ name: 'Giant Spider', zone: 'graveyard' })).toHaveLength(1);
  });

  test('the damage of every source counts: two bolts draw six', () => {
    const g = board();
    bolt(g, 1);
    bolt(g, 1);
    castDrake(g);
    g.passAll();
    g.act(0).accept();
    expect(handSize(g)).toBe(6);
  });

  test('declined: nothing is discarded and nothing is drawn', () => {
    const g = board();
    bolt(g, 1);
    castDrake(g);
    g.passAll();
    g.act(0).decline();
    expect(handSize(g)).toBe(3); // the second Bolt, Bears and Spider
  });

  test('no damage dealt to the target: the hand is discarded and nothing is drawn', () => {
    const g = board();
    bolt(g, 2);
    castDrake(g);
    g.passAll();
    g.act(0).accept();
    expect(handSize(g)).toBe(0);
  });
});

describe('"costs {3} less to cast if it targets a creature that was dealt damage this turn" (CR 120.3, 601.2c, 601.2f)', () => {
  const RECKONING = 'SYNTHETIC Bitter Reckoning';
  const BOLT = 'Lightning Bolt';
  const SPIDER = 'Giant Spider'; // 2/4: survives a Lightning Bolt
  const board = () =>
    scenario({ seats: 3 })
      .seat(0)
      .library(...LIBRARY)
      .hand(RECKONING, BOLT)
      .battlefield('Swamp', 'Swamp', 'Mountain')
      .seat(1)
      .library(...LIBRARY)
      .battlefield(SPIDER, { label: 'hurt' })
      .battlefield(SPIDER, { label: 'fresh' })
      .seat(2)
      .library(...LIBRARY)
      .battlefield(SPIDER, { label: 'theirs2' })
      .at('precombatMain', { active: 0 })
      .build();

  const costOfTargeting = (g: Game, target: string) => {
    g.act(0).cast(RECKONING, { targets: [target] });
    return g.state.casting?.totalCost;
  };

  test('the card is valid and the filter is a listed feature', () => {
    expect(validateCard(syntheticCard(RECKONING))).toEqual([]);
    expect(SUPPORTED_FEATURES.selectorKinds).toContain('dealtDamageThisTurn');
  });

  test('a creature dealt damage this turn: the generic {3} is gone, only {B} is paid', () => {
    const g = board();
    g.act(0).cast(BOLT, { targets: ['hurt'], pay: true });
    g.passAll();
    expect(costOfTargeting(g, 'hurt')).toEqual(['B']);
  });

  test('a creature of another opponent that took damage counts too (three seats)', () => {
    const g = board();
    g.act(0).cast(BOLT, { targets: ['theirs2'], pay: true });
    g.passAll();
    expect(costOfTargeting(g, 'theirs2')).toEqual(['B']);
  });

  test('a creature that was not dealt damage: the full {3}{B}', () => {
    const g = board();
    g.act(0).cast(BOLT, { targets: ['hurt'], pay: true });
    g.passAll();
    expect(costOfTargeting(g, 'fresh')).toEqual(['3', 'B']);
  });

  test('with no damage dealt at all: the full cost', () => {
    const g = board();
    expect(costOfTargeting(g, 'hurt')).toEqual(['3', 'B']);
  });

  test('the spell destroys the creature and its controller loses 2 life', () => {
    const g = board();
    g.act(0).cast(BOLT, { targets: ['hurt'], pay: true });
    g.passAll();
    g.act(0).cast(RECKONING, { targets: ['hurt'], pay: true });
    g.passAll();
    expect(g.state.objects[g.id('hurt')]?.zone).toBe('graveyard');
    g.expect.life(1, 38);
  });

  test('the damage is not remembered into the next turn', () => {
    const g = board();
    g.act(0).cast(BOLT, { targets: ['hurt'], pay: true });
    g.passAll();
    expect(g.state.turnLog.damagedObjects).toContain(g.id('hurt'));
    g.advanceTo('precombatMain', { turn: 'next' });
    expect(g.state.turnLog.damagedObjects ?? []).toEqual([]);
  });
});

describe('"costs {X} less to cast, where X is the greatest number of artifacts an opponent controls" and "a Treasure for each artifact that player controls" (CR 109.4, 601.2f, 603.2c)', () => {
  const WYRM = 'SYNTHETIC Hoard Wyrm';
  const RING = 'Sol Ring';
  const rings = (n: number) => Array.from({ length: n }, () => RING);
  const board = (a: number, b: number, mine = 0) =>
    scenario({ seats: 3 })
      .seat(0)
      .library(...LIBRARY)
      .hand(WYRM)
      .battlefield(...Array.from({ length: 9 }, () => 'Mountain'))
      .battlefield(...rings(mine))
      .seat(1)
      .library(...LIBRARY)
      .battlefield(...rings(a))
      .seat(2)
      .library(...LIBRARY)
      .battlefield(...rings(b))
      .at('precombatMain', { active: 0 })
      .build();

  const castCost = (g: Game) =>
    getView(g.state, 0).seats[0]?.hand?.find((o) => o.name === WYRM)?.castCost;

  test('the card is valid and the amount is a listed feature', () => {
    expect(validateCard(syntheticCard(WYRM))).toEqual([]);
    expect(SUPPORTED_FEATURES.amountKinds).toContain('greatestCountOfAnOpponent');
  });

  test('the opponent with the most counts, not the sum: 2 and 3 artifacts reduce by 3', () => {
    expect(castCost(board(2, 3))).toEqual(['4', 'R', 'R']);
    expect(castCost(board(3, 2))).toEqual(['4', 'R', 'R']);
  });

  test('my own artifacts do not count', () => {
    expect(castCost(board(0, 1, 5))).toEqual(['6', 'R', 'R']);
  });

  test('no opponent artifacts: the full cost', () => {
    expect(castCost(board(0, 0))).toEqual(['7', 'R', 'R']);
  });

  test('seven or more: only the generic mana goes, {R}{R} is left (ruling 2023-06-16)', () => {
    expect(castCost(board(8, 1))).toEqual(['R', 'R']);
    expect(castCost(board(7, 0))).toEqual(['R', 'R']);
  });

  test('it can be cast with the reduced cost', () => {
    const g = board(2, 3);
    g.act(0).cast(WYRM, { pay: true });
    g.passAll();
    g.expect.zone(WYRM, 'battlefield');
  });

  test('combat damage to a player: a Treasure for each artifact that player controls, not the other opponent', () => {
    const g = scenario({ seats: 3 })
      .seat(0)
      .library(...LIBRARY)
      .battlefield(WYRM, { label: 'wyrm' })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(...rings(2))
      .seat(2)
      .library(...LIBRARY)
      .battlefield(...rings(3))
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: 'wyrm', target: { player: 2 } }]);
    g.advanceTo('endOfCombat');
    g.passAll();
    const treasures = g.find({ name: 'Treasure', zone: 'battlefield' });
    expect(treasures).toHaveLength(3);
    for (const t of treasures) expect(t.controller).toBe(0);
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

  test('while X is still to be chosen, the other seats cannot see which card is being cycled (CR 602.2b)', () => {
    const g = board();
    g.act(0).activate(MAMMOTH);
    expect(g.state.pending?.kind).toBe('chooseX');
    const other = JSON.stringify(getView(g.state, 1));
    expect(other).not.toContain(MAMMOTH);
    expect(JSON.stringify(getView(g.state, 0))).toContain(MAMMOTH);
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
