// validateCard for Auras, Equipment, "attach" and static abilities with subjects (CR 301.5, 303.4,
// 702.5, 702.6, 701.3, 611.3, 613). Structural rules are checked by validateCardStructure; the "can
// the engine run it" rules by validateCard. Cards are SYNTHETIC or defined here.
import { describe, expect, test } from 'vitest';
import type { Ability, ObjectFilter, StaticEffect } from '../src/ast/types';
import { validateCard, validateCardStructure } from '../src/ast/validate';
import type { CardDefinition } from '../src/cards/definition';
import { singleFace } from '../src/cards/fixtures/helpers';
import { SYNTHETIC_ATTACHMENT_LIST } from '../src/cards/fixtures/synthetic-attachments';

const enchantCreature: Ability = {
  kind: 'keyword',
  keyword: { kind: 'enchant', filter: { types: ['creature'] } },
};

function aura(abilities: readonly Ability[], subtypes = ['Aura']): CardDefinition {
  return singleFace({
    name: 'SYNTHETIC Test Aura',
    manaCost: ['1'],
    types: ['enchantment'],
    subtypes,
    colors: [],
    colorIdentity: [],
    oracleText: 'test',
    abilities,
  });
}

function creature(abilities: readonly Ability[]): CardDefinition {
  return singleFace({
    name: 'SYNTHETIC Test Creature',
    manaCost: ['1'],
    types: ['creature'],
    subtypes: ['Bear'],
    colors: [],
    colorIdentity: [],
    power: 1,
    toughness: 1,
    oracleText: 'test',
    abilities,
  });
}

const messages = (def: CardDefinition) => validateCard(def).map((i) => i.message);

describe('the SYNTHETIC attachment cards are valid and supported', () => {
  test.each(SYNTHETIC_ATTACHMENT_LIST.map((c) => [c.name, c] as const))('%s', (_name, card) => {
    expect(validateCard(card)).toEqual([]);
    expect(card.support).toBe('supported');
  });
});

describe('Auras (CR 303.4a, 702.5a)', () => {
  test('an Aura with an enchant ability is valid', () => {
    expect(validateCard(aura([enchantCreature]))).toEqual([]);
  });

  test('an Aura needs an enchant ability', () => {
    expect(messages(aura([]))).toEqual([expect.stringContaining('needs an enchant ability')]);
  });

  test('only an Aura has an enchant ability', () => {
    expect(messages(creature([enchantCreature]))).toEqual([
      expect.stringContaining('only an Aura has an enchant ability'),
    ]);
  });

  test('an Aura is an enchantment', () => {
    const def = singleFace({
      name: 'SYNTHETIC Test Aura',
      manaCost: ['1'],
      types: ['artifact'],
      subtypes: ['Aura'],
      colors: [],
      colorIdentity: [],
      oracleText: 'test',
      abilities: [enchantCreature],
    });
    expect(messages(def)).toEqual([expect.stringContaining('an Aura is an enchantment')]);
  });

  test('the enchant filter must be about permanents on the battlefield', () => {
    for (const filter of [
      { zone: 'graveyard', types: ['creature'] },
      { stackKind: 'spell' },
      { anyOf: [{ zone: 'graveyard' }] },
    ] as ObjectFilter[]) {
      const def = aura([{ kind: 'keyword', keyword: { kind: 'enchant', filter } }]);
      expect(validateCardStructure(def), JSON.stringify(filter)).not.toEqual([]);
    }
  });

  test('two enchant abilities are structurally fine but not run (CR 702.5c)', () => {
    const def = aura([
      enchantCreature,
      { kind: 'keyword', keyword: { kind: 'enchant', filter: { controller: 'you' } } },
    ]);
    expect(validateCardStructure(def)).toEqual([]);
    expect(messages(def)).toEqual([expect.stringContaining('more than one enchant ability')]);
  });

  test('marked unsupported, the same Aura has no feature issues', () => {
    const def = { ...aura([enchantCreature, enchantCreature]), support: 'unsupported' as const };
    expect(validateCard(def)).toEqual(validateCardStructure(def));
  });

  test('a card that puts a possible Aura card onto the battlefield by a target is run: the Aura chooses what it enchants (CR 303.4f, D-149)', () => {
    const reanimate = (filter: ObjectFilter) =>
      singleFace({
        name: 'SYNTHETIC Test Reanimate',
        manaCost: ['B'],
        types: ['sorcery'],
        colors: ['B'],
        colorIdentity: ['B'],
        oracleText: 'test',
        spell: {
          targets: [
            { id: 't1', what: { kind: 'object', filter: { ...filter, zone: 'graveyard' } } },
          ],
          effect: {
            kind: 'moveToZone',
            objects: { kind: 'target', id: 't1' },
            to: 'battlefield',
          },
        },
      });
    // D-149: an Aura card named by a target, `moved` or `each` enters attached to what its controller chooses (`rules/aura-entry.ts`).
    expect(messages(reanimate({}))).toEqual([]);
    // A card picked by a `choose` selector from the graveyard is not run for a card that could be an Aura.
    const chosen = singleFace({
      name: 'SYNTHETIC Test Reanimate Chosen',
      manaCost: ['B'],
      types: ['sorcery'],
      colors: ['B'],
      colorIdentity: ['B'],
      oracleText: 'test',
      spell: {
        effect: {
          kind: 'moveToZone',
          objects: { kind: 'choose', filter: { zone: 'graveyard', controller: 'you' } },
          to: 'battlefield',
        },
      },
    });
    expect(messages(chosen)).toEqual([expect.stringContaining('Aura onto the battlefield')]);
    // A creature card, a land or a basic land cannot be an Aura.
    for (const filter of [
      { types: ['creature'] },
      { types: ['land'] },
      { subtypes: ['Forest'] },
      { supertypes: ['basic'] },
      { notTypes: ['enchantment'] },
    ] as ObjectFilter[]) {
      expect(messages(reanimate(filter)), JSON.stringify(filter)).toEqual([]);
    }
  });

  test('a search that puts a possible Aura onto the battlefield is refused, a land search is not', () => {
    const search = (filter: ObjectFilter) =>
      singleFace({
        name: 'SYNTHETIC Test Search',
        manaCost: ['G'],
        types: ['sorcery'],
        colors: ['G'],
        colorIdentity: ['G'],
        oracleText: 'test',
        spell: {
          effect: {
            kind: 'search',
            player: { kind: 'you' },
            filter,
            max: 1,
            destinations: [{ zone: 'battlefield', count: 'rest' }],
            reveal: false,
            shuffle: true,
          },
        },
      });
    expect(messages(search({ subtypes: ['Aura'] }))).toEqual([
      expect.stringContaining('Aura onto the battlefield'),
    ]);
    expect(messages(search({ types: ['land'], supertypes: ['basic'] }))).toEqual([]);
  });
});

