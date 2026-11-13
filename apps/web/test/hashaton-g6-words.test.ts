// The words of the primitives of group 6 of the Hashaton deck program (D-376, D-377, provisional), read from the engine's SYNTHETIC fixtures
// (`synthetic-hashaton-g6.ts`): "As this creature enters, choose a card type." (the question and the chip on the permanent), "You have protection from the chosen card type"
// and "Creatures you control have protection from the chosen card type".
import { type Ability, CARD_TYPES, syntheticCard } from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { angelsStaticWording } from '../src/game/angels-text';
import { chosenLabel, optionText, purposeNoun } from '../src/game/chosen';
import { conditionalWording } from '../src/game/static-text';
import {
  isCardTypeChoice,
  namedOptionPrompt,
  namedOptionRows,
} from '../src/ui/decisions/option-names';
import { optionPrompt } from '../src/ui/decisions/option-picker';

const staticsOf = (name: string): Extract<Ability, { kind: 'static' }>[] =>
  (syntheticCard(name).faces[0]?.abilities ?? []).filter(
    (a): a is Extract<Ability, { kind: 'static' }> => a.kind === 'static',
  );

const asked = {
  purpose: 'cardType',
  options: CARD_TYPES,
  sourceName: 'SYNTHETIC Warding Seraph',
  sourceOracleText: 'As this creature enters, choose a card type.',
} as const;

test('the question is its own kind of choice, asked with the card types as buttons', () => {
  expect(isCardTypeChoice(asked)).toBe(true);
  expect(isCardTypeChoice({ purpose: 'creatureType', options: [] })).toBe(false);
  expect(namedOptionPrompt({ ...asked })).toBe(
    'As SYNTHETIC Warding Seraph enters, choose a card type.',
  );
  expect(optionPrompt(asked)).toBe('As SYNTHETIC Warding Seraph enters, choose a card type.');
  expect(namedOptionRows(asked).map((r) => r.label)).toEqual([
    'Artifact',
    'Battle',
    'Creature',
    'Enchantment',
    'Instant',
    'Kindred',
    'Land',
    'Planeswalker',
    'Sorcery',
  ]);
  expect(namedOptionRows(asked).map((r) => r.option)).toEqual([...CARD_TYPES]);
});

test('the noun and the log line of the answer', () => {
  expect(purposeNoun('cardType')).toBe('card type');
  expect(optionText('cardType', 'artifact')).toBe('artifact');
});

test('the chip on the permanent says the card type it chose', () => {
  expect(chosenLabel({ chosen: { cardType: 'artifact' } })).toEqual({
    short: 'artifact',
    title: 'Chosen card type: artifact',
    heading: 'Chosen card type',
  });
});

test('you and creatures you control have protection from the chosen card type', () => {
  const [player, creatures] = staticsOf('SYNTHETIC Warding Seraph');
  if (player === undefined || creatures === undefined) throw new Error('missing statics');
  expect(angelsStaticWording(player.static, 'creature')).toBe(
    'You have protection from the chosen card type',
  );
  expect(
    angelsStaticWording(
      { kind: 'playerProtection', from: 'cardType', types: ['artifact'] },
      'creature',
    ),
  ).toBe('You have protection from artifact');
  expect(conditionalWording({ ...creatures }, { noun: 'creature' })).toBe(
    'Creatures you control have protection from the chosen card type',
  );
});
