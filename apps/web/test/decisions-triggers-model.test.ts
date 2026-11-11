/** The M5 S2 decisions as pure models: choosePermanent, orderTriggers, confirmOptional, and the
 * manual payment of a source that makes any color (a Treasure). No DOM. */
import type {
  Action,
  ChoosePermanentDecision,
  ConfirmOptionalDecision,
  GameView,
  ManaColor,
  ObjectId,
  ObjectView,
  OrderTriggersDecision,
  PayManaDecision,
  PendingDecision,
} from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { keyCommand } from '../src/ui/decisions/keys';
import { buildModel, type Controller, optionalPrompt, payPrompt } from '../src/ui/decisions/model';
import {
  defaultResolveOrder,
  engineOrder,
  moveTrigger,
  resolvesLabel,
} from '../src/ui/decisions/order';
import {
  asksColor,
  clickSource,
  sacrificesWhenTapped,
  setTapColor,
  tapBadges,
  untap,
} from '../src/ui/decisions/payment';
import {
  choosePermanentPrompt,
  chosenCount,
  permanentLabels,
  permanentRange,
  permanentsReady,
  togglePermanent,
} from '../src/ui/decisions/permanents';
import { initialUi, type UiState, uiFor } from '../src/ui/decisions/ui-state';
import { lookupIndexFor } from './decisions-helpers';

const o = (n: number): ObjectId => `o${n}`;

function card(n: number, name: string, patch: Partial<ObjectView> = {}): ObjectView {
  return {
    id: o(n),
    name,
    controller: 0,
    owner: 0,
    types: ['land'],
    oracleText: '',
    ...patch,
  } as ObjectView;
}

const treasure = card(4, 'Treasure', {
  types: ['artifact'],
  isToken: true,
  oracleText: '{T}, Sacrifice this token: Add one mana of any color.',
});

const board = [card(1, 'Forest'), card(2, 'Forest'), card(3, 'Plains'), treasure];

