// "{T}: Add one mana of any color. If you control a creature with power 4 or greater, add two mana of any one color instead." (D-145):
// a mana ability that makes another production while a condition holds (`ManaAbility.instead`), and `anyColor` with a `count`.
// Pins: CR 605.1a and 605.3b (a mana ability does not use the stack; the color is chosen as it is activated), CR 106.1b (the types of
// mana: two mana of any one color are two of the same type), CR 608.2c (an instruction that depends on the game as it resolves),
// CR 601.2g (the mana of a source is planned when a cost is paid), CR 302.6 (summoning sickness of a creature's {T} ability).
// All cards are SYNTHETIC (src/cards/fixtures/synthetic-mana-instead.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const MYSTIC = 'SYNTHETIC Doubling Mystic'; // one mana of any color; two of one color with a creature of power 4 or greater
const ROCK = 'SYNTHETIC Rich Rock'; // {G}; {G}{G} with three or more lands
const CHAMELEON = 'SYNTHETIC Chameleon Rock'; // {C}; one mana of any color with three or more lands
const SPRING = 'SYNTHETIC Twin Spring'; // two mana of any one color
const BIG = 'SYNTHETIC Elf 5/2';
const SMALL = 'SYNTHETIC Goblin 1/1';

describe('the cards are valid', () => {
  test.each([MYSTIC, ROCK, CHAMELEON, SPRING])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

describe('"two mana of any one color" (a count on anyColor)', () => {
  test('the color is chosen once and both mana have it', () => {
    const g = scenario().seat(0).battlefield(SPRING).build();
    g.act(0).tapForMana(SPRING, { color: 'R' });
    g.expect.pool(0, 'RR');
    g.expect.stack([]);
  });

  test('each of the five colors, and colorless, is offered as the one color of the two mana', () => {
    const g = scenario().seat(0).battlefield(SPRING).build();
    const offered = g
      .legalActions(0)
      .flatMap((a) => (a.kind === 'activateAbility' ? [a.color] : []));
    expect(offered.sort()).toEqual(['B', 'G', 'R', 'U', 'W']);
  });

  test('a color that is not one is refused, and two different colors are not a choice', () => {
    const g = scenario().seat(0).battlefield(SPRING).build();
    expect(g.act(0).try.tapForMana(SPRING, { color: 'C' }).ok).toBe(false);
    g.expect.tapped(SPRING, false);
  });
});

describe('"If you control a creature with power 4 or greater, add two mana of any one color instead"', () => {
  test('without such a creature it makes one mana of the chosen color', () => {
    const g = scenario().seat(0).battlefield(MYSTIC, SMALL).build();
    g.act(0).tapForMana(MYSTIC, { color: 'W' });
    g.expect.pool(0, 'W');
  });

  test('with one, two mana of the one color chosen', () => {
    const g = scenario().seat(0).battlefield(MYSTIC, BIG).build();
    g.act(0).tapForMana(MYSTIC, { color: 'U' });
    g.expect.pool(0, 'UU');
  });

  test('the creature with the ability counts itself when its own power is 4 or greater (the condition has no "other")', () => {
    const g = scenario()
      .seat(0)
      .battlefield(MYSTIC, { label: 'mystic' })
      .battlefield('SYNTHETIC Might Aura', { attachedTo: 'mystic' })
      .battlefield('SYNTHETIC Might Aura', { attachedTo: 'mystic' })
      .build();
    g.expect.pt('mystic', 5, 5);
    g.act(0).tapForMana('mystic', { color: 'R' });
    g.expect.pool(0, 'RR');
  });

  test('an opponent\'s creature does not count: "you control"', () => {
    const g = scenario().seat(0).battlefield(MYSTIC).seat(1).battlefield(BIG).build();
    g.act(0).tapForMana(MYSTIC, { color: 'W' });
    g.expect.pool(0, 'W');
  });

  test('it follows the board: a creature that arrives changes what the same ability makes', () => {
    const g = scenario()
      .seat(0)
      .hand(BIG)
      .battlefield('Forest')
      .battlefield(MYSTIC, { label: 'first' })
      .battlefield(MYSTIC, { label: 'second' })
      .build();
    g.act(0).tapForMana('first', { color: 'W' });
    g.expect.pool(0, 'W');
    g.act(0).cast(BIG, { pay: true });
    g.passAll();
    g.act(0).tapForMana('second', { color: 'W' });
    // The first W paid for the {1} Elf; the second Mystic now makes two mana of the one color.
    g.expect.pool(0, 'WW');
  });
});

describe('the payment planner knows what the source makes now (CR 601.2g)', () => {
  test('Divination ({2}{U}) is not payable with the Mystic and one Island when it makes one mana', () => {
    const g = scenario().seat(0).hand('Divination').battlefield(MYSTIC, 'Island').build();
    expect(g.act(0).try.cast('Divination').ok).toBe(false);
  });

  test('with a creature of power 4 or greater the same two permanents pay for it', () => {
    const g = scenario()
      .seat(0)
      .hand('Divination')
      .library('Island', 'Island', 'Island')
      .battlefield(MYSTIC, 'Island', BIG)
      .build();
    g.act(0).cast('Divination', { pay: true });
    g.passAll();
    g.expect.handSize(0, 2);
    g.expect.tapped(MYSTIC, true);
  });
});

describe('another production instead, not only a count', () => {
  test('{G}{G} instead with three or more lands, {G} with fewer', () => {
    const few = scenario().seat(0).battlefield(ROCK, 'Forest', 'Forest').build();
    few.act(0).tapForMana(ROCK);
    few.expect.pool(0, 'G');
    const many = scenario().seat(0).battlefield(ROCK, 'Forest', 'Forest', 'Forest').build();
    many.act(0).tapForMana(ROCK);
    many.expect.pool(0, 'GG');
  });

  test('a land that is tapped still counts: the condition reads the permanents, not their state', () => {
    const g = scenario()
      .seat(0)
      .battlefield(ROCK, 'Forest', 'Forest')
      .battlefield('Forest', { tapped: true })
      .build();
    g.act(0).tapForMana(ROCK);
    g.expect.pool(0, 'GG');
  });
});

describe('the replacing production may be another kind: a fixed {C}, or one mana of a color you choose', () => {
  test('with fewer than three lands it makes {C} and offers no choice of color', () => {
    const g = scenario().seat(0).battlefield(CHAMELEON, 'Forest', 'Forest').build();
    expect(g.act(0).try.tapForMana(CHAMELEON, { color: 'R' }).ok).toBe(false);
    g.act(0).tapForMana(CHAMELEON);
    g.expect.pool(0, 'C');
  });

  test('with three it makes one mana of the color chosen, and a bare tap is refused', () => {
    const g = scenario().seat(0).battlefield(CHAMELEON, 'Forest', 'Forest', 'Forest').build();
    expect(() => g.act(0).tapForMana(CHAMELEON)).toThrow(/pass \{ color \}/);
    g.act(0).tapForMana(CHAMELEON, { color: 'R' });
    g.expect.pool(0, 'R');
  });
});

describe('validation', () => {
  const withProduction = (production: object, instead?: object) =>
    ({
      ...syntheticCard(ROCK),
      faces: [
        {
          ...syntheticCard(ROCK).faces[0],
          abilities: [
            {
              kind: 'mana',
              cost: [{ kind: 'tap' }],
              production,
              ...(instead === undefined ? {} : { instead }),
            },
          ],
        },
      ],
    }) as unknown as Parameters<typeof validateCard>[0];
  const holds = { kind: 'lifeTotal', compare: { cmp: 'atLeast', value: 1 } };

  test('a count of 2 or more is valid; 1, 0, a fraction are not', () => {
    expect(validateCard(withProduction({ kind: 'anyColor', count: 2 }))).toEqual([]);
    expect(validateCard(withProduction({ kind: 'anyColor', count: 3 }))).toEqual([]);
    for (const count of [1, 0, 1.5, -2]) {
      expect(
        validateCard(withProduction({ kind: 'anyColor', count })).length,
        `${count}`,
      ).toBeGreaterThan(0);
    }
  });

  test('instead needs a condition and a production, and the production does not look at other permanents', () => {
    const fixed = { kind: 'fixed', mana: ['G'] };
    expect(validateCard(withProduction(fixed, { condition: holds, production: fixed }))).toEqual(
      [],
    );
    expect(validateCard(withProduction(fixed, { production: fixed })).length).toBeGreaterThan(0);
    expect(validateCard(withProduction(fixed, { condition: holds })).length).toBeGreaterThan(0);
    expect(
      validateCard(
        withProduction(fixed, {
          condition: holds,
          production: { kind: 'couldProduce', lands: { types: ['land'] } },
        }),
      ).length,
    ).toBeGreaterThan(0);
  });
});
