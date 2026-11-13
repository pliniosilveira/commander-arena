// The words of the primitives of group 2b-a of the Niv-Mizzet deck program (D-331 to D-333), read from the engine's SYNTHETIC fixtures
// (`synthetic-niv-draw.ts`): "there are no cards in your library", "If you would draw a card while your library has no cards in it, skip that draw
// instead", "Whenever a source you control deals noncombat damage to an opponent", and the log line of a skipped draw.
import { type Ability, syntheticCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { expect, test } from 'vitest';
import { gameConditionWords } from '../src/game/condition-text';
import { describeEvent } from '../src/game/describe';
import { skipDrawWording } from '../src/game/draw-skip-text';
import { replacementWording } from '../src/game/static-text';
import { triggerWording } from '../src/game/trigger-text';

const abilitiesOf = (name: string): readonly Ability[] => {
  const face = syntheticCard(name).faces[0];
  if (face === undefined) throw new Error(`${name} has no face`);
  return face.abilities ?? [];
};

const replacementOf = (name: string) => {
  const ability = abilitiesOf(name).find((a) => a.kind === 'replacement');
  if (ability?.kind !== 'replacement') throw new Error(`${name} has no replacement`);
  return ability.replacement;
};

test('there are no cards in your library, and the other comparisons', () => {
  const none = { kind: 'cardsInLibrary', compare: { cmp: 'atMost', value: 0 } } as const;
  expect(gameConditionWords(none)).toBe('there are no cards in your library');
  expect(gameConditionWords({ kind: 'not', term: none })).toBe(
    "it's not true that there are no cards in your library",
  );
  expect(gameConditionWords({ kind: 'cardsInLibrary', compare: { cmp: 'atMost', value: 2 } })).toBe(
    'there are fewer than 3 cards in your library',
  );
});

test('the replacement of a draw, with and without a while', () => {
  expect(replacementWording(replacementOf('SYNTHETIC Hollow Warden'))).toBe(
    'If you would draw a card while your library has no cards in it, skip that draw instead',
  );
  expect(replacementWording(replacementOf('SYNTHETIC Draw Veto'))).toBe(
    'If you would draw a card, skip that draw instead',
  );
  expect(replacementWording(replacementOf('SYNTHETIC Thin Veto'))).toBe(
    'If you would draw a card while your library has fewer than 3 cards in it, skip that draw instead',
  );
});

test('a while the words do not cover gives nothing, never a guess', () => {
  expect(
    skipDrawWording({
      kind: 'skipDraw',
      while: { kind: 'lifeTotal', compare: { cmp: 'atMost', value: 5 } },
    }),
  ).toBeNull();
});

test('whenever a source you control deals noncombat damage to an opponent', () => {
  const ctx = { self: 'Spark Scribe' };
  expect(triggerWording({ kind: 'noncombatDamageDealt', by: 'you', to: 'opponent' }, ctx)).toBe(
    'Whenever a source you control deals noncombat damage to an opponent',
  );
  expect(triggerWording({ kind: 'noncombatDamageDealt', by: 'any', to: 'player' }, ctx)).toBe(
    'Whenever a source deals noncombat damage to a player',
  );
});

test('the log line of a skipped draw names the permanent and whose draw it was', () => {
  const g = scenario().seat(0).battlefield('SYNTHETIC Hollow Warden').seat(1).build();
  const source = g.state.battlefield[0];
  if (source === undefined) throw new Error('no permanent');
  const line = (seat: 0 | 1, viewer: 0 | 1) =>
    describeEvent({ kind: 'drawSkipped', seat, source }, g.state, g.state, viewer)?.text;
  expect(line(0, 0)).toBe('SYNTHETIC Hollow Warden skips your draw.');
  expect(line(0, 1)).toBe("SYNTHETIC Hollow Warden skips opponent's draw.");
});
