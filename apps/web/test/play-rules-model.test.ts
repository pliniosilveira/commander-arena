/**
 * The play rules of D-125 as pure models: the cost of attacking (the payment's words, the declaration's
 * costs), the untap step's checklist and its log line, the words of the four static abilities, and the
 * library's top card in the preview lookup. Fake views and states, no DOM.
 */
import type {
  Action,
  ChoosePermanentDecision,
  DeclareAttackersDecision,
  GameState,
  GameView,
  ObjectId,
  ObjectView,
  PayManaDecision,
  StaticEffect,
} from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { describeEvents } from '../src/game/describe';
import { playRuleWordings, staticWording } from '../src/game/play-rule-text';
import { findObject } from '../src/ui/board/resolve';
import { staticWording as labelWording } from '../src/ui/decisions/ability-label';
import {
  attackTaxDetail,
  attackTaxPrompt,
  combineSymbols,
  perAttackerCost,
  taxDetail,
  taxRows,
  taxRowText,
  taxRowWarning,
  totalText,
} from '../src/ui/decisions/attack-tax';
import { buildModel, type Controller } from '../src/ui/decisions/model';
import { payBarPrompt, payCancelLabel } from '../src/ui/decisions/payment';
import { initialUi } from '../src/ui/decisions/ui-state';
import { toggleUntap, untapButtonLabel, untapDetail } from '../src/ui/decisions/untap';
import { lookupIndexFor } from './decisions-helpers';

const card = (name: string, patch: Partial<ObjectView> = {}): ObjectView =>
  ({
    id: name,
    name,
    controller: 0,
    owner: 0,
    zone: 'battlefield',
    types: ['enchantment'],
    colors: [],
    manaCost: null,
    oracleText: '',
    keywords: [],
    targets: [],
    ...patch,
  }) as ObjectView;

const gate = card('Tax Gate', { id: 'o9', controller: 1, owner: 1 });
const goblin = (n: number) => card(`Goblin ${n}`, { id: `o${n}`, types: ['creature'] });
const index = lookupIndexFor([gate, goblin(1), goblin(2)]);
const opp = { kind: 'player', seat: 1 } as const;

const pay = (patch: Partial<PayManaDecision> = {}): PayManaDecision =>
  ({
    id: 'd1',
    seat: 0,
    kind: 'payMana',
    source: 'o9',
    totalCost: ['2', '2'],
    manaSources: [],
    purpose: 'attackTax',
    attacks: [
      { attacker: 'o1', target: opp },
      { attacker: 'o2', target: opp },
    ],
    ...patch,
  }) as PayManaDecision;

describe('the cost of attacking: the payment', () => {
  test('the bar reads the cost per creature and the total', () => {
    expect(attackTaxPrompt(pay())).toBe(
      'Pay {2} per attacking creature (4 total) so these creatures can attack: tap your mana sources.',
    );
    expect(payBarPrompt(pay(), index)).toBe(attackTaxPrompt(pay()));
  });

  test('one attacker, mixed costs and colored symbols', () => {
    expect(
      attackTaxPrompt(pay({ totalCost: ['2'], attacks: [{ attacker: 'o1', target: opp }] })),
    ).toBe('Pay {2} so this creature can attack: tap your mana sources.');
    // Colored mana is not folded into the generic number.
    expect(attackTaxPrompt(pay({ totalCost: ['1', 'R', '1', 'R'] }))).toBe(
      'Pay {1}{R} per attacking creature ({2}{R}{R} total) so these creatures can attack: tap your mana sources.',
    );
    // Different amounts: only the total is said.
    expect(attackTaxPrompt(pay({ totalCost: ['2', '1'] }))).toBe(
      'Pay {3} so these creatures can attack: tap your mana sources.',
    );
  });

  test('Cancel asks for the attackers again; the other payments keep their words', () => {
    expect(payCancelLabel({ purpose: 'attackTax' })).toBe('Choose other attackers');
    expect(payCancelLabel({})).toBe('Cancel');
    expect(payCancelLabel({ purpose: 'ward' })).toBe("Don't pay (it is countered)");
  });

  test('the dock names the attackers and the source', () => {
    expect(attackTaxDetail(pay(), index)).toBe(
      'Goblin 1, Goblin 2 will attack once this is paid. The cost is from Tax Gate.',
    );
  });

  test('symbol helpers', () => {
    expect(combineSymbols(['2', '2', 'R'])).toEqual(['4', 'R']);
    expect(totalText(['2', '2'])).toBe('4');
    expect(totalText([])).toBe('0');
    expect(totalText(['W/P', 'W/P'])).toBe('{W/P}{W/P}');
    expect(perAttackerCost(['2', '2'], 2)).toEqual(['2']);
    expect(perAttackerCost(['2', '1'], 2)).toBeNull();
    expect(perAttackerCost(['2'], 2)).toBeNull();
  });
});

