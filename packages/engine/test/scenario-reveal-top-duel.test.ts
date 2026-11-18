// "At the beginning of your upkeep, you and target opponent each reveal the top card of your library. You each lose life equal to the mana value of the card revealed by the other
// player. You each put the card you revealed into your hand." (`revealTopDuel`). Pins: CR 701.20a (Reveal: shown to all players), CR 119.3 (each player loses life equal to the card the
// OTHER player revealed), CR 202.3 (mana value; a land card has 0), CR 401.5 (an empty library reveals nothing). The card is SYNTHETIC (synthetic-reveal-duel.ts).
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const DUELIST = 'SYNTHETIC Reveal Duelist';
const ANGEL = 'Serra Angel'; // mana value 5
const BOLT = 'Lightning Bolt'; // mana value 1

type Builder = ReturnType<typeof scenario>;

/** Seat 0 at its upkeep with the duelist trigger on the stack, the libraries (top first) as given. */
function upkeepGame(mine: readonly string[], theirs: readonly string[], life = 20) {
  const place = (b: Builder, library: readonly string[]) =>
    library.length === 0 ? b.life(life) : b.life(life).library(...library);
  const a = place(scenario().seat(0), mine).battlefield(DUELIST);
  const g = place(a.seat(1), theirs).at('postcombatMain', { active: 1, turn: 2 }).build();
  g.advanceTo('upkeep', { turn: 'next' });
  return g;
}

const resolveTop = (g: ReturnType<typeof upkeepGame>): void => {
  g.pass();
  g.pass();
};

describe('the card is valid and the shapes that are refused', () => {
  test('valid', () => {
    expect(validateCard(syntheticCard(DUELIST))).toEqual([]);
  });

  test('the players are two selectors in an `all`', () => {
    const card = syntheticCard(DUELIST);
    const face = card.faces[0];
    const ability = face?.abilities[0];
    if (face === undefined || ability?.kind !== 'triggered') throw new Error('no trigger');
    const withPlayers = (players: unknown) =>
      ({
        ...card,
        faces: [
          { ...face, abilities: [{ ...ability, effect: { kind: 'revealTopDuel', players } }] },
        ],
      }) as never;
    expect(validateCard(withPlayers({ kind: 'you' })).length).toBeGreaterThan(0);
    expect(
      validateCard(withPlayers({ kind: 'all', of: [{ kind: 'you' }] })).length,
    ).toBeGreaterThan(0);
    expect(
      validateCard(
        withPlayers({ kind: 'all', of: [{ kind: 'you' }, { kind: 'target', id: 't1' }] }),
      ),
    ).toEqual([]);
  });
});

describe('you and target opponent each reveal the top card of your library', () => {
  test("each loses life equal to the mana value of the OTHER player's card, then each takes their own card", () => {
    const g = upkeepGame([ANGEL, 'Plains'], [BOLT, 'Plains']);
    g.expect.stack([`${DUELIST} (ability)`]);
    resolveTop(g);
    // Seat 0 revealed Serra Angel (5): seat 1 loses 5. Seat 1 revealed Lightning Bolt (1): seat 0 loses 1.
    g.expect.life(0, 19);
    g.expect.life(1, 15);
    g.expect.handSize(0, 1);
    g.expect.handSize(1, 1);
    g.expect.zone(ANGEL, 'hand', { seat: 0 });
    g.expect.zone(BOLT, 'hand', { seat: 1 });
  });

  test('both cards are revealed to everyone (CR 701.20a)', () => {
    const g = upkeepGame([ANGEL, 'Plains'], [BOLT, 'Plains']);
    resolveTop(g);
    const shown = g.events.filter((e) => e.kind === 'cardsRevealed');
    expect(shown.map((e) => [e.seat, e.names])).toEqual([
      [0, [ANGEL]],
      [1, [BOLT]],
    ]);
  });

  test('a land card has mana value 0: its owner is not hurt by it, and the other player loses nothing', () => {
    const g = upkeepGame(['Plains', 'Plains'], [ANGEL, 'Plains']);
    resolveTop(g);
    // Seat 1 revealed a 5: seat 0 loses 5. Seat 0 revealed a land (0): seat 1 loses nothing.
    g.expect.life(0, 15);
    g.expect.life(1, 20);
    g.expect.handSize(0, 1);
    g.expect.handSize(1, 1);
  });

  test('an empty library reveals nothing: the other player loses no life, and still takes their card', () => {
    const g = upkeepGame([ANGEL], []);
    resolveTop(g);
    g.expect.life(0, 20);
    g.expect.life(1, 15);
    g.expect.handSize(0, 1);
    g.expect.handSize(1, 0);
  });

  test('the life is lost at the same time: a player at 5 life facing a 5 dies, the other facing a 1 does not', () => {
    const g = upkeepGame([BOLT, 'Plains'], [ANGEL, 'Plains'], 5);
    resolveTop(g);
    g.expect.life(0, 0);
    g.expect.life(1, 4);
    g.expect.handSize(0, 1);
    g.expect.handSize(1, 1);
  });
});
