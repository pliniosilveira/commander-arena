/**
 * The words of "[do something] unless [that player] pays" (CR 118.12a, D-111) for each of the
 * SYNTHETIC fixture cards that use it, from the payer's seat and the controller's, as pure functions
 * of a decision and the ability on the stack. No game is played.
 */
import {
  type ConfirmOptionalDecision,
  type ObjectId,
  type ObjectView,
  type PayManaDecision,
  type StackAbility,
  SYNTHETIC_CARDS,
} from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { triggerGist } from '../src/ui/decisions/ability-label';
import { cardsPrompt } from '../src/ui/decisions/cards-picker';
import { optionalAsk } from '../src/ui/decisions/optional';
import { payBarPrompt, payCancelLabel } from '../src/ui/decisions/payment';
import { lookupIndexFor } from './decisions-helpers';

const o = (n: number): ObjectId => `o${n}`;

/** The first triggered ability of a SYNTHETIC card. */
function abilityOf(name: string): StackAbility {
  const card = SYNTHETIC_CARDS[name];
  const ability = card?.faces[0]?.abilities.find((a) => a.kind === 'triggered');
  if (ability === undefined) throw new Error(`no trigger on ${name}`);
  return ability;
}

/** The ability on the stack, controlled by `controller`, as the view shows it. */
function onStack(name: string, controller: number): ObjectView {
  return {
    id: o(50),
    name,
    controller,
    owner: controller,
    zone: 'stack',
    types: [],
    abilitySource: o(1),
    ability: abilityOf(name),
    oracleText: '',
  } as unknown as ObjectView;
}

const question = (name: string, patch: Partial<ConfirmOptionalDecision>, withPurpose = true) =>
  ({
    id: 'd1',
    seat: 0,
    kind: 'confirmOptional',
    source: o(50),
    sourceName: name,
    sourceOracleText: '',
    ...(withPurpose ? { purpose: 'unlessPays' } : {}),
    ...patch,
  }) as ConfirmOptionalDecision;

const mana1 = [{ kind: 'mana', symbols: ['1'] }] as const;

