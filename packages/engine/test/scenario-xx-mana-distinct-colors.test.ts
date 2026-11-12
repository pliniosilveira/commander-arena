// "{T}: Add two mana of different colors." (D-982): the mana production `anyCombination` with `distinct: true`: two mana, each of a color of the five
// chosen on its own, never the same color twice and never colorless (a combination is named as the ability is activated, as for any combination).
// Pins: CR 105.1 and 106.1b (colorless is not a color, so "different colors" are two of the five), CR 605.3b (the choice is made as the mana ability is
// activated, with no stack), CR 106.4 (mana in the pool has no order), CR 601.2g (the payment planner must know what a source can make), CR 601.2h.
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-niv-primitives.ts, synthetic-dragons-mana.ts).
import { describe, expect, test } from 'vitest';
import type { PayManaDecision } from '../src/index';
import { SUPPORTED_FEATURES, syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const VESSEL = 'SYNTHETIC Prism Vessel'; // {T}: Add two mana of different colors.
const ORB = 'SYNTHETIC Dragon Orb'; // {1}, {T}: two mana in any combination of colors (the control: the same color twice is allowed)
const SIP = 'SYNTHETIC Azorius Sip'; // {W}{U}
const PAIR = 'SYNTHETIC Green Pair'; // {G}{G}
const SPLASH = 'SYNTHETIC Green Splash'; // {1}{G}
const LIBRARY = Array.from({ length: 8 }, () => 'Plains');

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

const offered = (g: Game, name: string): string[] =>
  g
    .legalActions(0)
    .flatMap((a) =>
      a.kind === 'activateAbility' && a.source === g.id(name) && a.combination
        ? [a.combination.join('')]
        : [],
    );

describe('the card is valid and the feature is listed', () => {
  test(VESSEL, () => {
    expect(validateCard(syntheticCard(VESSEL))).toEqual([]);
  });
  test('ability:manaDistinctColors', () => {
    expect(SUPPORTED_FEATURES.abilityFeatures).toContain('manaDistinctColors');
  });
});

describe('"Add two mana of different colors" (CR 106.1b, 605.3b)', () => {
  test('the ten pairs of different colors are on offer; colorless and a color twice are not', () => {
    const g = game((b) => b.battlefield(VESSEL));
    expect(offered(g, VESSEL).sort()).toEqual(
      ['WU', 'WB', 'WR', 'WG', 'UB', 'UR', 'UG', 'BR', 'BG', 'RG'].sort(),
    );
    for (const pair of offered(g, VESSEL)) {
      expect(pair).not.toContain('C');
      expect(pair[0]).not.toBe(pair[1]);
    }
  });

  test('the control: without "different" the Orb also offers the same color twice and has 15 pairs', () => {
    const g = game((b) => b.battlefield(ORB, 'Mountain'));
    g.act(0).tapForMana('Mountain');
    const pairs = offered(g, ORB);
    expect(pairs).toHaveLength(15);
    expect(pairs).toContain('RR');
  });

  test('the chosen pair goes to the pool, no stack, the artifact is tapped', () => {
    const g = game((b) => b.battlefield(VESSEL));
    const before = g.mark();
    g.act(0).tapForMana(VESSEL, { combination: 'UR' });
    g.expect.pool(0, 'UR');
    g.expect.tapped(VESSEL);
    g.expect.stack([]);
    g.expect.noEvent({ kind: 'priorityPassed' }, { since: before });
  });

  test('the order inside the pair does not matter', () => {
    const g = game((b) => b.battlefield(VESSEL));
    g.act(0).tapForMana(VESSEL, { combination: 'RU' });
    g.expect.pool(0, 'UR');
  });

  test.each([['WW'], ['GG'], ['CC'], ['WC'], ['C'], ['W'], ['WUB']])(
    'the combination %s is refused: nothing is tapped',
    (combination) => {
      const g = game((b) => b.battlefield(VESSEL));
      const r = g.act(0).try.tapForMana(VESSEL, { combination });
      expect(r.ok, combination).toBe(false);
      g.expect.tapped(VESSEL, false);
      g.expect.pool(0, '');
    },
  );

  test('no combination at all is refused: one of ten must be named (nothing is on offer without one)', () => {
    const g = game((b) => b.battlefield(VESSEL));
    const activations = g
      .legalActions(0)
      .filter((a) => a.kind === 'activateAbility' && a.source === g.id(VESSEL));
    expect(activations).toHaveLength(10);
    expect(activations.every((a) => a.kind === 'activateAbility' && a.combination)).toBe(true);
    const bare = g.legalActions(0).find((a) => a.kind === 'activateAbility');
    if (bare?.kind !== 'activateAbility') throw new Error('expected an activation');
    const { combination: _named, ...withoutPair } = bare;
    expect(g.act(0).try.action(withoutPair).ok).toBe(false);
    g.expect.tapped(VESSEL, false);
  });
});

describe('paying with it (the payment planner, CR 601.2g)', () => {
  test('{W}{U} is paid by the Vessel alone, which makes {W}{U}', () => {
    const g = game((b) => b.hand(SIP).battlefield(VESSEL));
    g.expect.legal(0, { cast: SIP });
    g.act(0).cast(SIP, { pay: true });
    g.expect.tapped(VESSEL);
    g.passAll();
    g.expect.life(0, 41);
  });

  test('{G}{G} cannot be paid by the Vessel alone: two different colors are never {G}{G}', () => {
    const g = game((b) => b.hand(PAIR).battlefield(VESSEL));
    g.expect.illegal(0, { cast: PAIR });
  });

  test('{G}{G} with a Forest and the Vessel: the Vessel pays one {G} and its other mana is spare', () => {
    const g = game((b) => b.hand(PAIR).battlefield(VESSEL, 'Forest'));
    g.act(0).cast(PAIR, { pay: true });
    g.expect.tapped(VESSEL);
    g.expect.tapped('Forest');
    g.passAll();
    g.expect.life(0, 41);
  });

  test('{1}{G} is paid by the Vessel alone: G and any other color', () => {
    const g = game((b) => b.hand(SPLASH).battlefield(VESSEL));
    g.act(0).cast(SPLASH, { pay: true });
    g.expect.tapped(VESSEL);
  });

  test('two Vessels make {G}{G} together (one G from each)', () => {
    const g = game((b) => b.hand(PAIR).battlefield(VESSEL, VESSEL));
    g.act(0).cast(PAIR, { pay: true });
    g.passAll();
    g.expect.life(0, 41);
  });

  test('manaSources of the payment names the ten pairs, and no colors', () => {
    const g = game((b) => b.hand(SIP).battlefield(VESSEL));
    g.act(0).cast(SIP);
    const d = g.state.pending;
    if (d?.kind !== 'payMana') throw new Error('expected a payMana decision');
    const entry = (d as PayManaDecision).manaSources.find((s) => s.object === g.id(VESSEL));
    expect(entry?.combinations).toHaveLength(10);
    expect(entry?.combinations?.every((c) => c.length === 2 && c[0] !== c[1])).toBe(true);
    expect(entry?.combinations?.flat()).not.toContain('C');
    expect(entry?.colors).toBeUndefined();
  });

  test('a manual payment that names a pair the source cannot make is refused, nothing is tapped', () => {
    const g = game((b) => b.hand(SIP).battlefield(VESSEL));
    g.act(0).cast(SIP);
    const r = g.act(0).try.tapForMana(VESSEL, { combination: 'WW' });
    expect(r.ok).toBe(false);
    g.expect.tapped(VESSEL, false);
  });
});

describe('legal actions agree with applyAction', () => {
  test('every pair on offer is accepted by the engine; the pairs not on offer are not', () => {
    for (const combination of ['WU', 'WB', 'WR', 'WG', 'UB', 'UR', 'UG', 'BR', 'BG', 'RG']) {
      const g = game((b) => b.battlefield(VESSEL));
      expect(g.act(0).try.tapForMana(VESSEL, { combination }).ok, combination).toBe(true);
      g.expect.pool(0, combination);
    }
  });
});

describe('validation', () => {
  const withProduction = (production: unknown) => ({
    ...syntheticCard(VESSEL),
    faces: [
      {
        ...syntheticCard(VESSEL).faces[0],
        abilities: [{ kind: 'mana', cost: [{ kind: 'tap' }], production }],
      },
    ],
  });

  test('distinct is true or absent; the count is still 2 to 4', () => {
    expect(
      validateCard(withProduction({ kind: 'anyCombination', count: 2, distinct: false }) as never)
        .length,
    ).toBeGreaterThan(0);
    expect(
      validateCard(withProduction({ kind: 'anyCombination', count: 5, distinct: true }) as never)
        .length,
    ).toBeGreaterThan(0);
    expect(
      validateCard(withProduction({ kind: 'anyCombination', count: 3, distinct: true }) as never),
    ).toEqual([]);
  });
});
