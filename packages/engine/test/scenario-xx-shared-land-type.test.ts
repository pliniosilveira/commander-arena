// "{2}, {T}, Sacrifice this land: Search your library for up to two basic land cards that share a land type, put them onto the battlefield tapped, then shuffle." (D-258, the
// Bruna deck): the `search` option `sharedLandType`, a condition on the cards found together. Pins: CR 701.23a-b (the searcher finds cards that match and may find fewer),
// CR 205.3i (land types), CR 205.4c (a basic land), CR 701.24 (shuffle), CR 608.2d (the player chooses as the effect resolves), CR 602.2 (the cost, {2}, {T} and a
// sacrifice of the land itself, is paid before the effect happens). Cards are SYNTHETIC (src/cards/fixtures/synthetic-bruna-search.ts) or basic lands.
import { describe, expect, test } from 'vitest';
import { applyAction, syntheticCard, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { chooseCardsDecision } from './pending-helpers';

const LANDSCAPE = 'SYNTHETIC Twin Landscape';
const BOG_FOREST = 'SYNTHETIC Bog Forest'; // a basic land that is a Swamp and a Forest

describe('the cards are valid', () => {
  test.each([LANDSCAPE, BOG_FOREST])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

/** The land and two Plains to pay {2}; the library cards in order, with the labels given. */
const game = (library: readonly (readonly [string, string])[]) => {
  const b = scenario().seat(0).battlefield(LANDSCAPE, 'Plains', 'Plains');
  for (const [name, label] of library) b.library(name, { label });
  return b.seat(1).library('Island').build();
};

/** Pay {2}, tap and sacrifice the land; the ability resolves up to the question. */
const search = (g: ScenarioGame): void => {
  g.act(0).activate(LANDSCAPE, { pay: true });
  g.passAll();
};

const FOUR: readonly (readonly [string, string])[] = [
  ['Forest', 'forest1'],
  ['Plains', 'plains'],
  ['Forest', 'forest2'],
  ['Mountain', 'mountain'],
];

describe('the cost, and the question', () => {
  test('the land is sacrificed and the mana spent before the effect: the ability is on the stack without it', () => {
    const g = game(FOUR);
    g.act(0).activate(LANDSCAPE, { pay: true });
    g.expect.zone(LANDSCAPE, 'graveyard', { seat: 0 });
    g.expect.stack([`${LANDSCAPE} (ability)`]);
  });

  test('asks for up to two basic land cards, and lists the land types of each card that may be found', () => {
    const g = game(FOUR);
    search(g);
    g.expect.pending('chooseCards', 0);
    const d = chooseCardsDecision(g);
    expect(d.purpose).toBe('search');
    expect(d.min).toBe(0);
    expect(d.max).toBe(2);
    expect(d.prompt).toBe(
      'Choose up to two basic land cards that share a land type; the first two go onto the battlefield tapped. Then your library is shuffled.',
    );
    expect(d.shareLandType).toEqual({
      [g.id('forest1')]: ['Forest'],
      [g.id('plains')]: ['Plains'],
      [g.id('forest2')]: ['Forest'],
      [g.id('mountain')]: ['Mountain'],
    });
    expect([...d.legal].sort()).toEqual(Object.keys(d.shareLandType ?? {}).sort());
  });
});

describe('what may be found', () => {
  test('two lands of one type come onto the battlefield tapped, and the library is shuffled', () => {
    const g = game(FOUR);
    search(g);
    const mark = g.mark();
    g.act(0).chooseCards('forest1', 'forest2');
    g.expect.zone('Forest', 'battlefield', { seat: 0, count: 2 });
    g.expect.tapped('Forest[0]', true);
    g.expect.tapped('Forest[1]', true);
    g.expect.librarySize(0, 2);
    g.expect.pending('priority', 0);
    expect(g.eventsSince(mark).map((e) => e.kind)).toContain('libraryShuffled');
    g.expect.invariants();
  });

  test('two lands of different types are not an answer, and the question stays (CR 205.3i)', () => {
    const g = game(FOUR);
    search(g);
    const d = chooseCardsDecision(g);
    const r = applyAction(g.state, 0, {
      kind: 'chooseCards',
      objects: [g.id('forest1'), g.id('plains')],
    });
    expect(r.ok).toBe(false);
    expect(d.kind).toBe('chooseCards');
    g.expect.pending('chooseCards', 0);
    g.expect.zone('Plains', 'library', { seat: 0 });
  });

  test('one card, or none, is an answer: the player may find fewer (CR 701.23b)', () => {
    const g = game(FOUR);
    search(g);
    g.act(0).chooseCards('mountain');
    g.expect.zone('Mountain', 'battlefield', { seat: 0 });
    g.expect.tapped('Mountain', true);
    const none = game(FOUR);
    search(none);
    none.act(0).chooseCards();
    none.expect.librarySize(0, 4);
    none.expect.eventLog([
      { kind: 'librarySearched', seat: 0, found: 0 },
      { kind: 'libraryShuffled', seat: 0 },
    ]);
  });

  test('the answers listed are the empty one, each single card and each pair of one type, and no other', () => {
    const g = game(FOUR);
    search(g);
    const answers = g
      .legalActions(0)
      .flatMap((a) => (a.kind === 'chooseCards' ? [a.objects.length] : []));
    // Forest, Plains, Forest, Mountain: the empty answer, four single cards, one pair (the two Forests).
    expect(answers.filter((n) => n === 0)).toHaveLength(1);
    expect(answers.filter((n) => n === 1)).toHaveLength(4);
    expect(answers.filter((n) => n === 2)).toHaveLength(1);
  });

  test('a land with two land types shares either one with a land of that type, and only those', () => {
    const g = game([
      ['Forest', 'forest'],
      ['Swamp', 'swamp'],
      [BOG_FOREST, 'bog'],
      ['Plains', 'plains'],
    ]);
    search(g);
    const d = chooseCardsDecision(g);
    expect(d.shareLandType?.[g.id('bog')]).toEqual(['Swamp', 'Forest']);
    const ok = (a: string, b: string): boolean =>
      applyAction(g.state, 0, { kind: 'chooseCards', objects: [g.id(a), g.id(b)] }).ok;
    expect(ok('bog', 'forest')).toBe(true);
    expect(ok('bog', 'swamp')).toBe(true);
    expect(ok('bog', 'plains')).toBe(false);
    expect(ok('forest', 'swamp')).toBe(false);
    // The pairs the engine lists are exactly these two.
    const pairs = g
      .legalActions(0)
      .flatMap((a) => (a.kind === 'chooseCards' && a.objects.length === 2 ? [a.objects] : []));
    expect(pairs).toHaveLength(2);
  });

  test('a nonbasic land is not offered; the search is for basic land cards', () => {
    const g = game([
      ['Forest', 'forest'],
      [LANDSCAPE, 'landscape'],
    ]);
    search(g);
    expect(chooseCardsDecision(g).legal).toEqual([g.id('forest')]);
  });
});
