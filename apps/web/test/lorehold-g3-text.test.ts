// The words of group 3 of the Lorehold Spirit deck (issue 86) as pure models: the intervening "if" "a player has one or fewer cards in hand", the gist of the upkeep trigger that makes its
// creature prepared and the gist of the prepare spell "Each player discards their hand, then draws seven cards". Read from the engine's SYNTHETIC card, so a wording that drifts from the
// AST fails here. No DOM.
import { type Ability, syntheticCard } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { gameConditionWords } from '../src/game/condition-text';
import { triggerGist } from '../src/ui/decisions/ability-label';

const CARD = 'SYNTHETIC Lore Jackal // Spin of Fate';
const EMPTY = 'SYNTHETIC Empty Hands';

describe('the condition "a player has one or fewer cards in hand"', () => {
  const at = (cmp: 'atMost' | 'atLeast' | 'equal', value: number, negate = false) =>
    gameConditionWords(
      negate
        ? { kind: 'not', term: { kind: 'aPlayerCardsInHand', compare: { cmp, value } } }
        : { kind: 'aPlayerCardsInHand', compare: { cmp, value } },
    );

  test('at most, at least and exactly', () => {
    expect(at('atMost', 1)).toBe('a player has 1 or fewer cards in hand');
    expect(at('atLeast', 7)).toBe('a player has 7 or more cards in hand');
    expect(at('equal', 0)).toBe('a player has exactly 0 cards in hand');
  });

  test('negated', () => {
    expect(at('atMost', 1, true)).toBe("it's not true that a player has 1 or fewer cards in hand");
  });
});

describe('the abilities of the card', () => {
  test('the upkeep trigger prepares the creature, with its condition in the words', () => {
    const [trigger] = syntheticCard(CARD).faces[0]?.abilities ?? ([] as readonly Ability[]);
    if (trigger?.kind !== 'triggered') throw new Error('no trigger');
    expect(triggerGist(trigger as never, undefined)).toBe(
      'This permanent becomes prepared if a player has 1 or fewer cards in hand',
    );
  });

  test('the prepare spell: each player discards their hand, then draws seven cards', () => {
    const effect = syntheticCard(CARD).faces[1]?.spell?.effect;
    if (effect === undefined) throw new Error('no spell');
    const gist = triggerGist(
      { kind: 'triggered', trigger: { kind: 'upkeep', whose: 'you' }, effect } as never,
      undefined,
    );
    expect(gist).toBe('Each player discards their hand. Each player draws 7 cards');
  });

  test('the discard alone', () => {
    const effect = syntheticCard(EMPTY).faces[0]?.spell?.effect;
    if (effect === undefined) throw new Error('no spell');
    expect(
      triggerGist(
        { kind: 'triggered', trigger: { kind: 'upkeep', whose: 'you' }, effect } as never,
        undefined,
      ),
    ).toBe('Each player discards their hand');
  });
});
