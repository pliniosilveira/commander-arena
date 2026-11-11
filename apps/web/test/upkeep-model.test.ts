/**
 * The words of Echo, Cumulative upkeep and the monarch (D-127): the question and the payment, the buttons,
 * the age counters, the ability wording and the monarch's stack object, as pure functions of a decision and
 * the views. No game is played (the games are in e2e/upkeep.e2e.ts).
 */
import type {
  ConfirmOptionalDecision,
  Cost,
  ObjectId,
  ObjectView,
  PayManaDecision,
  StackAbility,
  Trigger,
} from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { unlessCostPhrase } from '../src/game/cost-text';
import {
  inherentTriggerWording,
  inherentWording,
  isInherentAbility,
} from '../src/game/monarch-text';
import { chipsOf } from '../src/ui/board/keywords';
import { triggerGist } from '../src/ui/decisions/ability-label';
import { optionalAsk } from '../src/ui/decisions/optional';
import { payBarPrompt, payCancelLabel } from '../src/ui/decisions/payment';
import { lookupIndexFor } from './decisions-helpers';

const o = (n: number): ObjectId => `o${n}`;
const mana = (...symbols: string[]): Cost => ({ kind: 'mana', symbols });

const echoAbility = (cost: Cost[]): StackAbility => ({
  kind: 'triggered',
  trigger: { kind: 'upkeep', whose: 'you' },
  interveningIf: { kind: 'cameUnderControlSinceLastUpkeep' },
  effect: {
    kind: 'unlessPays',
    player: { kind: 'you' },
    cost,
    effect: { kind: 'sacrifice', objects: { kind: 'this' } },
    upkeep: 'echo',
  },
});

const cumulativeAbility = (cost: Cost[]): StackAbility => ({
  kind: 'triggered',
  trigger: { kind: 'upkeep', whose: 'you' },
  effect: { kind: 'cumulativeUpkeep', cost },
});

/** The permanent and the upkeep ability on the stack that belongs to it, as the view shows them. */
function views(name: string, ability: StackAbility, age?: number): ObjectView[] {
  return [
    {
      id: o(1),
      name,
      controller: 0,
      owner: 0,
      zone: 'battlefield',
      types: ['creature'],
      counters: age === undefined ? {} : { age },
    },
    {
      id: o(50),
      name,
      controller: 0,
      owner: 0,
      zone: 'stack',
      types: [],
      counters: {},
      abilitySource: o(1),
      ability,
    },
  ] as unknown as ObjectView[];
}

const question = (name: string, cost: readonly Cost[], upkeep?: 'echo' | 'cumulativeUpkeep') =>
  ({
    id: 'd1',
    seat: 0,
    kind: 'confirmOptional',
    source: o(50),
    sourceName: name,
    sourceOracleText: '',
    purpose: 'unlessPays',
    cost,
    ...(upkeep === undefined ? {} : { upkeep }),
  }) as ConfirmOptionalDecision;

describe('Echo', () => {
  const index = lookupIndexFor(views('Hound', echoAbility([mana('1', 'R')])));

  test('the question and its buttons', () => {
    const ask = optionalAsk(question('Hound', [mana('1', 'R')], 'echo'), index);
    expect(ask.prompt).toBe('Echo: pay {1}{R} or sacrifice Hound?');
    expect([ask.yes, ask.no]).toEqual(['Pay', 'Sacrifice it']);
    expect(ask.cancellable).toBe(false);
  });

  test('the payment and its Cancel', () => {
    const pay = {
      id: 'd2',
      seat: 0,
      kind: 'payMana',
      source: o(50),
      totalCost: ['1', 'R'],
      manaSources: [],
      purpose: 'unlessPays',
      upkeep: 'echo',
    } as unknown as PayManaDecision;
    expect(payBarPrompt(pay, index)).toBe(
      'Echo: pay {1}{R} or sacrifice Hound: tap your mana sources.',
    );
    expect(payCancelLabel(pay)).toBe('Sacrifice it');
  });

  test('the ability on the stack says what it does', () => {
    expect(triggerGist(echoAbility([mana('1', 'R')]), undefined)).toBe(
      'Sacrifice this permanent unless you pay {1}{R} if this permanent came under your control since the beginning of your last upkeep',
    );
  });
});

