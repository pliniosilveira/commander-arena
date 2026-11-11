import type { ActivatedAbility } from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { activationCostPart } from '../src/game/cost-text';
import { activationLabel } from '../src/ui/decisions/ability-label';

// The words of the Vraska deck's abilities in the target picker and the ability label (groups 3 and 4, D-207, D-208).
test('Forge of Heroes: the target says it must have entered this turn (CR 400.7)', () => {
  const ability: ActivatedAbility = {
    kind: 'activated',
    cost: [{ kind: 'tap' }],
    targets: [
      { id: 't1', what: { kind: 'object', filter: { commander: true, enteredThisTurn: true } } },
    ],
    effect: {
      kind: 'sequence',
      effects: [
        {
          kind: 'conditional',
          condition: {
            kind: 'objectMatches',
            of: { kind: 'target', id: 't1' },
            filter: { types: ['creature'] },
          },
          effect: {
            kind: 'addCounters',
            objects: { kind: 'target', id: 't1' },
            counter: '+1/+1',
            count: 1,
          },
        },
      ],
    },
  } as never;
  expect(activationLabel(undefined, { abilityIndex: 0, ability })).toBe(
    "{T}: If it's a creature card, put a +1/+1 counter on target commander that entered this turn",
  );
});

test('an energy cost reads as the symbols the card prints (CR 107.14)', () => {
  expect(activationCostPart({ kind: 'energy', count: 2 })).toBe('{E}{E}');
});
