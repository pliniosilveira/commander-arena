/**
 * Kicker and Flashback as pure models: what a click on a graveyard card sends and labels, the
 * kicker question's prompt and buttons, its Cancel and Esc, and that the older questions keep
 * their words. No DOM.
 */
import type {
  Action,
  ConfirmOptionalDecision,
  GameView,
  ObjectView,
  PendingDecision,
  PriorityDecision,
  PriorityOption,
} from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { kickerCostPart } from '../src/game/cost-text';
import { flashbackCost, flashbackLabel } from '../src/ui/decisions/flashback';
import { keyCommand } from '../src/ui/decisions/keys';
import { buildModel, type Controller } from '../src/ui/decisions/model';
import { kickerPrompt } from '../src/ui/decisions/optional';
import { clickOutcome, playableObjects } from '../src/ui/decisions/priority';
import { initialUi } from '../src/ui/decisions/ui-state';
import { lookupIndexFor } from './decisions-helpers';

const card = (n: number, name: string, patch: Partial<ObjectView> = {}): ObjectView =>
  ({
    id: `o${n}`,
    name,
    controller: 0,
    owner: 0,
    types: ['instant'],
    oracleText: '',
    keywords: [],
    ...patch,
  }) as ObjectView;

const slay = card(1, 'Flash Slay', {
  zone: 'graveyard',
  keywords: ['flashback'],
  oracleText: 'Destroy target creature. Flashback {2}{B}.',
});
const study = card(2, 'Flash Study', {
  zone: 'graveyard',
  types: ['sorcery'],
  keywords: ['flashback'],
  oracleText: 'Draw a card. Flashback {4}{U}.',
});
const odd = card(3, 'Odd Flash', {
  zone: 'graveyard',
  keywords: ['flashback'],
  oracleText: 'Flashback-Pay 3 life.',
});
const bolt = card(4, 'Bolt', { zone: 'hand' });
const index = lookupIndexFor([slay, study, odd, bolt]);

const priority = (...options: PriorityOption[]): PriorityDecision => ({
  id: 'd1',
  seat: 0,
  kind: 'priority',
  options: [{ kind: 'pass' }, ...options],
});

const fb = (n: number): PriorityOption => ({
  kind: 'castSpell',
  object: `o${n}`,
  alternative: 'flashback',
});

function harness(pending: PendingDecision) {
  const view = {
    viewer: 0,
    turn: 3,
    activeSeat: 0,
    step: 'precombatMain',
    battlefield: [],
    stack: [],
    exile: [],
    seats: [
      { id: 0, hand: [bolt], graveyard: [slay, study, odd], command: [], mulligans: 0 },
      { id: 1, hand: null, graveyard: [], command: [], mulligans: 0 },
    ],
    pending,
  } as unknown as GameView;
  const acts: Action[] = [];
  const chooser: string[] = [];
  const ctl: Controller = {
    act: (a) => acts.push(a),
    update: () => {},
    openChooser: (id) => chooser.push(id),
  };
  return { model: buildModel(view, pending, initialUi(pending), ctl), acts, chooser };
}

describe('a graveyard card with a flashback option', () => {
  test('it is clickable, and the click sends the cast with its alternative', () => {
    const d = priority(fb(1), { kind: 'castSpell', object: 'o4' });
    expect(playableObjects(d)).toEqual(new Set(['o1', 'o4']));
    expect(clickOutcome(d, 'o1', index)).toEqual({
      kind: 'act',
      action: { kind: 'castSpell', object: 'o1', alternative: 'flashback' },
    });
    // A hand card still sends the plain cast.
    expect(clickOutcome(d, 'o4', index)).toEqual({
      kind: 'act',
      action: { kind: 'castSpell', object: 'o4' },
    });
  });

  test('the model sends it on a click and badges it "Flashback {cost}"', () => {
    const { model, acts } = harness(priority(fb(1), fb(2), fb(3)));
    model.interaction.onObject('o1');
    expect(acts).toEqual([{ kind: 'castSpell', object: 'o1', alternative: 'flashback' }]);
    expect(model.interaction.badge('o1')).toBe('Flashback {2}{B}');
    expect(model.interaction.badge('o2')).toBe('Flashback {4}{U}');
    // A cost the text does not print in mana symbols is left out, not guessed.
    expect(model.interaction.badge('o3')).toBe('Flashback');
    expect(model.interaction.badge('o4')).toBeNull();
  });

  test('a card with another option too gets a menu whose item carries the alternative', () => {
    const d = priority(fb(1), { kind: 'activate', object: 'o1', abilityIndex: 0 });
    const outcome = clickOutcome(d, 'o1', index);
    if (outcome.kind !== 'menu') throw new Error('expected a menu');
    expect(outcome.items[0]?.label).toBe('Flashback {2}{B}');
    expect(outcome.items[0]?.action).toEqual({
      kind: 'castSpell',
      object: 'o1',
      alternative: 'flashback',
    });
  });

  test('the cost is read from the Oracle text', () => {
    expect(flashbackCost(slay)).toBe('{2}{B}');
    expect(flashbackCost(card(9, 'Plain'))).toBeNull();
    expect(flashbackCost(undefined)).toBeNull();
    expect(flashbackLabel(undefined)).toBe('Flashback');
  });
});

