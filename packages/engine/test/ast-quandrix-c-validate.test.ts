// validateCard for the nodes of group C of the Quandrix deck: the keyword `protection` from `multicolored` (CR 702.16a, 105.2), the target slot `ownedByTarget` (CR 115.1, 608.2b:
// "target cards from their graveyard" after "target player"), the effect `moveAllCounters` (CR 122.1, 122.6) and the `thisWay` count `countersRemoved` (CR 608.2c). Cards are
// SYNTHETIC and defined here.
import { describe, expect, test } from 'vitest';
import type { Ability, Effect, SpellText, TargetSpec } from '../src/ast/types';
import { validateCard } from '../src/ast/validate';
import type { CardDefinition } from '../src/cards/definition';
import { singleFace } from '../src/cards/fixtures/helpers';

const YOU = { kind: 'you' } as const;

function sorcery(spell: SpellText): CardDefinition {
  return singleFace({
    name: 'SYNTHETIC Test Sorcery',
    manaCost: ['1'],
    types: ['sorcery'],
    colors: [],
    colorIdentity: [],
    oracleText: 'test',
    spell,
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
const PLAYER: TargetSpec = { id: 't1', what: { kind: 'player', filter: 'any' } };
const CARDS = (extra: Partial<TargetSpec> = {}): TargetSpec => ({
  id: 't2',
  what: { kind: 'object', filter: { zone: 'graveyard' } },
  min: 0,
  max: 3,
  ownedByTarget: 't1',
  ...extra,
});
const SHUFFLE: Effect = {
  kind: 'sequence',
  effects: [
    { kind: 'moveToZone', objects: { kind: 'target', id: 't2' }, to: 'library' },
    { kind: 'shuffle', player: { kind: 'target', id: 't1' } },
  ],
};

describe('protection from multicolored (CR 702.16a, 105.2)', () => {
  test('a printed keyword of a creature is valid', () => {
    const ability: Ability = {
      kind: 'keyword',
      keyword: { kind: 'protection', from: 'multicolored' },
    };
    expect(validateCard(creature([ability]))).toEqual([]);
  });
});

describe('ownedByTarget: the cards are in the graveyard of the player an earlier slot names (CR 115.1, 608.2b)', () => {
  const spell = (targets: readonly TargetSpec[]) => sorcery({ targets, effect: SHUFFLE });

  test('a player slot and a slot of graveyard cards that names it is valid', () => {
    expect(validateCard(spell([PLAYER, CARDS()]))).toEqual([]);
  });

  test('it names an earlier slot', () => {
    expect(messages(spell([CARDS(), PLAYER])).join('|')).toContain(
      'ownedByTarget names an earlier player target slot',
    );
    expect(messages(spell([PLAYER, CARDS({ ownedByTarget: 't9' })])).join('|')).toContain(
      'ownedByTarget names an earlier player target slot',
    );
  });

  test('the earlier slot is a player, not an object', () => {
    const objectSlot: TargetSpec = {
      id: 't1',
      what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
    };
    expect(messages(spell([objectSlot, CARDS()])).join('|')).toContain(
      'ownedByTarget names an earlier player target slot',
    );
  });

  test('the slot is of cards in a graveyard', () => {
    const battlefield = CARDS({
      what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
    });
    expect(messages(spell([PLAYER, battlefield])).join('|')).toContain(
      'ownedByTarget is said of cards in a graveyard',
    );
  });
});

describe('moveAllCounters (CR 122.1, 122.6)', () => {
  const FROM: TargetSpec = {
    id: 't1',
    what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
  };
  const TO: TargetSpec = { ...FROM, id: 't2', differentFrom: 't1' };
  const move = (from: string, to: string) =>
    sorcery({
      targets: [FROM, TO],
      effect: {
        kind: 'moveAllCounters',
        from: { kind: 'target', id: from },
        to: { kind: 'target', id: to },
      },
    });

  test('two target slots are valid', () => {
    expect(validateCard(move('t1', 't2'))).toEqual([]);
  });

  test('a target that no slot declares is refused', () => {
    expect(validateCard(move('t1', 't9')).length).toBeGreaterThan(0);
  });
});

describe('countersRemoved: "for each counter removed this way" (CR 608.2c)', () => {
  const target: TargetSpec = {
    id: 't1',
    what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
  };
  const remove: Effect = { kind: 'removeAllCounters', objects: { kind: 'target', id: 't1' } };
  const draw: Effect = {
    kind: 'draw',
    player: YOU,
    count: { kind: 'thisWay', what: 'countersRemoved' },
  };

  test('a removeAllCounters before the draw produces it', () => {
    const card = sorcery({
      targets: [target],
      effect: { kind: 'sequence', effects: [remove, draw] },
    });
    expect(validateCard(card)).toEqual([]);
  });

  test('without a removeAllCounters before it, it is refused', () => {
    const card = sorcery({ targets: [target], effect: draw });
    expect(messages(card).join('|')).toContain('removeAllCounters');
  });
});
