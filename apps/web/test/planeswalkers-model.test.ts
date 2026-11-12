/** Planeswalkers in the web (D-200 to D-203) as pure models: the words of a loyalty cost, the printed loyalty in a corner, a click on a planeswalker, the
 * words of the new effects and targets, and the log line of an emblem. No DOM. */
import type {
  ActivatedAbility,
  Effect,
  GameEvent,
  GameState,
  ObjectView,
  PriorityDecision,
  TargetSpec,
} from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { activationCostText } from '../src/game/cost-text';
import { describeEvent } from '../src/game/describe';
import { cornerStat } from '../src/ui/board/resolve';
import { activationLabel } from '../src/ui/decisions/ability-label';
import { clickOutcome } from '../src/ui/decisions/priority';
import { lookupIndexFor } from './decisions-helpers';

const gain = { kind: 'gainLife', player: { kind: 'you' }, amount: 2 } as const;
const loyalty = (change: number | 'x', effect: Effect = gain): ActivatedAbility => ({
  kind: 'activated',
  cost: [{ kind: 'loyalty', change }],
  effect,
});

function view(patch: Partial<ObjectView>): ObjectView {
  return {
    id: 'o1',
    name: 'Walker',
    controller: 0,
    owner: 0,
    types: ['planeswalker'],
    oracleText: '',
    counters: {},
    ...patch,
  } as ObjectView;
}

describe('the cost of a loyalty ability reads as the card prints it (CR 606.4, 606.5)', () => {
  test('+N, −N with the real minus sign, 0 and −X', () => {
    expect(activationCostText([{ kind: 'loyalty', change: 1 }])).toBe('+1');
    expect(activationCostText([{ kind: 'loyalty', change: 12 }])).toBe('+12');
    expect(activationCostText([{ kind: 'loyalty', change: -3 }])).toBe('−3');
    expect(activationCostText([{ kind: 'loyalty', change: 0 }])).toBe('0');
    expect(activationCostText([{ kind: 'loyalty', change: 'x' }])).toBe('−X');
  });

  test('the chooser label is the cost and what the ability does', () => {
    const walker = view({ activated: [{ abilityIndex: 0, ability: loyalty(1) }] });
    expect(activationLabel(walker, { abilityIndex: 0, ability: loyalty(1) })).toBe(
      '+1: You gain 2 life',
    );
    expect(activationLabel(walker, { abilityIndex: 1, ability: loyalty(-2) })).toBe(
      '−2: You gain 2 life',
    );
  });
});

describe('the corner of a planeswalker', () => {
  test('the counters on the battlefield, the printed loyalty in a hand or a graveyard (CR 306.5a, 306.5c)', () => {
    expect(cornerStat(view({ zone: 'battlefield', counters: { loyalty: 5 } }))?.text).toBe('5');
    expect(cornerStat(view({ zone: 'hand', printedLoyalty: 4 }))).toEqual({
      kind: 'loyalty',
      text: '4',
    });
    expect(cornerStat(view({ zone: 'graveyard', printedLoyalty: 3 }))?.text).toBe('3');
    expect(cornerStat(view({ zone: 'hand', power: null, toughness: null }))).toBeNull();
  });
});

describe('a click on a planeswalker', () => {
  const walker = view({
    activated: [{ abilityIndex: 0, ability: loyalty(1) }],
    zone: 'battlefield',
  });
  const d: PriorityDecision = {
    id: 'd1',
    seat: 0,
    kind: 'priority',
    options: [{ kind: 'pass' }, { kind: 'activate', object: 'o1', abilityIndex: 0 }],
  };
  const index = lookupIndexFor([walker]);

  test('with one loyalty ability still opens the chooser, which shows its cost', () => {
    const outcome = clickOutcome(d, 'o1', index);
    expect(outcome.kind).toBe('menu');
    if (outcome.kind === 'menu')
      expect(outcome.items.map((i) => i.label)).toEqual(['+1: You gain 2 life']);
  });

  test('any other single activated ability is still done by the click', () => {
    const pump = view({
      id: 'o2',
      types: ['creature'],
      activated: [
        {
          abilityIndex: 0,
          ability: { kind: 'activated', cost: [{ kind: 'mana', symbols: ['1'] }], effect: gain },
        },
      ],
    });
    const decision: PriorityDecision = {
      ...d,
      options: [{ kind: 'pass' }, { kind: 'activate', object: 'o2', abilityIndex: 0 }],
    };
    expect(clickOutcome(decision, 'o2', lookupIndexFor([pump])).kind).toBe('act');
  });
});

/** The label of a loyalty ability whose effect is `effect`, worded as the chooser words it. */
const label = (effect: Effect, targets?: TargetSpec[]): string =>
  activationLabel(view({}), {
    abilityIndex: 0,
    ability: { ...loyalty(-2, effect), ...(targets === undefined ? {} : { targets }) },
  });

describe('the words of the new effects and targets', () => {
  test('Empower Jace, the emblem, and a life total that becomes a number', () => {
    expect(label({ kind: 'empowerJace', amount: 6 })).toBe('\u22122: Empower Jace 6');
    expect(
      label({ kind: 'createEmblem', abilities: [], text: 'Creatures you control get +1/+1.' }),
    ).toBe('\u22122: You get an emblem with "Creatures you control get +1/+1."');
    expect(
      label({ kind: 'setLifeTotal', player: { kind: 'target', id: 't1' }, amount: 1 }, [
        { id: 't1', what: { kind: 'player', filter: 'any' } },
      ]),
    ).toBe("\u22122: Target player's life total becomes 1");
  });

  test('"each player this creature attacked this turn loses the game" (D-921)', () => {
    expect(
      label({
        kind: 'loseGame',
        player: { kind: 'attackedPlayers', of: { kind: 'this' } },
      }),
    ).toBe('\u22122: Each player this creature attacked this turn loses the game');
    expect(label({ kind: 'loseGame', player: { kind: 'eachOpponent' } })).toBe(
      '\u22122: Each opponent loses the game',
    );
  });

  test('"target player or planeswalker" and "target opponent or planeswalker"', () => {
    const damage: Effect = { kind: 'dealDamage', amount: 3, to: { kind: 'target', id: 't1' } };
    for (const [player, words] of [
      ['any', 'target player or planeswalker'],
      ['opponent', 'target opponent or planeswalker'],
    ] as const) {
      expect(
        label(damage, [
          {
            id: 't1',
            what: { kind: 'playerOrObject', player, filter: { types: ['planeswalker'] } },
          },
        ]),
      ).toContain(words);
    }
  });
});

describe('the log', () => {
  test('an emblem is announced as the player getting one', () => {
    const state = {
      objects: {},
      lki: {},
      cards: {},
      definitions: {},
      pending: null,
    } as unknown as GameState;
    const e: GameEvent = { kind: 'emblemCreated', seat: 0, object: 'o7' };
    const you = describeEvent(e, state, state, 0);
    expect(you?.text).toBe('You get an emblem.');
    expect(you?.rule).toBe('CR 114.1');
    expect(describeEvent({ ...e, seat: 1 }, state, state, 0)?.text).toBe(
      'Opponent gets an emblem.',
    );
  });
});