const declare = (patch: Partial<DeclareAttackersDecision> = {}): DeclareAttackersDecision =>
  ({
    id: 'd2',
    seat: 0,
    kind: 'declareAttackers',
    candidates: [
      { attacker: 'o1', targets: [opp] },
      { attacker: 'o2', targets: [opp] },
    ],
    mustAttack: [],
    attackCosts: [{ target: opp, cost: ['2'], affordable: 1 }],
    ...patch,
  }) as DeclareAttackersDecision;

describe('the cost of attacking: the declaration', () => {
  const rows = (picks: number) =>
    taxRows(
      declare(),
      (['o1', 'o2'] as const).slice(0, picks).map((attacker) => ({ attacker, target: opp })),
      index,
      0,
    );

  test('a row for the taxed target with the cost and what the mana covers', () => {
    const [row] = rows(0);
    expect(row).toMatchObject({ label: 'Opponent', affordable: 1, attackers: 0, over: false });
    expect(row && taxRowText(row)).toBe(
      'Attacking Opponent costs {2} for each creature. Your mana covers 1 creature now.',
    );
    expect(taxDetail(rows(0))).toBeNull();
  });

  test('one attacker fits; two are more than the mana covers and the bar says so', () => {
    expect(taxDetail(rows(1))).toBe('This attack costs {2}.');
    const [two] = rows(2);
    expect(two).toMatchObject({ attackers: 2, over: true, total: ['4'] });
    expect(two && taxRowWarning(two)).toContain('You can pay for 1 creature attacking Opponent');
    expect(taxDetail(rows(2))).toContain('This attack costs {4}.');
  });

  test('nothing affordable', () => {
    const [row] = taxRows(
      declare({ attackCosts: [{ target: opp, cost: ['2'], affordable: 0 }] }),
      [{ attacker: 'o1', target: opp }],
      index,
      0,
    );
    expect(row && taxRowWarning(row)).toBe(
      'You cannot pay to attack Opponent now: choose other targets or attackers.',
    );
    expect(row && taxRowText(row)).toContain('Your mana covers none now.');
  });

  test('no tax means no rows', () => {
    expect(taxRows({}, [], index, 0)).toEqual([]);
  });

  test('the bar of the declaration carries the cost and the model sends the same action', () => {
    const sent: Action[] = [];
    const ctl: Controller = { act: (a) => sent.push(a), update: () => {}, openChooser: () => {} };
    const view = { viewer: 0, battlefield: [gate, goblin(1), goblin(2)], seats: [], stack: [] };
    const attacks = [
      { attacker: 'o1', target: opp },
      { attacker: 'o2', target: opp },
    ] as const;
    const ui = { ...initialUi(declare()), attacks };
    const model = buildModel(view as unknown as GameView, declare(), ui, ctl);
    expect(model.bar.detail).toContain('2 creatures attacking.');
    expect(model.bar.detail).toContain('This attack costs {4}.');
    model.bar.buttons[1]?.run();
    expect(sent).toEqual([{ kind: 'declareAttackers', attacks: ui.attacks }]);
  });
});

const untapAsk = (patch: Partial<ChoosePermanentDecision> = {}): ChoosePermanentDecision => ({
  id: 'd3',
  seat: 0,
  kind: 'choosePermanent',
  source: 'o21',
  purpose: 'untap',
  min: 0,
  max: 2,
  legal: ['o21', 'o22'],
  ...patch,
});

