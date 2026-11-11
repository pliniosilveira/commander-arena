import type {
  Action,
  DeclareAttackersDecision,
  DeclareBlockersDecision,
  GameView,
  ObjectId,
  ObjectView,
  PendingDecision,
} from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { type KeyContext, type KeyEventInfo, keyCommand } from '../src/ui/decisions/keys';
import { buildModel, type Controller } from '../src/ui/decisions/model';
import { initialUi, type UiState, uiFor } from '../src/ui/decisions/ui-state';

const o = (n: number): ObjectId => `o${n}`;

function card(n: number, name: string, patch: Partial<ObjectView> = {}): ObjectView {
  return {
    id: o(n),
    name,
    controller: 0,
    owner: 0,
    types: ['creature'],
    tapped: false,
    keywords: [],
    summoningSick: false,
    ...patch,
  } as ObjectView;
}

const board = [
  card(1, 'Grizzly Bears'),
  card(2, 'Serra Angel'),
  card(10, 'Goblin Guide', { controller: 1 }),
  card(11, 'Menace Man', { controller: 1 }),
];

function viewOf(pending: PendingDecision | null, patch: Partial<GameView> = {}): GameView {
  return {
    viewer: 0,
    turn: 3,
    activeSeat: 0,
    step: 'precombatMain',
    battlefield: board,
    stack: [],
    exile: [],
    seats: [
      {
        id: 0,
        hand: [card(5, 'Lightning Bolt', { types: ['instant'] })],
        graveyard: [],
        command: [],
        mulligans: 0,
      },
      { id: 1, hand: null, graveyard: [], command: [], mulligans: 0 },
    ],
    pending,
    ...patch,
  } as unknown as GameView;
}

/** Applies controller updates to a state, records actions. */
function harness(pending: PendingDecision, patch: Partial<GameView> = {}) {
  const view = viewOf(pending, patch);
  const acts: Action[] = [];
  const chooser: ObjectId[] = [];
  let ui: UiState = uiFor(initialUi(null), pending);
  const ctl: Controller = {
    act: (a) => acts.push(a),
    update: (change) => {
      ui = change(ui);
    },
    openChooser: (id) => chooser.push(id),
  };
  const model = () => buildModel(view, pending, ui, ctl);
  return { model, acts, chooser, ui: () => ui };
}

describe('model: priority', () => {
  const pending: PendingDecision = {
    id: 'd1',
    seat: 0,
    kind: 'priority',
    options: [
      { kind: 'pass' },
      { kind: 'castSpell', object: o(5) },
      { kind: 'activateAbility', source: o(1), abilityIndex: 0, color: 'W' },
      { kind: 'activateAbility', source: o(1), abilityIndex: 0, color: 'U' },
      { kind: 'activateAbility', source: o(2), abilityIndex: 0, color: null },
    ],
  };
  test('clickable objects, the pass button, and what each click sends', () => {
    const h = harness(pending);
    const m = h.model();
    expect(m.interaction.clickable).toEqual(new Set([o(5), o(1), o(2)]));
    expect(m.interaction.dimOthers).toBe(false);
    const primary = m.bar.buttons[0];
    expect(primary?.label).toBe('To Combat');
    primary?.run();
    m.interaction.onObject(o(5));
    m.interaction.onObject(o(2));
    m.interaction.onObject(o(1));
    expect(h.acts).toEqual([
      { kind: 'pass' },
      { kind: 'castSpell', object: o(5) },
      { kind: 'activateAbility', source: o(2), abilityIndex: 0, color: null },
    ]);
    expect(h.chooser).toEqual([o(1)]);
  });
});

describe('model: mulligan and card choices', () => {
  test('mulligan disables Mulligan when none is possible', () => {
    const d: PendingDecision = {
      id: 'd1',
      seat: 0,
      kind: 'mulligan',
      hand: [o(5)],
      bottomCount: 1,
      canMulligan: false,
    };
    const m = harness(d).model();
    expect(m.bar.inOverlay).toBe(true);
    expect(m.bar.buttons.map((b) => [b.label, b.disabled])).toEqual([
      ['Keep', false],
      ['Mulligan', true],
    ]);
  });

  test('discard needs exactly count cards', () => {
    const d: PendingDecision = {
      id: 'd1',
      seat: 0,
      kind: 'discard',
      count: 2,
      hand: [o(1), o(2), o(5)],
    };
    const h = harness(d);
    expect(h.model().bar.buttons[0]?.disabled).toBe(true);
    h.model().interaction.onObject(o(1));
    h.model().interaction.onObject(o(2));
    h.model().interaction.onObject(o(5));
    const m = h.model();
    expect(m.bar.buttons[0]?.disabled).toBe(false);
    expect(m.interaction.selected).toEqual(new Set([o(1), o(2)]));
    m.bar.buttons[0]?.run();
    expect(h.acts).toEqual([{ kind: 'chooseCards', objects: [o(1), o(2)] }]);
  });
});

