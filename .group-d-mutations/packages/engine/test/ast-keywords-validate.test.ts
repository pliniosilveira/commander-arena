// The AST of keyword batch 1 (D-104, D-110): validation (structure and what the engine can run), the feature
// tables the parser reads, and the abilities `derive` expands the keywords into (CR 702.83a, 702.86a, 702.79a,
// 702.93a, 702.29e). Cards are SYNTHETIC (src/cards/fixtures/synthetic-keywords.ts) or defined here.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import {
  type Ability,
  type CardDefinition,
  GRANTABLE_KEYWORDS,
  isFeatureSupported,
  isKnownFeature,
  SUPPORTED_FEATURES,
  SYNTHETIC_CARDS,
  validateAbility,
  validateCard,
} from '../src/index';
import { derive } from '../src/rules/derive';
import { scenario } from '../src/testing/index';

const KEYWORD_CARDS = [
  'SYNTHETIC Chameleon Drifter',
  'SYNTHETIC Void Wisp',
  'SYNTHETIC Duo Scout',
  'SYNTHETIC Exalted Squire',
  'SYNTHETIC Exalted Banner',
  'SYNTHETIC Annihilator Titan',
  'SYNTHETIC Eater Imp',
  'SYNTHETIC Persist Bear',
  'SYNTHETIC Persist Wisp',
  'SYNTHETIC Undying Imp',
  'SYNTHETIC Infect Bear',
  'SYNTHETIC Infect Lifelinker',
  'SYNTHETIC Infect Viper',
  'SYNTHETIC Infect Pinger',
  'SYNTHETIC Wither Imp',
  'SYNTHETIC Toxic Rat',
  'SYNTHETIC Toxic Brute',
  'SYNTHETIC Hush Bolt',
  'SYNTHETIC Hush Gain',
  'SYNTHETIC Landcycler Beast',
  'SYNTHETIC Islandcycler Drake',
  'SYNTHETIC Tide Pool',
  'SYNTHETIC Strider Cub',
  'SYNTHETIC Volley Barrage',
  'SYNTHETIC Blood Tithe',
];

function creature(
  abilities: readonly Ability[],
  extra: Partial<Parameters<typeof singleFace>[0]> = {},
) {
  return singleFace({
    name: 'SYNTHETIC Test Subject',
    manaCost: ['2'],
    types: ['creature'],
    colors: [],
    colorIdentity: [],
    power: 2,
    toughness: 2,
    oracleText: 'Test.',
    abilities,
    ...extra,
  });
}

const issues = (card: CardDefinition) => validateCard(card).map((i) => `${i.path}: ${i.message}`);
const kw = (
  keyword: Ability extends infer A ? (A extends { keyword: infer K } ? K : never) : never,
): Ability => ({
  kind: 'keyword',
  keyword,
});

describe('the batch is supported and valid', () => {
  test('every fixture validates and is runnable', () => {
    for (const name of KEYWORD_CARDS)
      expect(validateCard(SYNTHETIC_CARDS[name] as never), name).toEqual([]);
  });

  test('every keyword is in SUPPORTED_FEATURES and in the tables the parser reads', () => {
    for (const kind of [
      'changeling',
      'devoid',
      'partner',
      'exalted',
      'annihilator',
      'persist',
      'undying',
      'infect',
      'wither',
      'toxic',
      'splitSecond',
      'typecycling',
      'multikicker',
    ]) {
      expect(SUPPORTED_FEATURES.keywordKinds, kind).toContain(kind);
      expect(isKnownFeature(`keyword:${kind}` as never), kind).toBe(true);
      expect(isFeatureSupported(`keyword:${kind}` as never), kind).toBe(true);
    }
    for (const ref of [
      'trigger:alone',
      'selector:defendingPlayer',
      'selector:thisCard',
      'condition:sourceHasCounter',
      'amount:timesKicked',
    ]) {
      expect(isKnownFeature(ref as never), ref).toBe(true);
      expect(isFeatureSupported(ref as never), ref).toBe(true);
    }
  });

  test('only infect and wither of the batch can be granted: the others are parametric or are not read after layer 6', () => {
    expect(GRANTABLE_KEYWORDS).toContain('infect');
    expect(GRANTABLE_KEYWORDS).toContain('wither');
    for (const kind of [
      'toxic',
      'annihilator',
      'changeling',
      'devoid',
      'persist',
      'undying',
      'splitSecond',
      'typecycling',
      'multikicker',
      'partner',
    ]) {
      expect(GRANTABLE_KEYWORDS, kind).not.toContain(kind);
    }
  });
});

