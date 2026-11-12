// The words of group 2b-b of the Niv-Mizzet deck (D-327 to D-330), read from the engine's SYNTHETIC fixtures (`synthetic-niv-group-2b-b.ts`):
// "Mill a card. You may play that card this turn.", "Spend this mana only to cast instant and sorcery spells." and the mana that copies the spell it is
// spent on.
import {
  type Ability,
  type ManaAbility,
  type StackAbility,
  syntheticCard,
} from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { manaRestrictionWording, riderWords } from '../src/game/angels-text';
import { spentRiderText } from '../src/game/dragons-text';
import { triggerGist } from '../src/ui/decisions/ability-label';

const faceOf = (name: string) => {
  const face = syntheticCard(name).faces[0];
  if (face === undefined) throw new Error(`${name} has no face`);
  return face;
};

const abilitiesOf = (name: string): readonly Ability[] => faceOf(name).abilities ?? [];

const manaOf = (name: string, at: number): ManaAbility => {
  const ability = abilitiesOf(name)[at];
  if (ability?.kind !== 'mana') throw new Error(`${name} has no mana ability at ${at}`);
  return ability;
};

/** The gist of a spell's effect, as the stack words an ability. */
function spellGist(name: string): string {
  const spell = faceOf(name).spell;
  if (spell === null || spell === undefined || spell.effect === undefined) {
    throw new Error(`${name} has no effect`);
  }
  const ability = { kind: 'activated', cost: [], effect: spell.effect } as unknown as StackAbility;
  return triggerGist(ability, { types: faceOf(name).types } as never);
}

test('mill a card, you may play that card this turn; mill two cards, those cards', () => {
  expect(spellGist('SYNTHETIC Mill Rite')).toBe(
    'You mill a card. You may play that card this turn',
  );
  expect(spellGist('SYNTHETIC Double Mill Rite')).toBe(
    'You mill 2 cards. You may play those cards this turn',
  );
});

test('mana that can be spent only on instant and sorcery spells', () => {
  expect(manaRestrictionWording(manaOf('SYNTHETIC Spell Tablet', 2))).toBe(
    '{T}: Add {R}{R}. Spend this mana only to cast an instant or sorcery spell',
  );
});

test('mana that copies the spell it is spent on, with and without new targets', () => {
  expect(manaRestrictionWording(manaOf('SYNTHETIC Mirror Goggles', 0))).toBe(
    '{T}: Add {R}. When that mana is spent to cast a red instant or sorcery spell, copy that spell and you may choose new targets for the copy',
  );
  expect(manaRestrictionWording(manaOf('SYNTHETIC Exact Goggles', 0))).toBe(
    '{T}: Add {U}. When that mana is spent to cast an instant spell, copy that spell',
  );
});

test('the mana in a pool says what it does when it is spent', () => {
  expect(
    riderWords({
      kind: 'copy',
      source: 'o1' as never,
      types: ['instant', 'sorcery'],
      colors: ['R'],
      newTargets: 'may',
    }),
  ).toBe(
    'When spent to cast a red instant or sorcery spell, copy that spell and you may choose new targets for the copy',
  );
  expect(
    riderWords({ kind: 'copy', source: 'o1' as never, types: ['instant'], newTargets: 'no' }),
  ).toBe('When spent to cast an instant spell, copy that spell');
});

test('a copy rider the words do not cover is not worded', () => {
  expect(
    spentRiderText({
      spells: { subtypes: ['Dragon'], types: ['creature'] },
      grants: { copySpell: 'may' },
    }),
  ).toBeNull();
  expect(
    spentRiderText({
      spells: { colors: ['R', 'U'], types: ['instant'] },
      grants: { copySpell: 'no' },
    }),
  ).toBeNull();
});
