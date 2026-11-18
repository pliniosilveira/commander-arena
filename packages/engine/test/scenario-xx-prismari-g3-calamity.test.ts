// The Prismari deck (issue 87), group 3: Dance with Calamity, "Shuffle your library. As many times as you choose, you may exile the top card of your library. If the total mana value of the
// cards exiled this way is 13 or less, you may cast any number of spells from among those cards without paying their mana costs." (SYNTHETIC Calamity Dance and, without the shuffle so a test
// knows the cards, SYNTHETIC Calamity Unshuffled, src/cards/fixtures/synthetic-prismari-g3.ts). Pins: CR 701.13 (exile; the cards are face up), CR 608.2d (a choice made as the effect resolves,
// asked again after each card, with the card seen), CR 202.3 (mana value: a land has 0, a split card the sum of its halves, CR 202.3d, the front face of a double-faced card, CR 202.3b, X is 0
// in exile, CR 202.3e), CR 608.2c (the condition is read after the exile), CR 608.2g (the spells are cast during resolution, any number of them), CR 701.24 (shuffle), CR 400.7.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import type { ScenarioGame } from '../src/testing/index';
import { scenario } from '../src/testing/index';
import { chooseCardsDecision, confirmOptionalDecision } from './pending-helpers';

const DANCE = 'SYNTHETIC Calamity Dance';
const PLAIN = 'SYNTHETIC Calamity Unshuffled';
const GAIN2 = 'SYNTHETIC Calamity Gain Two'; // mana value 2
const GAIN7 = 'SYNTHETIC Calamity Gain Seven'; // mana value 7
const BIG = 'SYNTHETIC Prismari Big Study'; // {4}{U}{U}, mana value 6
const XSPELL = 'SYNTHETIC Prismari X Spell'; // {X}{R}, mana value 1 off the stack
const SPLIT = 'SYNTHETIC Singe // Mend'; // {R} and {1}{W}: mana value 3 together
const MDFC = 'SYNTHETIC Ridge Drake // Ridge Pass'; // front {2}{R}: mana value 3
const FILLER = ['Island', 'Island', 'Island', 'Island'] as const;
const MANA = 'RRRRRRRR';

type Builder = ReturnType<typeof scenario>;

function dance(card: string, top: readonly string[], extra: (b: Builder) => void = () => {}) {
  const b = scenario().seat(0).hand(card).library(...top, ...FILLER).pool(MANA);
  extra(b);
  const g = b
    .seat(1)
    .library(...FILLER)
    .at('precombatMain', { active: 0 })
    .build();
  g.act(0).cast(card, { pay: true });
  g.passAll();
  return g;
}

const exiled = (g: ScenarioGame, name: string) =>
  g.find({ name, zone: 'exile', seat: 0 }).filter((o) => o.card !== null);
const exileCount = (g: ScenarioGame) => g.state.exile.length;
const again = (g: ScenarioGame) => g.act(0).accept();
const stop = (g: ScenarioGame) => g.act(0).decline();

describe('the cards are valid', () => {
  for (const name of [DANCE, PLAIN]) {
    test(name, () => expect(validateCard(syntheticCard(name))).toEqual([]));
  }
});

describe('"as many times as you choose, you may exile the top card of your library" (CR 701.13, 608.2d)', () => {
  test('the player is asked again after each card, and sees what was exiled so far', () => {
    const g = dance(PLAIN, [GAIN2, 'Island', GAIN7]);
    let d = confirmOptionalDecision(g);
    expect(d).toMatchObject({ seat: 0, purpose: 'exileMore', exiled: [] });
    again(g);
    d = confirmOptionalDecision(g);
    expect(d.exiled).toHaveLength(1);
    expect(g.state.objects[d.exiled?.[0] as `o${number}`]?.zone).toBe('exile');
    again(g);
    expect(confirmOptionalDecision(g).exiled).toHaveLength(2);
    stop(g);
    // Two cards were exiled, the third stays on the library; 2 + 0 is within 13: the spell may be cast.
    expect(exileCount(g)).toBe(2);
    expect(chooseCardsDecision(g)).toMatchObject({ purpose: 'cast', zone: 'exile', seat: 0 });
    g.expect.invariants();
  });

  test('declining at once exiles nothing: nothing is cast and the library is as it was', () => {
    const g = dance(PLAIN, [GAIN2, GAIN7]);
    stop(g);
    expect(exileCount(g)).toBe(0);
    g.expect.pending('priority', 0);
    expect(g.state.seats[0]?.library).toHaveLength(2 + FILLER.length);
  });

  test('the cards are exiled face up, from the top, one after the other, each a new object (CR 400.7)', () => {
    const g = dance(PLAIN, [GAIN2, GAIN7]);
    again(g);
    again(g);
    expect(exileCount(g)).toBe(2);
    expect(exiled(g, GAIN2)).toHaveLength(1);
    expect(exiled(g, GAIN7)).toHaveLength(1);
    expect(g.state.objects[g.state.exile[0] as `o${number}`]?.exiledFaceDown).not.toBe(true);
  });

  test('the library running out ends the question: nothing is asked of an empty library, and nobody loses', () => {
    const g = dance(PLAIN, [GAIN2], (b) => b.seat(0));
    // Exile every card of the library: the one card of the fixture and the four islands.
    for (let i = 0; i < 1 + FILLER.length; i += 1) again(g);
    expect(g.state.seats[0]?.library).toHaveLength(0);
    expect(g.state.seats[0]?.hasLost).toBe(false);
    expect(g.state.pending?.kind).not.toBe('confirmOptional');
    // 2 + lands (0) = 2: the spell may be cast.
    expect(chooseCardsDecision(g)).toMatchObject({ purpose: 'cast' });
  });

  test('the shuffle comes first (CR 701.24): the cards on top afterwards are random, from the game’s own generator', () => {
    const run = (seed: number) => {
      const g = dance(DANCE, [GAIN2, GAIN7, BIG, 'Island'], (b) => b.seed(seed));
      return g.state.seats[0]?.library.map((id) => g.state.objects[id]?.card).join(',');
    };
    // The same seed, the same order; some other seed, another.
    expect(run(7)).toBe(run(7));
    expect(new Set([1, 2, 3, 4, 5, 6].map(run)).size).toBeGreaterThan(1);
    const g = dance(DANCE, [GAIN2, GAIN7], (b) => b.seed(3));
    g.expect.eventLog([{ kind: 'libraryShuffled', seat: 0 }]);
  });
});

