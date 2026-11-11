/** arrangeCards (scry, surveil, reorder) and the putOnTop picker as pure models: the default, moves
 * within and between piles, drops, the answer, prompts, badges, the bar and keys, and the waiting
 * messages. No DOM. */
import type {
  Action,
  ArrangeCardsDecision,
  ChooseCardsDecision,
  GameView,
  ObjectId,
  PendingDecision,
} from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import {
  type Arrangement,
  arrangeAction,
  arrangeBadge,
  arrangeDetail,
  arrangeLabel,
  arrangementComplete,
  arrangePrompt,
  defaultArrangement,
  dropCard,
  flipPile,
  locate,
  moveToPile,
  moveWithin,
  pileHint,
  placeCard,
} from '../src/ui/decisions/arrange';
import {
  confirmLabel,
  foundBadge,
  foundDetail,
  foundReady,
  pickOrderLabel,
  pickOrderMatters,
  waitingText,
} from '../src/ui/decisions/cards-picker';
import { keyCommand } from '../src/ui/decisions/keys';
import { buildModel, type Controller } from '../src/ui/decisions/model';
import { initialUi, type UiState, uiFor } from '../src/ui/decisions/ui-state';

const o = (n: number): ObjectId => `o${n}`;

function arrange(
  purpose: ArrangeCardsDecision['purpose'],
  count = 3,
  patch: Partial<ArrangeCardsDecision> = {},
): ArrangeCardsDecision {
  return {
    id: 'd1',
    seat: 0,
    kind: 'arrangeCards',
    source: o(99),
    purpose,
    cards: Array.from({ length: count }, (_, i) => o(i + 1)),
    piles:
      purpose === 'scry'
        ? ['top', 'bottom']
        : purpose === 'surveil'
          ? ['top', 'graveyard']
          : ['top'],
    ...patch,
  };
}

const scry = (count = 3) => arrange('scry', count);
const surveil = (count = 3) => arrange('surveil', count);
const reorder = (count = 3) => arrange('reorder', count);

describe('the default and the answer', () => {
  test('everything stays on top in the order it was looked at', () => {
    const d = scry(3);
    expect(defaultArrangement(d)).toEqual({ top: [o(1), o(2), o(3)], other: [] });
    expect(arrangeAction(defaultArrangement(d))).toEqual({
      kind: 'arrangeCards',
      top: [o(1), o(2), o(3)],
      other: [],
    });
    expect(arrangementComplete(d, defaultArrangement(d))).toBe(true);
  });

  test('a stale or partial arrangement is not complete', () => {
    const d = scry(3);
    expect(arrangementComplete(d, { top: [o(1)], other: [] })).toBe(false);
    expect(arrangementComplete(d, { top: [o(1), o(1), o(2)], other: [o(3)] })).toBe(false);
    expect(arrangementComplete(d, { top: [o(1), o(2)], other: [o(9)] })).toBe(false);
  });

  test('initialUi arranges only for an arrangeCards decision, and a new decision starts afresh', () => {
    const d = scry(2);
    expect(initialUi(d).arrange).toEqual({ top: [o(1), o(2)], other: [] });
    expect(initialUi(null).arrange).toEqual({ top: [], other: [] });
    const moved: UiState = { ...initialUi(d), arrange: { top: [o(2)], other: [o(1)] } };
    expect(uiFor(moved, d).arrange.other).toEqual([o(1)]);
    expect(uiFor(moved, { ...d, id: 'd2' }).arrange).toEqual({ top: [o(1), o(2)], other: [] });
  });
});