describe('what is refused', () => {
  test('annihilator and toxic need a positive count', () => {
    for (const kind of ['annihilator', 'toxic'] as const) {
      for (const count of [0, -1, 1.5]) {
        const out = issues(creature([kw({ kind, count })]));
        expect(out.length, `${kind} ${count}`).toBeGreaterThan(0);
      }
      expect(issues(creature([kw({ kind, count: 1 })]))).toEqual([]);
    }
  });

  test('typecycling names a type, sets neither zone nor controller, and does not list the discard', () => {
    const cost = [{ kind: 'mana', symbols: ['1'] }] as const;
    expect(issues(creature([kw({ kind: 'typecycling', filter: {}, cost })])).join()).toContain(
      'names a type',
    );
    expect(
      issues(
        creature([
          kw({ kind: 'typecycling', filter: { zone: 'library', subtypes: ['Island'] }, cost }),
        ]),
      ).join(),
    ).toContain('neither zone nor controller');
    expect(
      issues(
        creature([
          kw({
            kind: 'typecycling',
            filter: { subtypes: ['Island'] },
            cost: [...cost, { kind: 'discardThis' }],
          }),
        ]),
      ).join(),
    ).toContain('already discards');
    expect(
      issues(creature([kw({ kind: 'typecycling', filter: { subtypes: ['Island'] }, cost })])),
    ).toEqual([]);
    // Only mana and life are paid by the engine for an activation of this kind.
    expect(
      issues(
        creature([
          kw({ kind: 'typecycling', filter: { subtypes: ['Island'] }, cost: [{ kind: 'tap' }] }),
        ]),
      ).join(),
    ).toContain('not implemented');
  });

  test('multikicker costs are mana or life without X, and a card has one kicker ability', () => {
    expect(
      issues(
        creature([kw({ kind: 'multikicker', cost: [{ kind: 'mana', symbols: ['X'] }] })]),
      ).join(),
    ).toContain('X in a kicker cost');
    expect(
      issues(creature([kw({ kind: 'multikicker', cost: [{ kind: 'tap' }] })])).join(),
    ).toContain('mana or life only');
    const mana = [{ kind: 'mana', symbols: ['1'] }] as const;
    expect(
      issues(
        creature([kw({ kind: 'multikicker', cost: mana }), kw({ kind: 'kicker', cost: mana })]),
      ).join(),
    ).toContain('more than one kicker or multikicker');
    expect(
      issues(
        creature([
          kw({ kind: 'multikicker', cost: mana }),
          kw({ kind: 'multikicker', cost: mana }),
        ]),
      ).join(),
    ).toContain('more than one kicker or multikicker');
  });

  test('"for each time it was kicked" needs a kicker or a multikicker', () => {
    const spell = singleFace({
      name: 'SYNTHETIC Test Counted',
      manaCost: ['R'],
      types: ['sorcery'],
      colors: ['R'],
      colorIdentity: ['R'],
      oracleText: 'Test.',
      spell: {
        effect: {
          kind: 'dealDamage',
          amount: { kind: 'timesKicked' },
          to: { kind: 'eachOpponent' },
        },
      },
    });
    expect(issues(spell).join()).toContain('timesKicked needs a kicker or multikicker');
  });

  test('the new references are valid only where the engine reads them', () => {
    const sac = (player: unknown, objects: unknown): Ability =>
      ({
        kind: 'triggered',
        trigger: { kind: 'attacks', what: { kind: 'this' } },
        effect: { kind: 'sacrifice', objects, player },
      }) as never;
    expect(
      validateAbility(sac({ kind: 'defendingPlayer' }, { kind: 'choose', filter: {}, count: 2 })),
    ).toEqual([]);
    expect(
      validateAbility(sac({ kind: 'defendingPlayer' }, { kind: 'this' }))
        .map((i) => i.message)
        .join(),
    ).toContain('choose selector');
    const ret = (to: string, extra: object = {}): Ability =>
      ({
        kind: 'triggered',
        trigger: { kind: 'dies', what: { kind: 'this' } },
        effect: { kind: 'moveToZone', objects: { kind: 'thisCard' }, to, ...extra },
      }) as never;
    expect(
      validateAbility(ret('battlefield', { withCounters: { counter: '-1/-1', count: 1 } })),
    ).toEqual([]);
    expect(
      validateAbility(ret('hand', { withCounters: { counter: '-1/-1', count: 1 } }))
        .map((i) => i.message)
        .join(),
    ).toContain('only for the battlefield');
    expect(
      validateAbility(ret('battlefield', { withCounters: { counter: '', count: 0 } })).length,
    ).toBeGreaterThan(0);
    // `thisCard` anywhere else is refused (a damage target, a spell).
    const dmg: Ability = {
      kind: 'triggered',
      trigger: { kind: 'dies', what: { kind: 'this' } },
      effect: { kind: 'destroy', objects: { kind: 'thisCard' } },
    };
    expect(
      validateAbility(dmg)
        .map((i) => i.message)
        .join(),
    ).toContain("'thisCard' is only valid");
  });

  test('"attacks alone" is a flag of the attacks trigger, and "that creature gets" reads the triggering permanent', () => {
    const exalted = (trigger: object, objects: object): Ability =>
      ({
        kind: 'triggered',
        trigger,
        effect: { kind: 'modifyPt', objects, power: 1, toughness: 1, duration: 'untilEndOfTurn' },
      }) as never;
    expect(
      validateAbility(
        exalted(
          { kind: 'attacks', what: { controller: 'you' }, alone: true },
          { kind: 'triggerSubject' },
        ),
      ),
    ).toEqual([]);
    expect(
      validateAbility(
        exalted(
          { kind: 'attacks', what: { kind: 'this' }, alone: false },
          { kind: 'triggerSubject' },
        ),
      ).length,
    ).toBeGreaterThan(0);
    // A trigger with no permanent as its subject has no "that creature".
    expect(
      validateAbility(exalted({ kind: 'upkeep', whose: 'you' }, { kind: 'triggerSubject' })).length,
    ).toBeGreaterThan(0);
  });
});

