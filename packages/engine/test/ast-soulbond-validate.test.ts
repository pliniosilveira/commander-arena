// The validator of the soulbond shapes (D-984): the keyword, the engine's own effect `pair` and condition `soulbondReady`, the public condition `paired` and the
// static subject `pair`. A card is supported or unsupported, never partly: what the engine does not run is refused, not accepted and ignored.
import { describe, expect, test } from 'vitest';
import type { Ability } from '../src/ast/types';
import { singleFace } from '../src/cards/fixtures/helpers';
import { isFeatureSupported, syntheticCard, validateCard } from '../src/index';

const SQUIRE = 'SYNTHETIC Soulbound Squire';
const SERAPH = 'SYNTHETIC Soulbound Seraph';

const withAbilities = (
  types: ('creature' | 'artifact' | 'instant' | 'enchantment')[],
  abilities: Ability[],
) =>
  singleFace({
    name: 'SYNTHETIC Validation Card',
    manaCost: ['1'],
    types,
    colors: [],
    colorIdentity: [],
    ...(types.includes('creature') ? { power: 1, toughness: 1 } : {}),
    oracleText: 'SYNTHETIC validation card',
    abilities,
  });
const messages = (card: ReturnType<typeof singleFace>) =>
  validateCard(card)
    .map((i) => i.message)
    .join('\n');
const keyword = (kind: string): Ability =>
  ({ kind: 'keyword', keyword: { kind } }) as unknown as Ability;
const staticAbility = (staticEffect: unknown, condition?: unknown): Ability =>
  ({
    kind: 'static',
    static: staticEffect,
    ...(condition === undefined ? {} : { condition }),
  }) as unknown as Ability;
const PAIR = { kind: 'pair' };
const PAIRED = { kind: 'paired' };

describe('the keyword', () => {
  test('is valid on a creature and listed as supported', () => {
    expect(validateCard(syntheticCard(SQUIRE))).toEqual([]);
    expect(validateCard(syntheticCard(SERAPH))).toEqual([]);
    expect(isFeatureSupported('keyword:soulbond')).toBe(true);
    expect(isFeatureSupported('condition:paired')).toBe(true);
    expect(isFeatureSupported('staticSubject:pair')).toBe(true);
    expect(isFeatureSupported('effect:pair')).toBe(true);
  });

  test('is refused on a face that is not a creature (CR 702.95a): it would be accepted and do nothing', () => {
    for (const types of [['artifact'], ['instant'], ['enchantment']] as const) {
      expect(messages(withAbilities([...types], [keyword('soulbond')]))).toContain(
        'not a creature',
      );
    }
    expect(validateCard(withAbilities(['creature'], [keyword('soulbond')]))).toEqual([]);
  });

  test('is refused on a token definition that is not a creature, accepted on a creature token (CR 702.95a)', () => {
    const makes = (types: string[]): Ability =>
      ({
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: {
          kind: 'createToken',
          count: 1,
          token: {
            kind: 'custom',
            definition: {
              name: 'Soul Token',
              types,
              subtypes: [],
              colors: [],
              power: types.includes('creature') ? 1 : null,
              toughness: types.includes('creature') ? 1 : null,
              abilities: [keyword('soulbond')],
            },
          },
        },
      }) as unknown as Ability;
    expect(messages(withAbilities(['creature'], [makes(['artifact'])]))).toContain(
      'not a creature',
    );
    expect(validateCard(withAbilities(['creature'], [makes(['creature'])]))).toEqual([]);
  });

  test('can not be granted: a static ability that grants it is refused, and so is a granted ability that is the keyword', () => {
    const grant = staticAbility({
      kind: 'grantKeyword',
      subject: { kind: 'filter', filter: { types: ['creature'], controller: 'you' } },
      keyword: { kind: 'soulbond' },
    });
    expect(validateCard(withAbilities(['creature'], [grant])).length).toBeGreaterThan(0);
    const grantAbility = staticAbility({
      kind: 'grantAbility',
      subject: { kind: 'this' },
      ability: keyword('soulbond'),
    });
    expect(validateCard(withAbilities(['creature'], [grantAbility])).length).toBeGreaterThan(0);
    const effect = {
      kind: 'grantKeyword',
      objects: { kind: 'this' },
      keyword: { kind: 'soulbond' },
      duration: 'untilEndOfTurn',
    };
    const gives: Ability = {
      kind: 'triggered',
      trigger: { kind: 'attacks', what: { kind: 'this' } },
      effect,
    } as unknown as Ability;
    expect(validateCard(withAbilities(['creature'], [gives])).length).toBeGreaterThan(0);
  });
});

describe("the engine's own effect and condition are refused in card data", () => {
  test('the effect pair', () => {
    const ability: Ability = {
      kind: 'triggered',
      trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
      effect: { kind: 'pair', partner: 'choose' },
    };
    expect(messages(withAbilities(['creature'], [ability]))).toContain('soulbond');
  });

  test('the condition soulbondReady, as an intervening "if" and in a static ability', () => {
    const ability: Ability = {
      kind: 'triggered',
      trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
      interveningIf: { kind: 'soulbondReady', with: 'another' },
      effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
    };
    expect(messages(withAbilities(['creature'], [ability]))).toContain('soulbondReady');
    const grant = staticAbility(
      { kind: 'grantKeyword', subject: { kind: 'this' }, keyword: { kind: 'flying' } },
      { kind: 'soulbondReady', with: 'another' },
    );
    expect(messages(withAbilities(['creature'], [grant]))).toContain('soulbondReady');
  });
});

