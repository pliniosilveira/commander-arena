// "Starting with you, each player votes for wild or free. Reveal cards from the top of your library until you reveal a creature card for each wild vote. Put those creature
// cards onto the battlefield, then shuffle the rest into your library. You may put a permanent card from your hand onto the battlefield for each free vote." (the wording
// of the real Selvala's Stampede): `revealUntil` with a `count` ("a creature card for each wild vote") and `rest: 'stay'`, and a `moveToZone` choice whose `count` is a vote tally.
// Pins: CR 701.38a/701.38b (the votes, counted for each option), CR 701.20 (reveal: every card revealed is public), CR 701.24 (shuffle), CR 110.2a (put onto the battlefield
// under the control of the player who puts it), CR 608.2c/608.2d (the choice is made as the effect resolves; none when the number is 0), CR 401.5 (a library with fewer
// matching cards than needed is revealed to its end). Cards are SYNTHETIC (src/cards/fixtures/synthetic-vote.ts).
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const RITE = 'SYNTHETIC Stampede Rite';
const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider';
const ELVES = 'Llanowar Elves';

describe('the card is valid', () => {
  test(RITE, () => {
    expect(validateCard(syntheticCard(RITE))).toEqual([]);
  });
});

const game = (library: readonly string[], hand: readonly string[] = []) =>
  scenario()
    .seat(0)
    .hand(RITE, ...hand)
    .battlefield('Forest', 'Forest', 'Forest', 'Forest', 'Forest', 'Forest')
    .library(...library)
    .seat(1)
    .library('Island', 'Island', 'Island')
    .build();

const vote = (g: ReturnType<typeof game>, mine: string, theirs: string) => {
  g.act(0).cast(RITE, { pay: true });
  g.passAll();
  g.act(0).chooseOption(mine);
  g.act(1).chooseOption(theirs);
};

describe('wild votes: reveal until that many creature cards', () => {
  test('two wild votes: the first two creature cards enter, the other cards revealed stay in the library', () => {
    const g = game(['Island', BEARS, 'Plains', SPIDER, 'Swamp', 'Swamp']);
    vote(g, 'wild', 'wild');
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.zone(SPIDER, 'battlefield', { seat: 0 });
    expect(g.state.seats[0]?.library).toHaveLength(4);
    const reveal = g.eventsSince(0).find((e) => e.kind === 'cardsRevealed');
    expect(reveal?.kind === 'cardsRevealed' ? reveal.names : []).toEqual([
      'Island',
      BEARS,
      'Plains',
      SPIDER,
    ]);
    g.expect.pending('priority', 0);
    g.expect.invariants();
  });

  test('one wild vote from the opponent: one creature enters under the controller of the spell', () => {
    const g = game([BEARS, SPIDER, 'Swamp']);
    vote(g, 'free', 'wild');
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.zone(SPIDER, 'library', { seat: 0 });
  });

  test('fewer creature cards than wild votes: the library is revealed to its end and the creatures all enter', () => {
    const g = game(['Swamp', ELVES, 'Swamp']);
    vote(g, 'wild', 'wild');
    g.expect.zone(ELVES, 'battlefield', { seat: 0 });
    expect(g.state.seats[0]?.library).toHaveLength(2);
    const reveal = g.eventsSince(0).find((e) => e.kind === 'cardsRevealed');
    expect(reveal?.kind === 'cardsRevealed' ? reveal.names : []).toEqual(['Swamp', ELVES, 'Swamp']);
  });

  test('no wild votes: nothing is revealed', () => {
    const g = game([BEARS, SPIDER]);
    vote(g, 'free', 'free');
    expect(g.eventsSince(0).some((e) => e.kind === 'cardsRevealed')).toBe(false);
    g.expect.zone(BEARS, 'library', { seat: 0 });
  });
});

describe('free votes: put up to that many permanent cards from the hand', () => {
  test('two free votes: up to two permanent cards, an instant is not a candidate', () => {
    const g = game(['Swamp', 'Swamp'], [BEARS, SPIDER, ELVES, 'Lightning Bolt']);
    vote(g, 'free', 'free');
    const d = g.state.pending;
    expect(d).toMatchObject({ kind: 'chooseCards', seat: 0, min: 0, max: 2 });
    if (d?.kind !== 'chooseCards') throw new Error('expected chooseCards');
    expect(d.legal).toHaveLength(3);
    g.act(0).chooseCards(BEARS, SPIDER);
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.zone(SPIDER, 'battlefield', { seat: 0 });
    g.expect.zone(ELVES, 'hand', { seat: 0 });
    g.expect.invariants();
  });

  test('the player may choose none', () => {
    const g = game(['Swamp'], [BEARS]);
    vote(g, 'free', 'wild');
    g.act(0).chooseCards();
    g.expect.zone(BEARS, 'hand', { seat: 0 });
  });

  test('no free votes: the player is not asked at all', () => {
    const g = game(['Swamp'], [BEARS]);
    vote(g, 'wild', 'wild');
    g.expect.pending('priority', 0);
    g.expect.zone(BEARS, 'hand', { seat: 0 });
  });

  test('one wild and one free vote: one creature from the library, then one permanent from the hand', () => {
    const g = game([SPIDER, 'Swamp'], [BEARS]);
    vote(g, 'wild', 'free');
    g.expect.zone(SPIDER, 'battlefield', { seat: 0 });
    expect(g.state.pending).toMatchObject({ kind: 'chooseCards', min: 0, max: 1 });
    g.act(0).chooseCards(BEARS);
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
  });
});