describe('model: targets', () => {
  const d: PendingDecision = {
    id: 'd1',
    seat: 0,
    kind: 'targets',
    source: o(5),
    specs: [
      {
        specId: 's0',
        min: 1,
        max: 1,
        legal: [
          { kind: 'object', id: o(10), specId: 's0' },
          { kind: 'player', seat: 1, specId: 's0' },
        ],
      },
    ],
  };
  test('legal targets are clickable, others dim, Confirm waits for a pick, Cancel cancels', () => {
    const h = harness(d, { stack: [card(5, 'Lightning Bolt')] });
    let m = h.model();
    expect(m.interaction.dimOthers).toBe(true);
    expect(m.interaction.clickable).toEqual(new Set([o(10)]));
    expect(m.interaction.clickableSeats).toEqual(new Set([1]));
    expect(m.bar.prompt).toBe('Choose a target for Lightning Bolt.');
    expect(m.bar.buttons[0]?.disabled).toBe(true);
    m.interaction.onSeat(1);
    m = h.model();
    expect(m.interaction.selectedSeats).toEqual(new Set([1]));
    expect(m.bar.buttons[0]?.disabled).toBe(false);
    m.bar.buttons[0]?.run();
    m.bar.cancel?.run();
    expect(h.acts).toEqual([
      { kind: 'chooseTargets', targets: [{ kind: 'player', seat: 1, specId: 's0' }] },
      { kind: 'cancel' },
    ]);
    // The only slot is full, so a further pick is ignored and nothing is badged.
    m.interaction.onObject(o(10));
    expect(h.model().interaction.badge(o(10))).toBeNull();
  });
});

describe('model: payMana', () => {
  const d: PendingDecision = {
    id: 'd1',
    seat: 0,
    kind: 'payMana',
    source: o(5),
    totalCost: ['1', 'R'],
    manaSources: [
      { object: o(1), abilityIndex: 0 },
      { object: o(2), abilityIndex: 0 },
    ],
  };
  test('taps are numbered in order and sent as payManual', () => {
    const h = harness(d);
    h.model().interaction.onObject(o(2));
    h.model().interaction.onObject(o(1));
    const m = h.model();
    expect(m.interaction.badge(o(2))).toBe('1');
    expect(m.interaction.badge(o(1))).toBe('2');
    expect(m.bar.buttons[0]?.label).toBe('Pay (2 taps)');
    m.bar.buttons[0]?.run();
    m.bar.buttons[1]?.run();
    expect(h.acts).toEqual([
      {
        kind: 'payManual',
        taps: [
          { object: o(2), abilityIndex: 0 },
          { object: o(1), abilityIndex: 0 },
        ],
      },
      { kind: 'payAuto' },
    ]);
    expect(m.bar.cancel).not.toBeNull();
  });
});

describe('model: declareAttackers', () => {
  const d: DeclareAttackersDecision & PendingDecision = {
    id: 'd1',
    seat: 0,
    kind: 'declareAttackers',
    mustAttack: [],
    candidates: [
      {
        attacker: o(1),
        targets: [
          { kind: 'player', seat: 1 },
          { kind: 'permanent', object: o(10) },
        ],
      },
      { attacker: o(2), targets: [{ kind: 'player', seat: 1 }] },
    ],
  };
  test('toggle, badge, label, all out and the sent attack set', () => {
    const h = harness(d);
    expect(h.model().bar.buttons[1]?.label).toBe('No Attack');
    h.model().interaction.onObject(o(1));
    let m = h.model();
    expect(m.interaction.badge(o(1))).toBe('Attacking');
    expect(m.interaction.badge(o(2))).toBeNull();
    expect(m.bar.buttons[1]?.label).toBe('Declare attackers (1)');
    m.bar.buttons[0]?.run();
    m = h.model();
    expect(m.interaction.selected).toEqual(new Set([o(1), o(2)]));
    m.bar.buttons[1]?.run();
    expect(h.acts[0]).toEqual({
      kind: 'declareAttackers',
      attacks: [
        { attacker: o(1), target: { kind: 'player', seat: 1 } },
        { attacker: o(2), target: { kind: 'player', seat: 1 } },
      ],
    });
    m.interaction.onObject(o(1));
    m.interaction.onObject(o(2));
    expect(h.model().bar.buttons[1]?.label).toBe('No Attack');
  });
  test('a creature with no candidates says so', () => {
    const none = harness({ ...d, candidates: [] }).model();
    expect(none.bar.prompt).toBe('No creature can attack.');
    expect(none.bar.buttons[0]?.disabled).toBe(true);
  });
});