describe('moving cards', () => {
  const start = (d: ArrangeCardsDecision): Arrangement => defaultArrangement(d);

  test('a card moves one place within its pile and stops at the ends', () => {
    const a = start(scry(3));
    expect(moveWithin(a, o(1), 1).top).toEqual([o(2), o(1), o(3)]);
    expect(moveWithin(a, o(3), -1).top).toEqual([o(1), o(3), o(2)]);
    expect(moveWithin(a, o(1), -1)).toBe(a);
    expect(moveWithin(a, o(3), 1)).toBe(a);
    expect(moveWithin(a, o(77), 1)).toBe(a);
  });

  test('a card sent to the other pile leaves the top pile', () => {
    const d = scry(3);
    const a = moveToPile(start(d), d, o(2), 'other');
    expect(a).toEqual({ top: [o(1), o(3)], other: [o(2)] });
    expect(locate(a, o(2))).toEqual({ pile: 'other', index: 0 });
    expect(locate(a, o(77))).toBeNull();
  });

  test('a card sent away and back lands where it started', () => {
    const d = scry(4);
    let a = moveToPile(start(d), d, o(2), 'other');
    a = moveToPile(a, d, o(3), 'other');
    // The bottom pile keeps the order the cards were looked at: 2 then 3.
    expect(a.other).toEqual([o(2), o(3)]);
    a = moveToPile(a, d, o(2), 'top');
    expect(a.top).toEqual([o(1), o(2), o(4)]);
    expect(a.other).toEqual([o(3)]);
  });

  test('a click flips the card between the piles; a reorder has only one pile', () => {
    const d = surveil(3);
    const a = flipPile(start(d), d, o(1));
    expect(a).toEqual({ top: [o(2), o(3)], other: [o(1)] });
    expect(flipPile(a, d, o(1))).toEqual(start(d));
    const r = reorder(3);
    expect(flipPile(start(r), r, o(1))).toEqual(start(r));
    expect(moveToPile(start(r), r, o(1), 'other')).toEqual(start(r));
    expect(placeCard(start(r), r, o(1), 'other', 0)).toEqual(start(r));
  });

  test('dropping before a card, after the last card and in the same pile', () => {
    const d = scry(4);
    // Card 4 dropped before card 1 of the top pile.
    expect(dropCard(start(d), d, o(4), 'top', 0).top).toEqual([o(4), o(1), o(2), o(3)]);
    // Card 1 dropped at the end of its own pile (index = length).
    expect(dropCard(start(d), d, o(1), 'top', 4).top).toEqual([o(2), o(3), o(4), o(1)]);
    // Card 1 dropped before card 3: the pile shifts by one once the card is out.
    expect(dropCard(start(d), d, o(1), 'top', 2).top).toEqual([o(2), o(1), o(3), o(4)]);
    // Card 3 dropped onto the empty bottom pile, then card 1 before it.
    let a = dropCard(start(d), d, o(3), 'other', 0);
    expect(a).toEqual({ top: [o(1), o(2), o(4)], other: [o(3)] });
    a = dropCard(a, d, o(1), 'other', 0);
    expect(a.other).toEqual([o(1), o(3)]);
    // An index past the end is clamped.
    expect(dropCard(start(d), d, o(1), 'other', 9).other).toEqual([o(1)]);
  });

  test('every move leaves each card placed exactly once', () => {
    const d = scry(5);
    let a = start(d);
    a = moveToPile(a, d, o(2), 'other');
    a = dropCard(a, d, o(5), 'other', 0);
    a = moveWithin(a, o(3), 1);
    a = flipPile(a, d, o(1));
    a = dropCard(a, d, o(2), 'top', 0);
    expect(arrangementComplete(d, a)).toBe(true);
  });
});

describe('words', () => {
  test('the prompts say what to choose', () => {
    expect(arrangePrompt(scry(2))).toBe(
      'Scry 2: choose the cards to put on the bottom and the order.',
    );
    expect(arrangePrompt(scry(1))).toBe('Scry 1: keep the card on top or put it on the bottom.');
    expect(arrangePrompt(surveil(3))).toBe(
      'Surveil 3: choose the cards to put into your graveyard and the order of the rest.',
    );
    expect(arrangePrompt(surveil(1))).toBe(
      'Surveil 1: keep the card on top or put it into your graveyard.',
    );
    expect(arrangePrompt(reorder(3))).toBe('Look at the top 3 cards: put them back in any order.');
  });

  test('the detail counts the piles', () => {
    const d = scry(3);
    expect(arrangeDetail(d, moveToPile(defaultArrangement(d), d, o(1), 'other'))).toBe(
      '2 on top, 1 on the bottom.',
    );
    const s = surveil(2);
    expect(arrangeDetail(s, moveToPile(defaultArrangement(s), s, o(1), 'other'))).toBe(
      '1 on top, 1 into the graveyard.',
    );
    expect(arrangeDetail(reorder(3), defaultArrangement(reorder(3)))).toBe(
      '3 on top. The first card ends on top.',
    );
  });

  test('badges give the place in the order of a pile; the graveyard has none', () => {
    const d = scry(4);
    const a = moveToPile(moveToPile(defaultArrangement(d), d, o(3), 'other'), d, o(4), 'other');
    expect(arrangeBadge(d, a, o(1))).toBe('1st from top');
    expect(arrangeBadge(d, a, o(2))).toBe('2nd from top');
    // The last card of the bottom pile is the bottom card of the library.
    expect(arrangeBadge(d, a, o(4))).toBe('Bottom card');
    expect(arrangeBadge(d, a, o(3))).toBe('2nd from bottom');
    expect(arrangeBadge(d, a, o(77))).toBeNull();
    const s = surveil(2);
    expect(arrangeBadge(s, moveToPile(defaultArrangement(s), s, o(2), 'other'), o(2))).toBeNull();
  });

  test('a screen reader hears the name, the pile and the place', () => {
    const d = scry(3);
    expect(arrangeLabel(d, defaultArrangement(d), o(2), 'Island')).toBe('Island, Top pile, 2 of 3');
    expect(
      arrangeLabel(d, moveToPile(defaultArrangement(d), d, o(2), 'other'), o(2), 'Island'),
    ).toBe('Island, Bottom pile, 1 of 1');
    expect(arrangeLabel(d, defaultArrangement(d), o(9), 'Island')).toBe('Island');
  });

  test('the pile hints say which end is which', () => {
    expect(pileHint(scry(), 'top')).toContain('first card is the top card');
    expect(pileHint(scry(), 'other')).toContain('last card is the bottom card');
    expect(pileHint(surveil(), 'other')).toContain('graveyard');
  });
});

