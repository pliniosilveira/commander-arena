/**
 * The words of group 1 of the Gisa deck (D-472 to D-476) as pure models: the keyword chips of Afflict N, the grants of swampwalk and afflict by a static ability and by an effect, the
 * effect that turns a land into a Swamp, and the condition of the combat damage by a creature type. Read from the engine's SYNTHETIC cards, so a wording that drifts from the AST
 * fails here. No DOM.
 */
import { type Ability, syntheticCard } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { gameConditionWords } from '../src/game/condition-text';
import { lordWordings } from '../src/game/static-text';
import { grantedKeywordWords } from '../src/game/trigger-text';
import { chipsOf } from '../src/ui/board/keywords';
import { activationLabel } from '../src/ui/decisions/ability-label';

const abilitiesOf = (name: string): readonly Ability[] => {
  const face = syntheticCard(name).faces[0];
  if (face === undefined) throw new Error(`no face for ${name}`);
  return face.abilities;
};

describe('a keyword that is given, with its land type or its number', () => {
  test('swampwalk, nonbasic landwalk and afflict 3; the others by their kind', () => {
    expect(grantedKeywordWords({ kind: 'landwalk', landType: 'Swamp' })).toBe('swampwalk');
    expect(grantedKeywordWords({ kind: 'landwalk', landType: 'Island' })).toBe('islandwalk');
    expect(grantedKeywordWords({ kind: 'landwalk', landType: 'nonbasic' })).toBe(
      'nonbasic landwalk',
    );
    expect(grantedKeywordWords({ kind: 'afflict', count: 3 })).toBe('afflict 3');
    expect(grantedKeywordWords({ kind: 'firstStrike' })).toBe('first strike');
  });

  test('the static abilities of the Monarch and of the Master say what they give', () => {
    expect(
      lordWordings(abilitiesOf('SYNTHETIC Afflict Monarch'), {
        noun: 'creature',
        subtypes: ['Zombie', 'Noble'],
      }),
    ).toEqual(['Other Zombie permanents you control have afflict 3.']);
    expect(
      lordWordings(abilitiesOf('SYNTHETIC Walk Master'), {
        noun: 'creature',
        subtypes: ['Zombie'],
      }),
    ).toEqual(['Other Zombies have swampwalk.']);
  });
});

describe('the activations of the Scout', () => {
  const label = (index: number) => {
    const ability = abilitiesOf('SYNTHETIC Trail Scout')[index];
    if (ability?.kind !== 'activated') throw new Error('not an activated ability');
    return activationLabel(undefined, { abilityIndex: index, ability });
  };

  test('a land becomes a Swamp, and the cost taps an untapped Zombie', () => {
    expect(label(0)).toContain('becomes a Swamp until end of turn');
    expect(label(0).toLowerCase()).toContain('tap');
  });

  test('a creature gains swampwalk', () => {
    expect(label(1)).toContain('gains swampwalk until end of turn');
  });
});

describe('the condition of the combat damage by a kind of creature (D-475)', () => {
  test('a Zombie, a creature you control, an Elf an opponent controls', () => {
    expect(gameConditionWords({ kind: 'combatDamagedBy', filter: { subtypes: ['Zombie'] } })).toBe(
      'a player was dealt combat damage by a Zombie this turn',
    );
    expect(
      gameConditionWords({
        kind: 'combatDamagedBy',
        filter: { types: ['creature'], controller: 'you' },
      }),
    ).toBe('a player was dealt combat damage by a creature you control this turn');
    expect(
      gameConditionWords({
        kind: 'combatDamagedBy',
        filter: { subtypes: ['Elf'], controller: 'opponent' },
      }),
    ).toBe('a player was dealt combat damage by an Elf an opponent controls this turn');
  });

  test('negated', () => {
    expect(
      gameConditionWords({
        kind: 'not',
        term: { kind: 'combatDamagedBy', filter: { subtypes: ['Zombie'] } },
      }),
    ).toBe('no player was dealt combat damage by any Zombie this turn');
  });
});

describe('the chips of Afflict', () => {
  test('one chip for each instance in the text, "Afl 3" and "Afflict 3"; a granted one with no number in the text is the bare name', () => {
    const chips = chipsOf({
      keywords: ['afflict'],
      oracleText: 'Afflict 3\nAfflict 2',
    });
    expect(chips.map((c) => [c.short, c.full])).toEqual([
      ['Afl 3', 'Afflict 3'],
      ['Afl 2', 'Afflict 2'],
    ]);
    expect(chipsOf({ keywords: ['afflict'], oracleText: 'Flying' }).map((c) => c.full)).toEqual([
      'Afflict',
    ]);
  });
});
