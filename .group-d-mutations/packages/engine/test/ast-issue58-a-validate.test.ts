import { describe, expect, test } from 'vitest';
import { type Ability, validateAbility } from '../src/index';

const grant = (player: unknown): Ability =>
  ({
    kind: 'static',
    condition: {
      kind: 'lifeTotal',
      compare: { cmp: 'atMost', value: 10 },
      player,
    },
    static: { kind: 'grantKeyword', subject: { kind: 'this' }, keyword: { kind: 'haste' } },
  }) as Ability;

describe('opponent life-total scope and exile-result conditions', () => {
  test('an opponent is the only explicit life-total scope', () => {
    expect(validateAbility(grant('opponent'))).toEqual([]);
    for (const player of ['you', 'eachOpponent', 1, null]) {
      expect(validateAbility(grant(player)).map((i) => i.path)).toContain(
        'ability.condition.player',
      );
    }
  });

  test.each(['hand', 'exile', 'graveyard'])('objectMatches inZone %s is checked', (inZone) => {
    const ability = {
      kind: 'activated',
      cost: [{ kind: 'mana', symbols: ['0'] }],
      targets: [{ id: 't1', what: { kind: 'object', filter: { zone: 'graveyard' } } }],
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'exile', objects: { kind: 'target', id: 't1' } },
          {
            kind: 'conditional',
            condition: {
              kind: 'objectMatches',
              of: { kind: 'moved' },
              filter: { types: ['creature'] },
              inZone,
            },
            effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
          },
        ],
      },
    } as Ability;
    const issues = validateAbility(ability);
    if (inZone === 'graveyard') expect(issues.some((i) => i.path.endsWith('.inZone'))).toBe(true);
    else expect(issues).toEqual([]);
  });
});
