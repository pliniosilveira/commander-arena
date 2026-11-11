import { type Ability, syntheticCard } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { requireAttackText } from '../src/game/korvold-text';
import { lordWordings } from '../src/game/static-text';
import { triggerWording } from '../src/game/trigger-text';

/**
 * The words of the nodes of D-179 (the Korvold slice 4), read from the engine's SYNTHETIC fixtures (`synthetic-korvold-triggers.ts`): the trigger
 * of a card that was cycled, the count of colors, the replacement that makes lands enter untapped, the player-level restriction on casting with its
 * "attached" condition, and the requirement on a group of creatures to attack.
 */
const faceOf = (name: string) => {
  const found = syntheticCard(name).faces[0];
  if (found === undefined) throw new Error(`${name} has no face`);
  return found;
};
const abilitiesOf = (name: string): readonly Ability[] => faceOf(name).abilities;
const notes = (name: string) =>
  lordWordings(abilitiesOf(name), {
    noun: faceOf(name).types.includes('creature') ? 'creature' : (faceOf(name).types[0] ?? ''),
    subtypes: faceOf(name).subtypes,
  });
const triggered = (name: string, at = 0) => {
  const found = abilitiesOf(name).filter((a) => a.kind === 'triggered')[at];
  if (found?.kind !== 'triggered') throw new Error(`no triggered ability on ${name}`);
  return found;
};

describe('the trigger and the effects', () => {
  test('"When you cycle this card"', () => {
    const { trigger } = triggered('SYNTHETIC Treasure Cycler');
    expect(triggerWording(trigger, { self: 'this creature' })).toBe('When you cycle this card');
  });

  test('a requirement on a group of creatures says both halves', () => {
    const [ability] = abilitiesOf('SYNTHETIC Herding Horror').filter((a) => a.kind === 'triggered');
    if (ability?.kind !== 'triggered' || ability.effect.kind !== 'requireAttack') {
      throw new Error('expected the requirement');
    }
    expect(requireAttackText(ability.effect)).toBe(
      'Until your next turn, creatures your opponents control attack each combat if able and attack a player other than you if able',
    );
    const { awayFromYou: _away, ...single } = ability.effect;
    expect(requireAttackText(single)).toBe(
      'Until your next turn, creatures your opponents control attack each combat if able',
    );
    expect(requireAttackText({ ...ability.effect, duration: 'untilEndOfTurn' })).toBe(
      'Creatures your opponents control attack this turn if able',
    );
  });

  test('a group the words cannot say gives no words, never a guess', () => {
    const [ability] = abilitiesOf('SYNTHETIC Herding Horror').filter((a) => a.kind === 'triggered');
    if (ability?.kind !== 'triggered' || ability.effect.kind !== 'requireAttack') {
      throw new Error('expected the requirement');
    }
    expect(
      requireAttackText({ ...ability.effect, creatures: { owner: { kind: 'you' } } }),
    ).toBeNull();
  });
});

describe('the statics', () => {
  test('"for each color among permanents you control"', () => {
    expect(notes('SYNTHETIC Prism Blade')).toEqual([
      'Equipped creature gets +1/+1 for each color among permanents you control.',
    ]);
  });

  test('lands enter untapped', () => {
    expect(notes('SYNTHETIC Daylight Hall')).toEqual(['Lands you control enter untapped.']);
  });

  test("opponents can't cast spells during your turn, as long as it is attached to a creature", () => {
    expect(notes('SYNTHETIC Tide Seal')).toEqual([
      "Your opponents can't cast spells during your turn as long as this permanent is attached to a creature.",
    ]);
  });
});
