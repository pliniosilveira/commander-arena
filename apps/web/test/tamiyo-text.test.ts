// The words of Tamiyo, Field Researcher's +1 (the Peace Offering deck, group D) as a pure model: the gist of the delayed combat damage ability of any recipient until your next turn,
// beside the prepare trigger's "to a player this combat" it shares an AST node with (CR 603.7, 500.1). The abilities are SYNTHETIC, written as the parser lowers the real lines. No DOM.
import type { ActivatedAbility, Effect } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { activationLabel } from '../src/ui/decisions/ability-label';

const ability = (effect: Effect): ActivatedAbility => ({
  kind: 'activated',
  cost: [{ kind: 'loyalty', change: 1 }],
  targets: [
    {
      id: 't1',
      what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
      min: 0,
      max: 2,
    },
  ],
  effect,
});

describe('the delayed combat damage ability', () => {
  test('until your next turn, to anything', () => {
    const label = activationLabel(undefined, {
      abilityIndex: 0,
      ability: ability({
        kind: 'delayedCombatDamage',
        objects: { kind: 'target', id: 't1' },
        to: 'any',
        until: 'yourNextTurn',
        effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
      }),
    });
    expect(label).toMatch(
      /^\+1: Until your next turn, whenever any of up to two target creatures deals combat damage, you draw a card$/i,
    );
    expect(label).not.toMatch(/this combat|to a player/);
  });

  test('the prepare trigger keeps its words', () => {
    const label = activationLabel(undefined, {
      abilityIndex: 0,
      ability: ability({
        kind: 'delayedCombatDamage',
        objects: { kind: 'target', id: 't1' },
        effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
      }),
    });
    expect(label).toMatch(/Whenever .* deals combat damage to a player this combat, /);
  });
});
