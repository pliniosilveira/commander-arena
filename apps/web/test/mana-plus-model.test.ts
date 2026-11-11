/**
 * Pure parts of the more-mana-production UI (D-099, D-102): combination taps while paying, the
 * words for combinations and for life paid as a cost, and the log line "You pay 1 life.".
 */
import type {
  GameEvent,
  GameState,
  ObjectView,
  PayManaDecision,
  PriorityDecision,
} from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { describeEvents } from '../src/game/describe';
import { menuItems } from '../src/ui/decisions/abilities';
import {
  comboListText,
  comboText,
  lifeCostOf,
  manaChoiceLabel,
} from '../src/ui/decisions/mana-choice';
import {
  asksChoice,
  clickSource,
  payLifeDetail,
  setTapCombination,
  tapBadges,
} from '../src/ui/decisions/payment';
import { clickOutcome } from '../src/ui/decisions/priority';
import { lookupIndexFor } from './decisions-helpers';

const card = (id: string, oracleText: string): ObjectView =>
  ({ id, name: id, oracleText, controller: 0 }) as unknown as ObjectView;

describe('words for mana', () => {
  test('a combination reads as it does on a card', () => {
    expect(comboText(['R', 'W'])).toBe('{R}{W}');
    expect(
      comboListText([
        ['R', 'R'],
        ['R', 'W'],
        ['W', 'W'],
      ]),
    ).toBe('{R}{R}, {R}{W} or {W}{W}');
    expect(comboListText([['U', 'B']])).toBe('{U}{B}');
    expect(manaChoiceLabel(1, null, ['R', 'W'])).toBe('Add {R}{W}');
    expect(manaChoiceLabel(1, 'B', undefined)).toBe('Add B');
    expect(manaChoiceLabel(1, null, undefined)).toBe('Ability 2');
  });

  test('the life a mana ability costs is read from the sentence that makes that mana', () => {
    const confluence = card('c', '{T}, Pay 1 life: Add one mana of any color.');
    expect(lifeCostOf(confluence, 'U')).toBe(1);
    const blood = card('b', '{T}, Pay 2 life: Add {B}{B}.');
    expect(lifeCostOf(blood, null)).toBe(2);
    // Horizon-style: only the colored ability costs life.
    const horizon = card('h', '{T}: Add {C}.\n{T}, Pay 1 life: Add {G} or {W}.');
    expect(lifeCostOf(horizon, 'G')).toBe(1);
    expect(lifeCostOf(horizon, 'W')).toBe(1);
    expect(lifeCostOf(horizon, 'C')).toBe(0);
    // Two sentences that fit and disagree: nothing is claimed.
    expect(lifeCostOf(horizon, null)).toBe(0);
    const filter = card('f', '{T}: Add {C}. {R/W}, {T}: Add {R}{R}, {R}{W}, or {W}{W}.');
    expect(lifeCostOf(filter, null, ['R', 'W'])).toBe(0);
    expect(lifeCostOf(undefined, 'W')).toBe(0);
  });
});

const sources: PayManaDecision['manaSources'] = [
  { object: 'o1', abilityIndex: 0 },
  {
    object: 'o1',
    abilityIndex: 1,
    combinations: [
      ['R', 'R'],
      ['R', 'W'],
      ['W', 'W'],
    ],
  },
  { object: 'o2', abilityIndex: 0, combinations: [['U', 'B']] },
  { object: 'o3', abilityIndex: 0, colors: ['B', 'G'] },
];

describe('paying with a combination source', () => {
  test('a source with several combinations asks; one with a single combination does not', () => {
    expect(asksChoice(sources[1] ?? { object: 'o9', abilityIndex: 0 })).toBe(true);
    expect(asksChoice(sources[2] ?? { object: 'o9', abilityIndex: 0 })).toBe(false);
    expect(asksChoice(sources[0] ?? { object: 'o9', abilityIndex: 0 })).toBe(false);
  });

  test('clicking the filter land cycles: its plain tap, then the question, then out', () => {
    const first = clickSource([], sources, 'o1');
    expect(first).toEqual({ kind: 'taps', taps: [{ object: 'o1', abilityIndex: 0 }] });
    if (first.kind !== 'taps') return;
    expect(clickSource(first.taps, sources, 'o1')).toEqual({ kind: 'choose', abilityIndex: 1 });
    const chosen = setTapCombination(first.taps, sources, 'o1', 1, ['R', 'W']);
    expect(chosen).toEqual([{ object: 'o1', abilityIndex: 1, combination: ['R', 'W'] }]);
    expect(clickSource(chosen, sources, 'o1')).toEqual({ kind: 'taps', taps: [] });
  });

  test('a single combination is named in the tap without a question', () => {
    expect(clickSource([], sources, 'o2')).toEqual({
      kind: 'taps',
      taps: [{ object: 'o2', abilityIndex: 0, combination: ['U', 'B'] }],
    });
  });

  test('a combination that is not on offer, or on another ability, changes nothing', () => {
    expect(setTapCombination([], sources, 'o1', 1, ['U', 'U'])).toEqual([]);
    expect(setTapCombination([], sources, 'o1', 0, ['R', 'R'])).toEqual([]);
    expect(setTapCombination([], sources, 'o3', 0, ['B', 'G'])).toEqual([]);
  });

  test("the order of the pair does not matter and the engine's order is what is sent", () => {
    expect(setTapCombination([], sources, 'o1', 1, ['W', 'R'])).toEqual([
      { object: 'o1', abilityIndex: 1, combination: ['R', 'W'] },
    ]);
  });

  test('the badge names the combination, and a repeat tap keeps its place in the order', () => {
    const taps = setTapCombination(
      [
        { object: 'o3', abilityIndex: 0, color: 'B' },
        { object: 'o1', abilityIndex: 0 },
      ],
      sources,
      'o1',
      1,
      ['W', 'W'],
    );
    expect(taps.map((t) => t.object)).toEqual(['o3', 'o1']);
    expect([...tapBadges(taps).entries()]).toEqual([
      ['o3', '1 (B)'],
      ['o1', '2 (WW)'],
    ]);
  });

  test('the bar says what the taps cost in life', () => {
    const index = lookupIndexFor([
      card('o1', '{T}, Pay 1 life: Add one mana of any color.'),
      card('o2', '{T}, Pay 2 life: Add {B}{B}.'),
      card('o3', '{T}: Add {B}.'),
    ]);
    expect(payLifeDetail([], index)).toBeNull();
    expect(payLifeDetail([{ object: 'o3', abilityIndex: 0 }], index)).toBeNull();
    expect(
      payLifeDetail(
        [
          { object: 'o1', abilityIndex: 0, color: 'U' },
          { object: 'o2', abilityIndex: 0 },
          { object: 'o3', abilityIndex: 0 },
        ],
        index,
      ),
    ).toBe('These taps cost 3 life.');
  });
});

