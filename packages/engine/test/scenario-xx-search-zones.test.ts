// "Search your graveyard, hand, and/or library for a card named X and put it onto the battlefield. If you search your library this way, shuffle. Activate only if there are six or more
// creature cards in your graveyard." (issue 104): the `search` option `zones`, a card of a given name (`ObjectFilter.named`), and the restriction `activateOnlyIf`.
// Pins: CR 701.23a (look at all the cards of the zone), 701.23b (a stated quality: the player need not find the card), 701.23c (a search that finds nothing is still a search),
// 701.24a (shuffle), 602.5b (an activation restriction), 110.2a (the card enters under the control of the player who puts it there), 303.4f (an Aura put onto the battlefield chooses what it enchants).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-search-zones.ts); the real card is played in packages/cards/test/convert-grammar-engine-search-zones.test.ts.
import { describe, expect, test } from 'vitest';
import { getLegalActions, syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const SEEKER = 'SYNTHETIC Zone Seeker';
const BEARS = 'Grizzly Bears';
const ELVES = 'Llanowar Elves';
const LIBRARY = ['Swamp', 'Swamp', BEARS, 'Swamp'];

/** Six creature cards in the graveyard (the restriction) and the Bears wherever the test puts them. */
function board(where: { graveyard?: boolean; hand?: boolean; library?: boolean }, six = 6) {
  const library = where.library === true ? LIBRARY : ['Swamp', 'Swamp', 'Swamp'];
  const b = scenario()
    .define(syntheticCard(SEEKER))
    .seat(0)
    .library(...library)
    .battlefield('Swamp', 'Swamp', SEEKER)
    .graveyard(...Array.from({ length: six }, () => ELVES));
  if (where.graveyard === true) b.graveyard(BEARS);
  if (where.hand === true) b.hand(BEARS);
  return b.seat(1).library('Swamp', 'Swamp').at('precombatMain', { active: 0 }).build();
}

describe('the card is valid', () => {
  test(SEEKER, () => {
    expect(validateCard(syntheticCard(SEEKER))).toEqual([]);
  });

  test('zones are two or more different ones, with no shuffle in the search', () => {
    const base = syntheticCard(SEEKER);
    const face = base.faces[0];
    const ability = face?.abilities[0];
    if (face === undefined || ability?.kind !== 'activated') throw new Error('no ability');
    const search = ability.effect.kind === 'sequence' ? ability.effect.effects[0] : undefined;
    if (search?.kind !== 'search') throw new Error('no search');
    const with_ = (patch: Record<string, unknown>) => ({
      ...base,
      faces: [
        {
          ...face,
          abilities: [
            {
              ...ability,
              effect: { kind: 'sequence', effects: [{ ...search, ...patch }] },
            },
          ],
        },
      ],
    });
    expect(validateCard(with_({ zones: ['hand', 'library'] }) as never)).toEqual([]);
    expect(validateCard(with_({ zones: ['library'] }) as never).length).toBeGreaterThan(0);
    expect(validateCard(with_({ zones: ['hand', 'hand'] }) as never).length).toBeGreaterThan(0);
    expect(validateCard(with_({ zones: ['hand', 'exile'] }) as never).length).toBeGreaterThan(0);
    expect(validateCard(with_({ shuffle: true }) as never).length).toBeGreaterThan(0);
    // Tower Winder (CR 701.20a): the card found may be revealed; the shuffle is still another sentence.
    expect(validateCard(with_({ reveal: true }) as never)).toEqual([]);
  });
});

describe('Activate only if there are six or more creature cards in your graveyard (CR 602.5b)', () => {
  test('with five the ability cannot be activated', () => {
    const g = board({ hand: true }, 5);
    const activates = getLegalActions(g.state, 0).filter((a) => a.kind === 'activate');
    expect(activates).toEqual([]);
  });

  test('with six it can', () => {
    const g = board({ graveyard: true });
    g.act(0).activate(SEEKER, { pay: true });
    g.passAll();
    g.act(0).chooseCards(g.id(BEARS));
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
  });
});

describe('the card is found in the graveyard, the hand or the library (CR 701.23a)', () => {
  test('in the graveyard alone: it enters the battlefield and the library is not searched or shuffled', () => {
    const g = board({ graveyard: true, library: false });
    g.act(0).activate(SEEKER, { pay: true });
    g.passAll();
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards(g.id(BEARS));
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.noEvent({ kind: 'librarySearched' }, { since: 0 });
    g.expect.noEvent({ kind: 'libraryShuffled' }, { since: 0 });
    g.expect.invariants();
  });

  test('in the hand alone: the same', () => {
    const g = board({ hand: true });
    g.act(0).activate(SEEKER, { pay: true });
    g.passAll();
    g.act(0).chooseCards(g.id(BEARS));
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.noEvent({ kind: 'libraryShuffled' }, { since: 0 });
  });

  test('in the library: it is found, and "if you search your library this way" shuffles', () => {
    const g = board({ library: true });
    g.act(0).activate(SEEKER, { pay: true });
    g.passAll();
    g.act(0).chooseCards(g.id(BEARS));
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.eventLog(
      [
        { kind: 'librarySearched', seat: 0, found: 1 },
        { kind: 'libraryShuffled', seat: 0 },
      ],
      { since: 0 },
    );
    g.expect.invariants();
  });

  test('one choice lists the cards of all three zones, and only the card of that name (CR 701.23b)', () => {
    const g = board({ graveyard: true, hand: true, library: true });
    g.act(0).activate(SEEKER, { pay: true });
    g.passAll();
    const d = g.state.pending;
    if (d?.kind !== 'chooseCards') throw new Error('no choice');
    expect(d.legal).toHaveLength(3);
    expect(d.min).toBe(0);
    expect(d.max).toBe(1);
    expect(d.prompt).toContain('named Grizzly Bears');
    expect(d.prompt).toContain('graveyard, hand, and/or library');
  });

  test('the player may find nothing, and a search of the library that finds nothing still shuffles (CR 701.23b, 701.23c)', () => {
    const g = board({ graveyard: true, hand: true, library: true });
    g.act(0).activate(SEEKER, { pay: true });
    g.passAll();
    g.act(0).chooseCards();
    g.expect.zone(BEARS, 'battlefield', { seat: 0, count: 0 });
    g.expect.eventLog(
      [
        { kind: 'librarySearched', seat: 0, found: 0 },
        { kind: 'libraryShuffled', seat: 0 },
      ],
      { since: 0 },
    );
  });

  test('no such card anywhere: nothing is asked, the library was searched and is shuffled', () => {
    const g = board({});
    g.act(0).activate(SEEKER, { pay: true });
    g.passAll();
    g.expect.pending('priority', 0);
    g.expect.eventLog(
      [
        { kind: 'librarySearched', seat: 0, found: 0 },
        { kind: 'libraryShuffled', seat: 0 },
      ],
      { since: 0 },
    );
    g.expect.invariants();
  });

  test('the opponent sees nothing of the choice', () => {
    const g = board({ graveyard: true, hand: true, library: true });
    g.act(0).activate(SEEKER, { pay: true });
    g.passAll();
    const view = g.view(1);
    expect(view.pending).toBeNull();
    expect(view.pendingCards).toBeUndefined();
    expect(view.waitingOn?.purpose).toBe('search');
  });
});

describe('a card found by name that is an Aura asks what it enchants (CR 303.4f)', () => {
  test('the name is data: the same search finds an Aura and it enters attached to a creature', () => {
    const seeker = syntheticCard(SEEKER);
    const face = seeker.faces[0];
    const ability = face?.abilities[0];
    if (face === undefined || ability?.kind !== 'activated' || ability.effect.kind !== 'sequence') {
      throw new Error('no ability');
    }
    const [search, ...rest] = ability.effect.effects;
    if (search?.kind !== 'search') throw new Error('no search');
    const byName = {
      ...seeker,
      faces: [
        {
          ...face,
          abilities: [
            {
              ...ability,
              effect: {
                kind: 'sequence',
                effects: [{ ...search, filter: { named: 'SYNTHETIC Might Aura' } }, ...rest],
              },
            },
          ],
        },
      ],
    };
    expect(validateCard(byName as never)).toEqual([]);
    const g = scenario()
      .define(byName as never)
      .define(syntheticCard('SYNTHETIC Might Aura'))
      .seat(0)
      .library('Swamp', 'Swamp')
      .hand('SYNTHETIC Might Aura')
      .battlefield('Swamp', 'Swamp', SEEKER, BEARS)
      .graveyard(...Array.from({ length: 6 }, () => ELVES))
      .seat(1)
      .library('Swamp', 'Swamp')
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).activate(SEEKER, { pay: true });
    g.passAll();
    g.act(0).chooseCards(g.id('SYNTHETIC Might Aura'));
    // One creature to enchant: the engine chooses it (CR 303.4f), and the Aura enters attached to it.
    g.expect.attached('SYNTHETIC Might Aura', BEARS);
    g.expect.pt(BEARS, 4, 4);
    g.expect.invariants();
  });
});
