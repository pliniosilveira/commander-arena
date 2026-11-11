import type { Ability, StackAbility } from '@commander-arena/engine';
import { syntheticCard } from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { triggerWording } from '../src/game/trigger-text';
import { triggerGist } from '../src/ui/decisions/ability-label';

/**
 * The words of the nodes of D-177 (the Korvold slice 2), read from the engine's SYNTHETIC fixtures (`synthetic-fetch-grants.ts`): "that creature's
 * power" for the permanent an earlier sacrifice sacrificed, and the trigger that is for spells only.
 */
const faceOf = (name: string) => {
  const face = syntheticCard(name).faces[0];
  if (face === undefined) throw new Error(`${name} has no face`);
  return face;
};

function triggerOf(
  name: string,
  n = 0,
): { gist: string; trigger: Ability & { kind: 'triggered' } } {
  const face = faceOf(name);
  const trigger = face.abilities.filter(
    (a): a is Ability & { kind: 'triggered' } => a.kind === 'triggered',
  )[n];
  if (trigger === undefined) throw new Error(`${name} has no trigger ${n}`);
  return {
    gist: triggerGist(trigger as unknown as StackAbility, { types: face.types } as never),
    trigger,
  };
}

test('a reflexive ability after a sacrifice says the sacrificed creature', () => {
  expect(triggerOf('SYNTHETIC Grim Tither').gist).toBe(
    "Sacrifice a creature. When you do, you gain X life, where X is the sacrificed creature's power",
  );
  expect(triggerOf('SYNTHETIC Pyre Warden').gist).toContain("the sacrificed creature's power");
});

test('"becomes the target of a spell" does not say "or ability"', () => {
  const { trigger } = triggerOf('SYNTHETIC Spell Magnet');
  expect(triggerWording(trigger.trigger, { self: 'this creature' })).toBe(
    'Whenever this creature becomes the target of a spell',
  );
  expect(
    triggerWording(
      { kind: 'becomesTarget', what: { kind: 'this' }, by: 'any' },
      { self: 'this creature' },
    ),
  ).toBe('Whenever this creature becomes the target of a spell or ability');
});
