import type { ActivatedAbility, Cost, ObjectView } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { activationCostText } from '../src/game/cost-text';
import { activationLabel, isCycling, isEquip } from '../src/ui/decisions/ability-label';

const mana = (...symbols: string[]): Cost => ({ kind: 'mana', symbols });
const draw = { kind: 'draw', player: { kind: 'you' }, count: 1 } as const;
const ability = (patch: Partial<ActivatedAbility> & Pick<ActivatedAbility, 'cost'>) =>
  ({ kind: 'activated', effect: draw, ...patch }) as ActivatedAbility;
const bear = { name: 'Bear', types: ['creature'] } as unknown as ObjectView;

describe('activation cost text', () => {
  test('costs read as Oracle prints them, in order', () => {
    expect(activationCostText([mana('2', 'G'), { kind: 'tap' }])).toBe('{2}{G}, {T}');
    expect(activationCostText([{ kind: 'payLife', amount: 2 }])).toBe('Pay 2 life');
    expect(activationCostText([{ kind: 'sacrifice', what: { kind: 'this' } }])).toBe(
      'Sacrifice this',
    );
    expect(activationCostText([{ kind: 'sacrifice', what: { types: ['creature'] } }])).toBe(
      'Sacrifice a creature',
    );
    expect(
      activationCostText([{ kind: 'sacrifice', what: { types: ['artifact'], other: true } }]),
    ).toBe('Sacrifice another artifact');
    expect(activationCostText([{ kind: 'removeCounters', counter: 'charge', count: 1 }])).toBe(
      'Remove a charge counter',
    );
    expect(activationCostText([{ kind: 'removeCounters', counter: 'charge', count: 2 }])).toBe(
      'Remove 2 charge counters',
    );
    expect(activationCostText([{ kind: 'discard', count: 1 }, { kind: 'discardThis' }])).toBe(
      'Discard a card, Discard this card',
    );
  });
});

describe('ability labels', () => {
  const entry = (a: ActivatedAbility, abilityIndex = 0) => ({ abilityIndex, ability: a });

  test('Cycling reads as on the card', () => {
    const cycling = ability({
      cost: [{ kind: 'discardThis' }, mana('2')],
      functionsIn: 'hand',
    });
    expect(isCycling(cycling)).toBe(true);
    expect(activationLabel(bear, entry(cycling, 1))).toBe('Cycling {2}');
    const life = ability({
      cost: [{ kind: 'discardThis' }, { kind: 'payLife', amount: 2 }],
      functionsIn: 'hand',
    });
    expect(activationLabel(bear, entry(life))).toBe('Cycling—Pay 2 life');
  });

  test('a pump names the cost and the effect', () => {
    const pump = ability({
      cost: [mana('1')],
      effect: {
        kind: 'modifyPt',
        objects: { kind: 'this' },
        power: 1,
        toughness: 1,
        duration: 'untilEndOfTurn',
      },
    });
    expect(isCycling(pump)).toBe(false);
    expect(activationLabel(bear, entry(pump))).toBe(
      '{1}: This creature gets +1/+1 until end of turn',
    );
  });

  test('a targeted ability names its target; a sacrifice outlet and life gain read plainly', () => {
    const coach = ability({
      cost: [{ kind: 'tap' }],
      targets: [{ id: 't1', what: { kind: 'object', filter: { types: ['creature'] } } }],
      effect: {
        kind: 'modifyPt',
        objects: { kind: 'target', id: 't1' },
        power: 2,
        toughness: 2,
        duration: 'untilEndOfTurn',
      },
    });
    expect(activationLabel(bear, entry(coach))).toBe(
      '{T}: Target creature gets +2/+2 until end of turn',
    );
    const altar = ability({
      cost: [{ kind: 'sacrifice', what: { types: ['creature'] } }],
      effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 2 },
    });
    expect(activationLabel(undefined, entry(altar))).toBe('Sacrifice a creature: You gain 2 life');
    const slow = ability({ cost: [mana('1')], timing: 'sorcery' });
    expect(activationLabel(bear, entry(slow))).toBe('{1}: You draw a card (sorcery speed)');
  });

  test('an effect the label does not know shows the cost alone', () => {
    const odd = ability({
      cost: [mana('1')],
      effect: { kind: 'scry', count: 1 },
    });
    expect(activationLabel(bear, entry(odd))).toBe('{1}');
  });

  test('Equip reads as on the card, without a gist or a timing note', () => {
    const attach = {
      kind: 'attach',
      object: { kind: 'this' },
      to: { kind: 'target', id: 't1' },
    } as const;
    const equip = (cost: Cost[]) =>
      ability({
        cost,
        effect: attach,
        timing: 'sorcery',
        targets: [
          {
            id: 't1',
            what: { kind: 'object', filter: { types: ['creature'], controller: 'you' } },
          },
        ],
      });
    const gear = { name: 'Blade', types: ['artifact'] } as unknown as ObjectView;
    expect(isEquip(equip([mana('1')]))).toBe(true);
    expect(activationLabel(gear, entry(equip([mana('1')])))).toBe('Equip {1}');
    expect(activationLabel(gear, entry(equip([mana('2', 'G')])))).toBe('Equip {2}{G}');
    expect(activationLabel(gear, entry(equip([{ kind: 'payLife', amount: 2 }])))).toBe(
      'Equip—Pay 2 life',
    );
    // Cycling and other abilities are not Equip.
    expect(isEquip(ability({ cost: [mana('1')] }))).toBe(false);
    expect(isCycling(equip([mana('1')]))).toBe(false);
  });
});