const kicker = (cost: ConfirmOptionalDecision['cost']): ConfirmOptionalDecision => ({
  id: 'd2',
  seat: 0,
  kind: 'confirmOptional',
  source: 'o5',
  sourceName: 'Kicker Bear',
  sourceOracleText: 'Kicker {2}.',
  purpose: 'kicker',
  ...(cost === undefined ? {} : { cost }),
});

describe('the kicker question', () => {
  test('a mana cost: "Pay the kicker cost {2}?", Kick (primary) and Don\'t kick', () => {
    const { model, acts } = harness(kicker([{ kind: 'mana', symbols: ['2'] }]));
    expect(model.bar.prompt).toBe('Pay the kicker cost {2}?');
    expect(model.bar.inOverlay).toBe(true);
    expect(model.bar.buttons.map((b) => [b.label, b.variant])).toEqual([
      ['Kick', 'primary'],
      ["Don't kick", 'secondary'],
    ]);
    model.bar.buttons[0]?.run();
    model.bar.buttons[1]?.run();
    expect(acts).toEqual([{ kind: 'acceptOptional' }, { kind: 'declineOptional' }]);
  });

  test('a life cost reads "Pay the kicker cost: 3 life?"; mana and life together name both', () => {
    expect(harness(kicker([{ kind: 'payLife', amount: 3 }])).model.bar.prompt).toBe(
      'Pay the kicker cost: 3 life?',
    );
    expect(
      kickerPrompt([
        { kind: 'mana', symbols: ['1'] },
        { kind: 'payLife', amount: 1 },
      ]),
    ).toBe('Pay the kicker cost: {1} and 1 life?');
    expect(kickerPrompt([{ kind: 'mana', symbols: ['1', 'G'] }])).toBe(
      'Pay the kicker cost {1}{G}?',
    );
    expect(kickerCostPart({ kind: 'mana', symbols: ['2'] })).toBe('{2}');
  });

  test('Cancel sends cancel, and Esc and Enter reach it through the keys', () => {
    const { model, acts } = harness(kicker([{ kind: 'mana', symbols: ['2'] }]));
    expect(model.bar.cancel?.label).toBe('Cancel');
    model.bar.cancel?.run();
    expect(acts).toEqual([{ kind: 'cancel' }]);
    const key = (k: string) =>
      keyCommand(
        {
          key: k,
          ctrlKey: false,
          metaKey: false,
          altKey: false,
          tag: 'BODY',
          editable: false,
          foreignModalOpen: false,
        },
        { bar: model.bar, pinned: false, chooserOpen: false, canUndo: false },
      );
    expect(key('Escape')).toBe('cancel');
    expect(key('Enter')).toBe('primary');
  });

  test('the shock-land question keeps its words and has no Cancel', () => {
    const { model } = harness({
      id: 'd3',
      seat: 0,
      kind: 'confirmOptional',
      source: 'o6',
      sourceName: 'Shock Land',
      sourceOracleText: '',
      cost: [{ kind: 'payLife', amount: 2 }],
    });
    expect(model.bar.prompt).toBe('Pay 2 life?');
    expect(model.bar.buttons.map((b) => b.label)).toEqual(['Pay', "Don't pay"]);
    expect(model.bar.cancel).toBeNull();
  });

  test('a plain "you may" keeps Yes and No and has no Cancel', () => {
    const { model } = harness({
      id: 'd4',
      seat: 0,
      kind: 'confirmOptional',
      source: 'o7',
      sourceName: 'Token Maker',
      sourceOracleText: 'You may draw.',
    });
    expect(model.bar.buttons.map((b) => b.label)).toEqual(['Yes', 'No']);
    expect(model.bar.cancel).toBeNull();
  });
});
