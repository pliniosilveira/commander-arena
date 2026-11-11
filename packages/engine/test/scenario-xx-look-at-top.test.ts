// "You may look at the top card of your library any time." (D-125).
// Pins: CR 401.5 (Library): some effects say a player may look at the top card of their library; if the top
// card changes while a spell is being cast, the new top card can't be looked at until the spell becomes cast;
// CR 401.2 (nobody may know the order of a library, except as an effect lets them); CR 604.1 (a static ability
// works while the permanent is on the battlefield). All cards are SYNTHETIC
// (src/cards/fixtures/synthetic-play-rules.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import type { Ability, GameState } from '../src/index';
import {
  getView,
  isFeatureSupported,
  stateHash,
  validateAbility,
  validateCard,
} from '../src/index';
import { scenario } from '../src/testing/index';

const LENS = 'SYNTHETIC Seer Lens';
const SCOUT = 'SYNTHETIC Seer Scout';

/** Seat 0's first main phase; its library holds Grizzly Bears (a), Island (b), Forest (c) from the top. */
function game(configure: (b: ReturnType<typeof scenario>) => unknown = () => {}) {
  const b = scenario().seat(0);
  configure(b);
  return b
    .library('Grizzly Bears', { label: 'a' })
    .library('Island', { label: 'b' })
    .library('Forest', { label: 'c' })
    .seat(1)
    .library('Giant Spider', { label: 'x' })
    .library('Plains', { label: 'y' })
    .at('precombatMain', { active: 0, turn: 3 })
    .build();
}

describe('CR 401.5: who may look at the top card', () => {
  test('without the ability nobody sees a library card, the owner included (the baseline)', () => {
    const g = game();
    expect(g.view(0).seats[0]?.libraryTop).toBeUndefined();
    expect(g.view(0).seats[1]?.libraryTop).toBeUndefined();
    expect(g.view(1).seats[1]?.libraryTop).toBeUndefined();
  });

  test('with it on the battlefield the controller sees the top card, with its characteristics', () => {
    const g = game((b) => b.battlefield(LENS));
    const top = g.view(0).seats[0]?.libraryTop;
    expect(top?.id).toBe(g.id('a'));
    expect(top?.name).toBe('Grizzly Bears');
    expect(top?.zone).toBe('library');
    expect(top?.types).toEqual(['creature']);
    expect(top?.power).toBe(2);
    // Only the top card: the library count is public, the second card is not.
    expect(g.view(0).seats[0]?.libraryCount).toBe(3);
    expect(JSON.stringify(g.view(0))).not.toContain(g.id('b'));
  });

  test('a creature with the ability does the same as an enchantment', () => {
    const g = game((b) => b.battlefield(SCOUT));
    expect(g.view(0).seats[0]?.libraryTop?.name).toBe('Grizzly Bears');
  });

  test('the opponent never sees it: not in the view, the ids, or the names', () => {
    const g = game((b) => b.battlefield(LENS));
    const view = g.view(1);
    expect(view.seats[0]?.libraryTop).toBeUndefined();
    const text = JSON.stringify(view);
    expect(text).not.toContain(g.id('a'));
    expect(text).not.toContain('Grizzly Bears');
    expect(view.seats[0]?.libraryCount).toBe(3);
  });

  test("an opponent's permanent gives me nothing: it is its controller who looks", () => {
    const g = game((b) => b.seat(1).battlefield(LENS).seat(0));
    expect(g.view(0).seats[0]?.libraryTop).toBeUndefined();
    expect(g.view(0).seats[1]?.libraryTop).toBeUndefined();
    // Seat 1 sees its own top card and not seat 0's.
    expect(g.view(1).seats[1]?.libraryTop?.name).toBe('Giant Spider');
    expect(g.view(1).seats[0]?.libraryTop).toBeUndefined();
  });

  test('each player with the ability sees their own top card only', () => {
    const g = game((b) => b.battlefield(LENS).seat(1).battlefield(LENS).seat(0));
    expect(g.view(0).seats[0]?.libraryTop?.name).toBe('Grizzly Bears');
    expect(g.view(0).seats[1]?.libraryTop).toBeUndefined();
    expect(g.view(1).seats[1]?.libraryTop?.name).toBe('Giant Spider');
    expect(g.view(1).seats[0]?.libraryTop).toBeUndefined();
    expect(JSON.stringify(g.view(0))).not.toContain('Giant Spider');
    expect(JSON.stringify(g.view(1))).not.toContain('Grizzly Bears');
  });

  test('several sources do the same as one', () => {
    const g = game((b) => b.battlefield(LENS, SCOUT, LENS));
    expect(g.view(0).seats[0]?.libraryTop?.name).toBe('Grizzly Bears');
  });

  test('in the hand, the graveyard or the library the card does nothing: only the battlefield counts', () => {
    const g = game((b) => b.hand(LENS).graveyard(SCOUT));
    expect(g.view(0).seats[0]?.libraryTop).toBeUndefined();
  });

  test('an empty library has no top card to see', () => {
    const g = scenario()
      .seat(0)
      .battlefield(LENS)
      .seat(1)
      .library('Plains')
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    expect(g.view(0).seats[0]?.libraryCount).toBe(0);
    expect(g.view(0).seats[0]?.libraryTop).toBeUndefined();
  });
});

