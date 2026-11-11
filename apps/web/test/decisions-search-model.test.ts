/** chooseCards (library search and discard) as pure models: selection order, min and max, the
 * "Find nothing" button, the card source for a search and for a discard, and the waiting status.
 * No DOM. */
import type {
  Action,
  ChooseCardsDecision,
  GameView,
  ObjectId,
  ObjectView,
  PendingDecision,
} from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import {
  clickGroup,
  confirmLabel,
  foundBadge,
  foundCount,
  foundDetail,
  foundReady,
  groupCards,
  ordinal,
  pickerCards,
  toggleFound,
  waitingText,
} from '../src/ui/decisions/cards-picker';
import { keyCommand } from '../src/ui/decisions/keys';
import { buildModel, type Controller } from '../src/ui/decisions/model';
import { initialUi, type UiState, uiFor } from '../src/ui/decisions/ui-state';

const o = (n: number): ObjectId => `o${n}`;

function card(n: number, name: string, patch: Partial<ObjectView> = {}): ObjectView {
  return {
    id: o(n),
    name,
    controller: 0,
    owner: 0,
    types: ['land'],
    supertypes: ['basic'],
    subtypes: [],
    manaCost: null,
    oracleText: '',
    ...patch,
  } as ObjectView;
}

const library = [card(10, 'Forest'), card(11, 'Forest'), card(12, 'Island'), card(13, 'Swamp')];
const hand = [
  card(1, 'Giant Spider', { types: ['creature'] }),
  card(2, 'Forest'),
  card(3, 'Murder'),
];

function search(patch: Partial<ChooseCardsDecision> = {}): ChooseCardsDecision {
  return {
    id: 'd1',
    seat: 0,
    kind: 'chooseCards',
    source: o(9),
    purpose: 'search',
    zone: 'library',
    legal: library.map((c) => c.id),
    min: 0,
    max: 2,
    reveal: true,
    prompt: 'Choose up to two basic land cards; the first goes onto the battlefield tapped.',
    ...patch,
  };
}

function discard(patch: Partial<ChooseCardsDecision> = {}): ChooseCardsDecision {
  return {
    id: 'd2',
    seat: 0,
    kind: 'chooseCards',
    source: o(9),
    purpose: 'discard',
    zone: 'hand',
    legal: [o(1), o(2), o(3)],
    min: 1,
    max: 1,
    reveal: true,
    prompt: 'Discard a card.',
    ...patch,
  };
}

function viewOf(pending: PendingDecision | null, patch: Partial<GameView> = {}): GameView {
  return {
    viewer: 0,
    turn: 3,
    activeSeat: 0,
    step: 'precombatMain',
    battlefield: [],
    stack: [card(9, 'Twin Fetch', { types: ['sorcery'], supertypes: [] })],
    exile: [],
    seats: [
      { id: 0, hand, graveyard: [], command: [], mulligans: 0 },
      { id: 1, hand: null, graveyard: [], command: [], mulligans: 0 },
    ],
    pending,
    ...(pending?.kind === 'chooseCards' && pending.zone === 'library'
      ? { pendingCards: library }
      : {}),
    ...patch,
  } as unknown as GameView;
}

function harness(pending: ChooseCardsDecision) {
  const view = viewOf(pending);
  const acts: Action[] = [];
  let ui: UiState = uiFor(initialUi(null), pending);
  const ctl: Controller = {
    act: (a) => acts.push(a),
    update: (change) => {
      ui = change(ui);
    },
    openChooser: () => {},
  };
  return { model: () => buildModel(view, pending, ui, ctl), acts, ui: () => ui };
}

