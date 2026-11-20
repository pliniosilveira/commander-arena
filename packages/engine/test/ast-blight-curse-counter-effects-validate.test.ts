// Validation of what the counter effects of the Blight Curse deck need: `TargetSpec.alsoDifferentFrom` (CR 115.3), `doubleCounters` with no kind (CR 701.10e), the `aggregate` stat
// `counters` (CR 122.1), and the effects `moveCounter` (CR 122.5) and `removeChosenCounters` (CR 122.1, 608.2d). A node is well-formed and executable (validateCard) only as the
// engine runs it. Cards are SYNTHETIC, defined here.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import {
  type CardDefinition,
  type Effect,
  type SpellText,
  type TargetSpec,
  validateCard,
} from '../src/index';

const CREATURE = { kind: 'object', filter: { types: ['creature'], zone: 'battlefield' } } as const;

function sorcery(spell: SpellText): CardDefinition {
  return singleFace({
    name: 'SYNTHETIC Counter Effects Probe',
    manaCost: ['2', 'B'],
    types: ['sorcery'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: '',
    spell,
  });
}

const messages = (card: CardDefinition) => validateCard(card).map((i) => i.message);
const target = (id: string, extra: Partial<TargetSpec> = {}): TargetSpec => ({
  id,
  what: CREATURE,
  ...extra,
});
const t = (id: string) => ({ kind: 'target', id }) as const;
const counters = (id: string): Effect => ({
  kind: 'addCounters',
  objects: t(id),
  counter: '-1/-1',
  count: 1,
});

describe('alsoDifferentFrom: a target that differs from more than one slot before it (CR 115.3)', () => {
  test('a third target that differs from the first two validates', () => {
    const card = sorcery({
      targets: [
        target('t1'),
        target('t2', { differentFrom: 't1' }),
        target('t3', { differentFrom: 't2', alsoDifferentFrom: ['t1'] }),
      ],
      effect: { kind: 'sequence', effects: [counters('t1'), counters('t2'), counters('t3')] },
    });
    expect(validateCard(card)).toEqual([]);
  });

  test('it needs differentFrom, a slot declared before it, and at least one id', () => {
    const run = (extra: Partial<TargetSpec>) =>
      messages(
        sorcery({
          targets: [target('t1'), target('t2', extra)],
          effect: { kind: 'sequence', effects: [counters('t1'), counters('t2')] },
        }),
      );
    const message =
      'alsoDifferentFrom names earlier target slots of the same ability, with differentFrom';
    expect(run({ alsoDifferentFrom: ['t1'] })).toContain(message);
    expect(run({ differentFrom: 't1', alsoDifferentFrom: [] })).toContain(message);
    expect(run({ differentFrom: 't1', alsoDifferentFrom: ['t9'] })).toContain(message);
  });
});

describe('doubleCounters with no kind: every kind the object has (CR 701.10e)', () => {
  test('validates with or without a kind, and a kind must be named when it is there', () => {
    const doubling = (counter?: string) =>
      sorcery({
        targets: [target('t1')],
        effect: {
          kind: 'doubleCounters',
          objects: t('t1'),
          ...(counter === undefined ? {} : { counter }),
        },
      });
    expect(validateCard(doubling())).toEqual([]);
    expect(validateCard(doubling('+1/+1'))).toEqual([]);
    expect(messages(doubling(''))).toContain('counter name must be non-empty');
  });
});

describe('the aggregate stat `counters`', () => {
  test('"the number of counters among creatures target player controls" validates', () => {
    const card = sorcery({
      targets: [{ id: 't1', what: { kind: 'player', filter: 'any' } }],
      effect: {
        kind: 'gainLife',
        player: { kind: 'you' },
        amount: {
          kind: 'aggregate',
          how: 'total',
          stat: 'counters',
          filter: { types: ['creature'], controlledBy: t('t1') },
        },
      },
    });
    expect(validateCard(card)).toEqual([]);
  });

  test('an unknown stat is refused', () => {
    const card = sorcery({
      effect: {
        kind: 'gainLife',
        player: { kind: 'you' },
        amount: {
          kind: 'aggregate',
          how: 'total',
          stat: 'loyalty' as 'counters',
          filter: { types: ['creature'] },
        },
      },
    });
    expect(messages(card)).toContain('unknown stat "loyalty"');
  });
});

describe('moveCounter and removeChosenCounters', () => {
  test('both validate with the targets of the ability', () => {
    expect(
      validateCard(
        sorcery({
          targets: [target('t1'), target('t2')],
          effect: { kind: 'moveCounter', from: t('t1'), to: t('t2') },
        }),
      ),
    ).toEqual([]);
    expect(
      validateCard(
        sorcery({
          targets: [target('t1')],
          effect: { kind: 'removeChosenCounters', objects: t('t1'), upTo: 3 },
        }),
      ),
    ).toEqual([]);
    expect(
      validateCard(
        sorcery({
          effect: { kind: 'removeChosenCounters', objects: { kind: 'each', filter: {} } },
        }),
      ),
    ).toEqual([]);
  });

  test('moveCounter names declared targets, removeChosenCounters a positive whole number', () => {
    expect(
      validateCard(
        sorcery({
          targets: [target('t1')],
          effect: { kind: 'moveCounter', from: t('t1'), to: t('t2') },
        }),
      ).length,
    ).toBeGreaterThan(0);
    expect(
      messages(
        sorcery({
          targets: [target('t1')],
          effect: { kind: 'removeChosenCounters', objects: t('t1'), upTo: 0 },
        }),
      ),
    ).toContain('upTo must be a positive integer');
  });

  test('countersRemoved reads the counters a removeChosenCounters took, and only after one', () => {
    const draw: Effect = {
      kind: 'draw',
      player: { kind: 'you' },
      count: { kind: 'thisWay', what: 'countersRemoved' },
    };
    const remove: Effect = { kind: 'removeChosenCounters', objects: { kind: 'each', filter: {} } };
    expect(
      validateCard(sorcery({ effect: { kind: 'sequence', effects: [remove, draw] } })),
    ).toEqual([]);
    expect(validateCard(sorcery({ effect: draw })).length).toBeGreaterThan(0);
  });
});