function viewOf(pending: PendingDecision, patch: Partial<GameView> = {}): GameView {
  return {
    viewer: 0,
    turn: 3,
    activeSeat: 0,
    step: 'precombatMain',
    battlefield: board,
    stack: [
      card(9, 'Dragon', {
        types: [],
        oracleText: 'Whenever this enters, sacrifice another permanent.',
        abilitySource: o(8),
      }),
    ],
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
  const chooser: string[] = [];
  let ui: UiState = uiFor(initialUi(null), pending);
  const ctl: Controller = {
    act: (a) => acts.push(a),
    update: (change) => {
      ui = change(ui);
    },
    openChooser: (id, abilityIndex) =>
      chooser.push(abilityIndex === undefined ? id : `${id}#${abilityIndex}`),
  };
  return { model: () => buildModel(view, pending, ui, ctl), acts, chooser, ui: () => ui };
}

const sacrifice = (patch: Partial<ChoosePermanentDecision> = {}): ChoosePermanentDecision => ({
  id: 'd1',
  seat: 0,
  kind: 'choosePermanent',
  source: o(9),
  purpose: 'sacrifice',
  min: 1,
  max: 1,
  legal: [o(1), o(2), o(3), o(4)],
  ...patch,
});

describe('choosePermanent logic', () => {
  test('one allowed: a click swaps the choice, a second click on it takes it back', () => {
    const d = sacrifice();
    expect(togglePermanent([], d, o(1))).toEqual([o(1)]);
    expect(togglePermanent([o(1)], d, o(2))).toEqual([o(2)]);
    expect(togglePermanent([o(2)], d, o(2))).toEqual([]);
  });

  test('several allowed: picks add up to max, then further clicks are ignored', () => {
    const d = sacrifice({ min: 1, max: 2 });
    let chosen = togglePermanent([], d, o(1));
    chosen = togglePermanent(chosen, d, o(2));
    expect(chosen).toEqual([o(1), o(2)]);
    expect(togglePermanent(chosen, d, o(3))).toEqual([o(1), o(2)]);
    expect(togglePermanent(chosen, d, o(1))).toEqual([o(2)]);
  });

  test('an object that is not legal is never chosen', () => {
    expect(togglePermanent([], sacrifice({ legal: [o(1)] }), o(3))).toEqual([]);
  });

  test('ready means between min and max', () => {
    const d = sacrifice({ min: 1, max: 2 });
    expect(permanentsReady([], d)).toBe(false);
    expect(permanentsReady([o(1)], d)).toBe(true);
    expect(permanentsReady([o(1), o(2)], d)).toBe(true);
    expect(permanentsReady([o(1), o(2), o(3)], d)).toBe(false);
    expect(permanentsReady([], { min: 0, max: 1 })).toBe(true);
  });

  test('ranges and counts read in plain English', () => {
    expect(permanentRange(1, 1)).toBe('a permanent');
    expect(permanentRange(2, 2)).toBe('2 permanents');
    expect(permanentRange(0, 3)).toBe('up to 3 permanents');
    expect(permanentRange(1, 3)).toBe('1 to 3 permanents');
    expect(chosenCount([o(1)], { min: 2, max: 2 })).toBe('1 of 2 chosen');
    expect(chosenCount([], { min: 1, max: 3 })).toBe('0 of 1 to 3 chosen');
  });

  test('permanents with the same name are numbered in the choice list', () => {
    const index = lookupIndexFor(board);
    const labels = permanentLabels([o(1), o(2), o(3), o(4)], index);
    expect([...labels.values()]).toEqual(['Forest 1', 'Forest 2', 'Plains', 'Treasure']);
  });
});

describe('choosePermanent model', () => {
  test('legal permanents are clickable and dim the rest; Confirm waits for a pick', () => {
    const h = harness(sacrifice({ legal: [o(1), o(3)] }));
    let m = h.model();
    expect(m.interaction.clickable).toEqual(new Set([o(1), o(3)]));
    expect(m.interaction.dimOthers).toBe(true);
    expect(m.bar.inOverlay).toBe(false);
    expect(m.bar.prompt).toBe('Sacrifice a permanent for Dragon.');
    expect(m.bar.buttons[0]?.disabled).toBe(true);
    expect(m.bar.buttons[0]?.hint).toBe('Choose 1 more permanent');
    m.interaction.onObject(o(3));
    m = h.model();
    expect(m.interaction.selected).toEqual(new Set([o(3)]));
    expect(m.interaction.badge(o(3))).toBe('Sacrifice');
    expect(m.bar.buttons[0]?.disabled).toBe(false);
    m.bar.buttons[0]?.run();
    expect(h.acts).toEqual([{ kind: 'choosePermanents', objects: [o(3)] }]);
  });

  test('clicking something that is not legal does nothing', () => {
    const h = harness(sacrifice({ legal: [o(1)] }));
    h.model().interaction.onObject(o(2));
    expect(h.ui().permanents).toEqual([]);
  });

  test('the prompt names the number when more than one is needed', () => {
    const d = sacrifice({ min: 2, max: 2 });
    expect(choosePermanentPrompt(d, lookupIndexFor([...board, ...viewOf(d).stack]))).toBe(
      'Sacrifice 2 permanents for Dragon.',
    );
  });

  test('Space and Enter press Confirm once a choice is valid, and Esc has no cancel', () => {
    const h = harness(sacrifice());
    const key = (k: string) => ({
      key: k,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      tag: 'BODY',
      editable: false,
      foreignModalOpen: false,
    });
    const ctx = () => ({ bar: h.model().bar, pinned: false, chooserOpen: false, canUndo: false });
    expect(keyCommand(key('Enter'), ctx())).toBeNull();
    h.model().interaction.onObject(o(1));
    expect(keyCommand(key('Enter'), ctx())).toBe('primary');
    expect(keyCommand(key(' '), ctx())).toBe('primary');
    expect(keyCommand(key('Escape'), ctx())).toBeNull();
  });
});

describe('orderTriggers', () => {
  const triggers: OrderTriggersDecision['triggers'] = [
    { source: o(5), sourceName: 'A', sourceOracleText: 'a text', abilityIndex: 0, count: 1 },
    { source: o(6), sourceName: 'B', sourceOracleText: 'b text', abilityIndex: 1, count: 2 },
    { source: o(7), sourceName: 'C', sourceOracleText: '', abilityIndex: 0, count: 1 },
  ];
  const d: OrderTriggersDecision = { id: 'd1', seat: 0, kind: 'orderTriggers', triggers };

  test('the default shows the engine default as a resolution order: last put on resolves first', () => {
    expect(defaultResolveOrder(d)).toEqual([2, 1, 0]);
    // Sending it back unchanged is exactly the engine's own order.
    expect(engineOrder(defaultResolveOrder(d))).toEqual([0, 1, 2]);
  });

  test('moving swaps neighbours and stops at the ends', () => {
    expect(moveTrigger([2, 1, 0], 1, -1)).toEqual([1, 2, 0]);
    expect(moveTrigger([2, 1, 0], 1, 1)).toEqual([2, 0, 1]);
    expect(moveTrigger([2, 1, 0], 0, -1)).toEqual([2, 1, 0]);
    expect(moveTrigger([2, 1, 0], 2, 1)).toEqual([2, 1, 0]);
  });

  test('rows say when they resolve', () => {
    expect([0, 1, 2].map((i) => resolvesLabel(i, 3))).toEqual([
      'Resolves first',
      'Resolves second',
      'Resolves last',
    ]);
    expect(resolvesLabel(0, 1)).toBe('Resolves first');
  });

  test('the answer puts the one that resolves last on the stack first', () => {
    const h = harness(d);
    expect(h.ui().triggerOrder).toEqual([2, 1, 0]);
    expect(h.model().bar.inOverlay).toBe(false);
    // Untouched: exactly the engine's default order.
    h.model().bar.buttons[0]?.run();
    expect(h.acts).toEqual([{ kind: 'orderTriggers', order: [0, 1, 2] }]);

    // Shown C, B, A. Move A (last to resolve) up twice: A, C, B. B goes on the stack first.
    const moved = moveTrigger(moveTrigger(h.ui().triggerOrder, 2, -1), 1, -1);
    expect(moved).toEqual([0, 2, 1]);
    const acts: Action[] = [];
    const m = buildModel(
      viewOf(d),
      d,
      { ...h.ui(), triggerOrder: moved },
      { act: (a) => acts.push(a), update: () => {}, openChooser: () => {} },
    );
    m.bar.buttons[0]?.run();
    expect(acts).toEqual([{ kind: 'orderTriggers', order: [1, 2, 0] }]);
  });

  test('the bar tells how many triggered and which resolves first', () => {
    const m = harness(d).model();
    expect(m.bar.prompt).toBe('Order your triggered abilities.');
    expect(m.bar.detail).toContain('3 abilities triggered');
    expect(m.bar.detail).toContain('top one resolves first');
    expect(m.bar.buttons.map((b) => b.label)).toEqual(['Confirm order']);
  });
});

describe('confirmOptional', () => {
  const d: ConfirmOptionalDecision = {
    id: 'd1',
    seat: 0,
    kind: 'confirmOptional',
    source: o(9),
    sourceName: 'Archivist',
    sourceOracleText: 'When this enters, you may draw a card.',
  };

  test('Yes accepts and No declines; Yes is the primary button', () => {
    const h = harness(d);
    const m = h.model();
    expect(m.bar.inOverlay).toBe(true);
    expect(m.bar.prompt).toBe('Archivist: When this enters, you may draw a card. — do it?');
    expect(m.bar.buttons.map((b) => [b.label, b.variant])).toEqual([
      ['Yes', 'primary'],
      ['No', 'secondary'],
    ]);
    m.bar.buttons[1]?.run();
    m.bar.buttons[0]?.run();
    expect(h.acts).toEqual([{ kind: 'declineOptional' }, { kind: 'acceptOptional' }]);
  });

  test('a source without rules text still reads', () => {
    expect(optionalPrompt('Token', '')).toBe('Token — do it?');
  });

  test('a shock land asks "Pay 2 life?" with Pay and Don\'t pay', () => {
    const shock: ConfirmOptionalDecision = {
      ...d,
      source: o(9),
      sourceName: 'Shock Land',
      sourceOracleText: "As this land enters, you may pay 2 life. If you don't, it enters tapped.",
      cost: [{ kind: 'payLife', amount: 2 }],
    };
    const h = harness(shock);
    const m = h.model();
    expect(m.bar.inOverlay).toBe(true);
    expect(m.bar.prompt).toBe('Pay 2 life?');
    expect(m.bar.buttons.map((b) => [b.label, b.variant])).toEqual([
      ['Pay', 'primary'],
      ["Don't pay", 'secondary'],
    ]);
    m.bar.buttons[1]?.run();
    m.bar.buttons[0]?.run();
    expect(h.acts).toEqual([{ kind: 'declineOptional' }, { kind: 'acceptOptional' }]);
  });

  test('a cost other than life reads by its kind, nothing is guessed', () => {
    expect(payPrompt([{ kind: 'payLife', amount: 3 }])).toBe('Pay 3 life?');
    expect(payPrompt([{ kind: 'discard', count: 1 }])).toBe('Pay discard?');
    expect(
      payPrompt([
        { kind: 'payLife', amount: 2 },
        { kind: 'discard', count: 1 },
      ]),
    ).toBe('Pay 2 life and discard?');
  });
});

describe('manual payment reads the colors the engine lists', () => {
  const ANY: readonly ManaColor[] = ['W', 'U', 'B', 'R', 'G'];
  const sources: PayManaDecision['manaSources'] = [
    { object: o(1), abilityIndex: 0 },
    { object: o(4), abilityIndex: 1, colors: ANY },
    // A two-colour land and a pain land: the colorless ability asks nothing, the other asks.
    { object: o(5), abilityIndex: 0, colors: ['U', 'B'] },
    { object: o(6), abilityIndex: 0 },
    { object: o(6), abilityIndex: 1, colors: ['U', 'B'] },
    // The commander's identity is a single color: nothing to ask.
    { object: o(7), abilityIndex: 0, colors: ['G'] },
  ];
  const d: PayManaDecision = {
    id: 'd1',
    seat: 0,
    kind: 'payMana',
    source: o(9),
    totalCost: ['1', 'R'],
    manaSources: sources,
  };

  test('a color is asked only when the engine lists more than one', () => {
    expect(sources.map(asksColor)).toEqual([false, true, true, false, true, false]);
    // The rules text plays no part: a card that says "any color" but lists none asks nothing.
    const h = harness({
      ...d,
      manaSources: [{ object: o(4), abilityIndex: 1 }],
    });
    h.model().interaction.onObject(o(4));
    expect(h.chooser).toEqual([]);
    expect(h.ui().taps).toEqual([{ object: o(4), abilityIndex: 1 }]);
  });

  test('tapping a Treasure asks for a color first; the color is sent with the tap', () => {
    const h = harness(d);
    h.model().interaction.onObject(o(4));
    expect(h.chooser).toEqual(['o4#1']);
    expect(h.ui().taps).toEqual([]);
    // The popover's reducer.
    const taps = setTapColor(h.ui().taps, sources, o(4), 1, 'R');
    expect(taps).toEqual([{ object: o(4), abilityIndex: 1, color: 'R' }]);
    expect(tapBadges(taps).get(o(4))).toBe('1 (R)');
  });

  test('a two-colour land asks, and only those two colors are acceptable', () => {
    const h = harness(d);
    h.model().interaction.onObject(o(5));
    expect(h.chooser).toEqual(['o5#0']);
    expect(setTapColor([], sources, o(5), 0, 'G')).toEqual([]);
    expect(setTapColor([], sources, o(5), 0, 'B')).toEqual([
      { object: o(5), abilityIndex: 0, color: 'B' },
    ]);
  });

  test('a one-colour list taps at once, with no color sent', () => {
    const h = harness(d);
    h.model().interaction.onObject(o(7));
    expect(h.chooser).toEqual([]);
    expect(h.ui().taps).toEqual([{ object: o(7), abilityIndex: 0 }]);
  });

  test('a pain land cycles: colorless, then the colour ability asks, then off', () => {
    const first = clickSource([], sources, o(6));
    expect(first).toEqual({ kind: 'taps', taps: [{ object: o(6), abilityIndex: 0 }] });
    if (first.kind !== 'taps') return;
    expect(clickSource(first.taps, sources, o(6))).toEqual({ kind: 'choose', abilityIndex: 1 });
    const picked = setTapColor(first.taps, sources, o(6), 1, 'U');
    expect(picked).toEqual([{ object: o(6), abilityIndex: 1, color: 'U' }]);
    expect(clickSource(picked, sources, o(6))).toEqual({ kind: 'taps', taps: [] });
  });

  test('a chosen color can be changed in place and a tapped source is taken back by a click', () => {
    const first = setTapColor([{ object: o(1), abilityIndex: 0 }], sources, o(4), 1, 'R');
    const second = setTapColor(first, sources, o(4), 1, 'G');
    expect(second).toEqual([
      { object: o(1), abilityIndex: 0 },
      { object: o(4), abilityIndex: 1, color: 'G' },
    ]);
    expect(untap(second, o(4))).toEqual([{ object: o(1), abilityIndex: 0 }]);
    expect(clickSource(second, sources, o(4))).toEqual({
      kind: 'taps',
      taps: [{ object: o(1), abilityIndex: 0 }],
    });
    // A source that is not offered cannot be tapped.
    expect(setTapColor([], sources, o(77), 0, 'W')).toEqual([]);
    expect(clickSource([], sources, o(77))).toEqual({ kind: 'taps', taps: [] });
    // Plain sources still toggle as before.
    expect(clickSource([], sources, o(1))).toEqual({
      kind: 'taps',
      taps: [{ object: o(1), abilityIndex: 0 }],
    });
  });

  test('sacrifice is still read from the text of the tapped source', () => {
    expect(sacrificesWhenTapped(treasure)).toBe(true);
    expect(sacrificesWhenTapped(card(1, 'Forest'))).toBe(false);
  });

  test('Pay sends the taps in the order the player made them, with their colors', () => {
    const h = harness(d);
    h.model().interaction.onObject(o(1));
    // Simulate the popover's pick.
    const taps = setTapColor(h.ui().taps, sources, o(4), 1, 'B');
    const view = viewOf(d);
    const acts: Action[] = [];
    const m = buildModel(
      view,
      d,
      { ...h.ui(), taps },
      { act: (a) => acts.push(a), update: () => {}, openChooser: () => {} },
    );
    m.bar.buttons[0]?.run();
    expect(acts).toEqual([
      {
        kind: 'payManual',
        taps: [
          { object: o(1), abilityIndex: 0 },
          { object: o(4), abilityIndex: 1, color: 'B' },
        ],
      },
    ]);
    // Clicking the tapped Treasure takes it back.
    const again = buildModel(
      view,
      d,
      { ...h.ui(), taps },
      { act: () => {}, update: (c) => c({ ...h.ui(), taps }), openChooser: () => {} },
    );
    expect(again.interaction.badge(o(4))).toBe('2 (B)');
  });
});
