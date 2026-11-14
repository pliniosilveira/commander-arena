// The Gisa deck (issue 41), group 1 (D-472 to D-476): what `validateCard` allows of the new nodes: the keyword `afflict` (printed and granted), a granted `landwalk` (static and
// effect), the basic land types set by a `setTypes` effect (CR 305.7), and the condition `combatDamagedBy` (CR 120.2a); and the SYNTHETIC cards of the group are valid and supported.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import {
  type Ability,
  type Effect,
  GRANTABLE_KEYWORDS,
  SUPPORTED_FEATURES,
  syntheticCard,
  validateCard,
} from '../src/index';

const GROUP = [
  'SYNTHETIC Afflict Monarch',
  'SYNTHETIC Walk Master',
  'SYNTHETIC Trail Scout',
  'SYNTHETIC Horde Banner',
  'SYNTHETIC Gisa Zombie',
];

const creature = (abilities: readonly Ability[]) =>
  singleFace({
    name: 'SYNTHETIC Test Subject',
    manaCost: ['2'],
    types: ['creature'],
    colors: [],
    colorIdentity: [],
    power: 2,
    toughness: 2,
    oracleText: 'Test.',
    abilities,
  });

const spell = (effect: Effect) =>
  singleFace({
    name: 'SYNTHETIC Test Spell',
    manaCost: ['1'],
    types: ['instant'],
    colors: [],
    colorIdentity: [],
    oracleText: 'Test.',
    spell: {
      targets: [{ id: 't1', what: { kind: 'object', filter: { types: ['land'] } } }],
      effect,
    },
  });

const messages = (card: Parameters<typeof validateCard>[0]) =>
  validateCard(card)
    .map((i) => i.message)
    .join(' | ');

const staticGrant = (keyword: unknown): Ability => ({
  kind: 'static',
  static: {
    kind: 'grantKeyword',
    subject: { kind: 'filter', filter: { subtypes: ['Zombie'] }, other: true },
    keyword: keyword as never,
  },
});

const grantEffect = (keyword: unknown): Effect => ({
  kind: 'grantKeyword',
  objects: { kind: 'target', id: 't1' },
  keyword: keyword as never,
  duration: 'untilEndOfTurn',
});

describe('the cards of the group', () => {
  test.each(GROUP)('%s is valid and supported', (name) => {
    const card = syntheticCard(name);
    expect(validateCard(card)).toEqual([]);
    expect(card.support).toBe('supported');
  });
});

describe('Afflict N (CR 702.130a)', () => {
  test('a printed afflict takes a positive whole number', () => {
    expect(
      validateCard(creature([{ kind: 'keyword', keyword: { kind: 'afflict', count: 3 } }])),
    ).toEqual([]);
    for (const count of [0, -1, 1.5, '3', undefined, Number.NaN]) {
      expect(
        messages(creature([{ kind: 'keyword', keyword: { kind: 'afflict', count } as never }])),
        String(count),
      ).toContain('afflict needs a positive integer');
    }
  });

  test('it can be granted by a static ability and by an effect, with a count', () => {
    expect(GRANTABLE_KEYWORDS).toContain('afflict');
    expect(validateCard(creature([staticGrant({ kind: 'afflict', count: 3 })]))).toEqual([]);
    expect(messages(creature([staticGrant({ kind: 'afflict', count: 0 })]))).toContain(
      'afflict needs a positive integer',
    );
    expect(validateCard(spell(grantEffect({ kind: 'afflict', count: 2 })))).toEqual([]);
    expect(messages(spell(grantEffect({ kind: 'afflict' })))).toContain(
      'afflict needs a positive integer',
    );
  });

  test('the feature tables list it', () => {
    expect(SUPPORTED_FEATURES.keywordKinds).toContain('afflict');
  });
});

