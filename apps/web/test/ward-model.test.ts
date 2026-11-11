/**
 * Ward (CR 702.21a) and the legend rule (CR 704.5j) as pure models: the wording of the question,
 * of the payment and of its Cancel, the legend-rule prompt, chips and badge, the labels of the
 * `triggerSubject` selector, and that every one of these decisions stops the autopilot. No DOM.
 */
import type {
  Action,
  ActivatedAbility,
  ChoosePermanentDecision,
  ConfirmOptionalDecision,
  Cost,
  GameView,
  ObjectId,
  ObjectView,
  PayManaDecision,
  PendingDecision,
} from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { unlessCostText } from '../src/game/cost-text';
import { DEFAULT_STOPS, shouldStop } from '../src/policy/should-stop';
import { activationLabel } from '../src/ui/decisions/ability-label';
import { buildModel, type Controller } from '../src/ui/decisions/model';
import { optionalAsk, wardPrompt } from '../src/ui/decisions/optional';
import { payBarPrompt, payCancelLabel } from '../src/ui/decisions/payment';
import {
  choosePermanentPrompt,
  chosenBadge,
  isLegendRule,
  legendLabels,
} from '../src/ui/decisions/permanents';
import { initialUi } from '../src/ui/decisions/ui-state';
import { lookupIndexFor } from './decisions-helpers';

const mana = (...symbols: string[]): Cost => ({ kind: 'mana', symbols });
const life = (amount: number): Cost => ({ kind: 'payLife', amount });

const card = (n: number, name: string, patch: Partial<ObjectView> = {}): ObjectView =>
  ({
    id: `o${n}`,
    name,
    controller: 0,
    owner: 0,
    types: ['creature'],
    oracleText: '',
    keywords: [],
    isToken: false,
    ...patch,
  }) as ObjectView;

const bolt = card(1, 'Lightning Bolt', { zone: 'stack', types: ['instant'] });
const trigger = card(2, 'Grave Pact', { zone: 'stack', abilitySource: 'o9', types: [] });
const guard = card(3, 'Warded Guard', { zone: 'battlefield', oracleText: 'Ward {1}' });
const index = lookupIndexFor([bolt, trigger, guard]);

const asked = {
  id: 'd1',
  seat: 0,
  kind: 'confirmOptional',
  source: 'o8',
  sourceName: 'Warded Guard',
  sourceOracleText: 'Ward {1}',
} as const;

const ward = (patch: Partial<ConfirmOptionalDecision> = {}): ConfirmOptionalDecision => ({
  ...asked,
  cost: [mana('1')],
  purpose: 'ward',
  subject: 'o1',
  ...patch,
});

function harness(pending: PendingDecision, objects: readonly ObjectView[] = [bolt, guard]) {
  const view = {
    viewer: 0,
    turn: 3,
    activeSeat: 0,
    step: 'precombatMain',
    battlefield: objects.filter((o) => o.zone === 'battlefield'),
    stack: objects.filter((o) => o.zone === 'stack'),
    exile: [],
    seats: [
      { id: 0, hand: [], graveyard: [], command: [], mulligans: 0 },
      { id: 1, hand: null, graveyard: [], command: [], mulligans: 0 },
    ],
    pending,
  } as unknown as GameView;
  const acts: Action[] = [];
  const ctl: Controller = { act: (a) => acts.push(a), update: () => {}, openChooser: () => {} };
  return { view, acts, model: buildModel(view, pending, initialUi(pending), ctl) };
}

