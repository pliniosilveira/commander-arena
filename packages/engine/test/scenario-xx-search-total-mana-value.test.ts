// "When this creature dies, search your library for any number of creature cards with total mana value 6 or less, put them onto the battlefield, then shuffle." (the
// `search` option `totalManaValue`). Pins: CR 701.23a-b (the searcher finds cards that match and may find fewer, none included), CR 202.3 (mana value), CR 202.3e
// (an {X} in the cost of a card that is not on the stack counts as 0), CR 701.24 (shuffle), CR 608.2d (the player chooses as the effect resolves). Cards are
// SYNTHETIC (src/cards/fixtures/synthetic-hulk-search.ts) or Lightning Bolt.
import { describe, expect, test } from 'vitest';
import { applyAction, syntheticCard, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { chooseCardsDecision } from './pending-helpers';

const HULK = 'SYNTHETIC Hulking Beast';
const FREE = 'SYNTHETIC Free Beast'; // mana value 0
const TWO = 'SYNTHETIC Two Beast';
const FOUR = 'SYNTHETIC Four Beast';
const SIX = 'SYNTHETIC Six Beast';
const X1 = 'SYNTHETIC X Beast'; // {X}{1}
const XX3 = 'SYNTHETIC Double X Beast'; // {X}{X}{3}

describe('the cards are valid', () => {
  test.each([HULK, FREE, TWO, FOUR, SIX, X1, XX3])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });

  test('a total needs a positive limit, one destination of "rest" and a max of 1', () => {
    const card = syntheticCard(HULK);
    const face = card.faces[0];
    const ability = face?.abilities[0];
    if (face === undefined || ability?.kind !== 'triggered') throw new Error('no trigger');
    const withEffect = (changes: Record<string, unknown>) =>
      ({
        ...card,
        faces: [
          { ...face, abilities: [{ ...ability, effect: { ...ability.effect, ...changes } }] },
        ],
      }) as never;
    expect(validateCard(withEffect({ totalManaValue: 0 })).length).toBeGreaterThan(0);
    expect(validateCard(withEffect({ totalManaValue: 2.5 })).length).toBeGreaterThan(0);
    expect(validateCard(withEffect({ max: 2 })).length).toBeGreaterThan(0);
    expect(
      validateCard(withEffect({ destinations: [{ zone: 'battlefield', count: 1 }] })).length,
    ).toBeGreaterThan(0);
    expect(validateCard(withEffect({ sharedLandType: true })).length).toBeGreaterThan(0);
  });
});

/** Seat 0 holds the Hulk and a Bolt; the library cards in order, with the labels given. Bolt kills the 1/1, and the trigger searches. */
const game = (library: readonly (readonly [string, string])[]) => {
  const b = scenario().seat(0).battlefield(HULK, 'Mountain').hand('Lightning Bolt');
  for (const [name, label] of library) b.library(name, { label });
  return b.seat(1).library('Island').at('precombatMain').build();
};

/** Kill the Hulk; its trigger resolves up to the question. */
const dies = (g: ScenarioGame): void => {
  g.act(0).cast('Lightning Bolt', { targets: [HULK], pay: true });
  g.passAll();
  g.passAll();
};

const ALL: readonly (readonly [string, string])[] = [
  [FREE, 'free'],
  [TWO, 'two'],
  [FOUR, 'four'],
  [SIX, 'six'],
  [X1, 'x1'],
  [XX3, 'xx3'],
];

describe('the question', () => {
  test('asks for any number of creature cards, with the mana value of each and the limit', () => {
    const g = game(ALL);
    dies(g);
    g.expect.pending('chooseCards', 0);
    const d = chooseCardsDecision(g);
    expect(d.purpose).toBe('search');
    expect(d.min).toBe(0);
    expect(d.max).toBe(6);
    expect(d.prompt).toBe(
      'Choose any number of creature cards with total mana value 6 or less; they go onto the battlefield. Then your library is shuffled.',
    );
    expect(d.totalManaValue?.limit).toBe(6);
  });

  test('an {X} in the mana cost counts as 0 in the library (CR 202.3e)', () => {
    const g = game(ALL);
    dies(g);
    const values = chooseCardsDecision(g).totalManaValue?.values ?? {};
    expect(values[g.id('free')]).toBe(0);
    expect(values[g.id('two')]).toBe(2);
    expect(values[g.id('four')]).toBe(4);
    expect(values[g.id('six')]).toBe(6);
    expect(values[g.id('x1')]).toBe(1);
    expect(values[g.id('xx3')]).toBe(3);
  });
});

