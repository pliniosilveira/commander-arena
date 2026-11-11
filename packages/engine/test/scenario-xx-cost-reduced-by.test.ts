// "This ability costs {1} less to activate for each [thing]" (D-139): the generic part of an activated ability's mana cost goes down by an
// amount that reads the game as the ability is activated (`costReducedBy`), never below zero and never for colored mana.
// Pins: CR 601.2f (the total cost is determined: reductions are applied to the generic part, after increases), CR 602.2b (activating
// follows the casting steps), CR 118.7a (a reduction can't reduce colored mana or go below zero generic), CR 109.1 and 201.5 ("other"
// leaves out the source), CR 404.1 (a graveyard is a zone cards are counted in).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-ability-costs.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { twoSeatGame } from './two-seat-helpers';

const LAMP = 'SYNTHETIC Reading Lamp'; // {5}{U},{T}: draw; {1} less for each other artifact you control
const FURNACE = 'SYNTHETIC Zombie Furnace'; // {6}: gain 3; {2} less for each other Zombie you control
const GRAVE_LAMP = 'SYNTHETIC Grave Lamp'; // {4},{T}: draw; {1} less for each creature card in your graveyard
const TRINKET = 'SYNTHETIC Trinket 1';
const ZOMBIE = 'SYNTHETIC Plain Zombie';
const BEARS = 'Grizzly Bears';

const canActivate = (g: ReturnType<typeof twoSeatGame>, card: string): boolean =>
  g.legalActions(0).some((a) => a.kind === 'activate' && a.object === g.id(card));

/** The mana symbols the ability on the stack was paid with. */
const paidFor = (g: ReturnType<typeof twoSeatGame>): readonly string[] => {
  const top = g.state.stack[g.state.stack.length - 1];
  const ability = top === undefined ? undefined : g.state.objects[top]?.stack?.ability;
  if (ability?.kind !== 'activated') return [];
  return ability.cost.flatMap((c) => (c.kind === 'mana' ? c.symbols : []));
};

describe('the cards are valid', () => {
  test.each([LAMP, FURNACE, GRAVE_LAMP])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

describe('"costs {1} less for each other artifact you control" (CR 601.2f)', () => {
  test('with no other artifact the whole cost is paid: five Islands and a seventh land do not pay {5}{U}', () => {
    const g = twoSeatGame((b) => b.battlefield(LAMP).battlefield('Island', { count: 5 }));
    // {5}{U} needs six mana; five lands are not enough.
    expect(canActivate(g, LAMP)).toBe(false);
  });

  test('each other artifact takes {1} off the generic part: two artifacts leave {3}{U}', () => {
    const g = twoSeatGame((b) =>
      b.battlefield(LAMP).battlefield(TRINKET, { count: 2 }).battlefield('Island', { count: 4 }),
    );
    expect(canActivate(g, LAMP)).toBe(true);
    g.act(0).activate(LAMP, { pay: true });
    expect(paidFor(g)).toEqual(['3', 'U']);
    g.passAll();
    g.expect.handSize(0, 1);
    g.expect.invariants();
  });

  test('the source is not counted ("other"), and an opponent\'s artifact is not yours', () => {
    const g = twoSeatGame(
      (b) => b.battlefield(LAMP).battlefield('Island', { count: 5 }),
      (b) => b.battlefield(TRINKET, { count: 3 }),
    );
    expect(canActivate(g, LAMP)).toBe(false);
  });

  test('never below zero, and the colored mana stays: seven artifacts leave {U}', () => {
    const g = twoSeatGame((b) =>
      b.battlefield(LAMP).battlefield(TRINKET, { count: 7 }).battlefield('Island'),
    );
    expect(canActivate(g, LAMP)).toBe(true);
    g.act(0).activate(LAMP, { pay: true });
    expect(paidFor(g)).toEqual(['U']);
  });

  test('the reduction is worked out as the ability is activated: the stack object shows what was paid', () => {
    const g = twoSeatGame((b) =>
      b.battlefield(LAMP).battlefield(TRINKET, { count: 1 }).battlefield('Island', { count: 5 }),
    );
    g.act(0).activate(LAMP, { pay: true });
    expect(paidFor(g)).toEqual(['4', 'U']);
    // The artifact leaving in response changes nothing: the cost was paid.
    g.passAll();
    g.expect.handSize(0, 1);
  });
});

describe('the same ability field with another amount', () => {
  test('"{2} less for each other Zombie": a multiple of a count', () => {
    const g = twoSeatGame((b) =>
      b.battlefield(FURNACE).battlefield(ZOMBIE, { count: 2 }).battlefield('Plains', { count: 2 }),
    );
    // {6} less {4} is {2}.
    expect(canActivate(g, FURNACE)).toBe(true);
    g.act(0).activate(FURNACE, { pay: true });
    expect(paidFor(g)).toEqual(['2']);
    g.passAll();
    g.expect.life(0, 23);
  });

  test('one Zombie is not enough for two lands: {6} less {2} is {4}', () => {
    const g = twoSeatGame((b) =>
      b.battlefield(FURNACE).battlefield(ZOMBIE).battlefield('Plains', { count: 3 }),
    );
    expect(canActivate(g, FURNACE)).toBe(false);
  });

  test('"{1} less for each creature card in your graveyard": cards in a zone, not permanents', () => {
    const g = twoSeatGame((b) =>
      b
        .battlefield(GRAVE_LAMP)
        .graveyard(BEARS, { count: 3 })
        .graveyard(TRINKET)
        .battlefield('Plains'),
    );
    expect(canActivate(g, GRAVE_LAMP)).toBe(true);
    g.act(0).activate(GRAVE_LAMP, { pay: true });
    expect(paidFor(g)).toEqual(['1']);
  });
});
