/**
 * The web side of D-971 ("Reveal the top five cards of your library. An opponent separates those cards into two piles. Put one pile into your hand and the other into your
 * graveyard.", CR 700.3) as pure models: the words of the two questions (which cards are pile 1, which pile goes where), the preview of the piles while the cards are clicked,
 * the log lines of the piles and of the choice, and what the other player is shown while it waits. No DOM.
 */
import type {
  ChooseCardsDecision,
  ChooseOptionDecision,
  GameEvent,
  GameState,
  GameView,
  ObjectView,
} from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { describeEvent } from '../src/game/describe';
import {
  confirmLabel,
  discardTitle,
  foundBadge,
  pickerCards,
  pileList,
  pilesPreview,
  waitingText,
} from '../src/ui/decisions/cards-picker';
import { optionPrompt } from '../src/ui/decisions/option-picker';
import { pileLabel, pileOption, pilePrompt, pileTitle } from '../src/ui/decisions/piles-words';
import { lookupIndexFor } from './decisions-helpers';

const card = (id: string, name: string): ObjectView =>
  ({
    id,
    name,
    controller: 0,
    owner: 0,
    types: ['creature'],
    subtypes: [],
    counters: {},
    zone: 'library',
    oracleText: '',
    keywords: [],
  }) as unknown as ObjectView;

const CARDS = [
  card('a', 'Grizzly Bears'),
  card('b', 'Giant Spider'),
  card('c', 'Serra Angel'),
] as const;

const separate: ChooseCardsDecision = {
  kind: 'chooseCards',
  id: 'd1',
  seat: 1,
  source: 'o9',
  purpose: 'separate',
  zone: 'library',
  legal: ['a', 'b', 'c'],
  min: 0,
  max: 3,
  reveal: true,
  prompt: 'Separate the revealed cards into two piles.',
} as unknown as ChooseCardsDecision;

const pile = (receiver: 0 | 1, seat: 0 | 1, chosenTo: 'hand' | 'graveyard' = 'hand') =>
  ({
    kind: 'chooseOption',
    id: 'd2',
    seat,
    purpose: 'pile',
    options: ['pile1', 'pile2'],
    piles: {
      first: ['a'],
      second: ['b', 'c'],
      chosenTo,
      otherTo: chosenTo === 'hand' ? 'graveyard' : 'hand',
      separator: 1 - seat,
      receiver,
    },
    source: 'o9',
    sourceName: 'Fact or Fiction',
    sourceOracleText: '',
  }) as unknown as ChooseOptionDecision & { piles: NonNullable<ChooseOptionDecision['piles']> };

describe('the question which cards form pile 1', () => {
  const view = { viewer: 1, pending: separate, pendingCards: CARDS } as unknown as GameView;

  test('the picker lists the revealed cards, which are in a library: the view gives them to the player who separates', () => {
    expect(pickerCards(view, separate).map((o) => o.name)).toEqual([
      'Grizzly Bears',
      'Giant Spider',
      'Serra Angel',
    ]);
  });

  test('the words: the title names the spell, the button makes the piles, a clicked card says Pile 1', () => {
    const index = lookupIndexFor([
      { ...card('o9', 'Fact or Fiction'), zone: 'stack' } as unknown as ObjectView,
    ]);
    expect(discardTitle(separate, index)).toBe(
      'Separate the revealed cards into two piles (Fact or Fiction)',
    );
    expect(confirmLabel(separate, [])).toBe('Make the piles');
    expect(foundBadge(separate, ['a'], 'a')).toBe('Pile 1');
    expect(foundBadge(separate, ['a'], 'b')).toBeNull();
  });

  test('the preview: the cards clicked are pile 1, the others pile 2, and either may be empty (CR 700.3d)', () => {
    expect(pilesPreview(CARDS, ['b'])).toEqual({
      first: ['Giant Spider'],
      second: ['Grizzly Bears', 'Serra Angel'],
    });
    expect(pilesPreview(CARDS, [])).toEqual({
      first: [],
      second: ['Grizzly Bears', 'Giant Spider', 'Serra Angel'],
    });
    expect(pileList([])).toBe('no cards');
    expect(pileList(['Giant Spider', 'Sol Ring'])).toBe('Giant Spider, Sol Ring');
  });

  test('the player who waits is told what the other is doing, and no card', () => {
    const waiting = {
      waitingOn: { seat: 1, purpose: 'separate', sourceName: 'Fact or Fiction' },
    } as unknown as GameView;
    expect(waitingText(waiting)).toBe(
      'Opponent is separating the revealed cards into two piles (Fact or Fiction).',
    );
    const choosing = {
      waitingOn: { seat: 1, purpose: 'pile', sourceName: 'Fact or Fiction' },
    } as unknown as GameView;
    expect(waitingText(choosing)).toBe(
      'Opponent is choosing one of two piles of the revealed cards (Fact or Fiction).',
    );
  });
});

describe('the question which pile goes where', () => {
  test('the player who receives the piles picks the pile for their own hand', () => {
    const d = pile(0, 0);
    expect(pileTitle(d)).toBe('Pick a pile to put into your hand');
    expect(pilePrompt(d)).toBe(
      'The other pile goes into your graveyard. The cards are revealed and still in the library.',
    );
  });

  test('the words follow the destinations: the chosen pile may go to the graveyard', () => {
    expect(pileTitle(pile(0, 0, 'graveyard'))).toBe('Pick a pile to put into your graveyard');
    expect(pilePrompt(pile(0, 0, 'graveyard'))).toContain('The other pile goes into your hand.');
  });

  test('an opponent that chooses for the controller reads "their"', () => {
    expect(pileTitle(pile(0, 1))).toBe('Pick a pile to put into their hand');
    expect(pilePrompt(pile(0, 1))).toContain('into their graveyard');
  });

  test('the labels count the cards and the options are the engine ones', () => {
    expect(pileLabel(1, ['a'])).toBe('Pile 1 (1 card)');
    expect(pileLabel(2, ['b', 'c'])).toBe('Pile 2 (2 cards)');
    expect(pileLabel(2, [])).toBe('Pile 2 (no cards)');
    expect([pileOption(1), pileOption(2)]).toEqual(['pile1', 'pile2']);
  });

  test('the plain prompt of the option picker names the spell', () => {
    expect(optionPrompt(pile(0, 0))).toBe('Pick a pile (Fact or Fiction).');
  });
});

describe('the log', () => {
  const nothing = {} as unknown as GameState;
  const line = (event: GameEvent, viewer = 0) => describeEvent(event, nothing, nothing, viewer);

  test('the piles are public and name their cards; an empty pile says so', () => {
    const made = line({
      kind: 'pilesSeparated',
      seat: 1,
      first: ['Grizzly Bears'],
      second: ['Giant Spider', 'Serra Angel'],
    });
    expect(made?.text).toBe(
      'Opponent separates the revealed cards into two piles: Grizzly Bears and Giant Spider and Serra Angel.',
    );
    expect(made?.rule).toBe('CR 700.3');
    expect(line({ kind: 'pilesSeparated', seat: 0, first: [], second: ['Sol Ring'] })?.text).toBe(
      'You separate the revealed cards into two piles: no cards and Sol Ring.',
    );
  });

  test('the choice names the pile and its cards', () => {
    expect(line({ kind: 'pileChosen', seat: 0, pile: 2, names: ['Giant Spider'] })?.text).toBe(
      'You choose pile 2 (Giant Spider).',
    );
    expect(line({ kind: 'pileChosen', seat: 1, pile: 1, names: [] })?.text).toBe(
      'Opponent chooses pile 1 (no cards).',
    );
  });
});
