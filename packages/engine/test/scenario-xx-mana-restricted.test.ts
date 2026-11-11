// "{T}: Add {W}. Spend this mana only to cast an Angel spell." and "{T}: Add one mana of the chosen color." (D-149).
// Pins: CR 106.6 (mana that can be spent only on some things; it is restricted mana in the pool), CR 605.3a (a mana ability's costs and the
// mana of an activation cost: restricted mana does not pay for an ability when it says spells), CR 106.4 (mana empties as steps end), CR 614.12
// and 607.2d (the color chosen as the permanent entered, read by its mana ability and by "of the chosen color"). Cards are SYNTHETIC
// (src/cards/fixtures/synthetic-mana-restricted.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const FONT = 'SYNTHETIC Font Angel';
const ROCK = 'SYNTHETIC Builder Rock';
const SHRINE = 'SYNTHETIC Elf Shrine';
const SINK = 'SYNTHETIC Mana Sink';
const BANNER = 'SYNTHETIC Colored Banner';
const ANGEL = 'Serra Angel'; // {3}{W}{W}, an Angel
const BEARS = 'Grizzly Bears'; // {1}{G}
const ELVES = 'Llanowar Elves'; // {G}, an Elf Druid
const BOLT = 'Lightning Bolt';
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

describe('the cards are valid', () => {
  test.each([FONT, ROCK, SHRINE, SINK, BANNER])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

const game = (build: (b: ReturnType<typeof scenario>) => void) => {
  const b = scenario()
    .seat(0)
    .library(...LIBRARY);
  build(b);
  return b
    .seat(1)
    .library(...LIBRARY)
    .build();
};

describe('"Spend this mana only to cast an Angel spell"', () => {
  test('it pays for an Angel spell: five mana with four Plains and the commander', () => {
    const g = game((b) => b.hand(ANGEL).battlefield(FONT, 'Plains', 'Plains', 'Plains', 'Plains'));
    g.expect.legal(0, { cast: ANGEL });
    g.act(0).cast(ANGEL, { pay: true });
    g.passAll();
    g.expect.zone(ANGEL, 'battlefield', { seat: 0 });
    g.expect.tapped(FONT, true);
    // The Font's other ability: one counter for the Angel it already controlled.
    g.expect.counters(ANGEL, { '+1/+1': 1 });
  });

  test("it does not pay for a creature that is not an Angel: two Forests would, the Font's W would not", () => {
    const poor = game((b) => b.hand(BEARS).battlefield(FONT, 'Forest'));
    poor.expect.illegal(0, { cast: BEARS });
    const rich = game((b) => b.hand(BEARS).battlefield(FONT, 'Forest', 'Forest'));
    rich.expect.legal(0, { cast: BEARS });
    rich.act(0).cast(BEARS, { pay: true });
    rich.passAll();
    rich.expect.tapped(FONT, false);
  });

  test('it does not pay for an ability', () => {
    const poor = game((b) => b.battlefield(SINK, FONT, 'Plains'));
    poor.expect.illegal(0, { activate: SINK });
    const rich = game((b) => b.battlefield(SINK, FONT, 'Plains', 'Plains'));
    rich.expect.legal(0, { activate: SINK });
  });

  test('tapped by hand it stays in the pool as restricted mana, and an Angel spell uses it', () => {
    const g = game((b) => b.hand(ANGEL).battlefield(FONT, 'Plains', 'Plains', 'Plains', 'Plains'));
    g.act(0).tapForMana(FONT);
    g.expect.pool(0, 'W');
    expect(g.state.seats[0]?.manaPool[0]?.restriction).toEqual({
      kind: 'spellMatch',
      subtypes: ['Angel'],
    });
    g.act(0).cast(ANGEL, { pay: true });
    g.passAll();
    g.expect.zone(ANGEL, 'battlefield', { seat: 0 });
    g.expect.pool(0, '');
  });

  test("restricted mana in the pool is not used for a spell it can't pay", () => {
    const g = game((b) => b.hand(BEARS).battlefield(FONT, 'Forest'));
    g.act(0).tapForMana(FONT);
    g.expect.illegal(0, { cast: BEARS });
  });
});

describe('types and subtypes', () => {
  test('"artifact or creature spells": a creature and an artifact are paid, a Bolt is not', () => {
    const g = game((b) => b.hand(BEARS, SINK, BOLT).battlefield(ROCK, 'Forest', 'Mountain'));
    g.expect.legal(0, { cast: BEARS }); // the Rock's {C}{C}... needs {G}: the Forest pays it
    g.expect.legal(0, { cast: SINK }); // {1}: one of the rock's mana
    g.act(0).tapForMana(ROCK);
    g.expect.pool(0, 'CC');
    g.act(0).cast(SINK, { pay: true });
    g.passAll();
    // One restricted C left, and a Mountain: a Bolt ({R}) is not paid by the restricted mana, but the Mountain pays it.
    g.expect.pool(0, 'C');
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 37);
    g.expect.pool(0, 'C');
  });

  test('"artifact or creature spells": a sorcery is not paid by that mana, whatever its cost', () => {
    const tonic = 'SYNTHETIC Colorless Tonic';
    const poor = game((b) => b.hand(tonic).battlefield(ROCK));
    poor.expect.illegal(0, { cast: tonic });
    const rich = game((b) => b.hand(tonic).battlefield(ROCK, 'Plains', 'Plains'));
    rich.expect.legal(0, { cast: tonic });
  });

  test('"an Elf creature spell": both the type and the subtype must match', () => {
    const elf = game((b) => b.hand(ELVES).battlefield(SHRINE));
    elf.expect.legal(0, { cast: ELVES });
    const bear = game((b) => b.hand(BEARS).battlefield(SHRINE, 'Plains'));
    bear.expect.illegal(0, { cast: BEARS });
  });
});

describe('"Add one mana of the chosen color"', () => {
  const withBanner = (color: 'W' | 'G') =>
    game((b) =>
      b
        .battlefield(BANNER, { chosen: { color } })
        .battlefield(ANGEL, { label: 'white' })
        .battlefield(BEARS, { label: 'green' }),
    );

  test.each(['W', 'G'] as const)('the Banner makes %s', (color) => {
    const g = withBanner(color);
    g.act(0).tapForMana(BANNER);
    g.expect.pool(0, color);
  });

  test('creatures of the chosen color get +1/+0, others do not', () => {
    const white = withBanner('W');
    white.expect.pt('white', 5, 4);
    white.expect.pt('green', 2, 2);
    const green = withBanner('G');
    green.expect.pt('white', 4, 4);
    green.expect.pt('green', 3, 2);
  });

  test("the opponent's creatures of the color are not affected", () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(BANNER, { chosen: { color: 'W' } })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(ANGEL)
      .build();
    g.expect.pt(ANGEL, 4, 4);
  });

  test('chosen as it enters: the controller is asked and the answer is the color', () => {
    const g = game((b) => b.hand(BANNER).battlefield('Plains', 'Plains', 'Plains'));
    g.act(0).cast(BANNER, { pay: true });
    g.passAll();
    g.act(0).chooseOption('R');
    g.expect.chosen(BANNER, { color: 'R' });
    g.act(0).tapForMana(BANNER);
    g.expect.pool(0, 'R');
  });
});
