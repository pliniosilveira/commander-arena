import type {
  ConfirmOptionalDecision,
  GameState,
  ObjectView,
  TargetsDecision,
} from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { additionalCostChoiceText } from '../src/game/cost-text';
import { describeEvent } from '../src/game/describe';
import { optionalAsk } from '../src/ui/decisions/optional';
import { targetsPrompt } from '../src/ui/decisions/target-prompt';
import { lookupIndexFor } from './decisions-helpers';

/**
 * The words of D-181 (the Korvold slice 3): the question of an additional cost paid in one of two ways, the card's two ways in the preview, the new
 * target when a change of target resolves, and the log line of the change.
 */
const SACRIFICE = {
  kind: 'sacrifice',
  what: { anyOf: [{ types: ['artifact'] }, { types: ['creature'] }] },
} as const;
const FOUR = { kind: 'mana', symbols: ['4'] } as const;

const obj = (id: string, patch: Partial<ObjectView> = {}): ObjectView =>
  ({
    id,
    name: id,
    controller: 0,
    owner: 0,
    types: ['sorcery'],
    zone: 'stack',
    oracleText: '',
    keywords: [],
    ...patch,
  }) as ObjectView;

describe('the additional cost choice', () => {
  const d = {
    kind: 'confirmOptional',
    id: 'd1',
    seat: 0,
    source: 'o1',
    sourceName: 'Stir Up Trouble',
    sourceOracleText: '',
    purpose: 'costChoice',
    cost: [SACRIFICE],
    otherCost: [FOUR],
  } as unknown as ConfirmOptionalDecision;

  test('each button is one way to pay, and the cast can be taken back', () => {
    const ask = optionalAsk(d, lookupIndexFor([obj('o1', { name: 'Stir Up Trouble' })]));
    expect(ask).toEqual({
      prompt:
        'Stir Up Trouble: sacrifice an artifact or creature, or pay {4}, as an additional cost?',
      yes: 'Sacrifice an artifact or creature',
      no: 'Pay {4}',
      cancellable: true,
    });
  });

  test('the preview names both ways', () => {
    expect(additionalCostChoiceText([[SACRIFICE], [FOUR]])).toBe(
      'Sacrifice an artifact or creature, or pay {4}',
    );
    expect(
      additionalCostChoiceText([[{ kind: 'discard', count: 1 }], [{ kind: 'payLife', amount: 3 }]]),
    ).toBe('Discard a card, or pay 3 life');
    expect(additionalCostChoiceText(undefined)).toBe('');
  });
});

describe('the new target of a spell whose target is changed', () => {
  const d = {
    kind: 'targets',
    id: 'd2',
    seat: 0,
    source: 'o9',
    subject: 'o3',
    forChange: true,
    current: [{ kind: 'player', seat: 1, specId: 't1' }],
    specs: [
      {
        specId: 't1',
        min: 1,
        max: 1,
        legal: [{ kind: 'player', seat: 0, specId: 't1' }],
      },
    ],
  } as unknown as TargetsDecision;

  test('the prompt names the spell whose target changes', () => {
    const index = lookupIndexFor([
      obj('o9', { name: 'Bolt Bend', types: ['instant'] }),
      obj('o3', { name: 'Lightning Bolt', types: ['instant'] }),
    ]);
    expect(targetsPrompt(d, index, null)).toBe('Choose a new target for Lightning Bolt.');
  });
});

describe('the log line of a change of target', () => {
  const state = () =>
    ({
      objects: {
        o1: { card: 'c1', token: null, stack: null, controller: 0 },
        o2: { card: 'c2', token: null, stack: null, controller: 1 },
        o3: { card: 'c3', token: null, stack: null, controller: 1 },
      },
      cards: { c1: { definition: 'd1' }, c2: { definition: 'd2' }, c3: { definition: 'd3' } },
      definitions: {
        d1: { name: 'Lightning Bolt' },
        d2: { name: 'Grizzly Bears' },
        d3: { name: 'Giant Spider' },
      },
      lki: {},
      pending: null,
    }) as unknown as GameState;

  const line = (to: object, viewer = 0) =>
    describeEvent(
      {
        kind: 'targetChanged',
        seat: 0,
        object: 'o1',
        from: { kind: 'object', id: 'o2', specId: 't1' },
        to,
      } as never,
      state(),
      state(),
      viewer,
    );

  test('to a permanent and to a player', () => {
    const toSpider = line({ kind: 'object', id: 'o3', specId: 't1' });
    expect(toSpider?.text).toBe('You change the target of Lightning Bolt to Giant Spider.');
    expect(toSpider?.rule).toBe('CR 115.7a');
    expect(toSpider?.objects).toEqual(['o1', 'o3']);
    expect(line({ kind: 'player', seat: 1, specId: 't1' })?.text).toBe(
      'You change the target of Lightning Bolt to Opponent.',
    );
    expect(line({ kind: 'player', seat: 1, specId: 't1' }, 1)?.text).toBe(
      'Opponent changes the target of Lightning Bolt to you.',
    );
  });
});