describe('model: declareBlockers', () => {
  const d: DeclareBlockersDecision & PendingDecision = {
    id: 'd1',
    seat: 0,
    kind: 'declareBlockers',
    attackers: [
      { attacker: o(10), target: { kind: 'player', seat: 0 }, minBlockers: 1 },
      { attacker: o(11), target: { kind: 'player', seat: 0 }, minBlockers: 2 },
    ],
    candidates: [
      { blocker: o(1), canBlock: [o(10), o(11)] },
      { blocker: o(2), canBlock: [o(11)] },
    ],
  };
  test('select a blocker, assign, badges, and the menace rule disables Block', () => {
    const h = harness(d);
    let m = h.model();
    expect(m.interaction.clickable).toEqual(new Set([o(1), o(2)]));
    expect(m.interaction.badge(o(11))).toBe('needs 2 blockers');
    expect(m.bar.buttons[0]?.label).toBe('No Blocks');
    m.interaction.onObject(o(1));
    m = h.model();
    // The attackers it may block become clickable.
    expect(m.interaction.clickable).toEqual(new Set([o(1), o(2), o(10), o(11)]));
    expect(m.interaction.badge(o(1))).toBe('Choose attacker');
    m.interaction.onObject(o(11));
    m = h.model();
    // The number is the attacker's place among the attackers, as the board shows it on both ends.
    expect(m.interaction.badge(o(1))).toBe('Blocks #2');
    expect(m.interaction.pendingBlocks).toEqual([{ blocker: o(1), attacker: o(11) }]);
    expect(m.interaction.badge(o(11))).toBe('1 blocker, needs 2');
    expect(m.bar.buttons[0]?.disabled).toBe(true);
    expect(m.bar.detail).toContain('Menace Man needs 2 blockers');
    m.interaction.onObject(o(2));
    m.interaction.onObject(o(11));
    m = h.model();
    expect(m.bar.buttons[0]?.disabled).toBe(false);
    expect(m.interaction.badge(o(11))).toBe('2 blockers');
    m.bar.buttons[0]?.run();
    expect(h.acts).toEqual([
      {
        kind: 'declareBlockers',
        blocks: [
          { blocker: o(1), attacker: o(11) },
          { blocker: o(2), attacker: o(11) },
        ],
      },
    ]);
  });
});

describe('model: assignDamage and commanderZone', () => {
  test('starts from the default division and sends it on Confirm', () => {
    const d: PendingDecision = {
      id: 'd1',
      seat: 0,
      kind: 'assignDamage',
      step: 'regular',
      choices: [
        {
          source: o(1),
          power: 3,
          deathtouch: false,
          trample: false,
          blockers: [
            { object: o(10), lethal: 2 },
            { object: o(11), lethal: 2 },
          ],
          tramplesOver: null,
        },
      ],
    };
    const h = harness(d);
    const m = h.model();
    expect(m.bar.buttons[0]?.disabled).toBe(false);
    m.bar.buttons[0]?.run();
    expect(h.acts[0]).toEqual({
      kind: 'assignDamage',
      assignments: [
        { source: o(1), to: { kind: 'object', id: o(10) }, amount: 2 },
        { source: o(1), to: { kind: 'object', id: o(11) }, amount: 1 },
      ],
    });
  });

  test('commander zone yes and no', () => {
    const d: PendingDecision = {
      id: 'd1',
      seat: 0,
      kind: 'commanderZone',
      card: 'c1',
      object: o(1),
      from: 'graveyard',
    };
    const h = harness(d);
    const m = h.model();
    expect(m.bar.prompt).toBe('Move Grizzly Bears to the command zone?');
    m.bar.buttons[0]?.run();
    m.bar.buttons[1]?.run();
    expect(h.acts).toEqual([{ kind: 'moveToCommandZone' }, { kind: 'declineCommandZone' }]);
  });
});