describe("the payer's question (the human pays)", () => {
  test.each([
    ['SYNTHETIC Tax Collector', mana1, 'Pay {1} or Opponent may draw a card?'],
    ['SYNTHETIC Strict Tax Collector', mana1, 'Pay {1} or Opponent draws a card?'],
    [
      'SYNTHETIC Blood Tax Collector',
      [{ kind: 'payLife', amount: 2 }],
      'Pay 2 life or Opponent draws a card?',
    ],
    [
      'SYNTHETIC Tithe Collector',
      [{ kind: 'discard', count: 1 }],
      'Discard a card or Opponent draws a card?',
    ],
    ['SYNTHETIC Toll Keeper', [{ kind: 'mana', symbols: ['2'] }], 'Pay {2} or you lose 2 life?'],
  ] as const)('%s', (name, cost, prompt) => {
    const index = lookupIndexFor([onStack(name, 1)]);
    const ask = optionalAsk(question(name, { cost }), index);
    expect(ask.prompt).toBe(prompt);
    expect(ask.cancellable).toBe(false);
  });

  test("buttons: Pay and Don't pay, or Discard and Don't discard", () => {
    const index = lookupIndexFor([onStack('SYNTHETIC Tithe Collector', 1)]);
    const discard = optionalAsk(
      question('SYNTHETIC Tithe Collector', { cost: [{ kind: 'discard', count: 1 }] }),
      index,
    );
    expect([discard.yes, discard.no]).toEqual(['Discard', "Don't discard"]);
    const pay = optionalAsk(question('SYNTHETIC Tax Collector', { cost: mana1 }), index);
    expect([pay.yes, pay.no]).toEqual(['Pay', "Don't pay"]);
  });

  test('an effect the words do not know is not guessed at', () => {
    const odd = {
      ...onStack('SYNTHETIC Tax Collector', 1),
      ability: {
        ...abilityOf('SYNTHETIC Tax Collector'),
        effect: {
          kind: 'unlessPays',
          player: { kind: 'eachOpponent' },
          cost: mana1,
          effect: { kind: 'shuffle', player: { kind: 'you' } },
        },
      },
    } as unknown as ObjectView;
    const ask = optionalAsk(
      question('SYNTHETIC Tax Collector', { cost: mana1 }),
      lookupIndexFor([odd]),
    );
    expect(ask.prompt).toBe("Pay {1} or SYNTHETIC Tax Collector's ability has its effect?");
    // The ability is not in the view at all: the same.
    expect(optionalAsk(question('X', { cost: mana1 }), lookupIndexFor([])).prompt).toBe(
      "Pay {1} or X's ability has its effect?",
    );
  });

  test('the mana payment and its Cancel', () => {
    const index = lookupIndexFor([onStack('SYNTHETIC Tax Collector', 1)]);
    const pay = {
      id: 'd2',
      seat: 0,
      kind: 'payMana',
      source: o(50),
      totalCost: ['1'],
      manaSources: [],
      purpose: 'unlessPays',
    } as unknown as PayManaDecision;
    expect(payBarPrompt(pay, index)).toBe(
      'Pay {1} or Opponent may draw a card: tap your mana sources.',
    );
    expect(payCancelLabel(pay)).toBe("Don't pay");
  });

  test('the discard of a "discards a card" cost reads like the question', () => {
    const index = lookupIndexFor([onStack('SYNTHETIC Tithe Collector', 1)]);
    const discard = {
      id: 'd3',
      seat: 0,
      kind: 'chooseCards',
      source: o(50),
      purpose: 'discard',
      zone: 'hand',
      legal: [],
      min: 1,
      max: 1,
      reveal: true,
      prompt: 'Discard a card.',
    } as const;
    expect(cardsPrompt(discard, index)).toBe('Discard a card or Opponent draws a card?');
    // An ordinary discard keeps the engine's prompt.
    expect(cardsPrompt(discard, lookupIndexFor([]))).toBe('Discard a card.');
  });
});

describe('the controller\'s "you may" (the human controls)', () => {
  test('names who did not pay and what you would do', () => {
    const index = lookupIndexFor([onStack('SYNTHETIC Tax Collector', 0)]);
    const ask = optionalAsk(question('SYNTHETIC Tax Collector', {}, false), index);
    expect(ask.prompt).toBe("Opponent didn't pay {1}. Draw a card?");
    expect([ask.yes, ask.no]).toEqual(['Yes', 'No']);
  });

  test('an ability whose own "you may" asks the usual question', () => {
    const optional = {
      ...onStack('SYNTHETIC Tax Collector', 0),
      ability: { ...abilityOf('SYNTHETIC Tax Collector'), optional: true },
    } as unknown as ObjectView;
    const ask = optionalAsk(
      { ...question('SYNTHETIC Tax Collector', {}, false), sourceOracleText: 'Text.' },
      lookupIndexFor([optional]),
    );
    expect(ask.prompt).toBe('SYNTHETIC Tax Collector: Text. — do it?');
  });

  test('a strict ability never asks "you may"', () => {
    const index = lookupIndexFor([onStack('SYNTHETIC Strict Tax Collector', 0)]);
    const ask = optionalAsk(question('SYNTHETIC Strict Tax Collector', {}, false), index);
    expect(ask.prompt).not.toContain("didn't pay");
  });
});

describe('the ability gist', () => {
  test.each([
    ['SYNTHETIC Tax Collector', 'You may draw a card unless that player pays {1}'],
    ['SYNTHETIC Strict Tax Collector', 'You draw a card unless that player pays {1}'],
    ['SYNTHETIC Blood Tax Collector', 'You draw a card unless that player pays 2 life'],
    ['SYNTHETIC Tithe Collector', 'You draw a card unless that player discards a card'],
    ['SYNTHETIC Toll Keeper', 'Each opponent loses 2 life unless they pay {2}'],
  ])('%s', (name, gist) => {
    expect(triggerGist(abilityOf(name), undefined)).toBe(gist);
  });
});
