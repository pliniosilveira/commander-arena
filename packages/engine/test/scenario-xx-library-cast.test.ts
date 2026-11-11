// "You may cast creature spells with power 4 or greater from the top of your library. If you cast a creature spell this way, it gains haste until end
// of turn." (D-151): the static ability `castFromTopOfLibrary`, with `gainsHaste`.
// Pins: CR 601.3 and 601.2a (a card is cast from where it is, here the top of the library, at the timing of its type, paying its ordinary cost; it moves
// to the stack), CR 401.5 (the top card), CR 702.10 (haste), CR 514.2 (until end of turn), CR 400.7 (the card cast is a new object). Cards are SYNTHETIC
// (src/cards/fixtures/synthetic-dragons-library.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const SEER = 'SYNTHETIC Seer Drake';
const ORACLE = 'SYNTHETIC Artifact Oracle';
const BIG = 'SYNTHETIC Big Plain Drake'; // {3}{R}{R} 5/5 creature
const SMALL = 'SYNTHETIC Plain Drake'; // {3}{R} 3/3 creature
const BOLT = 'Lightning Bolt';
const RING = 'Sol Ring'; // an artifact
const FILLER = Array.from({ length: 8 }, () => 'Mountain');

describe('the cards are valid', () => {
  test.each([SEER, ORACLE, BIG])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

const game = (top: readonly string[], extra: readonly string[] = [SEER]) =>
  scenario()
    .seat(0)
    .battlefield(...extra, 'Mountain', 'Mountain', 'Mountain', 'Mountain', 'Mountain')
    .library(...top, ...FILLER)
    .seat(1)
    .library(...FILLER)
    .build();

describe('creature spells with power 4 or greater from the top of the library', () => {
  test('a creature with power 5 on top may be cast, and it goes to the stack and then the battlefield', () => {
    const g = game([BIG]);
    g.expect.legal(0, { cast: BIG });
    g.act(0).cast(BIG, { pay: true });
    g.expect.stack([BIG]);
    g.passAll();
    g.expect.zone(BIG, 'battlefield', { seat: 0 });
    g.expect.librarySize(0, FILLER.length);
  });

  test('it gains haste until end of turn, and not the turn after', () => {
    const g = game([BIG]);
    g.act(0).cast(BIG, { pay: true });
    g.passAll();
    g.expect.derived(BIG, { keywords: ['flying', 'haste'] });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.derived(BIG, { keywords: ['flying'] });
  });

  test('a creature with power 3, a spell that is not a creature and a land are not offered', () => {
    for (const top of [SMALL, BOLT, 'Forest']) {
      const g = game([top]);
      g.expect.illegal(0, { cast: { name: top, zone: 'library', seat: 0 } });
    }
  });

  test('only the top card: the second card of the library cannot be cast', () => {
    const g = game([SMALL, BIG]);
    g.expect.illegal(0, { cast: { name: BIG, zone: 'library', seat: 0 } });
  });

  test('after the top card is cast the next one is the top card', () => {
    const g = scenario()
      .seat(0)
      .battlefield(
        SEER,
        'Mountain',
        'Mountain',
        'Mountain',
        'Mountain',
        'Mountain',
        'Mountain',
        'Mountain',
        'Mountain',
        'Mountain',
        'Mountain',
      )
      .library(BIG, `${BIG}`, ...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();
    g.act(0).cast(`${BIG}[0]`, { pay: true });
    g.passAll();
    g.expect.legal(0, { cast: { name: BIG, zone: 'library', seat: 0 } });
  });

  test("it is a cast at the timing of the type: not at the opponent's turn, nor with something on the stack", () => {
    const g = game([BIG]);
    g.advanceTo('precombatMain', { turn: 'next' });
    g.pass(1);
    g.expect.illegal(0, { cast: { name: BIG, zone: 'library', seat: 0 } });
  });

  test('the opponent cannot cast my top card', () => {
    const g = game([BIG]);
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.illegal(1, { cast: { name: BIG, zone: 'library', seat: 0 } });
  });

  test('without the permanent there is no permission', () => {
    const g = game([BIG], []);
    g.expect.illegal(0, { cast: { name: BIG, zone: 'library', seat: 0 } });
  });

  test('it costs what it costs: the mana is needed', () => {
    const g = scenario()
      .seat(0)
      .battlefield(SEER, 'Mountain', 'Mountain')
      .library(BIG, ...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();
    g.expect.illegal(0, { cast: { name: BIG, zone: 'library', seat: 0 } });
  });
});

describe('an ability that gives the permission and no haste', () => {
  test('any artifact may be cast from the top, and it gets no haste (it is no creature)', () => {
    const g = game([RING], [ORACLE]);
    g.expect.legal(0, { cast: { name: RING, zone: 'library', seat: 0 } });
    g.act(0).cast(RING, { pay: true });
    g.passAll();
    g.expect.zone(RING, 'battlefield', { seat: 0 });
  });

  test('a creature is not an artifact: not offered', () => {
    const g = game([BIG], [ORACLE]);
    g.expect.illegal(0, { cast: { name: BIG, zone: 'library', seat: 0 } });
  });
});

describe('the haste is for a creature spell', () => {
  test('an artifact that is not a creature cast this way gets no haste effect', () => {
    const g = game([RING], ['SYNTHETIC Hasty Artifact Oracle']);
    g.act(0).cast(RING, { pay: true });
    g.passAll();
    g.expect.zone(RING, 'battlefield', { seat: 0 });
    expect(g.state.continuousEffects).toEqual([]);
  });
});

describe('two such permanents: either gives the permission, and the haste is theirs', () => {
  test('with the Seer and the Oracle a big creature on top is cast with haste', () => {
    const g = game([BIG], [SEER, ORACLE]);
    g.act(0).cast(BIG, { pay: true });
    g.passAll();
    g.expect.derived(BIG, { keywords: ['flying', 'haste'] });
  });
});

test('the view tells only the controller what is on top (look at the top card any time)', () => {
  const g = game([BIG]);
  expect(JSON.stringify(g.view(1))).not.toContain(BIG);
});