describe('what may be found', () => {
  test('several cards within the total come onto the battlefield, and the library is shuffled', () => {
    const g = game(ALL);
    dies(g);
    const mark = g.mark();
    // 0 + 2 + 1 + 3 = 6, where the two {X} cards are worth only what is not X.
    g.act(0).chooseCards('free', 'two', 'x1', 'xx3');
    for (const name of [FREE, TWO, X1, XX3]) g.expect.zone(name, 'battlefield', { seat: 0 });
    g.expect.librarySize(0, 2);
    g.expect.pending('priority', 0);
    expect(g.eventsSince(mark).map((e) => e.kind)).toContain('libraryShuffled');
    g.expect.invariants();
  });

  test('a total of exactly the limit is allowed: a 2 and a 4', () => {
    const g = game(ALL);
    dies(g);
    g.act(0).chooseCards('two', 'four');
    g.expect.zone(TWO, 'battlefield', { seat: 0 });
    g.expect.zone(FOUR, 'battlefield', { seat: 0 });
  });

  test('a total over the limit is not an answer, and the question stays', () => {
    const g = game(ALL);
    dies(g);
    const ok = (...labels: string[]): boolean =>
      applyAction(g.state, 0, { kind: 'chooseCards', objects: labels.map((l) => g.id(l)) }).ok;
    expect(ok('four', 'two', 'x1')).toBe(false); // 7
    expect(ok('six', 'x1')).toBe(false); // 7
    expect(ok('four', 'two', 'free')).toBe(true); // 6
    const r = applyAction(g.state, 0, {
      kind: 'chooseCards',
      objects: [g.id('four'), g.id('two'), g.id('x1')],
    });
    expect(r.ok).toBe(false);
    g.expect.pending('chooseCards', 0);
    g.expect.zone(FOUR, 'library', { seat: 0 });
  });

  test('the player may find none; the library is still shuffled (CR 701.23b)', () => {
    const g = game(ALL);
    dies(g);
    const mark = g.mark();
    g.act(0).chooseCards();
    g.expect.librarySize(0, 6);
    expect(g.eventsSince(mark).map((e) => e.kind)).toEqual(
      expect.arrayContaining(['librarySearched', 'libraryShuffled']),
    );
  });

  test('any number of free cards: only their mana value (0) counts', () => {
    const many: (readonly [string, string])[] = Array.from(
      { length: 8 },
      (_, i) => [FREE, `free${i}`] as const,
    );
    const g = game([...many, [SIX, 'six']]);
    dies(g);
    g.act(0).chooseCards(...many.map(([, label]) => label), 'six');
    g.expect.zone(FREE, 'battlefield', { seat: 0, count: 8 });
    g.expect.zone(SIX, 'battlefield', { seat: 0 });
  });

  test('cards that are not creatures are not offered', () => {
    const g = game([
      [TWO, 'two'],
      ['Forest', 'forest'],
    ]);
    dies(g);
    expect(chooseCardsDecision(g).legal).toEqual([g.id('two')]);
  });

  test('the answers listed are all within the limit, the empty one first, and each is accepted', () => {
    const g = game(ALL);
    dies(g);
    const answers = g.legalActions(0).flatMap((a) => (a.kind === 'chooseCards' ? [a.objects] : []));
    expect(answers[0]).toEqual([]);
    expect(answers.length).toBeGreaterThan(10);
    const values = chooseCardsDecision(g).totalManaValue?.values ?? {};
    for (const objects of answers) {
      expect(objects.reduce((n, id) => n + (values[id] ?? 0), 0)).toBeLessThanOrEqual(6);
      expect(applyAction(g.state, 0, { kind: 'chooseCards', objects }).ok).toBe(true);
    }
  });
});