describe('selection order', () => {
  test('clicks keep their order and a click on a chosen card takes it back', () => {
    const d = search();
    let chosen = toggleFound([], d, o(12));
    chosen = toggleFound(chosen, d, o(10));
    expect(chosen).toEqual([o(12), o(10)]);
    expect(toggleFound(chosen, d, o(13))).toEqual([o(12), o(10)]);
    expect(toggleFound(chosen, d, o(12))).toEqual([o(10)]);
  });

  test('with one allowed a click on another card swaps the choice', () => {
    const d = search({ max: 1 });
    expect(toggleFound([o(10)], d, o(12))).toEqual([o(12)]);
  });

  test('a card that is not legal is never chosen', () => {
    expect(toggleFound([], search({ legal: [o(10)] }), o(12))).toEqual([]);
  });

  test('ordinals read 1st, 2nd, 3rd, 4th, 11th, 22nd', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 103].map(ordinal)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
      '103rd',
    ]);
  });

  test('badges show the order for a search of several, "Found" for one, "Discard" for a discard', () => {
    expect(foundBadge(search(), [o(12), o(10)], o(10))).toBe('2nd');
    expect(foundBadge(search(), [o(12), o(10)], o(13))).toBeNull();
    expect(foundBadge(search({ max: 1 }), [o(12)], o(12))).toBe('Found');
    expect(foundBadge(discard({ min: 2, max: 2 }), [o(1)], o(1))).toBe('Discard');
  });
});

describe('ready, labels and counts', () => {
  test('a search may find nothing; a discard needs exactly its count', () => {
    expect(foundReady([], search())).toBe(true);
    expect(foundReady([o(10), o(11)], search())).toBe(true);
    expect(foundReady([o(10), o(11), o(12)], search())).toBe(false);
    expect(foundReady([], discard())).toBe(false);
    expect(foundReady([o(1)], discard())).toBe(true);
  });

  test('the button says Find nothing for an empty search, Confirm once something is chosen', () => {
    expect(confirmLabel(search(), [])).toBe('Find nothing');
    expect(confirmLabel(search(), [o(10)])).toBe('Confirm');
    expect(confirmLabel(discard(), [])).toBe('Discard');
  });

  test('counts and the order hint read in plain English', () => {
    expect(foundCount([], search())).toBe('0 of up to 2 chosen');
    expect(foundCount([o(1)], discard({ min: 2, max: 2 }))).toBe('1 of 2 chosen');
    expect(foundDetail(search(), [o(10)])).toContain('The order you pick them in matters');
    expect(foundDetail(search({ max: 1 }), [])).toBe('0 of up to 1 chosen');
    expect(foundDetail(discard(), [])).toBe('0 of 1 chosen');
  });
});

describe('chooseCards model', () => {
  test('legal cards are clickable; the bar shows the decision prompt; the order is sent', () => {
    const d = search();
    const h = harness(d);
    let m = h.model();
    expect(m.interaction.clickable).toEqual(new Set(d.legal));
    expect(m.bar.prompt).toBe(d.prompt);
    expect(m.bar.inOverlay).toBe(false);
    expect(m.bar.buttons[0]?.label).toBe('Find nothing');
    expect(m.bar.buttons[0]?.disabled).toBe(false);
    m.interaction.onObject(o(12));
    m = h.model();
    m.interaction.onObject(o(10));
    m = h.model();
    expect(m.interaction.badge(o(12))).toBe('1st');
    expect(m.interaction.badge(o(10))).toBe('2nd');
    expect(m.bar.buttons[0]?.label).toBe('Confirm');
    m.bar.buttons[0]?.run();
    expect(h.acts).toEqual([{ kind: 'chooseCards', objects: [o(12), o(10)] }]);
  });

  test('Find nothing sends an empty answer', () => {
    const h = harness(search());
    h.model().bar.buttons[0]?.run();
    expect(h.acts).toEqual([{ kind: 'chooseCards', objects: [] }]);
  });

  test('clicking something that is not legal does nothing', () => {
    const h = harness(search({ legal: [o(10)] }));
    h.model().interaction.onObject(o(13));
    expect(h.ui().found).toEqual([]);
  });

  test('a discard needs its count: Discard is disabled with a hint until a card is chosen', () => {
    const h = harness(discard());
    let m = h.model();
    expect(m.interaction.dimOthers).toBe(true);
    expect(m.bar.buttons[0]?.label).toBe('Discard');
    expect(m.bar.buttons[0]?.disabled).toBe(true);
    expect(m.bar.buttons[0]?.hint).toBe('Choose 1 more card');
    m.interaction.onObject(o(3));
    m = h.model();
    expect(m.interaction.badge(o(3))).toBe('Discard');
    m.bar.buttons[0]?.run();
    expect(h.acts).toEqual([{ kind: 'chooseCards', objects: [o(3)] }]);
  });

  test('a library search does not dim the board', () => {
    expect(harness(search()).model().interaction.dimOthers).toBe(false);
  });

  test('Space and Enter press the primary button of a search, even with nothing chosen', () => {
    const h = harness(search());
    const key = (k: string) => ({
      key: k,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      tag: 'BODY',
      editable: false,
      foreignModalOpen: false,
    });
    const ctx = { bar: h.model().bar, pinned: false, chooserOpen: false, canUndo: false };
    expect(keyCommand(key('Enter'), ctx)).toBe('primary');
    expect(keyCommand(key('Escape'), ctx)).toBeNull();
  });
});

