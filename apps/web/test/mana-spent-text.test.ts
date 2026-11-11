import type { Ability, CardDefinition, StackAbility } from '@commander-arena/engine';
import { syntheticCard } from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { lordWordings } from '../src/game/static-text';
import { triggerGist } from '../src/ui/decisions/ability-label';

/**
 * The words of D-183 (the Korvold slice 5): the amount of mana spent to cast a spell, the cast trigger of the spell itself and the count of an
 * "enters with a counter" replacement, read from the engine's SYNTHETIC fixtures (`synthetic-mana-spent.ts`).
 */
const faceOf = (card: CardDefinition) => {
  const face = card.faces[0];
  if (face === undefined) throw new Error(`${card.name} has no face`);
  return face;
};

const triggerOf = (name: string): string => {
  const face = faceOf(syntheticCard(name));
  const trigger = face.abilities.find(
    (a): a is Ability & { kind: 'triggered' } => a.kind === 'triggered',
  );
  if (trigger === undefined) throw new Error(`${name} has no trigger`);
  return triggerGist(trigger as unknown as StackAbility, { types: face.types } as never);
};

test('"X" is the amount of mana spent to cast the spell, and the token has its own name', () => {
  expect(triggerOf('SYNTHETIC Kobold Dragon')).toBe(
    'Create X 0/1 red Kobold creature tokens named Kobolds of Kher Keep, where X is the amount of mana spent to cast it',
  );
});

test('the replacement says the mana, in all or from a card type of its source', () => {
  const words = (name: string) =>
    lordWordings(faceOf(syntheticCard(name)).abilities, { noun: 'artifact', subtypes: [] }).join(
      ' | ',
    );
  expect(words('SYNTHETIC Coin Press')).toContain(
    'Each creature you control enters with an additional +1/+1 counter on it for each mana from an artifact source spent to cast it',
  );
  expect(words('SYNTHETIC Mana Press')).toContain(
    'Each creature you control enters with an additional +1/+1 counter on it for each mana spent to cast it',
  );
});