describe('Cumulative upkeep', () => {
  test.each([
    [[mana('1')], 1, 'Cumulative upkeep: pay {1} (1 age counter) or sacrifice Wall?'],
    [
      [mana('1'), mana('1')],
      2,
      'Cumulative upkeep: pay {1}{1} (2 age counters) or sacrifice Wall?',
    ],
    [
      [
        { kind: 'payLife', amount: 1 },
        { kind: 'payLife', amount: 1 },
        { kind: 'payLife', amount: 1 },
      ],
      3,
      'Cumulative upkeep: pay 3 life (3 age counters) or sacrifice Wall?',
    ],
  ] as const)(
    'the whole cost is the printed cost for each age counter (%#)',
    (cost, age, prompt) => {
      const index = lookupIndexFor(views('Wall', cumulativeAbility([...cost.slice(0, 1)]), age));
      const ask = optionalAsk(question('Wall', cost, 'cumulativeUpkeep'), index);
      expect(ask.prompt).toBe(prompt);
      expect([ask.yes, ask.no]).toEqual(['Pay', 'Sacrifice it']);
    },
  );

  test('a discard says Discard, and the counters are left out when the permanent is gone', () => {
    const index = lookupIndexFor(
      views('Wall', cumulativeAbility([{ kind: 'discard', count: 1 }]), 2),
    );
    const ask = optionalAsk(
      question(
        'Wall',
        [
          { kind: 'discard', count: 1 },
          { kind: 'discard', count: 1 },
        ],
        'cumulativeUpkeep',
      ),
      index,
    );
    expect(ask.prompt).toBe(
      'Cumulative upkeep: discard 2 cards (2 age counters) or sacrifice Wall?',
    );
    expect([ask.yes, ask.no]).toEqual(['Discard', 'Sacrifice it']);
    const gone = optionalAsk(question('Wall', [mana('1')], 'cumulativeUpkeep'), lookupIndexFor([]));
    expect(gone.prompt).toBe('Cumulative upkeep: pay {1} or sacrifice Wall?');
  });

  test('the payment', () => {
    const index = lookupIndexFor(views('Wall', cumulativeAbility([mana('1')]), 2));
    const pay = {
      id: 'd2',
      seat: 0,
      kind: 'payMana',
      source: o(50),
      totalCost: ['1', '1'],
      manaSources: [],
      purpose: 'unlessPays',
      upkeep: 'cumulativeUpkeep',
    } as unknown as PayManaDecision;
    expect(payBarPrompt(pay, index)).toBe(
      'Cumulative upkeep: pay {1}{1} (2 age counters) or sacrifice Wall: tap your mana sources.',
    );
    expect(payCancelLabel(pay)).toBe('Sacrifice it');
  });

  test('the ability on the stack says what it does', () => {
    expect(
      triggerGist(cumulativeAbility([mana('1')]), { types: ['creature'] } as unknown as ObjectView),
    ).toBe(
      'Put an age counter on this creature. Sacrifice it unless you pay {1} for each age counter on it',
    );
  });

  test('keyword chips read the cost from the text, one for each instance', () => {
    const chips = chipsOf({
      keywords: ['echo', 'cumulativeUpkeep'],
      oracleText: 'Echo {1}{R}\nCumulative upkeep {1}\nCumulative upkeep—Pay 1 life.',
    });
    expect(chips.map((c) => c.full)).toEqual([
      'Echo {1}{R}',
      'Cumulative upkeep {1}',
      'Cumulative upkeep—Pay 1 life',
    ]);
  });
});

describe('the unless-pays words with a repeated cost', () => {
  test('mana and life merge, discards add up', () => {
    expect(unlessCostPhrase([mana('1'), mana('1')])).toBe('pay {1}{1}');
    expect(unlessCostPhrase([mana('2'), { kind: 'payLife', amount: 1 }, mana('R')])).toBe(
      'pay {2}{R} and 1 life',
    );
  });

  test('another effect that sacrifices the permanent asks the same way, without the keyword', () => {
    const ability: StackAbility = {
      kind: 'triggered',
      trigger: { kind: 'upkeep', whose: 'you' },
      effect: {
        kind: 'unlessPays',
        player: { kind: 'you' },
        cost: [mana('2')],
        effect: { kind: 'sacrifice', objects: { kind: 'this' } },
      },
    };
    const index = lookupIndexFor(views('Rock', ability));
    const ask = optionalAsk(question('Rock', [mana('2')]), index);
    expect(ask.prompt).toBe('Pay {2} or sacrifice Rock?');
    expect(ask.no).toBe('Sacrifice it');
  });
});

describe('the monarch', () => {
  const draw: StackAbility = {
    kind: 'triggered',
    trigger: { kind: 'endStep', whose: 'you' },
    effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
  };
  const steal: StackAbility = {
    kind: 'triggered',
    trigger: { kind: 'dealsCombatDamage', what: { types: ['creature'] }, to: 'player' },
    effect: {
      kind: 'becomeMonarch',
      player: { kind: 'controllerOf', of: { kind: 'triggerSubject' } },
    },
  };

  test("an ability with no source is the monarch's", () => {
    expect(isInherentAbility({ ability: draw })).toBe(true);
    expect(isInherentAbility({ ability: draw, abilitySource: o(1) })).toBe(false);
    expect(isInherentAbility({})).toBe(false);
  });

  test('the wording is composed from the kind, for the monarch and for the other player', () => {
    expect(inherentWording(draw, true)).toBe('At the beginning of your end step, draw a card.');
    expect(inherentWording(steal, true)).toBe(
      'Whenever a creature deals combat damage to you, its controller becomes the monarch.',
    );
    expect(inherentWording(draw, false)).toBe(
      "At the beginning of the opponent's end step, they draw a card.",
    );
    expect(inherentWording(steal, false)).toBe(
      'Whenever a creature deals combat damage to the opponent, its controller becomes the monarch.',
    );
    const other: Trigger = { kind: 'upkeep', whose: 'you' };
    expect(inherentTriggerWording(other, true)).toBeNull();
  });

  test('becoming the monarch reads in the gist of any ability', () => {
    const enters: StackAbility = {
      kind: 'triggered',
      trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
      effect: { kind: 'becomeMonarch', player: { kind: 'you' } },
    };
    expect(triggerGist(enters, undefined)).toBe('You become the monarch');
    expect(triggerGist(steal, undefined)).toBe('Its controller becomes the monarch');
  });
});
