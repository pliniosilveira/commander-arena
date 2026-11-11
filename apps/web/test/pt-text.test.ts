/**
 * The words of counted and defined power and toughness (D-109, D-115): the effect gist in the ability
 * chooser, the stack panel and the target prompt, the static wording and the `*` tooltip.
 */
import type {
  CountAmount,
  Effect,
  ObjectView,
  PtAmount,
  StackAbility,
} from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { countPhrase, definedByTitle, ptChangeText, ptEffectText } from '../src/game/pt-text';
import { activationLabel, triggerGist } from '../src/ui/decisions/ability-label';

const count = (filter: CountAmount['filter']): CountAmount => ({ kind: 'countOf', filter });
const ARTIFACTS = count({ types: ['artifact'], controller: 'you' });
const HAND = count({ zone: 'hand', controller: 'you' });
const LANDS = count({ types: ['land'], controller: 'you' });
const X = { kind: 'x' } as const;
const THIS = { kind: 'this' } as const;
// The gist reads only the card's first type.
const CREATURE = { types: ['creature'] } as unknown as ObjectView;

test('counts are worded as the number of things, and "for each" in the singular', () => {
  expect(countPhrase(ARTIFACTS.filter)).toBe('the number of artifacts you control');
  expect(countPhrase(HAND.filter)).toBe('the number of cards in your hand');
  expect(countPhrase({ types: ['creature'], controller: 'you', other: true })).toBe(
    'the number of other creatures you control',
  );
  expect(countPhrase({ zone: 'graveyard', types: ['creature'], controller: 'you' })).toBe(
    'the number of creature cards in your graveyard',
  );
  expect(countPhrase({ types: ['creature'], subtypes: ['Elf'], controller: 'you' })).toBe(
    'the number of Elves you control',
  );
  // A field the words cannot say is unknowable, never guessed.
  expect(countPhrase({ chosenType: true })).toBeNull();
});

test('a change of power and toughness: numbers, X, a multiple of X and counts', () => {
  expect(ptChangeText(2, 2)).toBe('+2/+2');
  expect(ptChangeText(-1, 0)).toBe('-1/+0');
  expect(ptChangeText(X, 0)).toBe('+X/+0');
  expect(
    ptChangeText({ kind: 'times', factor: -1, of: X }, { kind: 'times', factor: -1, of: X }),
  ).toBe('-X/-X');
  expect(ptChangeText({ kind: 'times', factor: 2, of: X }, 0)).toBe('+2X/+0');
  expect(ptChangeText(ARTIFACTS, ARTIFACTS)).toBe('+1/+1 for each artifact you control');
  expect(
    ptChangeText(
      { kind: 'times', factor: -2, of: ARTIFACTS },
      { kind: 'times', factor: -2, of: ARTIFACTS },
    ),
  ).toBe('-2/-2 for each artifact you control');
  expect(ptChangeText(ARTIFACTS, 0)).toBe('+1/+0 for each artifact you control');
  // Two different counts, or a count beside a number, are said one at a time.
  expect(ptChangeText(ARTIFACTS, LANDS)).toBe(
    '+1/+0 for each artifact you control and +0/+1 for each land you control',
  );
  expect(ptChangeText(2, LANDS)).toBe('+2/+0 and +0/+1 for each land you control');
});

test('an amount the words do not know says a number or what X is, never JSON or undefined', () => {
  const odd = { kind: 'somethingNew' } as unknown as PtAmount;
  const text = ptChangeText(odd, odd);
  expect(text).toBe('+X/+X, where X is a number');
  expect(text).not.toMatch(/undefined|\{|\[object/);
  expect(ptChangeText({ kind: 'powerOf', of: { kind: 'target', id: 't1' } }, 0)).toBe(
    '+X/+0, where X is its power',
  );
  // A count over a filter the words cannot say.
  expect(ptChangeText(count({ chosenType: true }), 0)).toBe('+X/+0, where X is a number');
  expect(ptChangeText({ kind: 'times', factor: 3, of: 2 }, 0)).toBe('+6/+0');
});

const modify = (power: PtAmount, toughness: PtAmount): Effect => ({
  kind: 'modifyPt',
  objects: THIS,
  power,
  toughness,
  duration: 'untilEndOfTurn',
});

test('the effect gist: "gets ... until end of turn" and "has base power and toughness ..."', () => {
  const ability: StackAbility = {
    kind: 'triggered',
    trigger: { kind: 'attacks', what: THIS },
    effect: modify(X, 0),
  } as StackAbility;
  const source = CREATURE;
  expect(triggerGist(ability, source)).toBe('This creature gets +X/+0 until end of turn');
  expect(triggerGist({ ...ability, effect: modify(ARTIFACTS, ARTIFACTS) }, source)).toBe(
    'This creature gets +1/+1 for each artifact you control until end of turn',
  );
  expect(
    triggerGist(
      {
        ...ability,
        effect: modify({ kind: 'times', factor: -1, of: X }, { kind: 'times', factor: -1, of: X }),
      },
      source,
    ),
  ).toBe('This creature gets -X/-X until end of turn');
  const set = (power: PtAmount, toughness: PtAmount): StackAbility =>
    ({
      ...ability,
      effect: { kind: 'setPt', objects: THIS, power, toughness, duration: 'untilEndOfTurn' },
    }) as StackAbility;
  expect(triggerGist(set(4, 4), source)).toBe(
    'This creature has base power and toughness 4/4 until end of turn',
  );
  expect(triggerGist(set(LANDS, LANDS), source)).toBe(
    'This creature has base power and toughness each equal to the number of lands you control until end of turn',
  );
  expect(triggerGist(set(1, LANDS), source)).toBe(
    'This creature has base power equal to 1 and base toughness equal to the number of lands you control until end of turn',
  );
});

test('an activated ability label reads the counted amount', () => {
  const label = activationLabel(CREATURE, {
    abilityIndex: 0,
    ability: {
      kind: 'activated',
      cost: [{ kind: 'mana', symbols: ['X', 'R'] }],
      effect: modify(X, 0),
    } as never,
  });
  expect(label).toBe('{X}{R}: This creature gets +X/+0 until end of turn');
});

test('ptEffectText is the words after the subject', () => {
  expect(ptEffectText(modify(2, 2) as Extract<Effect, { kind: 'modifyPt' }>)).toBe('gets +2/+2');
});

test('the tooltip of a defined power or toughness', () => {
  expect(definedByTitle(HAND, HAND)).toBe(
    'Defined by an ability: equal to the number of cards in your hand',
  );
  expect(definedByTitle(count({ types: ['creature'], controller: 'you' }), undefined)).toBe(
    'Defined by an ability: power equal to the number of creatures you control',
  );
  expect(definedByTitle(HAND, LANDS)).toBe(
    'Defined by an ability: power equal to the number of cards in your hand, toughness equal to the number of lands you control',
  );
});
