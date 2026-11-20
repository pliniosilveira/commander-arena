// validateCard for an "up to" division of a triggered ability (SYNTHETIC card defined here): "distribute up to that many +1/+1 counters among any number of other target
// creatures" (CR 601.2d, 603.3d, 122.6): `TargetSpec.divide.upTo`.
import { describe, expect, test } from 'vitest';
import { validateCard } from '../src/ast/validate';
import { singleFace } from '../src/cards/fixtures/helpers';

const card = (
  divide: unknown,
  interveningIf: unknown = { kind: 'lifeGainedThisTurn', atLeast: 1 },
) =>
  singleFace({
    name: 'SYNTHETIC Test Up To',
    manaCost: ['G'],
    types: ['creature'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 1,
    toughness: 1,
    oracleText: 'test',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'endStep', whose: 'each' },
        interveningIf: interveningIf as never,
        targets: [
          {
            id: 't1',
            what: { kind: 'object', filter: { types: ['creature'], other: true } },
            divide: divide as never,
          },
        ],
        effect: { kind: 'distributeCounters', to: { kind: 'target', id: 't1' }, counter: '+1/+1' },
      },
    ],
  });

const issues = (c: ReturnType<typeof card>) =>
  validateCard(c).map((i) => `${i.path}: ${i.message}`);

describe('an "up to" division of a triggered ability', () => {
  test('the life gained this turn is a total, and the division may give out less', () => {
    expect(issues(card({ total: { kind: 'lifeGainedThisTurn' }, upTo: true }))).toEqual([]);
  });

  test('a total that needs the resolution (X) is still refused in an ability', () => {
    expect(issues(card({ total: { kind: 'x' }, upTo: true })).length).toBeGreaterThan(0);
  });
});
