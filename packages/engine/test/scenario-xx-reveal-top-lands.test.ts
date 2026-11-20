// "Play with the top card of your library revealed." and "You may play lands from the top of your library." (Oracle of Mul Daya, Courser of Kruphix).
// Pins: CR 401.5 (Library): some effects tell a player to play with the top card of their library revealed; if the top card changes while a spell is being cast the new
// top card is not revealed until it is cast; CR 401.6 (a card that stops being revealed is a new object); CR 305.1, 305.2, 305.2a, 305.3 (playing a land: how many,
// when); CR 604.1 (a static ability works while the permanent is on the battlefield); CR 701.20 (reveal). All cards are SYNTHETIC
// (src/cards/fixtures/synthetic-play-rules.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { createRng, determinize, getView, isFeatureSupported, validateAbility } from '../src/index';
import { scenario } from '../src/testing/index';

const OPEN = 'SYNTHETIC Open Library';
const TOP_LANDS = 'SYNTHETIC Top Lands';
const TOP_FORESTS = 'SYNTHETIC Top Forests';

/** Seat 0's first main phase; its library holds Forest (a), Island (b), Grizzly Bears (c), Mountain (d) from the top. */
function game(configure: (b: ReturnType<typeof scenario>) => unknown = () => {}) {
  const b = scenario().seat(0);
  configure(b);
  return b
    .library('Forest', { label: 'a' })
    .library('Island', { label: 'b' })
    .library('Grizzly Bears', { label: 'c' })
    .library('Mountain', { label: 'd' })
    .seat(1)
    .library('Giant Spider', { label: 'x' })
    .library('Plains', { label: 'y' })
    .at('precombatMain', { active: 0, turn: 3 })
    .build();
}

describe('CR 401.5: the top card revealed to every player', () => {
  test('with the ability both players see the top card; the second card stays hidden', () => {
    const g = game((b) => b.battlefield(OPEN));
    for (const viewer of [0, 1] as const) {
      const top = g.view(viewer).seats[0]?.libraryTop;
      expect(top?.id).toBe(g.id('a'));
      expect(top?.name).toBe('Forest');
      expect(JSON.stringify(g.view(viewer))).not.toContain(g.id('b'));
    }
    // The count of the library stays public.
    expect(g.view(1).seats[0]?.libraryCount).toBe(4);
  });

  test("an opponent's permanent reveals the opponent's library, not mine", () => {
    const g = game((b) => b.seat(1).battlefield(OPEN).seat(0));
    expect(g.view(0).seats[0]?.libraryTop).toBeUndefined();
    expect(g.view(0).seats[1]?.libraryTop?.name).toBe('Giant Spider');
    expect(g.view(1).seats[1]?.libraryTop?.name).toBe('Giant Spider');
    expect(g.view(1).seats[0]?.libraryTop).toBeUndefined();
  });

  test('without it, nothing is revealed', () => {
    const g = game();
    expect(g.view(0).seats[0]?.libraryTop).toBeUndefined();
    expect(g.view(1).seats[0]?.libraryTop).toBeUndefined();
  });

  test('"look at" alone shows the card to its controller only (CR 401.5)', () => {
    const g = game((b) => b.battlefield('SYNTHETIC Seer Lens'));
    expect(g.view(0).seats[0]?.libraryTop?.name).toBe('Forest');
    expect(g.view(1).seats[0]?.libraryTop).toBeUndefined();
  });

  test('the revealed top card is known to the opponent in a sampled game, and stays on top (determinize)', () => {
    const g = game((b) => b.battlefield(OPEN));
    for (let seed = 1; seed <= 10; seed += 1) {
      const sample = determinize(g.state, 1, createRng(seed));
      expect(sample.seats[0]?.library[0]).toBe(g.id('a'));
      expect(getView(sample, 1).seats[0]?.libraryTop?.name).toBe('Forest');
    }
  });

  test('a card the opponent cannot see is redrawn in the sample', () => {
    const g = game();
    let changed = 0;
    for (let seed = 1; seed <= 20; seed += 1) {
      const sample = determinize(g.state, 1, createRng(seed));
      if (sample.seats[0]?.library[0] !== g.id('a')) changed += 1;
    }
    expect(changed).toBeGreaterThan(5);
  });
});