describe('a granted landwalk (CR 702.14a, 702.14e)', () => {
  test('a static ability and an effect may grant one, with its land type', () => {
    expect(GRANTABLE_KEYWORDS).toContain('landwalk');
    expect(validateCard(creature([staticGrant({ kind: 'landwalk', landType: 'Swamp' })]))).toEqual(
      [],
    );
    expect(
      validateCard(creature([staticGrant({ kind: 'landwalk', landType: 'nonbasic' })])),
    ).toEqual([]);
    expect(validateCard(spell(grantEffect({ kind: 'landwalk', landType: 'Island' })))).toEqual([]);
  });

  test('a landwalk without a land type, or with a name that is no land type, is refused', () => {
    for (const landType of ['', 'swamp', '3', undefined]) {
      expect(
        messages(creature([staticGrant({ kind: 'landwalk', landType })])),
        String(landType),
      ).not.toBe('');
      expect(
        messages(spell(grantEffect({ kind: 'landwalk', landType }))),
        String(landType),
      ).not.toBe('');
    }
  });

  test('the other keywords with a parameter are still not granted', () => {
    for (const keyword of [
      { kind: 'toxic', count: 1 },
      { kind: 'annihilator', count: 1 },
      { kind: 'bushido', count: 1 },
      { kind: 'ward', cost: [{ kind: 'mana', symbols: ['1'] }] },
    ]) {
      expect(messages(creature([staticGrant(keyword)])), keyword.kind).toContain(
        'only keywords without parameters can be granted',
      );
      expect(messages(spell(grantEffect(keyword))), keyword.kind).toContain(
        'only keywords without parameters can be granted',
      );
    }
  });
});

describe('a land that becomes a basic land type (CR 305.7)', () => {
  const sets = (subtypes: readonly string[], more: object = {}): Effect =>
    ({
      kind: 'setTypes',
      objects: { kind: 'target', id: 't1' },
      subtypes,
      duration: 'untilEndOfTurn',
      ...more,
    }) as Effect;

  test('one or more basic land types are valid alone, replacing or adding', () => {
    expect(validateCard(spell(sets(['Swamp'])))).toEqual([]);
    expect(validateCard(spell(sets(['Swamp', 'Forest'])))).toEqual([]);
    expect(validateCard(spell(sets(['Island'], { additive: true })))).toEqual([]);
  });

  test('a land type that is not a basic land type is not run, nor is one mixed with a creature type or a card type', () => {
    expect(messages(spell(sets(['Desert'])))).toContain('Desert is not a creature type');
    expect(messages(spell(sets(['Swamp', 'Frog'])))).toContain('basic land types are set alone');
    expect(messages(spell(sets(['Swamp'], { types: ['artifact'] })))).toContain(
      'basic land types are set alone',
    );
  });
});

describe('the condition combatDamagedBy (CR 120.2a)', () => {
  const trigger = (filter: unknown): Ability => ({
    kind: 'triggered',
    trigger: { kind: 'step', step: 'main2', whose: 'you' },
    interveningIf: { kind: 'combatDamagedBy', filter: filter as never },
    effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
  });

  test('the types, the subtypes and who controlled the source', () => {
    for (const filter of [
      { subtypes: ['Zombie'] },
      { types: ['creature'] },
      { types: ['creature'], subtypes: ['Elf'], controller: 'you' },
      { subtypes: ['Zombie'], controller: 'opponent' },
    ]) {
      expect(validateCard(creature([trigger(filter)])), JSON.stringify(filter)).toEqual([]);
    }
  });

  test('a filter that names nothing the turn log keeps is refused', () => {
    for (const filter of [
      {},
      { token: true, subtypes: ['Zombie'] },
      { subtypes: ['Zombie'], tapped: true },
      { subtypes: [] },
      { types: ['frog'] },
      { subtypes: ['Zombie'], controller: 'triggerPlayer' },
      undefined,
    ]) {
      expect(messages(creature([trigger(filter)])), JSON.stringify(filter)).not.toBe('');
    }
  });

  test('a static ability may not read it: it reads the log, which no layer can follow (CR 613.8)', () => {
    const card = creature([
      {
        kind: 'static',
        static: { kind: 'modifyPt', subject: { kind: 'this' }, power: 1, toughness: 1 },
        condition: { kind: 'combatDamagedBy', filter: { subtypes: ['Zombie'] } },
      },
    ]);
    expect(messages(card)).not.toBe('');
  });

  test('the feature tables list it', () => {
    expect(SUPPORTED_FEATURES.conditionKinds).toContain('combatDamagedBy');
  });
});
