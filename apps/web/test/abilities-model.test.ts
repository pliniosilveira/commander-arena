/** Activated abilities at priority (D-075) as pure models: click outcomes, the chooser's labels,
 * the cancel of a sacrifice cost. No DOM. */
import type {
  Action,
  ActivatedAbility,
  ChoosePermanentDecision,
  GameView,
  ObjectId,
  ObjectView,
  PendingDecision,
  PriorityDecision,
  PriorityOption,
} from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { keyCommand } from '../src/ui/decisions/keys';
import { buildModel, type Controller } from '../src/ui/decisions/model';
import { choosePermanentPrompt } from '../src/ui/decisions/permanents';
import { clickOutcome, playableObjects } from '../src/ui/decisions/priority';
import { initialUi, type UiState, uiFor } from '../src/ui/decisions/ui-state';
import { lookupIndexFor } from './decisions-helpers';

const o = (n: number): ObjectId => `o${n}`;
const mana = (...symbols: string[]) => ({ kind: 'mana', symbols }) as const;
const draw = { kind: 'draw', player: { kind: 'you' }, count: 1 } as const;
const pumpEffect = {
  kind: 'modifyPt',
  objects: { kind: 'this' },
  power: 1,
  toughness: 1,
  duration: 'untilEndOfTurn',
} as const;

const pump: ActivatedAbility = { kind: 'activated', cost: [mana('1')], effect: pumpEffect };
const cycling: ActivatedAbility = {
  kind: 'activated',
  cost: [{ kind: 'discardThis' }, mana('2')],
  effect: draw,
  functionsIn: 'hand',
};
const altar: ActivatedAbility = {
  kind: 'activated',
  cost: [{ kind: 'sacrifice', what: { types: ['creature'] } }],
  effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 2 },
};

function card(n: number, name: string, patch: Partial<ObjectView> = {}): ObjectView {
  return {
    id: o(n),
    name,
    controller: 0,
    owner: 0,
    types: ['creature'],
    oracleText: '',
    ...patch,
  } as ObjectView;
}

// o1: a pump creature. o2: a creature in hand that can be cast or cycled. o3: two abilities.
// o4: a plain creature. o9: the ability on the stack.
const pumpBear = card(1, 'Pump Bear', { activated: [{ abilityIndex: 0, ability: pump }] });
const cyclingBear = card(2, 'Cycling Bear', {
  zone: 'hand',
  activated: [{ abilityIndex: 1, ability: cycling }],
});
const twoTricks = card(3, 'Two Tricks', {
  activated: [
    { abilityIndex: 0, ability: pump },
    { abilityIndex: 1, ability: altar },
  ],
});
const grizzly = card(4, 'Grizzly Bears');
const onStack = card(9, 'Altar', { types: [], abilitySource: o(5) });

const act = (object: number, abilityIndex: number): PriorityOption => ({
  kind: 'activate',
  object: o(object),
  abilityIndex,
});

const priority = (...options: PriorityOption[]): PriorityDecision => ({
  id: 'd1',
  seat: 0,
  kind: 'priority',
  options: [{ kind: 'pass' }, ...options],
});

const index = lookupIndexFor([pumpBear, cyclingBear, twoTricks, grizzly, onStack]);

function viewOf(pending: PendingDecision): GameView {
  return {
    viewer: 0,
    turn: 3,
    activeSeat: 0,
    step: 'precombatMain',
    battlefield: [pumpBear, twoTricks, grizzly],
    stack: [onStack],
    exile: [],
    seats: [
      { id: 0, hand: [cyclingBear], graveyard: [], command: [], mulligans: 0 },
      { id: 1, hand: null, graveyard: [], command: [], mulligans: 0 },
    ],
    pending,
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
    openChooser: (id) => chooser.push(id),
  };
  return { model: () => buildModel(view, pending, ui, ctl), acts, chooser };
}

