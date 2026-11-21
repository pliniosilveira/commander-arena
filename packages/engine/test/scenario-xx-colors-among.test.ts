// "The number of colors among permanents you control" as the amount of an effect and as the mana of a mana ability (the Dance of the Elements deck: Elemental Spectacle,
// Shimmercreep, Faeburrow Elder). Pins: CR 105.2 (a color counts once however many permanents have it, colorless is no color), CR 608.2c (the amount is read as the
// instruction runs), CR 605.3b (a mana ability resolves at once). Cards are SYNTHETIC (src/cards/fixtures/synthetic-korvold-triggers.ts) and the real fixtures named.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';
import { twoSeatGame } from './two-seat-helpers';

const DRAIN = 'SYNTHETIC Prism Drain';
const SPIRITS = 'SYNTHETIC Prism Spirits';
const SPRITE = 'SYNTHETIC Prism Sprite';
const BEARS = 'Grizzly Bears'; // green
const ANGEL = 'Serra Angel'; // white

describe('the cards are valid', () => {
  test.each([DRAIN, SPIRITS, SPRITE])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });

  test('a spell cannot add a mana of each color among permanents: only a mana ability can', () => {
    const card = syntheticCard(SPRITE);
    const bad = {
      ...card,
      faces: card.faces.map((f) => ({
        ...f,
        abilities: [],
        spell: {
          effect: {
            kind: 'addMana' as const,
            mana: { kind: 'eachColorAmong' as const, filter: { controller: 'you' as const } },
          },
        },
      })),
    };
    expect(validateCard(bad).length).toBeGreaterThan(0);
  });

  test('the colors of permanents that are not on the battlefield are not counted', () => {
    const card = syntheticCard(DRAIN);
    const bad = JSON.parse(
      JSON.stringify(card).replaceAll(
        '"controller":"you"',
        '"controller":"you","zone":"graveyard"',
      ),
    );
    expect(validateCard(bad).length).toBeGreaterThan(0);
  });
});

describe('"Each opponent loses X life and you gain X life, where X is the number of colors among permanents you control."', () => {
  const play = (
    extra: Parameters<typeof twoSeatGame>[0],
    theirs?: Parameters<typeof twoSeatGame>[1],
  ) => {
    const g = twoSeatGame(
      (b) => extra(b.hand(DRAIN).battlefield('Swamp', 'Swamp', 'Swamp')),
      theirs,
    );
    g.act(0).cast(DRAIN, { pay: true });
    g.passAll();
    return g;
  };

  test('each color counts once, however many permanents have it', () => {
    const g = play((b) => b.battlefield(BEARS, 'Llanowar Elves', ANGEL));
    // Green (two creatures) and white: two colors.
    g.expect.life(1, 18);
    g.expect.life(0, 22);
  });

  test('colorless is no color: lands and colorless permanents add none', () => {
    const g = play((b) => b);
    g.expect.life(1, 20);
    g.expect.life(0, 20);
  });

  test("the colors of an opponent's permanents are not counted", () => {
    const g = play(
      (b) => b.battlefield(BEARS),
      (b) => b.battlefield(ANGEL, 'Raging Goblin'),
    );
    g.expect.life(1, 19);
    g.expect.life(0, 21);
  });
});

describe('"Create a number of 1/1 Spirit tokens equal to the number of colors among permanents you control."', () => {
  const spirits = (g: ReturnType<typeof twoSeatGame>) =>
    g.events.filter((e) => e.kind === 'tokenCreated' && e.name === 'Spirit').length;

  test('one token for each color among the permanents', () => {
    const g = twoSeatGame((b) =>
      b.hand(SPIRITS).battlefield('Plains', 'Plains', 'Plains', BEARS, ANGEL),
    );
    g.act(0).cast(SPIRITS, { pay: true });
    g.passAll();
    expect(spirits(g)).toBe(2);
  });

  test('no colored permanent: no token', () => {
    const g = twoSeatGame((b) => b.hand(SPIRITS).battlefield('Plains', 'Plains', 'Plains'));
    g.act(0).cast(SPIRITS, { pay: true });
    g.passAll();
    expect(spirits(g)).toBe(0);
  });
});

describe('"{T}: For each color among permanents you control, add one mana of that color."', () => {
  const base = () => scenario().seat(0).life(20).library('Plains', 'Plains').at('precombatMain');

  test('one mana of each color among the permanents, the creature itself included', () => {
    const g = base().battlefield(SPRITE, BEARS, ANGEL, 'Raging Goblin').build();
    g.act(0).tapForMana(SPRITE);
    // Green (the Sprite, the Bears), white (the Angel), red (the Guide): one of each, not one per permanent.
    g.expect.pool(0, 'WRG');
    g.expect.tapped(SPRITE, true);
  });

  test('a lone mono-colored creature makes one mana of its color', () => {
    const g = base().battlefield(SPRITE, 'Swamp').build();
    g.act(0).tapForMana(SPRITE);
    g.expect.pool(0, 'G');
  });

  test("the opponent's colors are not counted", () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .library('Plains')
      .battlefield(SPRITE)
      .seat(1)
      .life(20)
      .library('Plains')
      .battlefield(ANGEL)
      .at('precombatMain')
      .build();
    g.act(0).tapForMana(SPRITE);
    g.expect.pool(0, 'G');
  });

  test('it is not a choice of a color: the activation names nothing', () => {
    const g = base().battlefield(SPRITE, ANGEL).build();
    // `tapForMana` with a color would throw for a fixed outcome; the plain call makes the whole list.
    g.act(0).tapForMana(SPRITE);
    g.expect.pool(0, 'WG');
  });
});