describe('Equipment (CR 702.6a) and the attach effect (CR 701.3)', () => {
  const equipment = (abilities: readonly Ability[]) =>
    singleFace({
      name: 'SYNTHETIC Test Equipment',
      manaCost: ['1'],
      types: ['artifact'],
      subtypes: ['Equipment'],
      colors: [],
      colorIdentity: [],
      oracleText: 'test',
      abilities,
    });

  test('an equip keyword with a mana or life cost is valid', () => {
    for (const cost of [
      [{ kind: 'mana', symbols: ['2'] }],
      [{ kind: 'payLife', amount: 2 }],
    ] as const) {
      expect(
        validateCard(equipment([{ kind: 'keyword', keyword: { kind: 'equip', cost } }])),
      ).toEqual([]);
    }
  });

  test('an equip cost the engine does not pay is refused, like Cycling', () => {
    const def = equipment([
      { kind: 'keyword', keyword: { kind: 'equip', cost: [{ kind: 'tap' }] } },
    ]);
    expect(messages(def)).toEqual([expect.stringContaining('cost "tap" is not implemented')]);
  });

  test('an attach effect names an object and a target declared on the ability', () => {
    const attach = (to: unknown): CardDefinition =>
      equipment([
        {
          kind: 'activated',
          cost: [{ kind: 'mana', symbols: ['0'] }],
          targets: [{ id: 't1', what: { kind: 'object', filter: { types: ['creature'] } } }],
          effect: { kind: 'attach', object: { kind: 'this' }, to: to as never },
        },
      ]);
    expect(validateCard(attach({ kind: 'target', id: 't1' }))).toEqual([]);
    expect(validateCardStructure(attach({ kind: 'target', id: 'nope' }))).not.toEqual([]);
    expect(
      validateCardStructure(attach({ kind: 'each', filter: { types: ['creature'] } })),
    ).not.toEqual([]);
  });
});