describe('CR 305.1, 401.5: lands from the top of the library', () => {
  test('the land on top is played, with the land play of the turn; the next card is on top then', () => {
    const g = game((b) => b.battlefield(TOP_LANDS));
    g.expect.legal(0, { playLand: 'Forest' });
    g.act(0).playLand('Forest');
    expect(g.view(0).battlefield.some((o) => o.name === 'Forest')).toBe(true);
    expect(g.view(0).seats[0]?.landsPlayedThisTurn).toBe(1);
    expect(g.view(0).seats[0]?.libraryCount).toBe(3);
    // CR 305.2: one land a turn: the next land on top (Island) cannot be played.
    expect(g.legalActions(0).some((a) => a.kind === 'playLand')).toBe(false);
  });

  test('the land of the hand and the land on top share the one land play (CR 305.2a)', () => {
    const g = game((b) => b.battlefield(TOP_LANDS).hand('Plains'));
    g.act(0).playLand('Plains');
    expect(g.legalActions(0).some((a) => a.kind === 'playLand')).toBe(false);
  });

  test('with an additional land play, the second land is the new top card (ruling: "you can play that one too")', () => {
    const g = game((b) => b.battlefield(TOP_LANDS, 'SYNTHETIC Wandering Path'));
    g.act(0).playLand('Forest');
    g.expect.legal(0, { playLand: 'Island' });
    g.act(0).playLand('Island');
    expect(g.view(0).battlefield.some((o) => o.name === 'Island')).toBe(true);
    // The top card is a creature now.
    expect(g.legalActions(0).some((a) => a.kind === 'playLand')).toBe(false);
  });

  test('only the top card, not the second', () => {
    const g = game((b) => b.battlefield(TOP_LANDS));
    const options = g.legalActions(0).flatMap((a) => (a.kind === 'playLand' ? [a.object] : []));
    expect(options).toEqual([g.id('a')]);
  });

  test('a land filter keeps out the other lands: Forests only', () => {
    const g = game((b) => b.battlefield(TOP_FORESTS));
    g.act(0).playLand('Forest');
    // Island is on top now: it is no Forest.
    expect(g.legalActions(0).some((a) => a.kind === 'playLand')).toBe(false);
    const h = game((b) => b.battlefield(TOP_FORESTS));
    expect(h.legalActions(0).some((a) => a.kind === 'playLand')).toBe(true);
  });

  test("only on the controller's own turn", () => {
    const g = scenario()
      .seat(0)
      .battlefield(TOP_LANDS)
      .library('Forest', { label: 'a' })
      .library('Island')
      .seat(1)
      .library('Plains')
      .library('Island')
      .at('precombatMain', { active: 1, turn: 4 })
      .build();
    expect(g.legalActions(0).some((a) => a.kind === 'playLand')).toBe(false);
  });

  test('the opponent gets nothing from my permanent, and I get nothing from theirs', () => {
    const g = game((b) => b.seat(1).battlefield(TOP_LANDS).seat(0));
    expect(g.legalActions(0).some((a) => a.kind === 'playLand')).toBe(false);
  });

  test('the permission does not let the player cast the top card (it is only a land play)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(TOP_LANDS, 'Forest', 'Forest')
      .library('Grizzly Bears')
      .library('Island')
      .seat(1)
      .library('Plains')
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    expect(g.legalActions(0).some((a) => a.kind === 'castSpell')).toBe(false);
  });

  test('the player may play the top card without it being revealed, as for a cast (CR 401.5 shows it only through another ability)', () => {
    const g = game((b) => b.battlefield(TOP_LANDS));
    expect(g.view(0).seats[0]?.libraryTop).toBeUndefined();
    g.expect.legal(0, { playLand: 'Forest' });
  });
});

describe('the two abilities are supported features', () => {
  test.each([
    { kind: 'revealTopOfLibrary' },
    { kind: 'playLandsFromTopOfLibrary' },
    { kind: 'playLandsFromTopOfLibrary', lands: { types: ['land'], subtypes: ['Forest'] } },
  ] as const)('%j validates', (staticEffect) => {
    expect(isFeatureSupported(`static:${staticEffect.kind}`)).toBe(true);
    expect(validateAbility({ kind: 'static', static: staticEffect })).toEqual([]);
  });

  test('a land filter that names a zone is refused', () => {
    const issues = validateAbility({
      kind: 'static',
      static: { kind: 'playLandsFromTopOfLibrary', lands: { types: ['land'], zone: 'hand' } },
    });
    expect(issues.length).toBeGreaterThan(0);
  });
});
