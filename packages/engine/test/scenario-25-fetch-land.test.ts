// Scenario 25 (SPEC 12): a fetch land.
// Pins: CR 602.2 (Activating Activated Abilities): the costs ({T} and sacrificing the land) are paid
// as it is activated, and the ability goes on the stack; CR 405.1 / 117.3c: players get priority and
// may respond, and the ability resolves only after every response; CR 605.1a: it is not a mana
// ability (it doesn't produce mana), so it uses the stack; CR 701.23 (Search): the controller looks
// through the library, may find fewer cards (CR 701.23b), and the card goes to the battlefield
// tapped; CR 701.24 (Shuffle) / 701.24b: the library is shuffled afterwards, without the found card;
// CR 113.7a: the ability exists on the stack independently of its source, which is already in the
// graveyard; CR 103.2 / D-024 (determinism): the shuffle uses the PRNG stored in the state.
// The land is SYNTHETIC (invented, defined in this file): "{T}, Sacrifice this land: Search your
// library for a basic land card, put it onto the battlefield tapped, then shuffle."
import { describe, expect, test } from 'vitest';
import { type Action, getLegalActions } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const FETCH = 'SYNTHETIC Fetch Land';
const BOLT = 'Lightning Bolt';

const fetchLand = singleFaceCard({
  name: FETCH,
  manaCost: null,
  types: ['land'],
  colors: [],
  colorIdentity: [],
  oracleText:
    '{T}, Sacrifice this land: Search your library for a basic land card, put it onto the ' +
    'battlefield tapped, then shuffle.',
  abilities: [
    {
      kind: 'activated',
      cost: [{ kind: 'tap' }, { kind: 'sacrifice', what: { kind: 'this' } }],
      effect: {
        kind: 'search',
        player: { kind: 'you' },
        filter: { types: ['land'], supertypes: ['basic'] },
        max: 1,
        destinations: [{ zone: 'battlefield', tapped: true, count: 1 }],
        reveal: false,
        shuffle: true,
      },
    },
  ],
});

const LIBRARY = [
  'Island',
  'Forest',
  'Grizzly Bears',
  'Plains',
  'Swamp',
  'Llanowar Elves',
  'Mountain',
  'Forest',
] as const;

function build(seed = 5) {
  const b = scenario().seed(seed).seat(0).battlefield(FETCH).define(fetchLand);
  for (const [i, name] of LIBRARY.entries()) b.library(name, { label: `lib${i}` });
  return b.seat(1).hand(BOLT).battlefield('Mountain').build();
}

const libraryOrder = (g: ScenarioGame) =>
  g.state.seats[0]?.library.map((id) => g.state.objects[id]?.card);

describe('SPEC scenario 25: a fetch land uses the stack (CR 602.2, 405.1)', () => {
  test('activating it pays the costs at once and puts the ability on the stack', () => {
    const g = build();
    const mark = g.mark();
    g.act(0).activate(FETCH);
    // Sacrificed as a cost: the land is already in the graveyard, the search hasn't happened.
    g.expect.zone(FETCH, 'graveyard', { seat: 0 });
    g.expect.stack([`${FETCH} (ability)`]);
    g.expect.librarySize(0, 8);
    g.expect.noEvent({ kind: 'librarySearched' }, { since: mark });
    g.expect.noEvent({ kind: 'libraryShuffled' }, { since: mark });
    g.expect.eventLog([{ kind: 'abilityActivated' }], { since: mark });
    g.expect.pending('priority', 0);
  });

  test('it is not a mana ability: it makes no mana and cannot be activated for mana', () => {
    const g = build();
    // No mana ability is offered for it, only the ordinary activation (the DSL refuses to tap it).
    const land = g.id(FETCH);
    const legal = getLegalActions(g.state, 0);
    expect(legal.some((a: Action) => a.kind === 'activateAbility' && a.source === land)).toBe(
      false,
    );
    expect(legal.some((a: Action) => a.kind === 'activate' && a.object === land)).toBe(true);
    expect(g.object(FETCH).zone).toBe('battlefield');
    g.act(0).activate(FETCH);
    g.expect.pool(0, '');
    g.expect.noEvent({ kind: 'manaAdded' });
    g.expect.stack([`${FETCH} (ability)`]);
  });

  test('the opponent can respond: the response resolves first, the search after', () => {
    const g = build();
    g.act(0).activate(FETCH);
    g.act(0).pass();
    g.act(1).cast(BOLT, { targets: [{ player: 0 }], pay: true });
    g.expect.stack([BOLT, `${FETCH} (ability)`]);
    const mark = g.mark();
    // The Bolt resolves; the ability is still waiting, with the library untouched.
    g.act(1).pass();
    g.act(0).pass();
    g.expect.life(0, 37);
    g.expect.stack([`${FETCH} (ability)`]);
    g.expect.librarySize(0, 8);
    g.expect.noEvent({ kind: 'librarySearched' }, { since: mark });
    // Seat 0 (the active player) has priority again; now the ability resolves and asks which
    // basic land to take.
    g.act(0).pass();
    g.act(1).pass();
    g.expect.pending('chooseCards', 0);
  });
});

