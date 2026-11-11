// "Enchanted creature loses all abilities and is a green Elk creature with base power and toughness 3/3." (D-145): the statics
// `loseAllAbilities` (layer 6), `setTypes` without `additive` (layer 4), `setColors` (layer 5) and `setPt` (layer 7b) of an Aura or an
// Equipment.
// Pins: CR 613.1d (layer 4: types), CR 205.1a and 205.3d (a new card type replaces the old ones, a creature type replaces the creature
// types), CR 613.1e and 105.3 (layer 5: colors replaced), CR 613.1f (layer 6: abilities), CR 613.7 (timestamp order: an ability granted
// later still applies), CR 613.4b and 613.4c (base power and toughness, then counters and +N/+N on top), CR 604.1 (a static ability of a
// permanent that lost its abilities gives nothing), CR 301.5 and 303.4 (what is attached).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-polymorph.ts, synthetic-attachments.ts, synthetic-commanders.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { derive } from '../src/rules/derive';
import type { ScenarioGame } from '../src/testing/index';
import { scenario } from '../src/testing/index';

const AURA = 'SYNTHETIC Elk Aura';
const BLADE = 'SYNTHETIC Elk Blade';
const WIZARD = 'SYNTHETIC Blue Wizard Aura';
const CLOCKWORK = 'SYNTHETIC Clockwork Bear';
const WINGS = 'SYNTHETIC Wings Aura';
const GROWTH = 'SYNTHETIC Growth Lord';
const ANGEL = 'Serra Angel'; // white Angel 4/4 with flying and vigilance
const ELVES = 'Llanowar Elves';
const BEARS = 'Grizzly Bears';

const hasMana = (g: ScenarioGame, label: string): boolean =>
  derive(g.state, g.object(label)).abilities.some((a) => a.kind === 'mana');

describe('the cards are valid', () => {
  test.each([AURA, BLADE, WIZARD, CLOCKWORK])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

describe('a creature that is enchanted', () => {
  const game = () =>
    scenario()
      .seat(0)
      .battlefield(ANGEL, { label: 'angel' })
      .battlefield(AURA, { attachedTo: 'angel' })
      .build();

  test('is a green Elk creature 3/3 with no abilities', () => {
    const g = game();
    g.expect.derived('angel', {
      types: ['creature'],
      subtypes: ['Elk'],
      colors: ['G'],
      keywords: [],
    });
    g.expect.pt('angel', 3, 3);
  });

  test('an unenchanted creature next to it keeps everything', () => {
    const g = scenario()
      .seat(0)
      .battlefield(ANGEL, { label: 'angel' })
      .battlefield(ANGEL, { label: 'other' })
      .battlefield(AURA, { attachedTo: 'angel' })
      .build();
    g.expect.derived('other', {
      types: ['creature'],
      subtypes: ['Angel'],
      colors: ['W'],
      keywords: ['flying', 'vigilance'],
    });
    g.expect.pt('other', 4, 4);
  });

  test('counters still apply on top of the base 3/3 (CR 613.4c)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(ANGEL, { label: 'angel', counters: { '+1/+1': 2 } })
      .battlefield(AURA, { attachedTo: 'angel' })
      .build();
    g.expect.pt('angel', 5, 5);
  });

  test('a card type is replaced too: an artifact creature is only a creature (CR 205.1a)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(CLOCKWORK, { label: 'bear' })
      .battlefield(AURA, { attachedTo: 'bear' })
      .build();
    g.expect.derived('bear', {
      types: ['creature'],
      subtypes: ['Elk'],
      colors: ['G'],
      keywords: [],
    });
  });

  test('an ability granted later still applies; one granted earlier is lost (CR 613.7)', () => {
    const later = scenario()
      .seat(0)
      .battlefield(BEARS, { label: 'bears' })
      .battlefield(AURA, { attachedTo: 'bears' })
      .battlefield(WINGS, { attachedTo: 'bears' })
      .build();
    later.expect.derived('bears', { keywords: ['flying'] });
    const earlier = scenario()
      .seat(0)
      .battlefield(BEARS, { label: 'bears' })
      .battlefield(WINGS, { attachedTo: 'bears' })
      .battlefield(AURA, { attachedTo: 'bears' })
      .build();
    earlier.expect.derived('bears', { keywords: [] });
  });

  test('its mana ability is lost', () => {
    const g = scenario()
      .seat(0)
      .battlefield(ELVES, { label: 'elf' })
      .battlefield(AURA, { attachedTo: 'elf' })
      .build();
    expect(hasMana(g, 'elf')).toBe(false);
    const plain = scenario().seat(0).battlefield(ELVES, { label: 'elf' }).build();
    expect(hasMana(plain, 'elf')).toBe(true);
  });

  test('a static ability of the creature stops working: it gives nothing (CR 604.1)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(GROWTH, { label: 'lord' })
      .battlefield(BEARS, { label: 'grown', counters: { '+1/+1': 1 } })
      .build();
    g.expect.derived('grown', { keywords: ['flying'] });
    const quiet = scenario()
      .seat(0)
      .battlefield(GROWTH, { label: 'lord' })
      .battlefield(AURA, { attachedTo: 'lord' })
      .battlefield(BEARS, { label: 'grown', counters: { '+1/+1': 1 } })
      .build();
    quiet.expect.derived('grown', { keywords: [] });
  });
});

