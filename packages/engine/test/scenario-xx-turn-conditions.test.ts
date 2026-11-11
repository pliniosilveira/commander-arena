// "As long as two or more nonland permanents entered the battlefield under your control this turn, ~ is a Dragon with base power and toughness 4/4,
// flying, and '{R}: Dragons you control get +1/+0 until end of turn'" and "if an opponent was dealt 7 or more damage this turn" (D-151): the conditions
// `enteredThisTurn` and `playerDealtDamage`, which read the turn log; conditional statics that set types, base power and toughness and grant an
// activated ability.
// Pins: CR 611.3a (an "as long as" effect is read each time), CR 613.1d (layer 4: a Dragon "loses all other creature types", CR 205.3d), CR 613.4b
// (layer 7b: base power and toughness), CR 613.1f (layer 6: flying and the granted ability), CR 400.7 (a permanent that left still entered), CR 120.3
// (damage dealt to a player), CR 702.75a (Hideaway). Cards are SYNTHETIC (src/cards/fixtures/synthetic-dragons-turnlog.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const CHIEF = 'SYNTHETIC Festive Chief'; // Goddric's shape: a Celebration creature
const CHEERER = 'SYNTHETIC Token Cheerer'; // two tokens this turn: 5/5
const HIDEAWAY = 'SYNTHETIC Scorched Hideaway';
const GOBLIN = 'Raging Goblin'; // {R}, a nonland permanent
const BOLT = 'Lightning Bolt';
const TREASURES = 'SYNTHETIC Make Treasures'; // {1}{R}: two Treasure tokens
const LIBRARY = Array.from({ length: 8 }, () => 'Mountain');

