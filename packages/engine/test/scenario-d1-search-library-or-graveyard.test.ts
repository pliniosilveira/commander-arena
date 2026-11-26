// "When this creature enters, search your library and/or graveyard for a card named X, reveal it, and put it into your hand. If you search your library this way, shuffle." (Tower Winder):
// the `search` option `zones` with a `reveal`, then a shuffle that "searched this way" decides.
// Pins: CR 701.23a (the player looks through the zones they search), 701.23b (a card of a stated name need not be found), 701.20a (reveal: the card is shown to every player), 701.24a (shuffle),
// 603.2 (the enters trigger). Played with three seats. Cards are SYNTHETIC (src/cards/fixtures/synthetic-d1.ts) or fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const FINDER = 'SYNTHETIC Bear Finder';
const BEARS = 'Grizzly Bears';

test('the card is valid', () => {
  expect(validateCard(syntheticCard(FINDER))).toEqual([]);
});

function board(where: { graveyard?: boolean; library?: boolean }) {
  const b = scenario({ seats: 3 })
    .seat(0)
    .library(...(where.library === true ? ['Swamp', BEARS, 'Swamp'] : ['Swamp', 'Swamp']))
    .hand(FINDER)
    .battlefield('Forest', { count: 3 });
  if (where.graveyard === true) b.graveyard(BEARS);
  return b
    .seat(1)
    .library('Swamp', 'Swamp')
    .seat(2)
    .library('Swamp', 'Swamp')
    .at('precombatMain', { active: 0 })
    .build();
}

/** The cards revealed since the start, by name and the zone they were in. */
const revealed = (g: ReturnType<typeof board>) =>
  g
    .eventsSince(0)
    .flatMap((e) => (e.kind === 'cardsRevealed' ? [{ names: e.names, from: e.from }] : []));

const inHand = (g: ReturnType<typeof board>): number =>
  g.state.seats[0]?.hand.filter((id) => g.state.objects[id]?.zone === 'hand').length ?? 0;

describe('search your library and/or graveyard, reveal it, put it into your hand (CR 701.23a)', () => {
  test('a card in the graveyard is found, revealed from there, and the library is neither searched nor shuffled', () => {
    const g = board({ graveyard: true });
    g.act(0).cast(FINDER, { pay: true });
    g.passAll();
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards(g.id(BEARS));
    g.expect.zone(BEARS, 'hand', { seat: 0 });
    g.expect.noEvent({ kind: 'librarySearched' }, { since: 0 });
    g.expect.noEvent({ kind: 'libraryShuffled' }, { since: 0 });
    expect(revealed(g)).toEqual([{ names: [BEARS], from: 'graveyard' }]);
    g.expect.invariants();
  });

  test('a card in the library is found, revealed, and "if you search your library this way" shuffles', () => {
    const g = board({ library: true });
    g.act(0).cast(FINDER, { pay: true });
    g.passAll();
    g.act(0).chooseCards(g.id(BEARS));
    g.expect.zone(BEARS, 'hand', { seat: 0 });
    expect(revealed(g)).toEqual([{ names: [BEARS], from: 'library' }]);
    g.expect.eventLog(
      [
        { kind: 'librarySearched', seat: 0, found: 1 },
        { kind: 'libraryShuffled', seat: 0 },
      ],
      { since: 0 },
    );
    g.expect.invariants();
  });

  test('both zones are offered in one choice, and finding the one in the graveyard does not search the library', () => {
    const g = board({ graveyard: true, library: true });
    g.act(0).cast(FINDER, { pay: true });
    g.passAll();
    const d = g.state.pending;
    if (d?.kind !== 'chooseCards') throw new Error('no choice');
    expect(d.legal).toHaveLength(2);
    expect(d.min).toBe(0);
    const inGraveyard = d.legal.find((id) => g.state.objects[id]?.zone === 'graveyard');
    if (inGraveyard === undefined) throw new Error('no graveyard card offered');
    g.act(0).chooseCards(inGraveyard);
    g.expect.noEvent({ kind: 'libraryShuffled' }, { since: 0 });
    expect(inHand(g)).toBe(1);
  });

  test('no such card: the library was searched and is shuffled, nothing is revealed', () => {
    const g = board({});
    g.act(0).cast(FINDER, { pay: true });
    g.passAll();
    g.expect.noEvent({ kind: 'cardsRevealed' }, { since: 0 });
    g.expect.eventLog(
      [
        { kind: 'librarySearched', seat: 0, found: 0 },
        { kind: 'libraryShuffled', seat: 0 },
      ],
      { since: 0 },
    );
  });
});
