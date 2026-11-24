// Validation of Sunburst and of the effect that gives it to a spell (CR 702.44a, 702.44d, 603.7): the keyword has no parameter, the effect names the spell of a cast trigger (or of a delayed
// cast trigger) and only Sunburst, and an enters-with count of "the colors of mana spent" names no other spell. The cards are built here; they are SYNTHETIC.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import type { Ability, CardDefinition, Effect } from '../src/index';
import { isFeatureSupported, validateCard } from '../src/index';

const messages = (card: CardDefinition): string[] => validateCard(card).map((i) => i.message);

const withAbility = (
  ability: Ability,
  types: CardDefinition['faces'][number]['types'] = ['artifact'],
) =>
  singleFace({
    name: 'SYNTHETIC Test Card',
    manaCost: ['2'],
    types,
    colors: [],
    colorIdentity: [],
    oracleText: 'text',
    abilities: [ability],
  });

const gains = (spell: unknown, keyword: unknown = { kind: 'sunburst' }): Effect =>
  ({ kind: 'spellGainsKeyword', spell, keyword }) as unknown as Effect;

const castTrigger = (effect: Effect): Ability => ({
  kind: 'triggered',
  trigger: {
    kind: 'castSpell',
    filter: { stackKind: 'spell', types: ['artifact', 'creature'] },
    by: 'you',
  },
  effect,
});

describe('the features are listed', () => {
  test.each(['keyword:sunburst', 'effect:spellGainsKeyword', 'amount:manaSpent'] as const)(
    '%s',
    (f) => {
      expect(isFeatureSupported(f)).toBe(true);
    },
  );
});

describe('the keyword', () => {
  test('Sunburst is a keyword with no parameter', () => {
    expect(messages(withAbility({ kind: 'keyword', keyword: { kind: 'sunburst' } }))).toEqual([]);
  });
});

describe('"it gains sunburst" in a cast trigger', () => {
  test('the spell of the trigger gains it', () => {
    expect(messages(withAbility(castTrigger(gains({ kind: 'triggerSubject' }))))).toEqual([]);
  });

  test('only Sunburst can be gained by a spell', () => {
    expect(
      messages(withAbility(castTrigger(gains({ kind: 'triggerSubject' }, { kind: 'flying' })))),
    ).toContain('only sunburst can be gained by a spell');
  });

  test('the spell must be the spell of the trigger, not the source or a target', () => {
    expect(messages(withAbility(castTrigger(gains({ kind: 'self' }))))).toContain(
      'spellGainsKeyword names the spell that was cast (triggerSubject)',
    );
  });

  test('a trigger that is not about a spell has no spell to name', () => {
    const ability: Ability = {
      kind: 'triggered',
      trigger: { kind: 'enters', filter: { types: ['creature'] } },
      effect: gains({ kind: 'triggerSubject' }),
    } as unknown as Ability;
    expect(messages(withAbility(ability)).length).toBeGreaterThan(0);
  });
});

describe('a delayed cast trigger that gives sunburst', () => {
  const delayed = (effect: Effect): Ability => ({
    kind: 'activated',
    cost: [{ kind: 'tap' }],
    effect: {
      kind: 'delayedCast',
      filter: { stackKind: 'spell', types: ['artifact'] },
      effect,
    },
  });

  test('its body may be the gain', () => {
    expect(messages(withAbility(delayed(gains({ kind: 'triggerSubject' }))))).toEqual([]);
  });
});

describe('"enters with a +1/+1 counter on it for each color of mana spent to cast it"', () => {
  const enters = (count: unknown): Ability =>
    ({
      kind: 'replacement',
      replacement: { kind: 'entersWithCounters', counter: '+1/+1', count },
    }) as unknown as Ability;

  test('the colors of the mana spent on the permanent itself', () => {
    expect(messages(withAbility(enters({ kind: 'manaSpent', colors: true })))).toEqual([]);
  });

  test('the mana spent on another spell is not the permanent that enters', () => {
    expect(
      messages(
        withAbility(enters({ kind: 'manaSpent', colors: true, of: { kind: 'triggerSubject' } })),
      ),
    ).toContain('an enters-with count of the mana spent is the spell the permanent came from');
  });
});
