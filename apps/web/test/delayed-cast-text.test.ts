/**
 * The web side of D-336 and D-337 (the delayed trigger "when you next cast an instant or sorcery spell this turn" and the copy count): the words of the
 * activated ability and of the trigger that goes on the stack, read from the engine's SYNTHETIC cards so a wording that drifts from the AST fails here. Pure
 * models, no DOM.
 */
import { type ActivatedAbility, type StackAbility, syntheticCard } from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { copySpellWords, delayedCastWords } from '../src/game/copy-text';
import { activationLabel, triggerGist } from '../src/ui/decisions/ability-label';

function drakeAbility(): ActivatedAbility {
  const ability = syntheticCard('SYNTHETIC Commander Echo Drake').faces[0]?.abilities?.[0];
  if (ability?.kind !== 'activated') throw new Error('no activated ability');
  return ability;
}

test('the Drake ability is worded as the card prints it, with the sacrifice as a cost (the cost words are the existing ones)', () => {
  expect(
    activationLabel({ types: ['creature'] } as never, { abilityIndex: 0, ability: drakeAbility() }),
  ).toBe(
    "{2}{U}, Sacrifice this: When you next cast an instant or sorcery spell this turn, copy that spell for each time you've cast your commander from the command zone this game. You may choose new targets for the copies",
  );
});

test('the trigger on the stack says what it copies', () => {
  const ability = drakeAbility();
  if (ability.effect.kind !== 'delayedCast') throw new Error('not delayed');
  const stack = {
    kind: 'triggered',
    trigger: { kind: 'castSpell', filter: ability.effect.filter, by: 'you' },
    effect: ability.effect.effect,
  } as unknown as StackAbility;
  expect(triggerGist(stack, undefined)).toBe(
    "Copy that spell for each time you've cast your commander from the command zone this game. You may choose new targets for the copies",
  );
});

test('the words of the pieces', () => {
  expect(copySpellWords('that spell', 'may', null)).toBe(
    'Copy that spell. You may choose new targets for the copy',
  );
  expect(copySpellWords('that spell', 'no', null)).toBe('Copy that spell');
  expect(delayedCastWords('an instant or sorcery spell', 'Copy that spell')).toBe(
    'When you next cast an instant or sorcery spell this turn, copy that spell',
  );
});