describe('CR 604.1: the view follows the board and the library', () => {
  test('when the top card is drawn the next one is shown', () => {
    const g = game((b) => b.battlefield(LENS));
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    // Seat 0 drew Grizzly Bears in its next turn: the second card is the top card now.
    g.expect.step('precombatMain', { active: 0, turn: 5 });
    expect(g.view(0).seats[0]?.libraryTop?.name).toBe('Island');
    expect(g.view(0).seats[0]?.hand?.map((c) => c.name)).toContain('Grizzly Bears');
  });

  test('when the source leaves the battlefield the top card is hidden again', () => {
    const b = scenario()
      .seat(0)
      .battlefield(SCOUT)
      .library('Grizzly Bears')
      .seat(1)
      .hand('Lightning Bolt')
      .battlefield('Mountain');
    const g = b.at('precombatMain', { active: 0, turn: 3, priority: 0 }).build();
    expect(g.view(0).seats[0]?.libraryTop?.name).toBe('Grizzly Bears');
    g.act(0).pass();
    g.act(1).cast('Lightning Bolt', { targets: [SCOUT], pay: true });
    g.passAll();
    g.expect.zone(SCOUT, 'graveyard', { seat: 0 });
    expect(g.view(0).seats[0]?.libraryTop).toBeUndefined();
  });

  test('a source that comes in later shows the top card from then on', () => {
    const g = game((b) => b.hand(LENS).pool('UU'));
    expect(g.view(0).seats[0]?.libraryTop).toBeUndefined();
    g.act(0).cast(LENS, { pay: true });
    g.passAll();
    g.expect.zone(LENS, 'battlefield', { seat: 0 });
    expect(g.view(0).seats[0]?.libraryTop?.name).toBe('Grizzly Bears');
  });
});

