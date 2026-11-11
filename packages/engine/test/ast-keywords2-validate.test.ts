// The AST of keyword batch 2 (D-116, D-120): validation (structure and what the engine can run), the feature tables
// the parser reads, and the abilities `derive` expands the keywords into (CR 702.118, 702.91, 702.134, 702.100,
// 702.45, 702.101, 702.41, 702.85) and the shapes of regeneration (CR 701.19), `mayPay`, `cascade`, the filters
// `attacking` and `powerLessThanSource` and the amount `lifeLostThisWay`. Cards are SYNTHETIC
// (src/cards/fixtures/synthetic-keywords-2.ts) or defined here.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import {
  type Ability,
  type CardDefinition,
  type Effect,
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

const KEYWORD2_CARDS = [
  'SYNTHETIC Skulk Rogue',
  'SYNTHETIC Battle Cry Chief',
  'SYNTHETIC Mentor Veteran',
  'SYNTHETIC Evolve Whelp',
  'SYNTHETIC Bushido Duelist',
  'SYNTHETIC Extort Priest',
  'SYNTHETIC Affinity Golem',
  'SYNTHETIC Affinity Sphinx',
  'SYNTHETIC Trinket',
  'SYNTHETIC Regenerating Troll',
  'SYNTHETIC Regrowth Charm',
  'SYNTHETIC Final Smite',
  'SYNTHETIC Self Edict',
  'SYNTHETIC Convoke Wurm',
  'SYNTHETIC Convoke Pair',
  'SYNTHETIC Convoke Hybrid',
  'SYNTHETIC Improvise Construct',
  'SYNTHETIC Delve Spirit',
  'SYNTHETIC Resourceful Hulk',
  'SYNTHETIC Cascade Giant',
  'SYNTHETIC Cascade Drake',
  'SYNTHETIC Cascade Sprite',
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
const spell = (effect: Effect, targets = undefined as never): CardDefinition =>
  singleFace({
    name: 'SYNTHETIC Test Spell',
    manaCost: ['1'],
    types: ['sorcery'],
    colors: [],
    colorIdentity: [],
    oracleText: 'Test.',
    spell: targets === undefined ? { effect } : { effect, targets },
  });
const kw = (
  keyword: Ability extends infer A ? (A extends { keyword: infer K } ? K : never) : never,
): Ability => ({
  kind: 'keyword',
  keyword,
});
const triggered = (trigger: unknown, effect: Effect, extra = {}): Ability =>
  ({ kind: 'triggered', trigger, effect, ...extra }) as Ability;

describe('the batch is supported and valid', () => {
  test('every fixture validates and is runnable', () => {
    for (const name of KEYWORD2_CARDS)
      expect(validateCard(SYNTHETIC_CARDS[name] as never), name).toEqual([]);
  });

  test('every keyword, trigger, effect, condition and amount is in SUPPORTED_FEATURES and the parser tables', () => {
    for (const ref of [
      'keyword:skulk',
      'keyword:battleCry',
      'keyword:mentor',
      'keyword:evolve',
      'keyword:bushido',
      'keyword:extort',
      'keyword:affinity',
      'keyword:convoke',
      'keyword:improvise',
      'keyword:delve',
      'keyword:cascade',
      'trigger:blocks',
      'trigger:becomesBlocked',
      'effect:regenerate',
      'effect:mayPay',
      'effect:cascade',
      'condition:subjectGreaterPt',
      'amount:lifeLostThisWay',
      'selector:attacking',
      'selector:powerLessThanSource',
    ]) {
      expect(isKnownFeature(ref as never), ref).toBe(true);
      expect(isFeatureSupported(ref as never), ref).toBe(true);
    }
    expect(SUPPORTED_FEATURES.keywordKinds).toEqual(
      expect.arrayContaining(['skulk', 'cascade', 'delve']),
    );
  });

  test('only skulk of the batch can be granted: the others are parametric or expand into abilities', () => {
    expect(GRANTABLE_KEYWORDS).toContain('skulk');
    for (const kind of [
      'battleCry',
      'mentor',
      'evolve',
      'bushido',
      'extort',
      'affinity',
      'convoke',
      'improvise',
      'delve',
      'cascade',
    ]) {
      expect(GRANTABLE_KEYWORDS, kind).not.toContain(kind);
    }
    const grant = creature([
      {
        kind: 'static',
        static: {
          kind: 'grantKeyword',
          subject: { kind: 'filter', filter: { types: ['creature'], controller: 'you' } },
          keyword: { kind: 'skulk' },
        },
      },
    ]);
    expect(issues(grant)).toEqual([]);
  });
});

describe('what is refused', () => {
  test('bushido needs a positive count', () => {
    for (const count of [0, -1, 1.5]) {
      expect(issues(creature([kw({ kind: 'bushido', count })])).length, `${count}`).toBeGreaterThan(
        0,
      );
    }
    expect(issues(creature([kw({ kind: 'bushido', count: 3 })]))).toEqual([]);
  });

  test('affinity names permanents the caster controls on the battlefield', () => {
    const affinity = (filter: unknown) =>
      issues(creature([kw({ kind: 'affinity', filter } as never)]));
    expect(affinity({ types: ['artifact'] })).toEqual([]);
    expect(affinity({ types: ['artifact'], controller: 'you' })).toEqual([]);
    expect(affinity({ subtypes: ['Island'] })).toEqual([]);
    expect(affinity({ types: ['artifact'], controller: 'opponent' }).length).toBeGreaterThan(0);
    expect(affinity({ zone: 'graveyard' }).length).toBeGreaterThan(0);
    expect(affinity({ attacking: true }).length).toBeGreaterThan(0);
    expect(affinity(undefined).length).toBeGreaterThan(0);
  });

  test('"when you cast this spell" is for the caster, the spell itself and no other filter', () => {
    const cast = (trigger: unknown) =>
      validateAbility(triggered(trigger, { kind: 'cascade' })).map((i) => i.message);
    expect(
      cast({ kind: 'castSpell', filter: { stackKind: 'spell' }, by: 'you', self: true }),
    ).toEqual([]);
    expect(
      cast({ kind: 'castSpell', filter: { stackKind: 'spell' }, by: 'opponent', self: true })
        .length,
    ).toBeGreaterThan(0);
    expect(
      cast({
        kind: 'castSpell',
        filter: { stackKind: 'spell', types: ['creature'] },
        by: 'you',
        self: true,
      }).length,
    ).toBeGreaterThan(0);
    expect(
      cast({ kind: 'castSpell', filter: { stackKind: 'spell' }, by: 'you', self: false }).length,
    ).toBeGreaterThan(0);
  });

  test('cascade is the whole effect of a "when you cast this spell" ability and nothing else', () => {
    const other = triggered({ kind: 'upkeep', whose: 'you' }, { kind: 'cascade' });
    expect(validateAbility(other).length).toBeGreaterThan(0);
    const nested = triggered(
      { kind: 'castSpell', filter: { stackKind: 'spell' }, by: 'you', self: true },
      {
        kind: 'sequence',
        effects: [{ kind: 'cascade' }, { kind: 'gainLife', player: { kind: 'you' }, amount: 1 }],
      },
    );
    expect(validateAbility(nested).length).toBeGreaterThan(0);
    expect(issues(spell({ kind: 'cascade' })).length).toBeGreaterThan(0);
  });

  test('the comparison with the creature that entered needs an enters trigger', () => {
    const gain: Effect = { kind: 'gainLife', player: { kind: 'you' }, amount: 1 };
    const ok = triggered(
      { kind: 'entersBattlefield', what: { types: ['creature'], controller: 'you', other: true } },
      gain,
      { interveningIf: { kind: 'subjectGreaterPt' } },
    );
    expect(validateAbility(ok)).toEqual([]);
    const wrong = triggered({ kind: 'attacks', what: { kind: 'this' } }, gain, {
      interveningIf: { kind: 'subjectGreaterPt' },
    });
    expect(validateAbility(wrong).length).toBeGreaterThan(0);
  });

  test('lifeLostThisWay needs a loseLife before it in the same sequence', () => {
    const lose: Effect = { kind: 'loseLife', player: { kind: 'eachOpponent' }, amount: 1 };
    const gain: Effect = {
      kind: 'gainLife',
      player: { kind: 'you' },
      amount: { kind: 'lifeLostThisWay' },
    };
    expect(issues(spell({ kind: 'sequence', effects: [lose, gain] }))).toEqual([]);
    expect(issues(spell({ kind: 'sequence', effects: [gain, lose] })).length).toBeGreaterThan(0);
    expect(issues(spell(gain)).length).toBeGreaterThan(0);
  });

  test('mayPay costs: mana and life run, an X, a sacrifice or a tap are not run', () => {
    const pay = (cost: unknown) =>
      issues(
        spell({
          kind: 'mayPay',
          cost,
          effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
        } as never),
      );
    expect(pay([{ kind: 'mana', symbols: ['W/B'] }])).toEqual([]);
    expect(pay([{ kind: 'payLife', amount: 2 }])).toEqual([]);
    expect(pay([{ kind: 'mana', symbols: ['X'] }]).length).toBeGreaterThan(0);
    expect(pay([{ kind: 'sacrifice', what: { kind: 'this' } }]).length).toBeGreaterThan(0);
    expect(pay([{ kind: 'tap' }]).length).toBeGreaterThan(0);
    expect(pay([]).length).toBeGreaterThan(0);
  });

  test('regenerate lasts until end of turn and names permanents; "can\'t be regenerated" is a flag', () => {
    const regen = (duration: unknown) =>
      issues(
        spell({
          kind: 'regenerate',
          objects: { kind: 'each', filter: { types: ['creature'] } },
          duration,
        } as never),
      );
    expect(regen('untilEndOfTurn')).toEqual([]);
    expect(regen('permanent').length).toBeGreaterThan(0);
    const destroy = (flag: unknown) =>
      issues(
        spell({
          kind: 'destroy',
          objects: { kind: 'each', filter: { types: ['creature'] } },
          cantBeRegenerated: flag,
        } as never),
      );
    expect(destroy(true)).toEqual([]);
    expect(destroy(false).length).toBeGreaterThan(0);
  });

  test('"attacking" and "power less than the source" are flags, and static abilities cannot read them', () => {
    const target = (filter: unknown) =>
      issues(
        spell({ kind: 'dealDamage', amount: 1, to: { kind: 'target', id: 't1' } }, [
          { id: 't1', what: { kind: 'object', filter } },
        ] as never),
      );
    expect(target({ types: ['creature'], attacking: true })).toEqual([]);
    expect(target({ types: ['creature'], powerLessThanSource: true })).toEqual([]);
    expect(target({ types: ['creature'], attacking: false }).length).toBeGreaterThan(0);
    expect(target({ attacking: true, zone: 'graveyard' }).length).toBeGreaterThan(0);
    const lord = (filter: unknown) =>
      issues(
        creature([
          {
            kind: 'static',
            static: {
              kind: 'modifyPt',
              subject: { kind: 'filter', filter },
              power: 1,
              toughness: 1,
            },
          },
        ] as never),
      );
    expect(lord({ types: ['creature'] })).toEqual([]);
    expect(lord({ types: ['creature'], attacking: true }).length).toBeGreaterThan(0);
    const counted = issues(
      creature([
        {
          kind: 'static',
          static: {
            kind: 'modifyPt',
            subject: { kind: 'this' },
            power: { kind: 'countOf', filter: { types: ['creature'], attacking: true } },
            toughness: 0,
          },
        },
      ] as never),
    );
    expect(counted.length).toBeGreaterThan(0);
  });

  test('blocks and becomes blocked take a subject like any trigger', () => {
    const gain: Effect = { kind: 'gainLife', player: { kind: 'you' }, amount: 1 };
    for (const kind of ['blocks', 'becomesBlocked']) {
      expect(validateAbility(triggered({ kind, what: { kind: 'this' } }, gain))).toEqual([]);
      expect(validateAbility(triggered({ kind, what: { kind: 'attached' } }, gain))).toEqual([]);
      expect(validateAbility(triggered({ kind, what: { types: ['creature'] } }, gain))).toEqual([]);
    }
  });
});

describe('the keywords expand into the abilities the rules define', () => {
  const abilitiesOf = (card: CardDefinition) => {
    const g = scenario().define(card).seat(0).battlefield(card.name).seat(1).build();
    const obj = g.state.objects[g.id(card.name)];
    if (obj === undefined) throw new Error('missing');
    return derive(g.state, obj).abilities;
  };

  test('battle cry: each other attacking creature gets +1/+0', () => {
    expect(abilitiesOf(creature([kw({ kind: 'battleCry' })]))[1]).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'attacks', what: { kind: 'this' } },
      effect: {
        kind: 'modifyPt',
        objects: { kind: 'each', filter: { attacking: true, other: true } },
        power: 1,
        toughness: 0,
      },
    });
  });

  test('mentor: a target attacking creature with less power gets a +1/+1 counter', () => {
    expect(abilitiesOf(creature([kw({ kind: 'mentor' })]))[1]).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'attacks' },
      targets: [{ what: { filter: { attacking: true, powerLessThanSource: true } } }],
      effect: { kind: 'addCounters', counter: '+1/+1', count: 1 },
    });
  });

  test('evolve: a creature you control enters, if it is bigger, a counter on this creature', () => {
    expect(abilitiesOf(creature([kw({ kind: 'evolve' })]))[1]).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'entersBattlefield', what: { controller: 'you', other: true } },
      interveningIf: { kind: 'subjectGreaterPt' },
      effect: { kind: 'addCounters', objects: { kind: 'this' }, counter: '+1/+1' },
    });
  });

  test('bushido N: two triggers, when it blocks and when it becomes blocked, for each instance', () => {
    const abilities = abilitiesOf(
      creature([kw({ kind: 'bushido', count: 2 }), kw({ kind: 'bushido', count: 1 })]),
    );
    expect(abilities).toHaveLength(6);
    expect(abilities[2]).toMatchObject({
      trigger: { kind: 'blocks' },
      effect: { power: 2, toughness: 2 },
    });
    expect(abilities[3]).toMatchObject({
      trigger: { kind: 'becomesBlocked' },
      effect: { power: 2 },
    });
    expect(abilities[4]).toMatchObject({ trigger: { kind: 'blocks' }, effect: { power: 1 } });
  });

  test('extort: whenever you cast a spell, you may pay {W/B}; each opponent loses 1 and you gain the total', () => {
    expect(abilitiesOf(creature([kw({ kind: 'extort' })]))[1]).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'castSpell', by: 'you' },
      effect: {
        kind: 'mayPay',
        cost: [{ kind: 'mana', symbols: ['W/B'] }],
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'loseLife', player: { kind: 'eachOpponent' }, amount: 1 },
            { kind: 'gainLife', amount: { kind: 'lifeLostThisWay' } },
          ],
        },
      },
    });
  });

  test('cascade: a "when you cast this spell" ability', () => {
    expect(abilitiesOf(creature([kw({ kind: 'cascade' })]))[1]).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'castSpell', by: 'you', self: true },
      effect: { kind: 'cascade' },
    });
  });

  test("affinity: a cost reduction of the spell itself, for each of the caster's permanents", () => {
    expect(
      abilitiesOf(creature([kw({ kind: 'affinity', filter: { types: ['artifact'] } })]))[1],
    ).toMatchObject({
      kind: 'static',
      static: {
        kind: 'costReduction',
        spells: { kind: 'this' },
        amount: { kind: 'countOf', filter: { types: ['artifact'], controller: 'you' } },
      },
    });
  });

  test('convoke, improvise, delve and skulk expand into nothing: they are read where they act', () => {
    for (const keyword of ['convoke', 'improvise', 'delve', 'skulk'] as const) {
      expect(abilitiesOf(creature([kw({ kind: keyword })]))).toHaveLength(1);
    }
  });
});