function viewOf(pending: PendingDecision | null, patch: Partial<GameView> = {}): GameView {
  return {
    viewer: 0,
    turn: 3,
    activeSeat: 0,
    step: 'precombatMain',
    battlefield: [],
    stack: [],
    exile: [],
    seats: [
      { id: 0, hand: [], graveyard: [], command: [], mulligans: 0 },
      { id: 1, hand: null, graveyard: [], command: [], mulligans: 0 },
    ],
    pending,
    ...patch,
  } as unknown as GameView;
}

function harness(pending: PendingDecision) {
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

describe('arrangeCards model', () => {
  test('the bar is in the overlay, has the prompt and a Confirm that sends the default', () => {
    const d = scry(2);
    const h = harness(d);
    const m = h.model();
    expect(m.bar.inOverlay).toBe(true);
    expect(m.bar.prompt).toBe(arrangePrompt(d));
    expect(m.bar.detail).toBe('2 on top, 0 on the bottom.');
    expect(m.bar.buttons.map((b) => [b.label, b.variant, b.disabled])).toEqual([
      ['Confirm', 'primary', false],
    ]);
    expect(m.interaction.clickable.size).toBe(0);
    m.bar.buttons[0]?.run();
    expect(h.acts).toEqual([{ kind: 'arrangeCards', top: [o(1), o(2)], other: [] }]);
  });

  test('there is no cancel, and Esc does nothing', () => {
    const m = harness(scry(2)).model();
    expect(m.bar.cancel).toBeNull();
    const esc = {
      key: 'Escape',
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      tag: 'LI',
      editable: false,
      foreignModalOpen: false,
    };
    expect(
      keyCommand(esc, { bar: m.bar, pinned: false, chooserOpen: false, canUndo: false }),
    ).toBeNull();
  });

  test('Enter on a focused card confirms; Enter on a focused button is the button own', () => {
    const m = harness(surveil(2)).model();
    const enter = {
      key: 'Enter',
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      tag: 'LI',
      editable: false,
      foreignModalOpen: false,
    };
    const ctx = { bar: m.bar, pinned: false, chooserOpen: false, canUndo: false };
    expect(keyCommand(enter, ctx)).toBe('primary');
    expect(keyCommand({ ...enter, tag: 'BUTTON' }, ctx)).toBeNull();
  });

  test('Confirm sends the arrangement as changed', () => {
    const d = surveil(3);
    const h = harness(d);
    h.model();
    // The panel writes into `ui.arrange`, as its handlers do.
    const next = moveWithin(moveToPile(h.ui().arrange, d, o(1), 'other'), o(2), 1);
    const changed: UiState = { ...h.ui(), arrange: next };
    const acts: Action[] = [];
    const m = buildModel(viewOf(d), d, changed, {
      act: (a) => acts.push(a),
      update: () => {},
      openChooser: () => {},
    });
    m.bar.buttons[0]?.run();
    expect(acts).toEqual([{ kind: 'arrangeCards', top: [o(3), o(2)], other: [o(1)] }]);
    expect(m.bar.detail).toBe('2 on top, 1 into the graveyard.');
  });
});

function putOnTop(patch: Partial<ChooseCardsDecision> = {}): ChooseCardsDecision {
  return {
    id: 'd3',
    seat: 0,
    kind: 'chooseCards',
    source: o(99),
    purpose: 'putOnTop',
    zone: 'hand',
    legal: [o(1), o(2), o(3), o(4)],
    min: 2,
    max: 2,
    reveal: false,
    prompt: 'Put two cards from your hand on top of your library in any order.',
    ...patch,
  };
}

describe('putOnTop in the card picker', () => {
  test('the order of the picks matters for two cards, not for one', () => {
    expect(pickOrderMatters(putOnTop())).toBe(true);
    expect(pickOrderMatters(putOnTop({ min: 1, max: 1 }))).toBe(false);
    expect(pickOrderMatters({ purpose: 'discard', max: 2 })).toBe(false);
    expect(pickOrderMatters({ purpose: 'search', max: 2 })).toBe(true);
  });

  test('picks are numbered from the top', () => {
    expect(pickOrderLabel(putOnTop(), 1)).toBe('1st from top');
    expect(pickOrderLabel(putOnTop(), 2)).toBe('2nd from top');
    expect(pickOrderLabel({ purpose: 'search' }, 2)).toBe('2nd');
    expect(foundBadge(putOnTop(), [o(3), o(1)], o(1))).toBe('2nd from top');
    expect(foundBadge(putOnTop(), [o(3), o(1)], o(2))).toBeNull();
    expect(foundBadge(putOnTop({ min: 1, max: 1 }), [o(3)], o(3))).toBe('On top');
  });

  test('the button, the detail and ready read for a put on top', () => {
    expect(confirmLabel(putOnTop(), [])).toBe('Put on top');
    expect(foundDetail(putOnTop(), [o(1)])).toBe(
      '1 of 2 chosen. The order you pick them in matters: the first you pick ends on top of your library.',
    );
    expect(foundDetail(putOnTop({ min: 1, max: 1 }), [])).toBe('0 of 1 chosen');
    expect(foundReady([o(1)], putOnTop())).toBe(false);
    expect(foundReady([o(1), o(2)], putOnTop())).toBe(true);
  });

  test('the bar shows the decision prompt and sends the picks in order; the hand is dimmed back', () => {
    const d = putOnTop();
    const h = harness(d);
    let m = h.model();
    expect(m.bar.prompt).toBe(d.prompt);
    expect(m.interaction.dimOthers).toBe(true);
    expect(m.interaction.clickable).toEqual(new Set(d.legal));
    m.interaction.onObject(o(3));
    m.interaction.onObject(o(1));
    m = h.model();
    expect(m.interaction.badge(o(3))).toBe('1st from top');
    expect(m.interaction.badge(o(1))).toBe('2nd from top');
    expect(m.bar.buttons[0]?.label).toBe('Put on top');
    expect(m.bar.buttons[0]?.disabled).toBe(false);
    m.bar.buttons[0]?.run();
    expect(h.acts).toEqual([{ kind: 'chooseCards', objects: [o(3), o(1)] }]);
  });
});

describe('waiting messages', () => {
  const waiting = (purpose: string, sourceName = 'SYNTHETIC Seer Of The Door') =>
    viewOf(null, { waitingOn: { seat: 1, purpose, sourceName } } as Partial<GameView>);

  test('each new purpose reads in plain words and names no card', () => {
    expect(waitingText(waiting('scry'))).toBe('Opponent is scrying (SYNTHETIC Seer Of The Door).');
    expect(waitingText(waiting('surveil'))).toBe(
      'Opponent is surveilling (SYNTHETIC Seer Of The Door).',
    );
    expect(waitingText(waiting('reorder'))).toBe(
      'Opponent is putting the top cards of their library back in an order (SYNTHETIC Seer Of The Door).',
    );
    expect(waitingText(waiting('putOnTop', 'SYNTHETIC Brainstorm Like'))).toBe(
      'Opponent is putting cards from their hand on top of their library (SYNTHETIC Brainstorm Like).',
    );
  });

  test('the old purposes and a missing source keep their words', () => {
    expect(waitingText(waiting('search', ''))).toBe('Opponent is searching their library.');
    expect(waitingText(waiting('discard', 'Loot'))).toBe('Opponent is discarding (Loot).');
    expect(waitingText(viewOf(null))).toBeNull();
  });
});