describe('local state belongs to one decision', () => {
  test('a new decision id starts from a fresh state', () => {
    const a: PendingDecision = { id: 'd1', seat: 0, kind: 'discard', count: 1, hand: [o(1)] };
    const b: PendingDecision = { ...a, id: 'd2' };
    const stored = { ...initialUi(a), cards: [o(1)] };
    expect(uiFor(stored, a).cards).toEqual([o(1)]);
    expect(uiFor(stored, b).cards).toEqual([]);
    expect(uiFor(stored, null).decisionId).toBeNull();
  });
});

describe('keyboard', () => {
  const run = () => undefined;
  const bar = (over: { cancel?: boolean; disabled?: boolean } = {}) => ({
    prompt: '',
    detail: null,
    inOverlay: false,
    buttons: [
      {
        key: 'p',
        label: 'Pass',
        variant: 'primary' as const,
        disabled: over.disabled === true,
        hint: null,
        run,
      },
    ],
    cancel:
      over.cancel === true
        ? {
            key: 'c',
            label: 'Cancel',
            variant: 'secondary' as const,
            disabled: false,
            hint: null,
            run,
          }
        : null,
  });
  const ev = (key: string, patch: Partial<KeyEventInfo> = {}): KeyEventInfo => ({
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    tag: 'BODY',
    editable: false,
    foreignModalOpen: false,
    ...patch,
  });
  const ctx = (patch: Partial<KeyContext> = {}): KeyContext => ({
    bar: bar(),
    pinned: false,
    chooserOpen: false,
    canUndo: false,
    ...patch,
  });

  test('Ctrl+Z and Cmd+Z undo only when there is something to take back', () => {
    expect(keyCommand(ev('z', { ctrlKey: true }), ctx({ canUndo: true }))).toBe('undo');
    expect(keyCommand(ev('Z', { metaKey: true }), ctx({ canUndo: true }))).toBe('undo');
    expect(keyCommand(ev('z', { ctrlKey: true }), ctx())).toBeNull();
    expect(keyCommand(ev('z'), ctx({ canUndo: true }))).toBeNull();
    expect(keyCommand(ev('z', { ctrlKey: true, altKey: true }), ctx({ canUndo: true }))).toBeNull();
    expect(keyCommand(ev('z', { ctrlKey: true, tag: 'INPUT' }), ctx({ canUndo: true }))).toBeNull();
  });

  test('Space and Enter press the primary button when it is enabled', () => {
    expect(keyCommand(ev(' '), ctx())).toBe('primary');
    expect(keyCommand(ev('Enter'), ctx())).toBe('primary');
    expect(keyCommand(ev(' '), ctx({ bar: bar({ disabled: true }) }))).toBeNull();
    expect(keyCommand(ev(' '), ctx({ bar: null }))).toBeNull();
  });

  test('a focused button or an input keeps its own keys', () => {
    expect(keyCommand(ev(' ', { tag: 'BUTTON' }), ctx())).toBeNull();
    expect(keyCommand(ev('Enter', { tag: 'BUTTON' }), ctx())).toBeNull();
    expect(keyCommand(ev(' ', { tag: 'INPUT' }), ctx())).toBeNull();
    expect(keyCommand(ev('f', { tag: 'TEXTAREA' }), ctx())).toBeNull();
    expect(keyCommand(ev(' ', { editable: true }), ctx())).toBeNull();
  });

  test('Esc unpins first, then closes the chooser, then cancels; never two at once', () => {
    const both = ctx({ bar: bar({ cancel: true }), pinned: true, chooserOpen: true });
    expect(keyCommand(ev('Escape'), both)).toBe('unpin');
    expect(keyCommand(ev('Escape'), { ...both, pinned: false })).toBe('closeChooser');
    expect(keyCommand(ev('Escape'), { ...both, pinned: false, chooserOpen: false })).toBe('cancel');
    expect(keyCommand(ev('Escape'), ctx())).toBeNull();
  });

  test('F toggles Full Control; modifiers and foreign modals are ignored', () => {
    expect(keyCommand(ev('f'), ctx())).toBe('fullControl');
    expect(keyCommand(ev('F'), ctx())).toBe('fullControl');
    expect(keyCommand(ev('f', { ctrlKey: true }), ctx())).toBeNull();
    expect(keyCommand(ev('Escape', { foreignModalOpen: true }), ctx({ pinned: true }))).toBeNull();
    expect(keyCommand(ev(' ', { foreignModalOpen: true }), ctx())).toBeNull();
  });
});