describe('the ward question', () => {
  test('mana, life and both: the cost as the card prints it, then the spell', () => {
    expect(wardPrompt([mana('2')], 'Lightning Bolt')).toBe(
      'Pay {2} or Lightning Bolt is countered?',
    );
    expect(wardPrompt([mana('1', 'W')], 'Bolt')).toBe('Pay {1}{W} or Bolt is countered?');
    expect(wardPrompt([life(3)], 'Bolt')).toBe('Pay 3 life or Bolt is countered?');
    expect(wardPrompt([mana('1'), life(2)], 'Bolt')).toBe(
      'Pay {1} and 2 life or Bolt is countered?',
    );
    expect(unlessCostText([life(1)])).toBe('1 life');
  });

  test('the subject comes from the stack view; an ability reads "X\'s ability"; a gone one "that spell"', () => {
    expect(optionalAsk(ward(), index).prompt).toBe('Pay {1} or Lightning Bolt is countered?');
    expect(optionalAsk(ward({ subject: 'o2' }), index).prompt).toBe(
      "Pay {1} or Grave Pact's ability is countered?",
    );
    expect(optionalAsk(ward({ subject: 'o404' }), index).prompt).toBe(
      'Pay {1} or that spell is countered?',
    );
    const { subject: _gone, ...noSubject } = ward();
    expect(optionalAsk(noSubject, index).prompt).toBe('Pay {1} or that spell is countered?');
  });

  test("Pay and Don't pay answer yes and no; there is no Cancel, and Esc finds nothing", () => {
    const ask = optionalAsk(ward(), index);
    expect([ask.yes, ask.no, ask.cancellable]).toEqual(['Pay', "Don't pay", false]);
    const { model, acts } = harness(ward());
    expect(model.bar.prompt).toBe('Pay {1} or Lightning Bolt is countered?');
    expect(model.bar.cancel).toBeNull();
    expect(model.bar.inOverlay).toBe(true);
    expect(model.bar.buttons.map((b) => [b.label, b.variant])).toEqual([
      ['Pay', 'primary'],
      ["Don't pay", 'secondary'],
    ]);
    model.bar.buttons[0]?.run();
    model.bar.buttons[1]?.run();
    expect(acts).toEqual([{ kind: 'acceptOptional' }, { kind: 'declineOptional' }]);
  });

  test('the older questions keep their words', () => {
    const plain: ConfirmOptionalDecision = { ...asked };
    expect(optionalAsk(plain, index).prompt).toBe('Warded Guard: Ward {1} — do it?');
    const shock: ConfirmOptionalDecision = { ...asked, cost: [life(2)] };
    expect(optionalAsk(shock, index)).toMatchObject({ prompt: 'Pay 2 life?', yes: 'Pay' });
    const kicker: ConfirmOptionalDecision = { ...asked, purpose: 'kicker', cost: [mana('2')] };
    expect(optionalAsk(kicker, index)).toMatchObject({ yes: 'Kick', cancellable: true });
  });
});

describe('the ward payment', () => {
  const pay = (patch: Partial<PayManaDecision> = {}): PayManaDecision => ({
    id: 'd2',
    seat: 0,
    kind: 'payMana',
    source: 'o8',
    totalCost: ['2'],
    manaSources: [],
    purpose: 'ward',
    subject: 'o1',
    ...patch,
  });

  const castPay: PayManaDecision = {
    id: 'd4',
    seat: 0,
    kind: 'payMana',
    source: guard.id,
    totalCost: ['2'],
    manaSources: [],
  };

  test('the prompt says what is at stake; a cast keeps its own wording', () => {
    expect(payBarPrompt(pay(), index)).toBe(
      'Pay {2} for ward or Lightning Bolt is countered: tap your mana sources.',
    );
    expect(payBarPrompt(pay({ totalCost: ['1', 'W'], subject: 'o2' }), index)).toBe(
      "Pay {1}{W} for ward or Grave Pact's ability is countered: tap your mana sources.",
    );
    expect(payBarPrompt(castPay, index)).toBe('Pay for Warded Guard: tap your mana sources.');
  });

  test('Cancel reads "Don\'t pay (it is countered)" and still sends cancel; a cast says Cancel', () => {
    expect(payCancelLabel(pay())).toBe("Don't pay (it is countered)");
    expect(payCancelLabel({})).toBe('Cancel');
    const { model, acts } = harness(pay());
    expect(model.bar.cancel?.label).toBe("Don't pay (it is countered)");
    model.bar.cancel?.run();
    expect(acts).toEqual([{ kind: 'cancel' }]);
    // The buttons are the ones of every payment, and Auto-pay stays available.
    expect(model.bar.buttons.map((b) => b.label)).toEqual(['Pay', 'Auto-pay']);
    const cast = harness(castPay);
    expect(cast.model.bar.cancel?.label).toBe('Cancel');
  });
});

