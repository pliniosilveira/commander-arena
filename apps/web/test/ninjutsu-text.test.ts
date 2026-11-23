/**
 * The words of Ninjutsu (CR 702.49a, UNVERIFIED rule number: the CR text is not in the repository): the chip, the label of its activation and the text of its cost. The ability is the
 * one the engine writes for the keyword (`rules/derive-keywords.ts`), so a wording that drifts from the AST fails here. No DOM.
 */
import type { ActivatedAbility } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { activationCostText } from '../src/game/cost-text';
import { chipsOf } from '../src/ui/board/keywords';
import { activationLabel, isCycling, isNinjutsu } from '../src/ui/decisions/ability-label';

const NINJUTSU: ActivatedAbility = {
  kind: 'activated',
  cost: [
    { kind: 'mana', symbols: ['1', 'R'] },
    { kind: 'returnToHand', what: { types: ['creature'], unblocked: true } },
  ],
  effect: {
    kind: 'sequence',
    effects: [
      { kind: 'moveToZone', objects: { kind: 'this' }, to: 'battlefield', tapped: true },
      { kind: 'enterAttacking', objects: { kind: 'moved' }, asReturned: true },
    ],
  },
  functionsIn: 'hand',
};

describe('Ninjutsu', () => {
  test('the chip carries the cost and the reminder', () => {
    const chips = chipsOf({
      keywords: ['ninjutsu'],
      restrictions: [],
      oracleText: 'Ninjutsu {1}{R}',
    });
    expect(chips).toHaveLength(1);
    expect(chips[0]?.short).toBe('Nin');
    expect(chips[0]?.full).toContain('Ninjutsu {1}{R}');
    expect(chips[0]?.full).toContain('unblocked attacker');
  });

  test('a granted Ninjutsu with no text on the card is the bare name, with no cost guessed', () => {
    const chips = chipsOf({ keywords: ['ninjutsu'], restrictions: [], oracleText: '' });
    expect(chips).toHaveLength(1);
    expect(chips[0]?.full).toMatch(/^Ninjutsu/);
  });

  test('the activation label says the keyword and its cost, not the return', () => {
    expect(isNinjutsu(NINJUTSU)).toBe(true);
    expect(isCycling(NINJUTSU)).toBe(false);
    expect(activationLabel(undefined, { abilityIndex: 1, ability: NINJUTSU })).toBe(
      'Ninjutsu {1}{R}',
    );
  });

  test('an ability from the hand that returns something else is not Ninjutsu', () => {
    const other: ActivatedAbility = {
      ...NINJUTSU,
      cost: [{ kind: 'returnToHand', what: { types: ['creature'] } }],
    };
    expect(isNinjutsu(other)).toBe(false);
  });

  test('the cost reads "Return an unblocked attacker you control to its owner\'s hand"', () => {
    expect(activationCostText(NINJUTSU.cost)).toBe(
      "{1}{R}, Return an unblocked attacker you control to its owner's hand",
    );
  });
});
