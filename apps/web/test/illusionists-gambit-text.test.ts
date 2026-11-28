// The Peace Offering deck, group G: the words the board shows for Illusionist's Gambit (CR 101.2, 601.3, 500.8, 508.1c, 508.1d).
import { describe, expect, test } from 'vitest';
import { cantCastWording } from '../src/game/angels-text';
import { extraCombatText } from '../src/game/dragons-text';

describe("Illusionist's Gambit words", () => {
  test('when the spell can be cast', () => {
    expect(
      cantCastWording({
        kind: 'static',
        static: { kind: 'cantCastThis' },
        condition: {
          kind: 'not',
          term: {
            kind: 'and',
            terms: [
              { kind: 'duringStep', step: 'declareBlockers' },
              { kind: 'not', term: { kind: 'yourTurn' } },
            ],
          },
        },
      }),
    ).toBe("Cast this spell only during the declare blockers step on an opponent's turn");
    expect(
      cantCastWording({
        kind: 'static',
        static: { kind: 'cantCastThis' },
        condition: { kind: 'not', term: { kind: 'duringStep', step: 'declareAttackers' } },
      }),
    ).toBe('Cast this spell only during the declare attackers step');
  });

  test('the added combat and what binds those creatures in it', () => {
    expect(extraCombatText(null, { attackIfAble: true, cantAttackYou: true })).toBe(
      "After this phase, there is an additional combat phase. Each of those creatures attacks that combat if able. They can't attack you or planeswalkers you control that combat",
    );
    expect(extraCombatText(null)).toBe('After this phase, there is an additional combat phase');
  });
});