describe('CR 401.5: a top card that changes during a cast stays hidden until the spell is cast', () => {
  /** Seat 0 is paying for a spell: the casting transaction is open. */
  function casting() {
    const g = game((b) => b.battlefield(LENS).hand('Grizzly Bears').pool('GG'));
    g.act(0).cast('Grizzly Bears');
    g.expect.pending('payMana', 0);
    expect(g.state.casting).not.toBeNull();
    return g;
  }

  /** The state with the top two cards of seat 0's library swapped, as an effect might do mid-cast. */
  function swapTop(state: GameState): GameState {
    const [first, second, ...rest] = state.seats[0]?.library ?? [];
    if (first === undefined || second === undefined) throw new Error('library too short');
    return {
      ...state,
      seats: state.seats.map((s) => (s.id === 0 ? { ...s, library: [second, first, ...rest] } : s)),
    };
  }

  test('the top card that was there when the cast began can still be looked at', () => {
    const g = casting();
    expect(getView(g.state, 0).seats[0]?.libraryTop?.name).toBe('Grizzly Bears');
  });

  test('a new top card is not shown while the cast goes on', () => {
    const g = casting();
    const changed = swapTop(g.state);
    expect(changed.seats[0]?.library[0]).toBe(g.id('b'));
    const view = getView(changed, 0);
    expect(view.seats[0]?.libraryTop).toBeUndefined();
    expect(JSON.stringify(view)).not.toContain('"Island"');
  });

  test('once the spell is cast the new top card is shown', () => {
    const g = game((b) => b.battlefield(LENS).hand('Grizzly Bears').pool('GG'));
    g.act(0).cast('Grizzly Bears', { pay: true });
    expect(g.state.casting).toBeNull();
    expect(getView(swapTop(g.state), 0).seats[0]?.libraryTop?.name).toBe('Island');
  });

  test('a cast that is taken back shows the old top card again', () => {
    const g = casting();
    g.act(0).cancel();
    expect(g.state.casting).toBeNull();
    expect(g.view(0).seats[0]?.libraryTop?.name).toBe('Grizzly Bears');
  });
});

describe('hidden information: nothing is revealed, nothing is logged', () => {
  test('looking changes nothing: the hash is the same, and the state holds no trace of it', () => {
    const g = game((b) => b.battlefield(LENS));
    const before = g.hash();
    g.view(0);
    g.view(1);
    expect(g.hash()).toBe(before);
    const without = game();
    // The only difference between the two states is the permanent itself.
    expect(stateHash(without.state)).not.toBe(before);
  });

  test('no event or logged action of a turn in which the card stays in the library names it', () => {
    const g = game((b) => b.battlefield(LENS).hand('Forest'));
    g.act(0).playLand('Forest');
    g.advanceTo('endOfCombat');
    g.advanceTo('end');
    const text = JSON.stringify({ events: g.events, log: g.log });
    // The three cards of seat 0's library were never in a zone anyone could see.
    for (const label of ['a', 'b', 'c']) expect(text, label).not.toContain(g.id(label));
    expect(text).not.toContain('Grizzly Bears');
    // And seat 1's view of the whole position names none of them either.
    const theirs = JSON.stringify(g.view(1));
    expect(theirs).not.toContain('Grizzly Bears');
    expect(theirs).not.toContain(g.id('a'));
  });

  test('the same actions from the same position give the same hash, whoever looked', () => {
    const play = (look: boolean) => {
      const g = game((b) => b.battlefield(LENS).hand('Forest'));
      if (look) {
        g.view(0);
        g.view(1);
      }
      g.act(0).playLand('Forest');
      if (look) g.view(0);
      g.advanceTo('precombatMain', { turn: 'next' });
      return { hash: g.hash(), log: g.log.length };
    };
    expect(play(true)).toEqual(play(false));
  });
});

describe('validation and features', () => {
  const ability: Ability = { kind: 'static', static: { kind: 'lookAtTopOfLibrary' } };

  test('the ability is valid and the feature is supported', () => {
    expect(validateAbility(ability)).toEqual([]);
    expect(isFeatureSupported('static:lookAtTopOfLibrary')).toBe(true);
  });

  test.each([LENS, SCOUT])('the fixture %s is a valid card', (name) => {
    const def = scenario()
      .seat(0)
      .battlefield(name)
      .build()
      .state.definitions.find((d) => d.name === name);
    expect(def && validateCard(def)).toEqual([]);
  });

  test('a variant the engine does not know is refused with a reason', () => {
    const unknown = {
      kind: 'static',
      static: { kind: 'playWithTopCardRevealed' },
    } as unknown as Ability;
    expect(validateAbility(unknown).length).toBeGreaterThan(0);
    expect(isFeatureSupported('static:playWithTopCardRevealed' as never)).toBe(false);
  });
});