describe('the keywords expand into the abilities the rules define', () => {
  const abilitiesOf = (card: CardDefinition) => {
    const g = scenario().define(card).seat(0).battlefield(card.name).seat(1).build();
    const obj = g.state.objects[g.id(card.name)];
    if (obj === undefined) throw new Error('missing');
    return derive(g.state, obj).abilities;
  };

  test('exalted: a trigger on a creature you control attacking alone, pumping the attacker', () => {
    const [kwd, expanded] = abilitiesOf(creature([kw({ kind: 'exalted' })]));
    expect(kwd?.kind).toBe('keyword');
    expect(expanded).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'attacks', alone: true },
      effect: { kind: 'modifyPt', objects: { kind: 'triggerSubject' }, power: 1, toughness: 1 },
    });
  });

  test('annihilator N: the defending player sacrifices N permanents of their choice', () => {
    const abilities = abilitiesOf(creature([kw({ kind: 'annihilator', count: 3 })]));
    expect(abilities[1]).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'attacks', what: { kind: 'this' } },
      effect: {
        kind: 'sacrifice',
        objects: { kind: 'choose', count: 3 },
        player: { kind: 'defendingPlayer' },
      },
    });
  });

  test('persist and undying: a dies trigger with an intervening if on the counter, returning with one', () => {
    for (const [keyword, counter] of [
      ['persist', '-1/-1'],
      ['undying', '+1/+1'],
    ] as const) {
      const abilities = abilitiesOf(creature([kw({ kind: keyword })]));
      expect(abilities[1], keyword).toMatchObject({
        kind: 'triggered',
        trigger: { kind: 'dies', what: { kind: 'this' } },
        interveningIf: { kind: 'not', term: { kind: 'sourceHasCounter', counter } },
        effect: {
          kind: 'moveToZone',
          objects: { kind: 'thisCard' },
          to: 'battlefield',
          controller: 'owner',
          withCounters: { counter, count: 1 },
        },
      });
    }
  });

  test('typecycling: an activated ability from the hand that discards and searches', () => {
    const abilities = abilitiesOf(
      creature([
        kw({
          kind: 'typecycling',
          filter: { types: ['land'], supertypes: ['basic'] },
          cost: [{ kind: 'mana', symbols: ['1'] }],
        }),
      ]),
    );
    expect(abilities[1]).toMatchObject({
      kind: 'activated',
      functionsIn: 'hand',
      cost: [{ kind: 'mana' }, { kind: 'discardThis' }],
      effect: {
        kind: 'search',
        max: 1,
        reveal: true,
        shuffle: true,
        destinations: [{ zone: 'hand', count: 1 }],
      },
    });
  });

  test('the printed abilities keep their indexes: the expansions come after them', () => {
    const abilities = abilitiesOf(
      creature([kw({ kind: 'persist' }), kw({ kind: 'exalted' }), kw({ kind: 'flying' })]),
    );
    expect(
      abilities.slice(0, 3).map((a) => (a.kind === 'keyword' ? a.keyword.kind : a.kind)),
    ).toEqual(['persist', 'exalted', 'flying']);
    expect(abilities).toHaveLength(5);
  });
});
