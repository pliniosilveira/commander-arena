// The validator of the soulbond shapes (D-286): the keyword, the engine's own effect `pair` and condition `soulbondReady`, the public condition `paired` and the
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

  // D-287 (CR 400.7, 603.4, 608.2h): a condition that reads the pair of the permanent is evaluated on the battlefield now. In a triggered ability the source can leave
  // between the event and the resolution (a Lightning Bolt in response), and the engine then reads no pair; so `paired` is valid only as the "as long as" condition of a
  // static ability, and everywhere else the card is refused, never accepted with a condition that may be false for the wrong reason.
  const draw = { kind: 'draw', player: { kind: 'you' }, count: 1 } as const;
  const TRIGGERS = [
    { kind: 'attacks', what: { kind: 'this' } },
    { kind: 'dies', what: { kind: 'this' } },
    { kind: 'leavesBattlefield', what: { kind: 'this' } },
    { kind: 'dies', what: { kind: 'another', filter: { types: ['creature'] } } },
    { kind: 'permanentSacrificed', by: 'you' },
    { kind: 'entersBattlefield', what: { kind: 'this' } },
    { kind: 'upkeep', whose: 'you' },
  ];

  test('is refused as the intervening "if", the trigger condition or a conditional effect of every triggered ability', () => {
    for (const trigger of TRIGGERS) {
      for (const where of ['interveningIf', 'triggerCondition', 'effect', 'else', 'modes']) {
        const ability = {
          kind: 'triggered',
          trigger,
          ...(where === 'effect'
            ? { effect: { kind: 'conditional', condition: PAIRED, effect: draw } }
            : where === 'else'
              ? {
                  effect: {
                    kind: 'conditional',
                    condition: { kind: 'not', term: PAIRED },
                    effect: draw,
                    else: draw,
                  },
                }
              : where === 'modes'
                ? {
                    effect: { kind: 'sequence', effects: [] },
                    chooseModes: { kind: 'one' },
                    modes: [{ effect: { kind: 'conditional', condition: PAIRED, effect: draw } }],
                  }
                : { effect: draw, [where]: PAIRED }),
        } as unknown as Ability;
        expect(
          messages(withAbilities(['creature'], [ability])),
          `${trigger.kind} ${where}`,
        ).toContain("'paired'");
      }
    }
  });

  test('is refused in an activated ability: its condition of activation, its cost reduction, a conditional effect', () => {
    const base = { kind: 'activated', cost: [{ kind: 'tap' }], effect: draw };
    const shapes: Record<string, unknown> = {
      activateOnlyIf: { ...base, activateOnlyIf: PAIRED },
      costReducedIf: {
        ...base,
        cost: [{ kind: 'mana', symbols: ['2'] }],
        costReducedIf: { generic: 1, condition: PAIRED },
      },
      effect: { ...base, effect: { kind: 'conditional', condition: PAIRED, effect: draw } },
    };
    for (const [name, ability] of Object.entries(shapes)) {
      expect(messages(withAbilities(['creature'], [ability as Ability])), name).toContain(
        "'paired'",
      );
    }
  });

  test('is refused as a state trigger (a delayed trigger takes no condition: the validator refuses its conditional effect as it did)', () => {
    const state = {
      kind: 'triggered',
      trigger: { kind: 'state', condition: PAIRED },
      effect: draw,
    } as unknown as Ability;
    expect(messages(withAbilities(['creature'], [state]))).toContain("'paired'");
    const delayed = {
      kind: 'triggered',
      trigger: { kind: 'attacks', what: { kind: 'this' } },
      effect: {
        kind: 'delayedTrigger',
        at: { step: 'upkeep', whose: 'you' },
        effect: { kind: 'conditional', condition: PAIRED, effect: draw },
      },
    } as unknown as Ability;
    expect(validateCard(withAbilities(['creature'], [delayed])).length).toBeGreaterThan(0);
  });

  test('is refused inside the ability a static ability grants (a triggered ability, a static ability with its own condition)', () => {
    const quoted = {
      kind: 'triggered',
      trigger: { kind: 'attacks', what: { kind: 'this' } },
      interveningIf: PAIRED,
      effect: draw,
    };
    const grant = staticAbility({ kind: 'grantAbility', subject: PAIR, ability: quoted }, PAIRED);
    expect(messages(withAbilities(['creature'], [grant]))).toContain("'paired'");
    const grantedStatic = staticAbility(
      {
        kind: 'grantAbility',
        subject: PAIR,
        ability: {
          kind: 'static',
          static: { kind: 'grantKeyword', subject: { kind: 'this' }, keyword: { kind: 'flying' } },
          condition: PAIRED,
        },
      },
      PAIRED,
    );
    expect(validateCard(withAbilities(['creature'], [grantedStatic])).length).toBeGreaterThan(0);
  });

  test('is refused on a static ability that works from the graveyard (the card has no pair there)', () => {
    const fromGraveyard = {
      ...staticAbility(
        {
          kind: 'grantKeyword',
          subject: { kind: 'filter', filter: { types: ['creature'], controller: 'you' } },
          keyword: { kind: 'flying' },
        },
        PAIRED,
      ),
      functionsIn: 'graveyard',
    } as unknown as Ability;
    expect(messages(withAbilities(['creature'], [fromGraveyard]))).toContain(
      "'paired' is valid only",
    );
  });

  test('is refused where a static ability keeps another condition in its payload (the lifted restriction)', () => {
    const lifted = staticAbility(
      {
        kind: 'restrictionUnless',
        subject: { kind: 'this' },
        restrictions: ['cantAttack'],
        unless: PAIRED,
      },
      undefined,
    );
    expect(messages(withAbilities(['creature'], [lifted]))).toContain("'paired' is valid only");
  });

  test('stays valid in the "as long as" condition of a static ability, through and, or and not', () => {
    const flying = {
      kind: 'grantKeyword',
      subject: { kind: 'this' },
      keyword: { kind: 'flying' },
    };
    for (const condition of [
      PAIRED,
      { kind: 'not', term: PAIRED },
      { kind: 'and', terms: [PAIRED, { kind: 'yourTurn' }] },
    ]) {
      expect(
        validateCard(withAbilities(['creature'], [staticAbility(flying, condition)])),
        JSON.stringify(condition),
      ).toEqual([]);
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

  test('is refused in the choice of modes of a spell (chooseModes.maxIf), not only in its effects', () => {
    const modal = singleFace({
      name: 'SYNTHETIC Validation Spell',
      manaCost: ['1'],
      types: ['instant'],
      colors: [],
      colorIdentity: [],
      oracleText: 'SYNTHETIC',
      spell: {
        effect: { kind: 'sequence', effects: [] },
        modes: [
          { text: 'draw', effect: draw },
          { text: 'draw again', effect: draw },
        ],
        chooseModes: { min: 1, max: 1, maxIf: { condition: PAIRED, max: 2 } },
      } as never,
    } as never);
    expect(messages(modal)).toContain("'paired' is valid only");
  });

  test('is refused in the costs of an additional-cost choice of a face (D-287)', () => {
    const choice = singleFace({
      name: 'SYNTHETIC Validation Spell',
      manaCost: ['1'],
      types: ['instant'],
      colors: [],
      colorIdentity: [],
      oracleText: 'SYNTHETIC',
      spell: { effect: draw as never },
      additionalCostChoice: [
        [{ kind: 'payLife', amount: { kind: 'fixed', value: 1, condition: PAIRED } }],
        [{ kind: 'mana', symbols: ['2'] }],
      ],
    } as never);
    expect(messages(choice)).toContain("'paired' is valid only");
  });

  test('is refused in the condition of an alternative cost (a card that is cast is not a permanent), a mana ability and a replacement', () => {
    const alternative = singleFace({
      name: 'SYNTHETIC Validation Spell',
      manaCost: ['1'],
      types: ['instant'],
      colors: [],
      colorIdentity: [],
      oracleText: 'SYNTHETIC',
      spell: { effect: draw as never },
      alternativeCosts: [{ kind: 'free', condition: PAIRED }],
    } as never);
    expect(messages(alternative)).toContain('paired');
    const mana = {
      kind: 'mana',
      cost: [{ kind: 'tap' }],
      production: { kind: 'fixed', mana: ['G'] },
      activateOnlyIf: PAIRED,
    } as unknown as Ability;
    expect(messages(withAbilities(['creature'], [mana]))).toContain("'paired' is valid only");
    const replacement = {
      kind: 'replacement',
      replacement: { kind: 'entersTapped', unless: PAIRED },
    } as unknown as Ability;
    expect(messages(withAbilities(['creature'], [replacement]))).toContain(
      "'paired' is valid only",
    );
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
