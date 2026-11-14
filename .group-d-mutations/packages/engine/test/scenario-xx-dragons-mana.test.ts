// "Add {R} for each tapped land your opponents control.", "{1}, {T}: Add two mana in any combination of colors. Spend this mana only to cast Dragon spells
// or activate abilities of Dragons.", "Spend this mana only to cast a Dragon creature spell.", "If that mana is spent on a Dragon creature spell, it gains haste until
// end of turn." and "You don't lose unspent red mana as steps and phases end." (D-151).
// Pins: CR 106.1 and 106.1b (mana; colorless is not a color), CR 106.4 and 500.5 (mana empties as steps and phases end), CR 106.6 (spending restrictions and
// what mana does when spent), CR 605.3b (a choice made as a mana ability resolves, so a combination is named), CR 702.10 (haste), CR 602.2 (abilities of
// Dragons), CR 107.3 / 202.3 not involved. Cards are SYNTHETIC (src/cards/fixtures/synthetic-dragons-mana.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const GEYSER = 'SYNTHETIC Tap Geyser';
const GEYSER2 = 'SYNTHETIC Creature Geyser';
const ORB = 'SYNTHETIC Dragon Orb';
const HAVEN = 'SYNTHETIC Dragon Haven';
const HASTY = 'SYNTHETIC Hasty Orb';
const BREATHER = 'SYNTHETIC Firebreather Drake'; // a Dragon with "{R}: +1/+0"
const KEEPER = 'SYNTHETIC Mana Keeper Drake';
const DRAKE = 'SYNTHETIC Plain Drake'; // {3}{R} Dragon creature
const SINK = 'SYNTHETIC Mana Sink'; // artifact: {2}: gain 1 life (an ability that is not a Dragon's)
const PINGER = 'SYNTHETIC Pinger'; // {1}{R}, a creature that is not a Dragon
const LIBRARY = Array.from({ length: 8 }, () => 'Mountain');

describe('the cards are valid', () => {
  test.each([GEYSER, GEYSER2, ORB, HAVEN, HASTY, BREATHER, KEEPER])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });

  test('"for each" mana belongs to a spell or a triggered ability, not to a mana ability', () => {
    const card = syntheticCard(HASTY);
    const face = card.faces[0];
    if (face === undefined) throw new Error('no face');
    const bad = {
      ...card,
      faces: [
        {
          ...face,
          abilities: [
            {
              kind: 'mana',
              cost: [{ kind: 'tap' }],
              production: { kind: 'fixed', mana: ['R'], times: 2 },
            },
          ],
        },
      ],
    };
    expect(JSON.stringify(validateCard(bad as never))).toContain('never a count');
  });

  test('the count of a combination is from 2 to 4', () => {
    const card = syntheticCard(ORB);
    const face = card.faces[0];
    if (face === undefined) throw new Error('no face');
    const withCount = (count: number) =>
      ({
        ...card,
        faces: [
          {
            ...face,
            abilities: [
              {
                kind: 'mana',
                cost: [{ kind: 'tap' }],
                production: { kind: 'anyCombination', count },
              },
            ],
          },
        ],
      }) as never;
    expect(validateCard(withCount(3))).toEqual([]);
    expect(validateCard(withCount(1)).length).toBeGreaterThan(0);
    expect(validateCard(withCount(5)).length).toBeGreaterThan(0);
  });
});

const game = (build: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario>) =>
  build(
    scenario()
      .seat(0)
      .library(...LIBRARY),
  )
    .seat(1)
    .library(...LIBRARY)
    .build();

describe('"Add {R} for each tapped land your opponents control."', () => {
  const geyserGame = (tapped: number, untapped: number) => {
    let opp = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(GEYSER)
      .battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain', 'Mountain')
      .battlefield('Forest', { tapped: true }) // my own tapped land does not count
      .seat(1)
      .library(...LIBRARY);
    for (let i = 0; i < tapped; i += 1) opp = opp.battlefield('Island', { tapped: true });
    for (let i = 0; i < untapped; i += 1) opp = opp.battlefield('Island');
    return opp.build();
  };

  test('three tapped lands and two untapped ones: {R}{R}{R}', () => {
    const g = geyserGame(3, 2);
    g.act(0).cast(GEYSER, { pay: true });
    g.passAll();
    g.expect.pool(0, 'RRR');
  });

  test('no tapped land: no mana, and nothing to lose', () => {
    const g = geyserGame(0, 3);
    g.act(0).cast(GEYSER, { pay: true });
    g.passAll();
    g.expect.pool(0, '');
  });

  test('a tapped creature is not a land, and the count is read as the spell resolves', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(GEYSER)
      .battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain', 'Mountain')
      .seat(1)
      .library(...LIBRARY)
      .battlefield('Grizzly Bears', { tapped: true })
      .battlefield('Island', { tapped: true })
      .build();
    g.act(0).cast(GEYSER, { pay: true });
    g.passAll();
    g.expect.pool(0, 'R');
  });

  test('two mana for each: the list is repeated', () => {
    const g = game((b) =>
      b.hand(GEYSER2).battlefield('Forest', 'Forest', 'Forest', 'Grizzly Bears', 'Grizzly Bears'),
    );
    g.act(0).cast(GEYSER2, { pay: true });
    g.passAll();
    g.expect.pool(0, 'GGGG');
  });
});

