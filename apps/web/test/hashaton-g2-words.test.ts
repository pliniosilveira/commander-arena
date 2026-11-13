// The words of the primitives of group 2 of the Hashaton deck program (D-363 to D-365, provisional), read from the engine's SYNTHETIC fixtures
// (`synthetic-hashaton-g2.ts`): "Your opponents can't gain life.", "each opponent loses life equal to the life that player lost this turn",
// "you may pay that much life. If you do, draw that many cards" and the question that asks for the payment.
import { type Ability, syntheticCard } from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { amountPhrase } from '../src/game/amount-text';
import { angelsStaticWording } from '../src/game/angels-text';
import { gameConditionWords } from '../src/game/condition-text';
import { costPart, unlessCostAsk } from '../src/game/cost-text';
import { triggerWording } from '../src/game/trigger-text';
import { triggerGist } from '../src/ui/decisions/ability-label';
import { mayPayPrompt } from '../src/ui/decisions/optional';

const triggeredOf = (name: string): Extract<Ability, { kind: 'triggered' }> => {
  const ability = syntheticCard(name).faces[0]?.abilities.find((a) => a.kind === 'triggered');
  if (ability?.kind !== 'triggered') throw new Error(`${name} has no triggered ability`);
  return ability;
};

test('your opponents can not gain life', () => {
  expect(angelsStaticWording({ kind: 'cantGainLife', who: 'opponents' }, 'artifact')).toBe(
    "Your opponents can't gain life",
  );
});

test('each opponent loses life equal to the life that player lost this turn', () => {
  const ability = triggeredOf('SYNTHETIC Grudge Demon');
  expect(triggerWording(ability.trigger, { self: 'SYNTHETIC Grudge Demon' })).toBe(
    'At the beginning of each end step',
  );
  expect(triggerGist(ability, undefined)).toBe(
    'Each opponent loses life equal to the life that player lost this turn',
  );
  expect(amountPhrase({ kind: 'lifeLostThisTurn' })).toBe('the life that player lost this turn');
});

test('if you gained life this turn', () => {
  const ability = triggeredOf('SYNTHETIC Dusk Seraph');
  expect(triggerGist(ability, undefined)).toBe(
    'Create a 4/4 white Angel creature token with flying if you gained life this turn',
  );
  expect(gameConditionWords({ kind: 'lifeGainedThisTurn', atLeast: 3 })).toBe(
    'you gained 3 or more life this turn',
  );
});

test('you may pay that much life. If you do, draw that many cards', () => {
  const ability = triggeredOf('SYNTHETIC Ghostly Dragon');
  expect(triggerWording(ability.trigger, { self: 'SYNTHETIC Ghostly Dragon' })).toBe(
    'Whenever you gain life',
  );
  expect(triggerGist(ability, undefined)).toBe(
    'You may pay that much life. If you do, you draw that many cards',
  );
  expect(costPart({ kind: 'payLife', amount: { kind: 'triggerDamage' } })).toBe('that much life');
});

test('the question names the life that is worked out', () => {
  const cost = [{ kind: 'payLife', amount: 3 }] as const;
  expect(unlessCostAsk(cost)).toBe('Pay 3 life');
  const prompt = mayPayPrompt(
    cost,
    { source: 'o1' as never, sourceName: 'SYNTHETIC Ghostly Dragon' },
    new Map() as never,
  );
  expect(prompt).toBe("Pay 3 life for SYNTHETIC Ghostly Dragon's ability?");
});