describe('static abilities with subjects (CR 611.3, 613)', () => {
  const stat = (effect: StaticEffect): Ability => ({ kind: 'static', static: effect });
  const anthem = (subject: unknown) =>
    stat({ kind: 'modifyPt', subject: subject as never, power: 1, toughness: 1 });

  test('a filter subject on a creature or enchantment is valid', () => {
    expect(
      validateCard(
        creature([anthem({ kind: 'filter', filter: { types: ['creature'] }, other: true })]),
      ),
    ).toEqual([]);
  });

  test('an attached subject needs an Aura or an Equipment', () => {
    expect(messages(creature([anthem({ kind: 'attached' })]))).toEqual([
      expect.stringContaining('needs an Aura or an Equipment'),
    ]);
    expect(validateCard(aura([enchantCreature, anthem({ kind: 'attached' })]))).toEqual([]);
  });

  test('a filter subject cannot look outside the battlefield', () => {
    const def = creature([anthem({ kind: 'filter', filter: { zone: 'graveyard' } })]);
    expect(validateCardStructure(def)).not.toEqual([]);
  });

  test('an unknown subject, and non-integer numbers, are structural errors', () => {
    expect(validateCardStructure(creature([anthem({ kind: 'everything' })]))).not.toEqual([]);
    const def = creature([
      stat({ kind: 'modifyPt', subject: { kind: 'attached' }, power: 1.5, toughness: 1 }),
    ]);
    expect(validateCardStructure(def).map((i) => i.path)).toContain(
      'faces[0].abilities[0].static.power',
    );
  });

  test('only keywords without parameters can be granted', () => {
    const grant = (keyword: unknown) =>
      aura([
        enchantCreature,
        stat({ kind: 'grantKeyword', subject: { kind: 'attached' }, keyword: keyword as never }),
      ]);
    for (const kind of [
      'flying',
      'trample',
      'haste',
      'vigilance',
      'lifelink',
      'deathtouch',
      'firstStrike',
      'doubleStrike',
      'menace',
      'reach',
      'hexproof',
      'shroud',
      'indestructible',
      'defender',
    ]) {
      expect(validateCard(grant({ kind })), kind).toEqual([]);
    }
    for (const keyword of [
      { kind: 'flash' },
      { kind: 'ward', cost: [{ kind: 'mana', symbols: ['1'] }] },
      { kind: 'cycling', cost: [{ kind: 'mana', symbols: ['1'] }] },
      { kind: 'equip', cost: [{ kind: 'mana', symbols: ['1'] }] },
      { kind: 'enchant', filter: {} },
    ]) {
      expect(validateCardStructure(grant(keyword)), JSON.stringify(keyword)).not.toEqual([]);
    }
  });

  test('a static ability may give protection from colors, or from the colors outside the commander identity (D-259)', () => {
    const grant = (keyword: unknown) =>
      aura([
        enchantCreature,
        stat({ kind: 'grantKeyword', subject: { kind: 'attached' }, keyword: keyword as never }),
      ]);
    expect(validateCard(grant({ kind: 'protection', from: 'color', colors: ['R', 'U'] }))).toEqual(
      [],
    );
    expect(
      validateCard(grant({ kind: 'protection', from: 'colorsNotInCommanderIdentity' })),
    ).toEqual([]);
    for (const keyword of [
      { kind: 'protection', from: 'color', colors: [] },
      { kind: 'protection', from: 'color', colors: ['X'] },
      { kind: 'protection', from: 'everything' },
    ]) {
      expect(validateCardStructure(grant(keyword)), JSON.stringify(keyword)).not.toEqual([]);
    }
  });

  test('a token with an attached static ability must be an Equipment', () => {
    const token = (subtypes: string[]) =>
      singleFace({
        name: 'SYNTHETIC Test Token Maker',
        manaCost: ['1'],
        types: ['sorcery'],
        colors: [],
        colorIdentity: [],
        oracleText: 'test',
        spell: {
          effect: {
            kind: 'createToken',
            count: 1,
            token: {
              kind: 'custom',
              definition: {
                name: 'Gizmo',
                manaCost: null,
                supertypes: [],
                types: ['artifact'],
                subtypes,
                colors: [],
                power: null,
                toughness: null,
                loyalty: null,
                defense: null,
                oracleText: '',
                abilities: [
                  stat({ kind: 'modifyPt', subject: { kind: 'attached' }, power: 1, toughness: 1 }),
                ],
              },
            },
          },
        },
      });
    expect(messages(token(['Equipment']))).toEqual([]);
    expect(messages(token(['Clue']))).toEqual([
      expect.stringContaining('only an Equipment token can have an "attached" static ability'),
    ]);
  });
});
