// Issue 422 (more opponents, step 3): an operand that reads one player must not take a selector that can name several (CR 101.4):
// with 3 or 4 seats `eachOpponent` would silently read the first opponent. Validation refuses it; a single player still passes.
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-upkeep.ts).
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';

const CLAIM = 'SYNTHETIC Crown Claim'; // a sorcery with a spell effect we replace

function withEffect(effect: unknown) {
  const card = syntheticCard(CLAIM);
  const face = card.faces[0];
  if (face === undefined) throw new Error('no face');
  return { ...card, faces: [{ ...face, spell: { effect } }] } as never;
}

const EACH_OPP = { kind: 'eachOpponent' };
const YOU = { kind: 'you' };
const GAIN = (amount: unknown) => ({ kind: 'gainLife', player: YOU, amount });

describe('single-player operands refuse a selector of several players', () => {
  test.each([
    ['poisonShortfall', GAIN({ kind: 'poisonShortfall', limit: 10, player: EACH_OPP })],
    ['commanderCasts', GAIN({ kind: 'commanderCasts', player: EACH_OPP })],
    ['addMana', { kind: 'addMana', player: EACH_OPP, mana: { kind: 'fixed', symbols: ['R'] } }],
    [
      'delayedCombatDamageToPlayer',
      {
        kind: 'delayedCombatDamageToPlayer',
        filter: { controller: 'you' },
        player: EACH_OPP,
        effect: { kind: 'draw', player: YOU, count: 1 },
      },
    ],
    [
      'a delayed draw',
      {
        kind: 'delayedTrigger',
        when: { kind: 'nextEndStep' },
        effect: { kind: 'draw', player: EACH_OPP, count: 1 },
      },
    ],
  ])('%s with eachOpponent is an issue', (what, effect) => {
    expect(JSON.stringify(validateCard(withEffect(effect)))).toContain('name a single player');
    expect(what).toBeTruthy();
  });

  test('lifeTotalOf of the players the effect names stays valid ("a third of their life")', () => {
    const issues = JSON.stringify(
      validateCard(
        withEffect({
          kind: 'loseLife',
          player: { kind: 'eachPlayer' },
          amount: { kind: 'lifeTotalOf', player: { kind: 'eachPlayer' } },
        }),
      ),
    );
    expect(issues).not.toContain('name a single player');
  });

  test('a single player passes', () => {
    const issues = JSON.stringify(
      validateCard(withEffect(GAIN({ kind: 'lifeTotalOf', player: YOU }))),
    );
    expect(issues).not.toContain('name a single player');
  });
});
