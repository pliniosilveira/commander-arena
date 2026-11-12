// The words of the four primitives of the Niv-Mizzet deck program (D-318 to D-321), read from the engine's SYNTHETIC fixtures
// (`synthetic-niv-primitives.ts`): "two mana of different colors", "Untap this permanent during each other player's untap step",
// "the number of cards in your hand minus 4".
import { type Ability, type ManaAbility, syntheticCard } from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { amountPhrase } from '../src/game/amount-text';
import { manaRestrictionWording } from '../src/game/angels-text';
import { gameConditionWords } from '../src/game/condition-text';
import { anyCombinationWords } from '../src/game/dragons-text';
import { playRuleWordings } from '../src/game/play-rule-text';

const abilitiesOf = (name: string): readonly Ability[] => {
  const face = syntheticCard(name).faces[0];
  if (face === undefined) throw new Error(`${name} has no face`);
  return face.abilities ?? [];
};

test('two mana of different colors, and the plain combination keeps its words', () => {
  expect(anyCombinationWords(2, true)).toBe('two mana of different colors');
  expect(anyCombinationWords(3, true)).toBe('three mana of different colors');
  expect(anyCombinationWords(2)).toBe('two mana in any combination of colors');
  const [mana] = abilitiesOf('SYNTHETIC Prism Vessel');
  if (mana?.kind !== 'mana') throw new Error('expected a mana ability');
  expect(manaRestrictionWording(mana as ManaAbility)).toBe('{T}: Add two mana of different colors');
});

test('untap this permanent during each other player untap step', () => {
  expect(playRuleWordings(abilitiesOf('SYNTHETIC Dew Flask'))).toEqual([
    "Untap this permanent during each other player's untap step.",
  ]);
});

test('you have cast three or more spells this turn', () => {
  const condition = { kind: 'spellsCastThisTurn', atLeast: 3 } as const;
  expect(gameConditionWords(condition)).toBe('you have cast 3 or more spells this turn');
  expect(gameConditionWords({ kind: 'not', term: condition })).toBe(
    "you haven't cast 3 or more spells this turn",
  );
});

test('the number of cards in your hand minus 4', () => {
  const hand = { kind: 'countOf', filter: { zone: 'hand', controller: 'you' } } as const;
  expect(amountPhrase({ kind: 'minus', of: hand, by: 4 })).toBe(
    'the number of cards in your hand minus 4',
  );
});