describe('the untap step', () => {
  test('every permanent starts checked, and the answer names the checked ones', () => {
    const ui = initialUi(untapAsk());
    expect(ui.permanents).toEqual(['o21', 'o22']);
    expect(initialUi(untapAsk({ purpose: 'sacrifice' })).permanents).toEqual([]);
    const sent: Action[] = [];
    const ctl: Controller = { act: (a) => sent.push(a), update: () => {}, openChooser: () => {} };
    const view = { viewer: 0, battlefield: [], seats: [], stack: [] };
    const model = buildModel(view as unknown as GameView, untapAsk(), ui, ctl);
    expect(model.bar.prompt).toBe(
      'Untap during your untap step: choose which of these stay tapped.',
    );
    expect(model.bar.inOverlay).toBe(true);
    expect(model.bar.cancel).toBeNull();
    expect(model.bar.buttons[0]?.label).toBe('Untap all');
    model.bar.buttons[0]?.run();
    expect(sent).toEqual([{ kind: 'choosePermanents', objects: ['o21', 'o22'] }]);
  });

  test('unchecking leaves a permanent tapped', () => {
    const d = untapAsk();
    const one = toggleUntap(['o21', 'o22'], d, 'o22');
    expect(one).toEqual(['o21']);
    expect(toggleUntap(one, d, 'o22')).toEqual(['o21', 'o22']);
    expect(toggleUntap(one, d, 'o99')).toEqual(['o21']);
    expect(untapButtonLabel(1, 2)).toBe('Untap 1 of 2');
    expect(untapButtonLabel(0, 2)).toBe('Leave all tapped');
    expect(untapButtonLabel(2, 2)).toBe('Untap all');
    expect(untapDetail(1, 2)).toBe('1 of 2 stays tapped.');
    expect(untapDetail(0, 3)).toBe('3 of 3 stay tapped.');
    expect(untapDetail(2, 2)).toBe('All of them untap.');
  });

  const token = (name: string) => ({ token: { characteristics: { name } } });
  const before = (seat: number): GameState =>
    ({
      pending: untapAsk({ seat }),
      objects: { o21: token('Drowsy Land'), o22: token('Drowsy Rod') },
    }) as unknown as GameState;
  const texts = (state: GameState, objects: ObjectId[], viewer = 0) =>
    describeEvents([], state, state, viewer, { kind: 'choosePermanents', objects }).map(
      (l) => l.text,
    );

  test('the log names what was left tapped, and says nothing when all untap', () => {
    expect(texts(before(0), ['o21'])).toEqual(['You left Drowsy Rod tapped.']);
    expect(texts(before(0), [])).toEqual(['You left Drowsy Land and Drowsy Rod tapped.']);
    expect(texts(before(0), ['o21', 'o22'])).toEqual([]);
    expect(texts(before(1), ['o21'])).toEqual(['Opponent left Drowsy Rod tapped.']);
    const [line] = describeEvents([], before(0), before(0), 0, {
      kind: 'choosePermanents',
      objects: ['o21'],
    });
    expect([line?.level, line?.rule, line?.seat]).toEqual(['major', 'CR 502.3', 0]);
  });
});

describe('the words of the static abilities', () => {
  const words = (effect: StaticEffect) => staticWording(effect);

  test('each node is composed from its fields', () => {
    expect(words({ kind: 'additionalLandDrops', count: 1 })).toBe(
      'You may play an additional land on each of your turns',
    );
    expect(words({ kind: 'additionalLandDrops', count: 2 })).toBe(
      'You may play two additional lands on each of your turns',
    );
    expect(words({ kind: 'additionalLandDrops', count: 1, eachPlayer: true })).toBe(
      'Each player may play an additional land on each of their turns',
    );
    expect(words({ kind: 'lookAtTopOfLibrary' })).toBe(
      'You may look at the top card of your library any time',
    );
    expect(words({ kind: 'optionalUntap' })).toBe(
      'You may choose not to untap this permanent during your untap step',
    );
    expect(words({ kind: 'attackTax', cost: [{ kind: 'mana', symbols: ['2'] }] })).toBe(
      "Creatures can't attack you unless their controller pays {2} for each creature they control that's attacking you",
    );
    expect(
      words({ kind: 'attackTax', cost: [{ kind: 'mana', symbols: ['W/P'] }], planeswalkers: true }),
    ).toBe(
      "Creatures can't attack you or planeswalkers you control unless their controller pays {W/P} for each of those creatures",
    );
  });

  test('other statics have none, abilities are collected in order, and the label file re-exports', () => {
    expect(
      words({ kind: 'restriction', subject: { kind: 'this' }, restriction: 'cantBlock' }),
    ).toBeNull();
    expect(
      playRuleWordings([
        { kind: 'static', static: { kind: 'optionalUntap' } },
        { kind: 'static', static: { kind: 'lookAtTopOfLibrary' } },
      ]),
    ).toEqual([
      'You may choose not to untap this permanent during your untap step.',
      'You may look at the top card of your library any time.',
    ]);
    expect(labelWording).toBe(staticWording);
  });
});

describe('the top card of the library', () => {
  test('the preview finds the viewer own top card, and only that one', () => {
    const top = card('Top Card', { id: 'o77', zone: 'library' });
    const seat = (id: number, libraryTop?: ObjectView) => ({
      id,
      graveyard: [],
      command: [],
      hand: id === 0 ? [] : null,
      ...(libraryTop === undefined ? {} : { libraryTop }),
    });
    const view = {
      viewer: 0,
      battlefield: [],
      stack: [],
      exile: [],
      seats: [seat(0, top), seat(1)],
    } as unknown as GameView;
    expect(findObject(view, 'o77')?.name).toBe('Top Card');
    // A top card on the other seat's view would not be looked up.
    const other = {
      ...view,
      seats: [seat(0), seat(1, top)],
    } as unknown as GameView;
    expect(findObject(other, 'o77')).toBeNull();
  });
});