describe('the condition paired', () => {
  const flying = { kind: 'grantKeyword', subject: { kind: 'this' }, keyword: { kind: 'flying' } };

  test('is valid on a static ability that derive reads, and in its negation', () => {
    expect(validateCard(withAbilities(['creature'], [staticAbility(flying, PAIRED)]))).toEqual([]);
    expect(
      validateCard(
        withAbilities(['creature'], [staticAbility(flying, { kind: 'not', term: PAIRED })]),
      ),
    ).toEqual([]);
  });

  test('is valid as the intervening "if" of an ability of a permanent', () => {
    const ability: Ability = {
      kind: 'triggered',
      trigger: { kind: 'attacks', what: { kind: 'this' } },
      interveningIf: PAIRED as never,
      effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
    };
    expect(validateCard(withAbilities(['creature'], [ability]))).toEqual([]);
  });

  test('is refused where the permanent may be gone when it is read: a dies or leaves trigger, a sacrifice, a card from the graveyard (D-985, CR 400.7, 603.10a)', () => {
    const draw = { kind: 'draw', player: { kind: 'you' }, count: 1 } as const;
    const triggers = [
      { kind: 'dies', what: { kind: 'this' } },
      { kind: 'leavesBattlefield', what: { kind: 'this' } },
      { kind: 'dies', what: { kind: 'another', filter: { types: ['creature'] } } },
      { kind: 'permanentSacrificed', by: 'you' },
    ];
    for (const trigger of triggers) {
      for (const where of ['interveningIf', 'triggerCondition', 'effect']) {
        const ability = {
          kind: 'triggered',
          trigger,
          ...(where === 'effect'
            ? { effect: { kind: 'conditional', condition: PAIRED, effect: draw } }
            : { effect: draw, [where]: PAIRED }),
        } as unknown as Ability;
        expect(
          messages(withAbilities(['creature'], [ability])),
          `${trigger.kind} ${where}`,
        ).toContain("'paired'");
      }
    }
  });

  test('is refused in a spell (a spell is not a permanent: it is never paired)', () => {
    const spell = singleFace({
      name: 'SYNTHETIC Validation Spell',
      manaCost: ['1'],
      types: ['instant'],
      colors: [],
      colorIdentity: [],
      oracleText: 'SYNTHETIC',
      spell: {
        effect: {
          kind: 'conditional',
          condition: PAIRED,
          effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
        } as never,
      },
    });
    expect(messages(spell)).toContain('paired');
  });

  test('is refused on a static ability that changes types or colors (a layer 4 or 5 effect may not depend on it)', () => {
    const types = staticAbility(
      { kind: 'setTypes', subject: { kind: 'this' }, types: ['artifact'] },
      PAIRED,
    );
    expect(validateCard(withAbilities(['creature'], [types])).length).toBeGreaterThan(0);
  });
});

describe('the subject pair', () => {
  const GRANT = {
    kind: 'triggered',
    trigger: { kind: 'dies', what: { kind: 'this' } },
    effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
  };

  test('is valid for power and toughness, a keyword and a triggered or activated ability', () => {
    const shapes = [
      { kind: 'modifyPt', subject: PAIR, power: 1, toughness: 1 },
      { kind: 'grantKeyword', subject: PAIR, keyword: { kind: 'flying' } },
      { kind: 'grantAbility', subject: PAIR, ability: GRANT },
      {
        kind: 'grantAbility',
        subject: PAIR,
        ability: {
          kind: 'activated',
          cost: [{ kind: 'tap' }],
          effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
        },
      },
    ];
    for (const s of shapes) {
      expect(
        validateCard(withAbilities(['creature'], [staticAbility(s, PAIRED)])),
        JSON.stringify(s),
      ).toEqual([]);
    }
  });

  test('is refused for everything else: a restriction, base values, types, a mana ability, riot, cost changes', () => {
    const shapes = [
      { kind: 'restriction', subject: PAIR, restriction: 'cantBlock' },
      { kind: 'setPt', subject: PAIR, power: 3, toughness: 3 },
      { kind: 'setTypes', subject: PAIR, subtypes: ['Frog'] },
      {
        kind: 'grantAbility',
        subject: PAIR,
        ability: {
          kind: 'mana',
          cost: [{ kind: 'tap' }],
          production: { kind: 'fixed', mana: ['G'] },
        },
      },
      { kind: 'grantKeyword', subject: PAIR, keyword: { kind: 'riot' } },
    ];
    for (const s of shapes) {
      expect(
        validateCard(withAbilities(['creature'], [staticAbility(s, PAIRED)])).length,
        JSON.stringify(s),
      ).toBeGreaterThan(0);
    }
  });
});