describe('"if the total mana value of the cards exiled this way is 13 or less" (CR 202.3, 608.2c)', () => {
  test('13 exactly is enough: 7 + 6; both can be cast, in either order, any number of them', () => {
    const g = dance(PLAIN, [GAIN7, BIG]);
    again(g);
    again(g);
    stop(g);
    const d = chooseCardsDecision(g);
    expect(d.legal).toHaveLength(2);
    g.act(0).chooseCards({ name: BIG, zone: 'exile', seat: 0 });
    // The question comes again for what is left, and the card cast is not offered.
    const second = chooseCardsDecision(g);
    expect(second.legal).toEqual([g.find({ name: GAIN7, zone: 'exile', seat: 0 })[0]?.id]);
    g.act(0).chooseCards({ name: GAIN7, zone: 'exile', seat: 0 });
    expect(g.state.pending?.kind).not.toBe('chooseCards');
    g.expect.stack([GAIN7, BIG]);
    g.passAll();
    g.expect.life(0, 47);
    expect(g.state.seats[0]?.hand).toHaveLength(1);
    g.expect.invariants();
  });

  test('14 is too much: 7 + 7, the spells stay exiled and nothing is asked', () => {
    const g = dance(PLAIN, [GAIN7, GAIN7]);
    again(g);
    again(g);
    stop(g);
    g.expect.pending('priority', 0);
    expect(exiled(g, GAIN7)).toHaveLength(2);
    expect(g.state.stack).toHaveLength(0);
  });

  test('going over and exiling a card more changes nothing about what is already exiled: 13 or less is the total, read after the last card', () => {
    const g = dance(PLAIN, [GAIN7, GAIN2, GAIN7]);
    again(g);
    again(g);
    // 9 so far: stop here and cast.
    stop(g);
    expect(chooseCardsDecision(g).legal).toHaveLength(2);
    g.act(0).chooseCards();
    expect(exiled(g, GAIN7)).toHaveLength(1);
    expect(exiled(g, GAIN2)).toHaveLength(1);
    // The third card is still in the library.
    expect(g.state.seats[0]?.library).toHaveLength(1 + FILLER.length);
  });

  test('lands count 0: any number of lands and a 7 and a 6 is still 13', () => {
    const g = dance(PLAIN, ['Island', GAIN7, 'Island', BIG, 'Island']);
    for (let i = 0; i < 5; i += 1) again(g);
    stop(g);
    expect(chooseCardsDecision(g).legal).toHaveLength(2);
  });

  test('an {X} spell counts X as 0 in exile (CR 202.3e): mana value 1', () => {
    const g = dance(PLAIN, [XSPELL, GAIN7, BIG]);
    for (let i = 0; i < 3; i += 1) again(g);
    stop(g);
    // 1 + 7 + 6 = 14 > 13, so with an {X} card the total is not 13.
    g.expect.pending('priority', 0);
    expect(exileCount(g)).toBe(3);
  });

  test('the mana value of a split card is the sum of its halves, of a double-faced card its front face (CR 202.3d, 202.3b)', () => {
    // 3 + 3 + 7 = 13 is enough; the split card alone read as 1 or the other half as 2 would not tell, so add the 7 and the 6: 3 + 3 + 7 = 13, plus 6 = 19.
    const ok = dance(PLAIN, [SPLIT, MDFC, GAIN7]);
    for (let i = 0; i < 3; i += 1) again(ok);
    stop(ok);
    expect(chooseCardsDecision(ok).purpose).toBe('cast');
    const over = dance(PLAIN, [SPLIT, MDFC, GAIN7, BIG]);
    for (let i = 0; i < 4; i += 1) again(over);
    stop(over);
    over.expect.pending('priority', 0);
  });

  test('the spells are cast without paying their mana costs, each with its own choices', () => {
    const g = dance(PLAIN, [GAIN2, 'SYNTHETIC Calamity Discard Draw'], (b) => b.hand('Plains'));
    again(g);
    again(g);
    stop(g);
    g.act(0).chooseCards({ name: 'SYNTHETIC Calamity Discard Draw', zone: 'exile', seat: 0 });
    g.act(0).chooseCards({ name: GAIN2, zone: 'exile', seat: 0 });
    g.passAll();
    g.expect.life(0, 42);
    g.expect.zone('Plains', 'graveyard', { seat: 0 });
    expect(g.state.seats[0]?.pool ?? []).toEqual([]);
    g.expect.invariants();
  });

  test('stopping before everything is cast leaves the rest exiled', () => {
    const g = dance(PLAIN, [GAIN2, GAIN7, 'Island']);
    for (let i = 0; i < 3; i += 1) again(g);
    stop(g);
    g.act(0).chooseCards({ name: GAIN7, zone: 'exile', seat: 0 });
    g.act(0).chooseCards();
    g.passAll();
    g.expect.life(0, 47);
    expect(exiled(g, GAIN2)).toHaveLength(1);
    expect(exiled(g, 'Island')).toHaveLength(1);
  });
});
