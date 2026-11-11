/** X in costs (D-103): how a cost with an {X} reads on a card, in a label and on the stack. */
import type { GameState, ObjectView } from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { describeEvent } from '../src/game/describe';
import {
  castCostChanged,
  castCostSuffix,
  costNowTitle,
  costsX,
  costText,
  withX,
  xCostTitle,
} from '../src/ui/decisions/cast-cost';
import { castLabel } from '../src/ui/decisions/flashback';

const card = (patch: Partial<ObjectView>): ObjectView =>
  ({
    id: 'o1',
    owner: 0,
    controller: 0,
    zone: 'hand',
    name: 'SYNTHETIC X Burn',
    manaCost: ['X', 'R'],
    castCost: ['X', 'R'],
    supertypes: [],
    types: ['instant'],
    subtypes: [],
    colors: ['R'],
    power: null,
    toughness: null,
    oracleText: '',
    counters: {},
    keywords: [],
    isCommander: false,
    isToken: false,
    support: 'supported',
    ...patch,
  }) as ObjectView;

test('a cost with an {X} reads "X + {1}{R}", two {X} read "2X"', () => {
  expect(costText(['X', 'R'])).toBe('X + {R}');
  expect(costText(['X', '1', 'R'])).toBe('X + {1}{R}');
  expect(costText(['X', 'X', 'U'])).toBe('2X + {U}');
  expect(costText(['X'])).toBe('X');
  expect(costText(['1', 'R'])).toBe('{1}{R}');
  expect(costText([])).toBe('{0}');
});

test('X announced as 3 turns each {X} into generic mana, added to the generic mana already there', () => {
  expect(withX(['X', 'R'], 3)).toEqual(['3', 'R']);
  expect(withX(['X', 'X', 'U'], 2)).toEqual(['4', 'U']);
  expect(withX(['X', '2', 'R'], 3)).toEqual(['5', 'R']);
  expect(withX(['X', 'R'], 0)).toEqual(['R']);
  expect(withX(['X'], 0)).toEqual([]);
  expect(withX(['G', 'U'], 4)).toEqual(['G', 'U']);
});

test('the printed X stays as printed: the cost is not "changed", and its hover says X is chosen', () => {
  const burn = card({});
  expect(costsX(burn)).toBe(true);
  expect(castCostChanged(burn)).toBe(false);
  expect(costNowTitle(burn)).toBeNull();
  expect(xCostTitle(burn)).toBe(
    'Costs X + {R}. You choose X as you cast it, up to what you can pay.',
  );
  expect(costsX(card({ manaCost: ['1', 'R'], castCost: ['1', 'R'] }))).toBe(false);
  expect(xCostTitle(card({ manaCost: ['1', 'R'], castCost: ['1', 'R'] }))).toBeNull();
});

test('a commander tax on an X spell is a change, and the cost now keeps the X', () => {
  const taxed = card({ castCost: ['X', '2', 'R'] });
  expect(castCostChanged(taxed)).toBe(true);
  expect(costNowTitle(taxed)).toContain('Costs X + {2}{R} now (printed {X}{R})');
  expect(xCostTitle(taxed)).toBeNull();
});

test('the cast option says what the cost is: "for X + {R}" for an X spell, nothing for a plain one', () => {
  const option = { kind: 'castSpell', object: 'o1' } as const;
  expect(castCostSuffix(card({}))).toBe(' for X + {R}');
  expect(castLabel(option, card({}), 'SYNTHETIC X Burn')).toBe('Cast SYNTHETIC X Burn for X + {R}');
  const plain = card({ manaCost: ['1', 'R'], castCost: ['1', 'R'] });
  expect(castLabel(option, plain, 'Bolt')).toBe('Cast Bolt');
  // A free cast has no X to pay for, and says so by its own wording.
  expect(castLabel({ ...option, alternative: 'free' }, card({}), 'SYNTHETIC Free X Burn')).toBe(
    'Cast SYNTHETIC Free X Burn without paying its mana cost',
  );
});

const state = () =>
  ({
    objects: { o1: { card: 'c1', token: null, stack: null, controller: 0 } },
    cards: { c1: { definition: 'd1' } },
    definitions: { d1: { name: 'SYNTHETIC X Burn', faces: [{ name: 'SYNTHETIC X Burn' }] } },
    lki: {},
    pending: null,
    casting: null,
  }) as unknown as GameState;

const logLine = (event: object) => describeEvent(event as never, state(), state(), 0)?.text;

test('the log says "with X = 3" for a spell and an ability, before ", kicked"', () => {
  const cast = { kind: 'spellCast', seat: 0, object: 'o1', commanderTax: 0 };
  expect(logLine({ ...cast, x: 3 })).toBe('You cast SYNTHETIC X Burn with X = 3.');
  expect(logLine({ ...cast, x: 0 })).toBe('You cast SYNTHETIC X Burn with X = 0.');
  expect(logLine({ ...cast, x: 2, kicked: true })).toBe(
    'You cast SYNTHETIC X Burn with X = 2, kicked.',
  );
  expect(logLine({ ...cast, commanderTax: 2, x: 1 })).toBe(
    'You cast SYNTHETIC X Burn (commander tax 2) with X = 1.',
  );
  expect(logLine(cast)).toBe('You cast SYNTHETIC X Burn.');
  const ability = {
    kind: 'abilityActivated',
    seat: 0,
    source: 'o1',
    abilityIndex: 0,
    stackObject: null,
  };
  expect(logLine({ ...ability, x: 4 })).toBe("You activate SYNTHETIC X Burn's ability with X = 4.");
  expect(logLine(ability)).toBe("You activate SYNTHETIC X Burn's ability.");
});