describe('the same statics on an Equipment that moves (CR 301.5)', () => {
  test('equipping the other creature restores the first and changes the second', () => {
    const g = scenario()
      .seat(0)
      .battlefield(BLADE, 'Forest', 'Forest')
      .battlefield(ANGEL, { label: 'angel' })
      .battlefield(BEARS, { label: 'bears' })
      .build();
    g.act(0).activate(BLADE, { targets: ['angel'], pay: true });
    g.passAll();
    g.expect.derived('angel', { subtypes: ['Elk'], colors: ['G'], keywords: [] });
    g.act(0).activate(BLADE, { targets: ['bears'], pay: true });
    g.passAll();
    g.expect.derived('angel', {
      subtypes: ['Angel'],
      colors: ['W'],
      keywords: ['flying', 'vigilance'],
    });
    g.expect.pt('angel', 4, 4);
    g.expect.derived('bears', { subtypes: ['Elk'], colors: ['G'] });
  });
});

describe('colors and types in addition (layer 5 and layer 4 apart)', () => {
  test('"is blue and is a Wizard in addition to its other types": colors replaced, subtypes added, abilities kept', () => {
    const g = scenario()
      .seat(0)
      .battlefield(ANGEL, { label: 'angel' })
      .battlefield(WIZARD, { attachedTo: 'angel' })
      .build();
    g.expect.derived('angel', {
      types: ['creature'],
      subtypes: ['Angel', 'Wizard'],
      colors: ['U'],
      keywords: ['flying', 'vigilance'],
    });
    g.expect.pt('angel', 4, 4);
  });
});

describe('validation', () => {
  const withStatic = (s: object) =>
    ({
      ...syntheticCard(AURA),
      faces: [
        {
          ...syntheticCard(AURA).faces[0],
          abilities: [
            { kind: 'keyword', keyword: { kind: 'enchant', filter: { types: ['creature'] } } },
            { kind: 'static', static: s },
          ],
        },
      ],
    }) as unknown as Parameters<typeof validateCard>[0];

  test('loseAllAbilities is about what is attached, with no host type', () => {
    expect(
      validateCard(withStatic({ kind: 'loseAllAbilities', subject: { kind: 'attached' } })),
    ).toEqual([]);
    expect(
      validateCard(
        withStatic({
          kind: 'loseAllAbilities',
          subject: { kind: 'filter', filter: { types: ['creature'] } },
        }),
      ).length,
    ).toBeGreaterThan(0);
    expect(
      validateCard(
        withStatic({
          kind: 'loseAllAbilities',
          subject: { kind: 'attached', types: ['creature'] },
        }),
      ).length,
    ).toBeGreaterThan(0);
  });

  test('setColors takes a list of distinct colors, empty for colorless', () => {
    const ok = (colors: unknown) =>
      validateCard(withStatic({ kind: 'setColors', subject: { kind: 'attached' }, colors }));
    expect(ok(['G'])).toEqual([]);
    expect(ok([])).toEqual([]);
    expect(ok(['G', 'G']).length).toBeGreaterThan(0);
    expect(ok(['X']).length).toBeGreaterThan(0);
    expect(ok('G').length).toBeGreaterThan(0);
  });

  test('a replacing setTypes with creature types needs the creature card type', () => {
    const set = (extra: object) =>
      validateCard(withStatic({ kind: 'setTypes', subject: { kind: 'attached' }, ...extra }));
    expect(set({ types: ['creature'], subtypes: ['Elk'] })).toEqual([]);
    expect(set({ subtypes: ['Elk'] }).length).toBeGreaterThan(0);
    expect(set({ subtypes: ['Elk'], additive: true })).toEqual([]);
    expect(set({}).length).toBeGreaterThan(0);
  });
});
