// Validation of the `batch` field of the `lifeLost` trigger ("Whenever one or more opponents lose life", CR 603.2c, 119.3): a node the engine does not run is refused with a
// message, never accepted and half run.
import { describe, expect, test } from 'vitest';
import { type CardDefinition, syntheticCard, validateCard } from '../src/index';

/** The card with the first ability replaced by `ability`. */
function withAbility(name: string, ability: unknown): CardDefinition {
  const card = syntheticCard(name);
  const [face] = card.faces;
  if (face === undefined) throw new Error('no face');
  return { ...card, faces: [{ ...face, abilities: face.abilities.map(() => ability) }] } as never;
}

const messages = (card: CardDefinition) => validateCard(card).map((i) => i.message);

const WARLOCK = 'SYNTHETIC Frost Warlock';
const DRAW = { kind: 'draw', player: { kind: 'you' }, count: 1 };
const triggered = (trigger: unknown) => ({ kind: 'triggered', trigger, effect: DRAW });

describe('the batch field of "lose life"', () => {
  test('the real shapes are valid', () => {
    for (const trigger of [
      { kind: 'lifeLost', who: 'opponent', batch: true },
      { kind: 'lifeLost', who: 'any', batch: true },
      { kind: 'lifeLost', who: 'opponent' },
    ]) {
      expect(messages(withAbility(WARLOCK, triggered(trigger))), JSON.stringify(trigger)).toEqual(
        [],
      );
    }
  });

  test.each([
    [{ kind: 'lifeLost', who: 'opponent', batch: false }, 'batch must be true'],
    [{ kind: 'lifeLost', who: 'you', batch: true }, 'of other players'],
    [
      { kind: 'lifeLost', who: 'opponent', batch: true, firstEachTurn: true },
      'does not go with firstEachTurn',
    ],
  ])('%j is refused', (trigger, text) => {
    expect(messages(withAbility(WARLOCK, triggered(trigger))).join('\n')).toContain(text);
  });
});
