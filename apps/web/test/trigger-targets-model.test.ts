/**
 * The target prompt of a triggered ability that is being put on the stack (CR 603.3d, D-089):
 * it names the trigger, has no Cancel (the engine refuses `cancel` for it) and Esc does nothing;
 * a spell's or an activation's target prompt keeps its Cancel. Built from hand-made views.
 */
import type {
  Action,
  GameView,
  ObjectId,
  ObjectView,
  PendingDecision,
  StackAbility,
} from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { type KeyContext, type KeyEventInfo, keyCommand } from '../src/ui/decisions/keys';
import { buildModel, type Controller } from '../src/ui/decisions/model';
import { initialUi, uiFor } from '../src/ui/decisions/ui-state';

const o = (n: number): ObjectId => `o${n}`;

const card = (n: number, name: string, patch: Partial<ObjectView> = {}): ObjectView =>
  ({ id: o(n), name, controller: 0, owner: 0, types: ['creature'], ...patch }) as ObjectView;

const destroyOpposing: StackAbility = {
  kind: 'triggered',
  trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
  targets: [
    {
      id: 't1',
      what: {
        kind: 'object',
        filter: { zone: 'battlefield', types: ['creature'], controller: 'opponent' },
      },
    },
  ],
  effect: { kind: 'destroy', objects: { kind: 'target', id: 't1' } },
};

const imp = card(1, 'Pyre Hound');
const victim = card(10, 'Goblin Guide', { controller: 1 });

function model(pending: PendingDecision, stack: readonly ObjectView[]) {
  const view = {
    viewer: 0,
    battlefield: [imp, victim],
    stack,
    exile: [],
    seats: [
      { id: 0, hand: [], graveyard: [], command: [] },
      { id: 1, hand: null, graveyard: [], command: [] },
    ],
    pending,
  } as unknown as GameView;
  const acts: Action[] = [];
  const ctl: Controller = {
    act: (a) => acts.push(a),
    update: () => undefined,
    openChooser: () => {},
  };
  const ui = uiFor(initialUi(null), pending);
  return { m: buildModel(view, pending, ui, ctl), acts };
}

const decision = (source: ObjectId, forTrigger: boolean): PendingDecision => ({
  id: 'd1',
  seat: 0,
  kind: 'targets',
  source,
  ...(forTrigger ? { forTrigger: true as const } : {}),
  specs: [{ specId: 't1', min: 1, max: 1, legal: [{ kind: 'object', id: o(10), specId: 't1' }] }],
});

const triggerOnStack = card(20, 'Pyre Hound', {
  types: [],
  abilitySource: o(1),
  ability: destroyOpposing,
});

const keys = (ctx: Partial<KeyContext>): KeyContext => ({
  bar: null,
  pinned: false,
  chooserOpen: false,
  canUndo: false,
  ...ctx,
});
const esc: KeyEventInfo = {
  key: 'Escape',
  tag: 'BODY',
  editable: false,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  foreignModalOpen: false,
};

describe('targets of a triggered ability', () => {
  test('the prompt names the trigger and reads what it does', () => {
    const { m } = model(decision(o(20), true), [triggerOnStack]);
    expect(m.bar.prompt).toBe(
      "Choose a target for Pyre Hound's ability (whenever Pyre Hound enters): Destroy target creature an opponent controls.",
    );
    expect(m.interaction.clickable).toEqual(new Set([o(10)]));
  });

  test('a Saga chapter ability names the chapter', () => {
    const chapter = { ...triggerOnStack, chapter: 2 };
    const { m } = model(decision(o(20), true), [chapter]);
    expect(m.bar.prompt).toContain(
      "Choose a target for Pyre Hound's chapter II ability (whenever Pyre Hound enters): ",
    );
  });

  test('an effect the gist does not know leaves the prompt at the ability name', () => {
    const odd = {
      ...triggerOnStack,
      ability: {
        ...destroyOpposing,
        effect: { kind: 'scry', count: 1 },
      },
    } as ObjectView;
    const { m } = model(decision(o(20), true), [odd]);
    expect(m.bar.prompt).toBe(
      "Choose a target for Pyre Hound's ability (whenever Pyre Hound enters).",
    );
  });

  test('a trigger the words do not know leaves the prompt at the ability name', () => {
    const unknown = {
      ...triggerOnStack,
      ability: { ...destroyOpposing, trigger: { kind: 'futureKind' } },
    } as unknown as ObjectView;
    const { m } = model(decision(o(20), true), [unknown]);
    expect(m.bar.prompt).toBe(
      "Choose a target for Pyre Hound's ability: Destroy target creature an opponent controls.",
    );
  });

  test('there is no Cancel button, and Esc does nothing', () => {
    const { m, acts } = model(decision(o(20), true), [triggerOnStack]);
    expect(m.bar.cancel).toBeNull();
    expect(keyCommand(esc, keys({ bar: m.bar }))).toBeNull();
    m.bar.cancel?.run();
    expect(acts).toEqual([]);
    // Confirm is still the one way forward.
    expect(m.bar.buttons.map((b) => b.label)).toEqual(['Confirm']);
  });

  test('a spell keeps its Cancel and Esc cancels it', () => {
    const bolt = card(5, 'Lightning Bolt', { types: ['instant'] });
    const { m, acts } = model(decision(o(5), false), [bolt]);
    expect(m.bar.prompt).toBe('Choose a target for Lightning Bolt.');
    expect(m.bar.cancel?.label).toBe('Cancel');
    expect(keyCommand(esc, keys({ bar: m.bar }))).toBe('cancel');
    m.bar.cancel?.run();
    expect(acts).toEqual([{ kind: 'cancel' }]);
  });

  test('an activated ability keeps its Cancel too', () => {
    const activation = card(21, 'Pyre Hound', { types: [], abilitySource: o(1) });
    const { m } = model(decision(o(21), false), [activation]);
    expect(m.bar.cancel?.label).toBe('Cancel');
  });
});
