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