describe('the cards are valid', () => {
  test.each([CHIEF, CHEERER, HIDEAWAY])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });

  test('a static ability that changes types takes only a condition that reads no characteristic', () => {
    const base = syntheticCard(CHIEF);
    const face = base.faces[0];
    if (face === undefined) throw new Error('no face');
    const withCondition = (condition: unknown) =>
      ({
        ...base,
        faces: [
          {
            ...face,
            abilities: [
              {
                kind: 'static',
                static: {
                  kind: 'setTypes',
                  subject: { kind: 'this' },
                  types: ['creature'],
                  subtypes: ['Dragon'],
                },
                condition,
              },
            ],
          },
        ],
      }) as never;
    expect(validateCard(withCondition({ kind: 'enteredThisTurn', count: 1 }))).toEqual([]);
    expect(
      JSON.stringify(
        validateCard(withCondition({ kind: 'controlsAtLeast', filter: {}, count: 1 })),
      ),
    ).toContain('reads no characteristic');
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

describe('Celebration: two or more nonland permanents entered under my control this turn', () => {
  test('with only the Chief entered it is a Human Noble 3/3 with haste and no flying', () => {
    const g = game((b) => b.hand(CHIEF).battlefield('Mountain', 'Mountain', 'Mountain'));
    g.act(0).cast(CHIEF, { pay: true });
    g.passAll();
    g.expect.pt(CHIEF, 3, 3);
    g.expect.derived(CHIEF, { subtypes: ['Human', 'Noble'], keywords: ['haste'] });
  });

  test('with a second nonland permanent it is a Dragon 4/4 with flying, and it lost the other creature types', () => {
    const g = game((b) =>
      b.hand(CHIEF, GOBLIN).battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain'),
    );
    g.act(0).cast(GOBLIN, { pay: true });
    g.passAll();
    g.expect.pt(CHIEF, 3, 3); // not on the battlefield yet
    g.act(0).cast(CHIEF, { pay: true });
    g.passAll();
    g.expect.pt(CHIEF, 4, 4);
    g.expect.derived(CHIEF, {
      subtypes: ['Dragon'],
      keywords: ['haste', 'flying'],
      types: ['creature'],
    });
  });

  test('lands do not count', () => {
    const g = game((b) =>
      b.hand(CHIEF, 'Forest', 'Swamp').battlefield('Mountain', 'Mountain', 'Mountain'),
    );
    g.act(0).playLand('Forest');
    g.act(0).cast(CHIEF, { pay: true });
    g.passAll();
    g.expect.pt(CHIEF, 3, 3);
  });

  test('the permanents of the opponent do not count, and the next turn starts over', () => {
    const g = game((b) =>
      b.battlefield(CHIEF, 'Mountain').hand(GOBLIN).seat(1).hand(GOBLIN).battlefield('Mountain'),
    );
    g.expect.pt(CHIEF, 3, 3);
    // The opponent casts two Goblins on their turn: nothing for me.
    g.advanceTo('precombatMain', { turn: 'next' });
    g.act(1).cast(GOBLIN, { pay: true });
    g.passAll();
    g.expect.pt(CHIEF, 3, 3);
  });

  test('tokens count as nonland permanents, and a permanent that left still counts', () => {
    const g = game((b) =>
      b.battlefield(CHIEF, 'Mountain', 'Mountain', 'Mountain', 'Mountain').hand(TREASURES, GOBLIN),
    );
    g.expect.pt(CHIEF, 3, 3);
    g.act(0).cast(TREASURES, { pay: true });
    g.passAll();
    g.expect.pt(CHIEF, 4, 4);
    // The two Treasures are sacrificed: the Chief is still celebrating.
    const treasure = g.find({ name: 'Treasure', zone: 'battlefield' })[0];
    expect(treasure).toBeDefined();
  });

  test('a permanent that entered and then left still counts (CR 400.7): a Goblin killed by a Bolt', () => {
    const g = game((b) =>
      b
        .battlefield(CHIEF, 'Mountain', 'Mountain', 'Mountain', 'Mountain')
        .hand(GOBLIN, GOBLIN, BOLT),
    );
    g.act(0).cast(`${GOBLIN}[0]`, { pay: true });
    g.passAll();
    g.expect.pt(CHIEF, 3, 3);
    g.act(0).cast(BOLT, { targets: [{ name: GOBLIN, seat: 0, zone: 'battlefield' }], pay: true });
    g.passAll();
    g.expect.zone(GOBLIN, 'graveyard', { seat: 0 });
    g.act(0).cast(GOBLIN, { pay: true });
    g.passAll();
    g.expect.pt(CHIEF, 4, 4);
  });

  test('the next turn the count starts over', () => {
    const g = game((b) =>
      b.battlefield(CHIEF, 'Mountain', 'Mountain', 'Mountain', 'Mountain').hand(TREASURES),
    );
    g.act(0).cast(TREASURES, { pay: true });
    g.passAll();
    g.expect.pt(CHIEF, 4, 4);
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.pt(CHIEF, 3, 3);
  });

  test('a Dragon pumps the Dragons: the granted ability gives +1/+0 to each Dragon until end of turn, itself included', () => {
    const g = game((b) =>
      b.battlefield(CHIEF, 'Mountain', 'Mountain', 'Mountain', 'Mountain').hand(TREASURES),
    );
    // Not celebrating yet: the Chief has no such ability.
    expect(g.legalActions(0).some((a) => a.kind === 'activate')).toBe(false);
    g.act(0).cast(TREASURES, { pay: true });
    g.passAll();
    g.expect.legal(0, { activate: CHIEF });
    g.act(0).activate(CHIEF, { pay: true });
    g.passAll();
    g.expect.pt(CHIEF, 5, 4);
  });

  test('a creature with tokens only: two tokens give base 5/5, one does not', () => {
    const one = game((b) => b.battlefield(CHEERER, 'Mountain', 'Mountain'));
    one.expect.pt(CHEERER, 1, 1);
    const two = game((b) => b.battlefield(CHEERER, 'Mountain', 'Mountain').hand(TREASURES));
    two.act(0).cast(TREASURES, { pay: true });
    two.passAll();
    two.expect.pt(CHEERER, 5, 5);
    // A card that entered is not a token.
    const cards = game((b) =>
      b.battlefield(CHEERER, 'Mountain', 'Mountain', 'Mountain').hand(GOBLIN, GOBLIN),
    );
    cards.act(0).cast(`${GOBLIN}[0]`, { pay: true });
    cards.passAll();
    cards.act(0).cast(GOBLIN, { pay: true });
    cards.passAll();
    cards.expect.pt(CHEERER, 1, 1);
  });
});

describe('"if an opponent was dealt N or more damage this turn": Hideaway', () => {
  // Hideaway 4: the land exiles one of the top four cards face down as it enters (tapped); on a later turn, {R}, {T} plays it free when an opponent took
  // 3 or more damage this turn.
  const BOLT2 = 'SYNTHETIC Bolt Two'; // 2 damage to each opponent
  const BEARS = 'Grizzly Bears';
  const setup = (hand: readonly string[]) => {
    const g = scenario()
      .seat(0)
      .hand(HIDEAWAY, ...hand)
      .battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain')
      .library(BEARS, 'Island', 'Island', 'Island', ...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.act(0).playLand(HIDEAWAY);
    g.passAll(); // the trigger goes on the stack and resolves into the question
    g.act(0).chooseCards(g.id(BEARS));
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    return g;
  };

  test('with no damage dealt this turn the ability does nothing', () => {
    const g = setup([]);
    g.expect.zone(BEARS, 'exile', { seat: 0 });
    g.act(0).activate(HIDEAWAY, { pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'exile', { seat: 0 });
  });

  test('damage dealt by Bolt to the opponent: 3 is enough', () => {
    const g = setup([BOLT]);
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 37);
    g.act(0).activate(HIDEAWAY, { pay: true });
    g.passAll();
    g.act(0).chooseCards(g.id(BEARS));
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
  });

  test('2 damage is not enough, and the ability does nothing', () => {
    const g = setup([BOLT2]);
    g.act(0).cast(BOLT2, { pay: true });
    g.passAll();
    g.expect.life(1, 38);
    g.act(0).activate(HIDEAWAY, { pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'exile', { seat: 0 });
  });

  test('damage from two sources adds up: 2 and 2 make 4', () => {
    const g = setup([BOLT2, BOLT2]);
    g.act(0).cast(`${BOLT2}[0]`, { pay: true });
    g.passAll();
    g.act(0).cast(BOLT2, { pay: true });
    g.passAll();
    g.expect.life(1, 36);
    g.act(0).activate(HIDEAWAY, { pay: true });
    g.passAll();
    g.act(0).chooseCards(g.id(BEARS));
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
  });

  test('damage dealt to me does not count for "an opponent"', () => {
    const g = setup([BOLT]);
    g.act(0).cast(BOLT, { targets: [{ player: 0 }], pay: true });
    g.passAll();
    g.expect.life(0, 37);
    g.act(0).activate(HIDEAWAY, { pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'exile', { seat: 0 });
  });

  test('damage dealt to a creature does not count either', () => {
    const g = scenario()
      .seat(0)
      .hand(HIDEAWAY, BOLT)
      .battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain')
      .library(BEARS, 'Island', 'Island', 'Island', ...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS)
      .build();
    g.act(0).playLand(HIDEAWAY);
    g.passAll();
    g.act(0).chooseCards(g.id(`${BEARS}[0]`));
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.act(0).cast(BOLT, { targets: [{ name: BEARS, seat: 1 }], pay: true });
    g.passAll();
    g.act(0).activate(HIDEAWAY, { pay: true });
    g.passAll();
    expect(g.find({ name: BEARS, zone: 'exile' })).toHaveLength(1);
  });
});