describe('clicking an object with activated abilities', () => {
  test('an object with an activate option is clickable', () => {
    const d = priority(act(1, 0), { kind: 'castSpell', object: o(2) }, act(2, 1));
    expect(playableObjects(d)).toEqual(new Set([o(1), o(2)]));
    expect(playableObjects(priority(act(3, 0)))).toEqual(new Set([o(3)]));
  });

  test('one activate option and nothing else: the click activates it', () => {
    expect(clickOutcome(priority(act(1, 0)), o(1), index)).toEqual({
      kind: 'act',
      action: { kind: 'activate', object: o(1), abilityIndex: 0 },
    });
    // Without a view index the click still works: labels are only for the menu.
    expect(clickOutcome(priority(act(1, 0)), o(1))).toEqual({
      kind: 'act',
      action: { kind: 'activate', object: o(1), abilityIndex: 0 },
    });
  });

  test('cast and cycle: a menu with Cast first and "Cycling {2}" second', () => {
    const d = priority({ kind: 'castSpell', object: o(2) }, act(2, 1));
    const outcome = clickOutcome(d, o(2), index);
    if (outcome.kind !== 'menu') throw new Error(`expected a menu, got ${outcome.kind}`);
    expect(outcome.items.map((i) => i.label)).toEqual(['Cast Cycling Bear', 'Cycling {2}']);
    expect(outcome.items.map((i) => i.action)).toEqual([
      { kind: 'castSpell', object: o(2) },
      { kind: 'activate', object: o(2), abilityIndex: 1 },
    ]);
  });

  test('a land that can be played or cycled offers both', () => {
    const land = card(6, 'Cycling Land', {
      types: ['land'],
      zone: 'hand',
      activated: [
        { abilityIndex: 2, ability: { ...cycling, cost: [{ kind: 'discardThis' }, mana('1')] } },
      ],
    });
    const d = priority({ kind: 'playLand', object: o(6) }, act(6, 2));
    const outcome = clickOutcome(d, o(6), lookupIndexFor([land]));
    if (outcome.kind !== 'menu') throw new Error('expected a menu');
    expect(outcome.items.map((i) => i.label)).toEqual(['Play Cycling Land', 'Cycling {1}']);
  });

  test('several abilities: a menu in the card order, each with its cost and a short effect', () => {
    const outcome = clickOutcome(priority(act(3, 0), act(3, 1)), o(3), index);
    if (outcome.kind !== 'menu') throw new Error('expected a menu');
    expect(outcome.items.map((i) => i.label)).toEqual([
      '{1}: This creature gets +1/+1 until end of turn',
      'Sacrifice a creature: You gain 2 life',
    ]);
  });

  test('a mana ability next to an activation joins the menu', () => {
    const d = priority(act(3, 1), {
      kind: 'activateAbility',
      source: o(3),
      abilityIndex: 0,
      color: 'G',
    });
    const outcome = clickOutcome(d, o(3), index);
    if (outcome.kind !== 'menu') throw new Error('expected a menu');
    expect(outcome.items.map((i) => i.label)).toEqual([
      'Sacrifice a creature: You gain 2 life',
      'Add G',
    ]);
  });

  test('an index without the ability still lets the player pick it, by number', () => {
    const outcome = clickOutcome(priority(act(1, 0), act(1, 1)), o(1), lookupIndexFor([]));
    if (outcome.kind !== 'menu') throw new Error('expected a menu');
    expect(outcome.items.map((i) => i.label)).toEqual(['Ability 1', 'Ability 2']);
  });

  test('objects without an option do nothing', () => {
    expect(clickOutcome(priority(act(1, 0)), o(4), index)).toEqual({ kind: 'none' });
  });

  test('the priority model acts on one option and opens the chooser for several', () => {
    const one = harness(priority(act(1, 0)));
    one.model().interaction.onObject(o(1));
    expect(one.acts).toEqual([{ kind: 'activate', object: o(1), abilityIndex: 0 }]);
    expect(one.chooser).toEqual([]);

    const many = harness(priority({ kind: 'castSpell', object: o(2) }, act(2, 1)));
    many.model().interaction.onObject(o(2));
    expect(many.acts).toEqual([]);
    expect(many.chooser).toEqual([o(2)]);
    expect(many.model().interaction.clickable).toEqual(new Set([o(2)]));
  });

  test('Esc closes the open chooser before anything else', () => {
    const h = harness(priority(act(3, 0), act(3, 1)));
    const key = {
      key: 'Escape',
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      tag: 'BUTTON',
      editable: false,
      foreignModalOpen: false,
    };
    const ctx = (chooserOpen: boolean) => ({
      bar: h.model().bar,
      pinned: false,
      chooserOpen,
      canUndo: false,
    });
    expect(keyCommand(key, ctx(true))).toBe('closeChooser');
    expect(keyCommand(key, ctx(false))).toBeNull();
  });
});

describe('a sacrifice that pays for an ability', () => {
  const effectOf = (): ChoosePermanentDecision => ({
    id: 'd2',
    seat: 0,
    kind: 'choosePermanent',
    source: o(9),
    purpose: 'sacrifice',
    min: 1,
    max: 1,
    legal: [o(1), o(4)],
  });
  const costOf = (): ChoosePermanentDecision => ({ ...effectOf(), forCost: true });

  test('the prompt says it pays for the source, an effect keeps the old wording', () => {
    expect(choosePermanentPrompt(costOf(), index)).toBe('Sacrifice a permanent to pay for Altar.');
    expect(choosePermanentPrompt(effectOf(), index)).toBe('Sacrifice a permanent for Altar.');
    expect(choosePermanentPrompt({ ...effectOf(), forCost: false }, index)).toBe(
      'Sacrifice a permanent for Altar.',
    );
  });

  test('the bar has a Cancel that sends the engine cancel, and Esc presses it', () => {
    const h = harness(costOf());
    const m = h.model();
    expect(m.bar.prompt).toBe('Sacrifice a permanent to pay for Altar.');
    expect(m.bar.cancel?.label).toBe('Cancel');
    expect(m.bar.cancel?.disabled).toBe(false);
    m.bar.cancel?.run();
    expect(h.acts).toEqual([{ kind: 'cancel' }]);
    const key = {
      key: 'Escape',
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      tag: 'BODY',
      editable: false,
      foreignModalOpen: false,
    };
    expect(keyCommand(key, { bar: m.bar, pinned: false, chooserOpen: false, canUndo: false })).toBe(
      'cancel',
    );
  });

  test('Confirm still sends the chosen permanent', () => {
    const h = harness(costOf());
    h.model().interaction.onObject(o(4));
    h.model().bar.buttons[0]?.run();
    expect(h.acts).toEqual([{ kind: 'choosePermanents', objects: [o(4)] }]);
  });

  test('a sacrifice for an effect has no Cancel: the engine would refuse it', () => {
    const h = harness(effectOf());
    expect(h.model().bar.cancel).toBeNull();
  });
});
