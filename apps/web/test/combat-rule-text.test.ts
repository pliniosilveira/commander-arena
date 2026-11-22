/** The web wording of the combat rule changes of the Abzan Armor deck (pure models, no DOM): "can attack as though it didn't have defender" and "assigns combat damage equal to its toughness". */
import { expect, test } from 'vitest';
import { lordWording } from '../src/game/static-text';
import { restrictionName, restrictionShort } from '../src/ui/board/keywords';

const CREATURES_YOU_CONTROL = {
  kind: 'filter' as const,
  filter: { types: ['creature' as const], controller: 'you' as const },
};

test('a group says what it can attack as and what it assigns, in the plural', () => {
  expect(
    lordWording(
      {
        kind: 'restriction',
        subject: CREATURES_YOU_CONTROL,
        restriction: 'canAttackAsThoughNoDefender',
      },
      { noun: 'creature' },
    ),
  ).toBe("Creatures you control can attack as though they didn't have defender");
  expect(
    lordWording(
      {
        kind: 'restriction',
        subject: CREATURES_YOU_CONTROL,
        restriction: 'assignsDamageByToughness',
      },
      { noun: 'creature' },
    ),
  ).toBe(
    'Creatures you control assign combat damage equal to their toughness rather than their power',
  );
});

test('the permanent itself says it in the singular', () => {
  expect(
    lordWording(
      {
        kind: 'restriction',
        subject: { kind: 'this' },
        restriction: 'canAttackAsThoughNoDefenderVsLastTurnAttackers',
      },
      { noun: 'creature' },
    ),
  ).toBe(
    "This creature can attack players who attacked you during their last turn as though it didn't have defender",
  );
});

test('the board names the restrictions', () => {
  expect(restrictionShort('assignsDamageByToughness')).toBe('DmgTgh');
  expect(restrictionName('canAttackAsThoughNoDefender')).toBe(
    "Can attack as though it didn't have defender",
  );
});