describe('"Add two mana in any combination of colors. Spend this mana only to cast Dragon spells or activate abilities of Dragons."', () => {
  test('the activation names the combination, and the two mana stay in the pool as restricted mana', () => {
    const g = game((b) => b.battlefield(ORB, 'Mountain'));
    g.act(0).tapForMana('Mountain');
    g.act(0).tapForMana(ORB, { combination: 'RG' });
    g.expect.pool(0, 'RG');
    expect(g.state.seats[0]?.manaPool[0]?.restriction).toEqual({
      kind: 'spellMatch',
      subtypes: ['Dragon'],
      alsoAbilities: true,
    });
  });

  test('every pair of colors is on offer: 15 of them, and colorless is not one', () => {
    const g = game((b) => b.battlefield(ORB, 'Mountain'));
    g.act(0).tapForMana('Mountain');
    const offered = g
      .legalActions(0)
      .filter((a) => a.kind === 'activateAbility' && a.source === g.id(ORB));
    expect(offered).toHaveLength(15);
    expect(
      offered.every((a) => a.kind === 'activateAbility' && !a.combination?.includes('C')),
    ).toBe(true);
    expect(() => g.act(0).tapForMana(ORB, { combination: 'CC' })).toThrow();
    expect(() => g.act(0).tapForMana(ORB, { combination: 'R' })).toThrow();
  });

  test('it pays for a Dragon spell: {3}{R} with the Orb and two lands', () => {
    const g = game((b) => b.hand(DRAKE).battlefield(ORB, 'Mountain', 'Mountain', 'Mountain'));
    g.expect.legal(0, { cast: DRAKE });
    g.act(0).cast(DRAKE, { pay: true });
    g.passAll();
    g.expect.zone(DRAKE, 'battlefield', { seat: 0 });
  });

  test("it does not pay for a spell that is not a Dragon: the Orb's two mana are no use for a Goblin and a Pinger", () => {
    const g = game((b) => b.hand(PINGER).battlefield(ORB, 'Mountain'));
    // {1}{R}: the Mountain pays the Orb's {1}, nothing is left.
    g.expect.illegal(0, { cast: PINGER });
    const h = game((b) => b.hand(PINGER).battlefield(ORB, 'Mountain', 'Mountain'));
    // Two Mountains: either pays {1}{R} itself; the Orb is of no use.
    h.expect.legal(0, { cast: PINGER });
    h.act(0).cast(PINGER, { pay: true });
    h.passAll();
    h.expect.tapped(ORB, false); // the Orb was not needed: the two lands paid
  });

  test('it pays for an activated ability of a Dragon, and not for one of another permanent', () => {
    const g = game((b) => b.battlefield(ORB, BREATHER, SINK, 'Mountain'));
    g.act(0).tapForMana('Mountain');
    g.act(0).tapForMana(ORB, { combination: 'RR' });
    // {R}: the Dragon's pump is paid by the Orb's restricted mana; the Sink's {2} could be, by the other mana, if it were not restricted
    g.expect.legal(0, { activate: BREATHER });
    g.act(0).activate(BREATHER, { pay: true });
    g.passAll();
    g.expect.pt(BREATHER, 3, 2);
    g.expect.pool(0, 'R');
    // One restricted R left: the Sink's {2} cannot be paid with it
    g.expect.illegal(0, { activate: SINK });
  });
});

