/**
 * Library search and discard through the game host with the hidden SYNTHETIC deck
 * `synthetic-search` (invented engine fixtures): the question reaches the human, the order of the
 * picks decides where the cards go, the log reads well and names no hidden card, and the answer
 * clears the undo history.
 */
import type { ChooseCardsDecision, GameEvent, GameState, ObjectId } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { describeEvent } from '../src/game/describe';
import type { Snapshot } from '../src/game/protocol';
import { pickerCards } from '../src/ui/decisions/cards-picker';
import { pressButton } from './mana-decks';
import { anyDiscard, anySearch, type Reached, reachSearch, reachSearchStore } from './search-decks';

const twin = (d: ChooseCardsDecision) => d.purpose === 'search' && d.max === 2;

function twoNames(snap: Snapshot): [string, string] {
  const pending = snap.view.pending;
  if (pending?.kind !== 'chooseCards') throw new Error('wrong decision');
  const names = [...new Set(pickerCards(snap.view, pending).map((c) => c.name))];
  const [a, b] = names;
  if (a === undefined || b === undefined) throw new Error('the library holds one kind of card');
  return [a, b];
}

function idOf(snap: Snapshot, name: string): ObjectId {
  const found = snap.view.pendingCards?.find((c) => c.name === name);
  if (found === undefined) throw new Error(`no ${name} in the library`);
  return found.id;
}

async function reach(accept: (d: ChooseCardsDecision) => boolean): Promise<Reached> {
  const reached = await reachSearch(accept);
  if (reached === null) throw new Error('no seed reached the decision');
  return reached;
}

describe('a search reaches the human', () => {
  test('the view carries the matching library cards and the prompt says where they go', async () => {
    const { snap } = await reach(twin);
    const pending = snap.view.pending;
    if (pending?.kind !== 'chooseCards') throw new Error('wrong decision');
    expect(pending.zone).toBe('library');
    expect(pending.min).toBe(0);
    expect(pending.prompt).toContain('the first goes onto the battlefield tapped');
    expect(snap.view.pendingCards?.map((c) => c.id).sort()).toEqual([...pending.legal].sort());
    expect(snap.view.waitingOn).toBeUndefined();
  });

  test('the autopilot leaves the question to the player', async () => {
    const reached = await reachSearchStore(anySearch);
    if (reached === null) throw new Error('no seed');
    const { store } = reached;
    const state = store.getState();
    expect(state.passing).toBe(false);
    await new Promise((r) => setTimeout(r, 20));
    expect(store.getState().snapshot?.view.pending?.kind).toBe('chooseCards');
    expect(store.getState().snapshot?.revision).toBe(state.snapshot?.revision);
  });
});

describe('the order of the picks decides the destinations', () => {
  for (const flip of [false, true]) {
    test(`${flip ? 'second then first' : 'first then second'}: the first pick enters tapped, the other goes to the hand`, async () => {
      const { host, snap } = await reach(twin);
      const [a, b] = twoNames(snap);
      const [first, second] = flip ? [b, a] : [a, b];
      const action = pressButton(snap.view, 'Confirm', (ui) => ({
        ...ui,
        found: [idOf(snap, first), idOf(snap, second)],
      }));
      expect(action).toEqual({
        kind: 'chooseCards',
        objects: [idOf(snap, first), idOf(snap, second)],
      });
      const before = snap.view.battlefield.filter((o) => o.name === first).length;
      const next = await host.act(action);
      expect(next.error).toBeNull();
      const entered = next.view.battlefield.filter((o) => o.name === first);
      expect(entered).toHaveLength(before + 1);
      expect(entered.some((o) => o.tapped)).toBe(true);
      expect(next.view.seats[0]?.hand?.some((o) => o.name === second)).toBe(true);
      const lines = next.log.map((l) => l.text);
      expect(lines).toContain('You search your library and find 2 cards.');
      expect(lines).toContain(`You reveal ${first} and ${second}.`);
    });
  }

  test('Find nothing finds nothing: no reveal, no card moves', async () => {
    const { host, snap } = await reach(twin);
    const handBefore = snap.view.seats[0]?.hand?.length;
    const action = pressButton(snap.view, 'Find nothing');
    expect(action).toEqual({ kind: 'chooseCards', objects: [] });
    const next = await host.act(action);
    expect(next.error).toBeNull();
    const lines = next.log.map((l) => l.text);
    expect(lines).toContain('You search your library and find nothing.');
    expect(lines.some((l) => l.includes('reveal'))).toBe(false);
    expect(next.view.seats[0]?.hand?.length).toBe(handBefore);
  });

  test('an answer that is not legal is refused by the engine and the question stays', async () => {
    const { host, snap } = await reach(twin);
    const next = await host.act({ kind: 'chooseCards', objects: ['o999999'] });
    expect(next.error).not.toBeNull();
    expect(next.view.pending?.id).toBe(snap.view.pending?.id);
  });
});