describe('the legend rule choice', () => {
  const knight = (n: number, patch: Partial<ObjectView> = {}) =>
    card(n, 'Ancient Knight', { zone: 'battlefield', supertypes: ['legendary'], ...patch });
  const rule = (legal: ObjectId[]): ChoosePermanentDecision => ({
    id: 'd3',
    seat: 0,
    kind: 'choosePermanent',
    source: legal[0] ?? 'o1',
    purpose: 'legendRule',
    min: 1,
    max: 1,
    legal,
  });

  test('the prompt counts the permanents the engine lists and names the first', () => {
    const board = lookupIndexFor([knight(5), knight(6, { isToken: true }), knight(7)]);
    expect(choosePermanentPrompt(rule(['o5', 'o6']), board)).toBe(
      'You control 2 legendary permanents named Ancient Knight. Choose one to keep; the others go to the graveyard.',
    );
    expect(choosePermanentPrompt(rule(['o5', 'o6', 'o7']), board)).toContain(
      'You control 3 legendary permanents named Ancient Knight.',
    );
  });

  test('a sacrifice keeps its prompt and its badge; the rule badges "Keep"', () => {
    const sacrifice = { ...rule(['o5', 'o6']), purpose: 'sacrifice' as const, source: bolt.id };
    expect(isLegendRule(rule([]))).toBe(true);
    expect(isLegendRule(sacrifice)).toBe(false);
    expect(chosenBadge(rule([]))).toBe('Keep');
    expect(chosenBadge(sacrifice)).toBe('Sacrifice');
    expect(choosePermanentPrompt(sacrifice, index)).toBe(
      'Sacrifice a permanent for Lightning Bolt.',
    );
  });

  test('chips tell the copies apart by number, and a token says so', () => {
    const board = lookupIndexFor([knight(5), knight(6, { isToken: true })]);
    const labels = legendLabels(['o5', 'o6'], board);
    expect(labels.get('o5')).toBe('Ancient Knight 1');
    expect(labels.get('o6')).toBe('Ancient Knight 2 (token)');
  });

  test('the model: click one, it gets "Keep"; Confirm sends it; there is no Cancel', () => {
    const board = [knight(5), knight(6, { isToken: true })];
    const pending = rule(['o5', 'o6']);
    const view = harness(pending, board).view;
    const acts: Action[] = [];
    let ui = initialUi(pending);
    const ctl: Controller = {
      act: (a) => acts.push(a),
      update: (change) => {
        ui = change(ui);
      },
      openChooser: () => {},
    };
    const first = buildModel(view, pending, ui, ctl);
    expect(first.bar.cancel).toBeNull();
    expect(first.bar.buttons[0]?.disabled).toBe(true);
    expect(first.interaction.clickable).toEqual(new Set(['o5', 'o6']));
    first.interaction.onObject('o6');
    const chosen = buildModel(view, pending, ui, ctl);
    expect(chosen.interaction.badge('o6')).toBe('Keep');
    expect(chosen.interaction.badge('o5')).toBeNull();
    // Choosing the other one swaps the choice: only one may be kept.
    chosen.interaction.onObject('o5');
    expect(ui.permanents).toEqual(['o5']);
    buildModel(view, pending, ui, ctl).bar.buttons[0]?.run();
    expect(acts).toEqual([{ kind: 'choosePermanents', objects: ['o5'] }]);
  });
});

describe('triggerSubject in an ability label', () => {
  const ability = (effect: ActivatedAbility['effect']): ActivatedAbility => ({
    kind: 'activated',
    cost: [mana('1')],
    effect,
  });
  const label = (effect: ActivatedAbility['effect']) =>
    activationLabel(card(1, 'Thing'), { abilityIndex: 0, ability: ability(effect) });

  test('an object reads "that spell", a damage recipient "it"', () => {
    expect(label({ kind: 'destroy', objects: { kind: 'triggerSubject' } })).toBe(
      '{1}: Destroy that spell',
    );
    expect(
      label({
        kind: 'dealDamage',
        amount: 2,
        to: { kind: 'triggerSubject' },
        source: { kind: 'this' },
      } as ActivatedAbility['effect']),
    ).toBe('{1}: Deal 2 damage to it');
  });
});

describe('the autopilot never answers these', () => {
  const view = (pending: PendingDecision) => harness(pending).view;
  test('the ward question, the ward payment and the legend rule are real stops', () => {
    for (const pending of [
      ward(),
      {
        id: 'd2',
        seat: 0,
        kind: 'payMana',
        source: 'o8',
        totalCost: ['1'],
        manaSources: [],
        purpose: 'ward',
        subject: 'o1',
      } as PayManaDecision,
      {
        id: 'd3',
        seat: 0,
        kind: 'choosePermanent',
        source: 'o5',
        purpose: 'legendRule',
        min: 1,
        max: 1,
        legal: ['o5', 'o6'],
      } as ChoosePermanentDecision,
    ]) {
      expect(shouldStop(view(pending), DEFAULT_STOPS)).toBe(true);
    }
  });
});