describe('abilities of Dragons', () => {
  test("the Orb's two mana are no use for the {2} of a permanent that is not a Dragon", () => {
    const g = game((b) => b.battlefield(ORB, SINK, 'Mountain'));
    g.act(0).tapForMana('Mountain');
    g.act(0).tapForMana(ORB, { combination: 'RR' });
    g.expect.pool(0, 'RR');
    g.expect.illegal(0, { activate: SINK });
  });

  test('mana that is for a Dragon spell only does not pay for an ability, not even of a Dragon', () => {
    const g = game((b) => b.battlefield(HAVEN, BREATHER));
    g.act(0).tapForMana(HAVEN, { ability: 1, color: 'R' });
    g.expect.pool(0, 'R');
    g.expect.illegal(0, { activate: BREATHER });
  });
});

describe('"Spend this mana only to cast a Dragon creature spell." (a type and a subtype together)', () => {
  test('it pays for a Dragon creature spell', () => {
    const g = game((b) => b.hand(DRAKE).battlefield(HAVEN, 'Mountain', 'Mountain', 'Mountain'));
    g.act(0).cast(DRAKE, { pay: true });
    g.passAll();
    g.expect.zone(DRAKE, 'battlefield', { seat: 0 });
  });

  test('a creature that is not a Dragon and an ability are not paid by it', () => {
    // The Haven's colorless mana is not restricted: it pays the generic part of the Goblin ({R}); the colored mana only a Dragon.
    const g = game((b) => b.hand(PINGER).battlefield(HAVEN));
    g.expect.illegal(0, { cast: PINGER });
    const tapped = game((b) => b.hand(PINGER).battlefield(HAVEN));
    tapped.act(0).tapForMana(HAVEN, { ability: 1, color: 'R' });
    expect(tapped.state.seats[0]?.manaPool[0]?.restriction).toEqual({
      kind: 'spellMatch',
      types: ['creature'],
      subtypes: ['Dragon'],
    });
    tapped.expect.illegal(0, { cast: PINGER });
  });
});

describe('"If that mana is spent on a Dragon creature spell, it gains haste until end of turn."', () => {
  test("a Dragon creature cast with the Orb's mana has haste this turn, and not the turn after", () => {
    const g = game((b) => b.hand(DRAKE).battlefield(HASTY, 'Mountain', 'Mountain', 'Mountain'));
    g.act(0).cast(DRAKE, { pay: true });
    g.passAll();
    g.expect.derived(DRAKE, { keywords: ['flying', 'haste'] });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.derived(DRAKE, { keywords: ['flying'] });
  });

  test('a creature that is not a Dragon gets none', () => {
    const g = game((b) => b.hand(PINGER).battlefield(HASTY, 'Mountain'));
    g.act(0).cast(PINGER, { pay: true });
    g.passAll();
    g.expect.derived(PINGER, { keywords: [] });
  });

  test('mana left in the pool unspent gives nothing: the Dragon is paid by the lands', () => {
    const g = game((b) =>
      b.hand(DRAKE).battlefield(HASTY, 'Mountain', 'Mountain', 'Mountain', 'Mountain'),
    );
    g.act(0).tapForMana(HASTY);
    g.act(0).cast(DRAKE, { payManual: [{ tap: 'Mountain[0]' }] } as never);
    g.expect.pool(0, 'R');
  });
});

describe('"You don\'t lose unspent red mana as steps and phases end."', () => {
  test('red mana stays through the steps, and other mana is lost', () => {
    const g = game((b) => b.battlefield(KEEPER, 'Mountain', 'Forest'));
    g.act(0).tapForMana('Mountain');
    g.act(0).tapForMana('Forest');
    g.expect.pool(0, 'RG');
    g.advanceTo('endOfCombat');
    g.expect.pool(0, 'R');
    g.advanceTo('postcombatMain');
    g.expect.pool(0, 'R');
  });

  test('it lasts through the turn and into the next one', () => {
    const g = game((b) => b.battlefield(KEEPER, 'Mountain'));
    g.act(0).tapForMana('Mountain');
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.pool(0, 'R');
  });

  test('without the permanent the mana is lost as the step ends', () => {
    const g = game((b) => b.battlefield('Mountain'));
    g.act(0).tapForMana('Mountain');
    g.expect.pool(0, 'R');
    g.advanceTo('endOfCombat');
    g.expect.pool(0, '');
  });

  test("the opponent's mana does not stay for my permanent", () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(KEEPER)
      .seat(1)
      .library(...LIBRARY)
      .battlefield('Mountain')
      .build();
    g.advanceTo('precombatMain', { turn: 'next' });
    g.act(1).tapForMana('Mountain');
    g.expect.pool(1, 'R');
    g.advanceTo('endOfCombat');
    g.expect.pool(1, '');
  });
});