describe('undo', () => {
  test('answering a search clears the undo history', async () => {
    const { host, snap } = await reach(anySearch);
    const next = await host.act(pressButton(snap.view, 'Find nothing'));
    expect(next.error).toBeNull();
    expect(next.undoDepth).toBe(0);
    expect((await host.undo()).error).toBe('Nothing to undo.');
  });
});

describe('a discard', () => {
  test('the hand is the source, Discard sends the card, the log names it', async () => {
    const { host, snap } = await reach(anyDiscard);
    const pending = snap.view.pending;
    if (pending?.kind !== 'chooseCards') throw new Error('wrong decision');
    expect(pending.zone).toBe('hand');
    const hand = snap.view.seats[0]?.hand ?? [];
    expect(pickerCards(snap.view, pending).map((c) => c.id)).toEqual(
      hand.filter((c) => pending.legal.includes(c.id)).map((c) => c.id),
    );
    const pick = pending.legal[0];
    if (pick === undefined) throw new Error('nothing legal');
    const name = hand.find((c) => c.id === pick)?.name;
    const action = pressButton(snap.view, 'Discard', (ui) => ({ ...ui, found: [pick] }));
    expect(action).toEqual({ kind: 'chooseCards', objects: [pick] });
    const next = await host.act(action);
    expect(next.error).toBeNull();
    expect(next.log.map((l) => l.text)).toContain(`You discard ${name}.`);
    expect(next.undoDepth).toBe(0);
  });
});

describe('log wording', () => {
  const nothing = {} as unknown as GameState;
  const line = (event: GameEvent, viewer = 0) => describeEvent(event, nothing, nothing, viewer);

  test('the searcher sees the count, the other side only that a search happened', () => {
    expect(line({ kind: 'librarySearched', seat: 0, found: 2 })?.text).toBe(
      'You search your library and find 2 cards.',
    );
    expect(line({ kind: 'librarySearched', seat: 0, found: 1 })?.text).toBe(
      'You search your library and find 1 card.',
    );
    expect(line({ kind: 'librarySearched', seat: 0, found: 0 })?.text).toBe(
      'You search your library and find nothing.',
    );
    const theirs = line({ kind: 'librarySearched', seat: 1, found: 2 })?.text;
    expect(theirs).toBe('Opponent searches their library.');
  });

  test('reveals name the cards for both sides', () => {
    const reveal = (seat: number, names: string[]): GameEvent => ({
      kind: 'cardsRevealed',
      seat,
      cards: names.map((_, i) => `c${i}` as const),
      names,
      from: 'library',
    });
    expect(line(reveal(0, ['Forest', 'Swamp']))?.text).toBe('You reveal Forest and Swamp.');
    expect(line(reveal(1, ['Forest', 'Swamp']))?.text).toBe('Opponent reveals Forest and Swamp.');
    expect(line(reveal(1, ['Forest']))?.text).toBe('Opponent reveals Forest.');
    expect(line(reveal(0, ['A', 'B', 'C']))?.text).toBe('You reveal A, B and C.');
  });

  test('a card that moves from a library to a hand is never named, whoever owns it', () => {
    const moved: GameEvent = {
      kind: 'zoneChanged',
      card: 'c1',
      from: 'o1',
      to: 'o2',
      fromZone: 'library',
      toZone: 'hand',
    };
    expect(line(moved)).toBeNull();
    expect(line(moved, 1)).toBeNull();
  });

  test('discards name the card for both sides', () => {
    const states = {
      objects: { o5: { card: 'c5', token: null, stack: null, zone: 'graveyard' } },
      cards: { c5: { definition: 'd5' } },
      definitions: { d5: { name: 'Murder' } },
      lki: {},
    } as unknown as GameState;
    const discarded = (seat: number): GameEvent => ({
      kind: 'discarded',
      seat,
      object: 'o5',
      to: null,
    });
    expect(describeEvent(discarded(0), states, states, 0)?.text).toBe('You discard Murder.');
    expect(describeEvent(discarded(1), states, states, 0)?.text).toBe('Opponent discards Murder.');
  });
});
