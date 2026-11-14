// Triggered mana abilities (CR 605.1b, D-139): "Whenever you tap a permanent for {C}, add an additional {C}."
// Pins: CR 605.1b (an ability that triggers from a mana ability and could add mana is a mana ability), CR 605.4a (a triggered mana ability resolves
// immediately after the mana ability that caused it, into the same pool and without the stack), CR 106.12 (tapping a permanent for mana is activating
// a mana ability with {T}), CR 106.4 (mana stays in the pool until the step ends), CR 601.2g-h (paying a cost taps sources).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-mana-triggers.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { twoSeatGame } from './two-seat-helpers';

const MONUMENT = 'SYNTHETIC Echo Monument'; // tap for {C}: add an additional {C}
const CAIRN = 'SYNTHETIC Green Cairn'; // tap a Forest for {G}: add an additional {G}
const TOTEM = 'SYNTHETIC Spark Totem'; // tap a creature for mana: add {R}
const RING = 'Sol Ring'; // {T}: {C}{C}
const ELVES = 'Llanowar Elves'; // {T}: {G}
const TRINKET4 = 'SYNTHETIC Trinket 4';
const TRINKET2 = 'SYNTHETIC Trinket 2';

describe('the cards are valid', () => {
  test.each([MONUMENT, CAIRN, TOTEM, 'SYNTHETIC Pain Stone'])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

describe('tapping by hand (CR 605.4a)', () => {
  test('Sol Ring makes {C}{C} and the Monument adds one more: three colorless in the pool, nothing on the stack', () => {
    const g = twoSeatGame((b) => b.battlefield(MONUMENT).battlefield(RING));
    g.act(0).tapForMana(RING);
    g.expect.pool(0, 'CCC');
    g.expect.stack([]);
    g.expect.invariants();
  });

  test('a mana ability with no {T} in its cost is not tapping a permanent for mana (CR 106.12): the Monument adds nothing', () => {
    const g = twoSeatGame((b) => b.battlefield(MONUMENT).battlefield('SYNTHETIC Pain Stone'));
    g.act(0).tapForMana('SYNTHETIC Pain Stone');
    g.expect.pool(0, 'C');
    g.expect.life(0, 19);
  });

  test('a Forest makes {G}: it is not {C}, so the Monument adds nothing', () => {
    const g = twoSeatGame((b) => b.battlefield(MONUMENT).battlefield('Forest'));
    g.act(0).tapForMana('Forest');
    g.expect.pool(0, 'G');
  });

  test("the opponent's Monument is not yours: it adds nothing for your tapping", () => {
    const g = twoSeatGame(
      (b) => b.battlefield(RING),
      (b) => b.battlefield(MONUMENT),
    );
    g.act(0).tapForMana(RING);
    g.expect.pool(0, 'CC');
  });

  test('two Monuments each add their mana', () => {
    const g = twoSeatGame((b) => b.battlefield(MONUMENT, { count: 2 }).battlefield(RING));
    g.act(0).tapForMana(RING);
    g.expect.pool(0, 'CCCC');
  });

  test('another type of mana and another permanent: tapping a Forest for {G} adds {G}; a Mountain adds nothing', () => {
    const g = twoSeatGame((b) =>
      b.battlefield(CAIRN).battlefield('Forest').battlefield('Mountain'),
    );
    g.act(0).tapForMana('Forest');
    g.expect.pool(0, 'GG');
    g.act(0).tapForMana('Mountain');
    g.expect.pool(0, 'GGR');
  });

  test("with no type named any mana counts, and the mana added is the trigger's: a creature tapped for mana adds {R}", () => {
    const g = twoSeatGame((b) => b.battlefield(TOTEM).battlefield(ELVES).battlefield('Forest'));
    g.act(0).tapForMana(ELVES);
    g.expect.pool(0, 'GR');
    g.act(0).tapForMana('Forest');
    g.expect.pool(0, 'GGR');
  });
});

describe('paying a cost (CR 601.2g-h): the planner counts the extra mana', () => {
  test('{4} is paid by Sol Ring and the Monument (three) and one land; without the Monument it takes two lands', () => {
    const withMonument = twoSeatGame((b) =>
      b.hand(TRINKET4).battlefield(MONUMENT).battlefield(RING).battlefield('Forest', { count: 2 }),
    );
    withMonument.act(0).cast(TRINKET4, { pay: true });
    const tapped = withMonument.state.battlefield.filter(
      (id) => withMonument.state.objects[id]?.tapped === true,
    );
    // Sol Ring and one Forest.
    expect(tapped).toHaveLength(2);
    withMonument.expect.pool(0, '');
    const without = twoSeatGame((b) =>
      b.hand(TRINKET4).battlefield(RING).battlefield('Forest', { count: 2 }),
    );
    without.act(0).cast(TRINKET4, { pay: true });
    expect(
      without.state.battlefield.filter((id) => without.state.objects[id]?.tapped === true),
    ).toHaveLength(3);
  });

  test('mana made and not spent stays in the pool: {2} paid by Sol Ring with the Monument leaves one {C}', () => {
    const g = twoSeatGame((b) => b.hand(TRINKET2).battlefield(MONUMENT).battlefield(RING));
    g.act(0).cast(TRINKET2, { pay: true });
    g.expect.pool(0, 'C');
  });

  test("a color choice is still the ability's own: Command Tower makes one color, the Cairn adds nothing for it", () => {
    const g = twoSeatGame((b) =>
      b.battlefield(CAIRN).battlefield('Command Tower').battlefield('Forest'),
    );
    g.act(0).tapForMana('Forest');
    g.expect.pool(0, 'GG');
  });
});