describe('priority: a filter land and a granted ability', () => {
  const decision = {
    kind: 'priority',
    options: [
      { kind: 'activateAbility', source: 'o1', abilityIndex: 0, color: 'C' },
      {
        kind: 'activateAbility',
        source: 'o1',
        abilityIndex: 1,
        color: null,
        combination: ['R', 'R'],
      },
      {
        kind: 'activateAbility',
        source: 'o1',
        abilityIndex: 1,
        color: null,
        combination: ['R', 'W'],
      },
      {
        kind: 'activateAbility',
        source: 'o1',
        abilityIndex: 1,
        color: null,
        combination: ['W', 'W'],
      },
    ],
  } as unknown as PriorityDecision;

  test('the click asks, and each choice sends its combination with color null', () => {
    const index = lookupIndexFor([
      card('o1', '{T}: Add {C}. {R/W}, {T}: Add {R}{R}, {R}{W}, or {W}{W}.'),
    ]);
    const outcome = clickOutcome(decision, 'o1', index);
    if (outcome.kind !== 'choose') throw new Error('expected a choice');
    expect(outcome.choices.map((c) => c.label)).toEqual([
      'Add C',
      'Add {R}{R}',
      'Add {R}{W}',
      'Add {W}{W}',
    ]);
    expect(outcome.choices[2]?.action).toEqual({
      kind: 'activateAbility',
      source: 'o1',
      abilityIndex: 1,
      color: null,
      combination: ['R', 'W'],
    });
    // A plain color choice has no `combination` key at all.
    expect('combination' in (outcome.choices[0]?.action ?? {})).toBe(false);
  });

  test('menu items are unique per combination and carry the life a card says it costs', () => {
    const index = lookupIndexFor([card('o1', '{T}, Pay 1 life: Add one mana of any color.')]);
    const withMenu = {
      kind: 'priority',
      options: [
        { kind: 'activate', object: 'o1', abilityIndex: 5 },
        { kind: 'activateAbility', source: 'o1', abilityIndex: 0, color: 'U' },
        {
          kind: 'activateAbility',
          source: 'o1',
          abilityIndex: 1,
          color: null,
          combination: ['U', 'B'],
        },
        {
          kind: 'activateAbility',
          source: 'o1',
          abilityIndex: 1,
          color: null,
          combination: ['B', 'B'],
        },
      ],
    } as unknown as PriorityDecision;
    const items = menuItems(withMenu, 'o1', index);
    const mana = items.filter((i) => i.key.startsWith('mana-'));
    expect(new Set(mana.map((i) => i.key)).size).toBe(3);
    expect(mana[0]?.label).toBe('Add U (pay 1 life)');
    expect(mana[1]?.label).toContain('{U}{B}');
  });
});

describe('the log', () => {
  const state = (life: number): GameState =>
    ({
      objects: { o1: { id: 'o1', card: null, token: null, zone: 'battlefield', controller: 0 } },
      cards: {},
      definitions: {},
      stack: [],
      pending: null,
      seats: [{ id: 0, life }],
    }) as unknown as GameState;

  test('life lost right after a permanent taps reads as a payment', () => {
    const events: GameEvent[] = [
      { kind: 'tapped', object: 'o1' },
      { kind: 'lifeChanged', seat: 0, from: 20, to: 19 },
      { kind: 'manaAdded', seat: 0, count: 1 },
    ];
    const lines = describeEvents(events, state(20), state(19), 0).map((l) => l.text);
    expect(lines).toContain('You pay 1 life.');
    expect(lines.join('\n')).not.toContain('Your life:');
    const theirs = describeEvents(
      [events[0] as GameEvent, { kind: 'lifeChanged', seat: 1, from: 20, to: 18 }],
      state(20),
      state(18),
      0,
    ).map((l) => l.text);
    expect(theirs).toContain('Opponent pays 2 life.');
  });

  test('life lost for any other reason keeps its own line', () => {
    const lines = describeEvents(
      [{ kind: 'lifeChanged', seat: 0, from: 20, to: 17 }],
      state(20),
      state(17),
      0,
    ).map((l) => l.text);
    expect(lines).toEqual(['Your life: 20 to 17.']);
  });
});
