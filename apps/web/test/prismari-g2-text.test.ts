/**
 * The words of group 2 of the Prismari deck (D-633 and later) as pure models: the trigger and the activated abilities that read the spell that was cast (its mana value, the mana spent
 * on it, the greatest mana value cast this turn), the token of an X size, the copy of an exiled card that is cast, the animated land with its keyword on its controller's turn, creatures
 * named like the source, the creature that can block only creatures with flying, and the activated ability that discards the card for a Treasure (which is not Cycling). Read from the
 * engine's SYNTHETIC cards, so a wording that drifts from the AST fails here. No DOM.
 */
import {
  type Ability,
  type CardDefinition,
  type StackAbility,
  syntheticCard,
} from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { amountPhrase } from '../src/game/amount-text';
import { gameConditionWords } from '../src/game/condition-text';
import { lordWordings } from '../src/game/static-text';
import { activationLabel, isCycling, triggerGist } from '../src/ui/decisions/ability-label';

const faceOf = (card: CardDefinition) => {
  const face = card.faces[0];
  if (face === undefined) throw new Error(`${card.name} has no face`);
  return face;
};

const abilitiesOf = <K extends Ability['kind']>(name: string, kind: K) =>
  faceOf(syntheticCard(name)).abilities.filter(
    (a): a is Extract<Ability, { kind: K }> => a.kind === kind,
  );

const gist = (name: string, n = 0): string => {
  const trigger = abilitiesOf(name, 'triggered')[n];
  if (trigger === undefined) throw new Error(`${name} has no trigger ${n}`);
  return triggerGist(
    trigger as unknown as StackAbility,
    {
      types: faceOf(syntheticCard(name)).types,
    } as never,
  );
};

const label = (name: string, n = 0): string => {
  const face = faceOf(syntheticCard(name));
  const entry = face.abilities
    .map((ability, abilityIndex) => ({ abilityIndex, ability }))
    .filter(
      (e): e is { abilityIndex: number; ability: Extract<Ability, { kind: 'activated' }> } =>
        e.ability.kind === 'activated',
    )[n];
  if (entry === undefined) throw new Error(`${name} has no activated ability ${n}`);
  return activationLabel({ types: face.types } as never, entry);
};

test('Prismari Pianist: three tokens instead of one, said about "that spell" (CR 202.3)', () => {
  const words = gist('SYNTHETIC Piano Elemental');
  expect(words).toContain("If that spell's mana value is 5 or greater, create 3 1/1");
  expect(words).toContain('Otherwise, create a 1/1');
  expect(words).not.toContain('permanent');
});

test('Rootha: an X/X token, X the greatest mana value among the spells cast this turn (CR 601.2i)', () => {
  const words = gist('SYNTHETIC Moment Master');
  expect(words).toContain(
    'Create an X/X blue and red Elemental creature token with flying and haste',
  );
  expect(words).toContain(
    "where X is the greatest mana value among instant and sorcery spells you've cast this turn",
  );
});

test('Renegade Bull: +X/+0 where X is the mana value of that spell, and the copy of the exiled card (CR 707.12)', () => {
  expect(gist('SYNTHETIC Charging Ox', 0)).toBe(
    "This creature gets +X/+0 until end of turn, where X is that spell's mana value",
  );
  expect(gist('SYNTHETIC Charging Ox', 1)).toBe(
    'Exile up to one target instant or sorcery card from your graveyard. Copy the exiled card. You may cast the copy without paying its mana cost',
  );
});

test('Manaform Hellkite: an X/X token, X the mana spent to cast that spell, exiled at the end step (CR 601.2h)', () => {
  const words = gist('SYNTHETIC Manaform Drake');
  expect(words).toContain('Create an X/X red Dragon Illusion creature token with flying and haste');
  expect(words).toContain('exile it');
  expect(words).toContain('where X is the amount of mana spent to cast that spell');
});

test('Leitmotif Composer: creatures named like it can’t be blocked this turn (CR 201.2)', () => {
  expect(label('SYNTHETIC Name Composer')).toBe(
    "{2}{U}: All creatures named SYNTHETIC Name Composer can't be blocked this turn",
  );
});

test('Restless Spire: the keyword works during its controller’s turn only (CR 604.1)', () => {
  const words = label('SYNTHETIC Spire Land');
  expect(words).toContain('gains first strike during your turn until end of turn');
  expect(words).toContain('base power and toughness 2/1');
  expect(words).toContain('Elemental creature');
});

test('Magma Opus: "Discard this card: Create a Treasure token" is not Cycling', () => {
  const [ability] = abilitiesOf('SYNTHETIC Opus Burst', 'activated');
  if (ability === undefined) throw new Error('no ability');
  expect(isCycling(ability)).toBe(false);
  expect(label('SYNTHETIC Opus Burst')).toBe(
    '{U/R}{U/R}, Discard this card: Create a Treasure token',
  );
});

test('Brazen Borrower: the restriction on what it can block (CR 509.1b)', () => {
  const lines = lordWordings(faceOf(syntheticCard('SYNTHETIC Skittish Borrower')).abilities, {
    noun: 'creature',
  });
  expect(lines).toEqual(['This creature can block only creatures with flying.']);
});

test('the amounts and the condition on their own (CR 202.3, 601.2h, 601.2i)', () => {
  expect(amountPhrase({ kind: 'greatestManaValueCast' })).toBe(
    "the greatest mana value among spells you've cast this turn",
  );
  expect(amountPhrase({ kind: 'manaSpent', of: { kind: 'triggerSubject' } })).toBe(
    'the amount of mana spent to cast that spell',
  );
  expect(
    amountPhrase({ kind: 'manaValueOf', of: { kind: 'triggerSubject' } }, { spell: true }),
  ).toBe("that spell's mana value");
  expect(
    gameConditionWords(
      {
        kind: 'objectMatches',
        of: { kind: 'triggerSubject' },
        filter: { manaValue: { cmp: 'atMost', value: 2 } },
      },
      { spell: true },
    ),
  ).toBe("that spell's mana value is 2 or less");
});