describe('SPEC scenario 25: the search and the shuffle (CR 701.23, 701.24)', () => {
  function resolveSearch(g: ScenarioGame, pick: string) {
    g.act(0).activate(FETCH);
    g.act(0).pass();
    g.act(1).pass();
    g.expect.pending('chooseCards', 0);
    const mark = g.mark();
    g.act(0).chooseCards(pick);
    return mark;
  }

  test('the chosen basic land enters tapped, and the library is shuffled afterwards', () => {
    const g = build();
    const mark = resolveSearch(g, 'lib3');
    g.expect.zone('Plains', 'battlefield', { seat: 0 });
    g.expect.tapped('Plains', true);
    g.expect.librarySize(0, 7);
    g.expect.eventLog(
      [
        { kind: 'librarySearched', seat: 0, found: 1 },
        { kind: 'zoneChanged', fromZone: 'library', toZone: 'battlefield' },
        { kind: 'libraryShuffled', seat: 0 },
        { kind: 'resolved' },
      ],
      { since: mark },
    );
    g.expect.noEvent({ kind: 'cardsRevealed' });
    g.expect.invariants();
  });

  test('only basic lands are offered; a nonbasic card and creatures are not', () => {
    const g = build();
    g.act(0).activate(FETCH);
    g.act(0).pass();
    g.act(1).pass();
    const d = g.state.pending;
    if (d?.kind !== 'chooseCards') throw new Error(`expected chooseCards, got ${d?.kind}`);
    expect(d.legal).toHaveLength(6);
    expect(d.legal).not.toContain(g.id('lib2'));
    expect(d.legal).not.toContain(g.id('lib5'));
    expect(d.min).toBe(0);
    expect(d.max).toBe(1);
  });

  test('the shuffle changes the order of the rest of the library, deterministically from the state PRNG', () => {
    const run = (seed: number) => {
      const g = build(seed);
      const rngBefore = g.state.rng;
      const unshuffled = libraryOrder(g)?.filter((c) => c !== g.object('lib3').card);
      resolveSearch(g, 'lib3');
      return { g, rngBefore, unshuffled, after: libraryOrder(g) };
    };
    const a = run(5);
    // The seven cards left are the original ones, in a different order (1/5040 to stay the same).
    expect([...(a.after ?? [])].sort()).toEqual([...(a.unshuffled ?? [])].sort());
    expect(a.after).not.toEqual(a.unshuffled);
    // The generator in the state advanced: the shuffle consumed state randomness, nothing else.
    expect(a.g.state.rng).not.toEqual(a.rngBefore);
    // The same seed and actions give the same order and the same state; another seed does not.
    const again = run(5);
    expect(again.after).toEqual(a.after);
    expect(again.g.hash()).toBe(a.g.hash());
    expect(run(6).after).not.toEqual(a.after);
  });

  test('finding nothing is allowed (CR 701.23b) and the library is shuffled anyway', () => {
    const g = build();
    g.act(0).activate(FETCH);
    g.act(0).pass();
    g.act(1).pass();
    const mark = g.mark();
    g.act(0).chooseCards();
    g.expect.librarySize(0, 8);
    g.expect.eventLog(
      [
        { kind: 'librarySearched', seat: 0, found: 0 },
        { kind: 'libraryShuffled', seat: 0 },
      ],
      { since: mark },
    );
  });
});
