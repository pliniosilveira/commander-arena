// `ObjectFilter.targetsPlayer` (CR 115.1, 601.2c): "a spell that targets a player" is about a spell or ability on the stack, so the validator refuses it anywhere else, and
// accepts it in the condition of a cast trigger about the spell that was cast ("copy that spell if it targets a permanent or player"). Cards are SYNTHETIC.
import { describe, expect, test } from 'vitest';
import { validateCardStructure } from '../src/ast/validate';
import type { Effect } from '../src/index';
import { singleFaceCard } from './dsl-helpers';

const card = (effect: Effect, trigger: 'cast' | 'enters') =>
  singleFaceCard({
    name: 'SYNTHETIC Aimed Checker',
    manaCost: ['1'],
    types: ['creature'],
    colors: [],
    colorIdentity: [],
    power: 1,
    toughness: 1,
    oracleText: '',
    abilities: [
      {
        kind: 'triggered',
        trigger:
          trigger === 'cast'
            ? { kind: 'castSpell', filter: { stackKind: 'spell' }, by: 'you' }
            : { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect,
      },
    ],
  });

const COPY_IF_AIMED: Effect = {
  kind: 'conditional',
  condition: {
    kind: 'objectMatches',
    of: { kind: 'triggerSubject' },
    filter: { anyOf: [{ targetsObject: { zone: 'battlefield' } }, { targetsPlayer: true }] },
  },
  effect: { kind: 'copySpell', spell: { kind: 'triggerSubject' }, newTargets: 'may' },
};

describe('targetsPlayer is read on the stack only (CR 115.1)', () => {
  test('the condition of a cast trigger about the spell is valid', () => {
    expect(validateCardStructure(card(COPY_IF_AIMED, 'cast'))).toEqual([]);
  });

  test('a filter of a battlefield permanent that targets a player is refused', () => {
    const effect: Effect = {
      kind: 'conditional',
      condition: {
        kind: 'objectMatches',
        of: { kind: 'this' },
        filter: { targetsPlayer: true },
      },
      effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
    };
    const issues = validateCardStructure(card(effect, 'enters'));
    expect(issues.some((i) => i.path.endsWith('targetsPlayer'))).toBe(true);
  });

  test('a filter that says false is refused', () => {
    const effect = {
      kind: 'conditional',
      condition: {
        kind: 'objectMatches',
        of: { kind: 'triggerSubject' },
        filter: { targetsPlayer: false },
      },
      effect: { kind: 'copySpell', spell: { kind: 'triggerSubject' }, newTargets: 'may' },
    } as unknown as Effect;
    const issues = validateCardStructure(card(effect, 'cast'));
    expect(issues.some((i) => i.message.includes('targetsPlayer must be true'))).toBe(true);
  });
});