describe('where the cards come from', () => {
  test('a library search lists the viewer pendingCards, grouped by name with a count', () => {
    const d = search();
    const cards = pickerCards(viewOf(d), d);
    expect(cards.map((c) => c.name)).toEqual(['Forest', 'Forest', 'Island', 'Swamp']);
    const groups = groupCards(cards);
    expect(groups.map((g) => [g.name, g.ids.length])).toEqual([
      ['Forest', 2],
      ['Island', 1],
      ['Swamp', 1],
    ]);
  });

  test('a discard lists the viewer hand filtered by legal', () => {
    const d = discard({ legal: [o(1), o(3)] });
    expect(pickerCards(viewOf(d), d).map((c) => c.name)).toEqual(['Giant Spider', 'Murder']);
  });

  test('pendingCards are never read unless the pending decision is the own chooseCards', () => {
    const d = search();
    const leaked = library;
    // No pending decision, or a different one: nothing is listed even if the field were present.
    expect(pickerCards(viewOf(null, { pendingCards: leaked }), d)).toEqual([]);
    expect(pickerCards(viewOf(discard(), { pendingCards: leaked }), d)).toEqual([]);
    expect(pickerCards(viewOf(search({ id: 'd999' }), { pendingCards: leaked }), d)).toEqual([]);
  });

  test('a row of copies adds the next copy, then takes the last back; a single card toggles', () => {
    const d = search({ max: 3 });
    const forests = { ids: [o(10), o(11)] };
    let chosen = clickGroup([], d, forests);
    expect(chosen).toEqual([o(10)]);
    chosen = clickGroup(chosen, d, forests);
    expect(chosen).toEqual([o(10), o(11)]);
    chosen = clickGroup(chosen, d, forests);
    expect(chosen).toEqual([o(10)]);
    chosen = clickGroup(chosen, d, { ids: [o(12)] });
    expect(chosen).toEqual([o(10), o(12)]);
    expect(clickGroup(chosen, d, { ids: [o(12)] })).toEqual([o(10)]);
  });

  test('with room for one, clicking another row swaps; clicking the chosen row takes it back', () => {
    const d = search({ max: 1 });
    expect(clickGroup([o(10)], d, { ids: [o(12)] })).toEqual([o(12)]);
    expect(clickGroup([o(10)], d, { ids: [o(10), o(11)] })).toEqual([]);
  });
});

describe('the opponent is choosing', () => {
  test('a search or a discard by the other seat is named, with the source and no card', () => {
    const waiting = (purpose: 'search' | 'discard') =>
      viewOf(null, { waitingOn: { seat: 1, purpose, sourceName: 'Twin Fetch' } });
    expect(waitingText(waiting('search'))).toBe(
      'Opponent is searching their library (Twin Fetch).',
    );
    expect(waitingText(waiting('discard'))).toBe('Opponent is discarding (Twin Fetch).');
    expect(waitingText(viewOf(null))).toBeNull();
  });
});

test('a fresh decision starts with nothing chosen', () => {
  const d = search();
  expect(initialUi(d).found).toEqual([]);
  const stale: UiState = { ...initialUi(d), found: [o(10)] };
  expect(uiFor(stale, search({ id: 'd7' })).found).toEqual([]);
});
