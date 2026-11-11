// validateCard for Crew (CR 702.122), the tapCreatures cost and the additive form of setTypes
// (CR 205.1b). Structural rules come from validateCardStructure, the "can the engine run it" rules
// from validateCard. Cards are SYNTHETIC and defined here or in src/cards/fixtures.
import { describe, expect, test } from 'vitest';
import { isFeatureSupported, SUPPORTED_FEATURES } from '../src/ast/features';
import type { Ability, Effect } from '../src/ast/types';
import { validateCard, validateCardStructure } from '../src/ast/validate';
import { singleFace } from '../src/cards/fixtures/helpers';
import { syntheticCard } from '../src/index';

const vehicle = (abilities: readonly Ability[]) =>
  singleFace({
    name: 'SYNTHETIC Test Vehicle',
    manaCost: ['2'],
    types: ['artifact'],
    subtypes: ['Vehicle'],
    colors: [],
    colorIdentity: [],
    power: 3,
    toughness: 3,
    oracleText: 'test',
    abilities,
  });
const crewKeyword = (power: unknown): Ability =>
  ({ kind: 'keyword', keyword: { kind: 'crew', power } }) as Ability;
const structure = (abilities: readonly Ability[]) =>
  validateCardStructure(vehicle(abilities)).map((i) => `${i.path}: ${i.message}`);
const gate = (abilities: readonly Ability[]) =>
  validateCard(vehicle(abilities)).map((i) => `${i.path}: ${i.message}`);
const draw: Effect = { kind: 'draw', player: { kind: 'you' }, count: 1 };
const activated = (cost: unknown[]): Ability =>
  ({ kind: 'activated', cost, effect: draw }) as Ability;

describe('the registry lists what the engine runs', () => {
  test('crew is a supported keyword and tapCreatures a supported cost', () => {
    expect(SUPPORTED_FEATURES.keywordKinds).toContain('crew');
    expect(SUPPORTED_FEATURES.costKinds).toContain('tapCreatures');
    expect(isFeatureSupported('keyword:crew')).toBe(true);
    expect(isFeatureSupported('cost:tapCreatures')).toBe(true);
    // Not allowed on a mana ability (CR 605.1a): its costs stay {T}, sacrifice and mana.
    expect(SUPPORTED_FEATURES.manaAbilityCostKinds).not.toContain('tapCreatures');
    expect(isFeatureSupported('effect:setTypes')).toBe(true);
  });

  test('the synthetic Vehicles are well formed and executable', () => {
    for (const name of [
      'SYNTHETIC Rattle Wagon',
      'SYNTHETIC Scout Skiff',
      'SYNTHETIC Dread Barge',
    ]) {
      expect(validateCard(syntheticCard(name)), name).toEqual([]);
    }
  });
});

describe('Crew N (CR 702.122a)', () => {
  test('a positive integer power is well formed and executable', () => {
    expect(structure([crewKeyword(1)])).toEqual([]);
    expect(gate([crewKeyword(3)])).toEqual([]);
  });

  test('zero, negative, fractional and missing powers are malformed', () => {
    for (const power of [0, -1, 1.5, Number.NaN, undefined, '3']) {
      expect(structure([crewKeyword(power)]).join(' | '), String(power)).toContain(
        'crew power must be a positive integer',
      );
    }
  });
});

describe('the tapCreatures cost (CR 702.122a)', () => {
  test('alone in the cost of an ability that functions on the battlefield: valid and executable', () => {
    const a = activated([{ kind: 'tapCreatures', totalPower: 2 }]);
    expect(structure([a])).toEqual([]);
    expect(gate([a])).toEqual([]);
  });

  test('the total power must be a positive integer', () => {
    for (const totalPower of [0, -2, 0.5, undefined]) {
      const a = activated([{ kind: 'tapCreatures', totalPower }]);
      expect(structure([a]).join(' | '), String(totalPower)).toContain(
        'total power to tap must be a positive integer',
      );
    }
  });

  test('it needs the battlefield: an ability that functions from the hand cannot have it', () => {
    const a: Ability = {
      ...activated([{ kind: 'tapCreatures', totalPower: 1 }]),
      functionsIn: 'hand',
    } as Ability;
    expect(structure([a]).join(' | ')).toContain('cannot cost tapCreatures');
  });

  test('combined with mana, a sacrifice or another creature-tapping cost it is not executable', () => {
    const tap = { kind: 'tapCreatures', totalPower: 2 };
    for (const other of [
      { kind: 'mana', symbols: ['1'] },
      { kind: 'sacrifice', what: { kind: 'this' } },
      { kind: 'tapCreatures', totalPower: 1 },
    ]) {
      const a = activated([tap, other]);
      expect(structure([a]), JSON.stringify(other)).toEqual([]);
      expect(gate([a]).join(' | '), JSON.stringify(other)).toContain(
        'creature-tapping cost combined with another',
      );
    }
  });

  test('the cost is not accepted as part of Cycling, Equip or the other keywords with a cost', () => {
    for (const kind of ['cycling', 'equip', 'ward', 'kicker']) {
      const keyword = { kind, cost: [{ kind: 'tapCreatures', totalPower: 1 }] };
      const a = { kind: 'keyword', keyword } as unknown as Ability;
      expect(gate([a]).join(' | '), kind).toContain('is not implemented');
    }
  });
});

describe('setTypes with additive (CR 205.1b)', () => {
  const effect = (extra: Record<string, unknown>): Effect =>
    ({
      kind: 'setTypes',
      objects: { kind: 'this' },
      types: ['artifact', 'creature'],
      duration: 'untilEndOfTurn',
      ...extra,
    }) as Effect;
  const withEffect = (e: Effect) => [
    { kind: 'activated', cost: [{ kind: 'tap' }], effect: e } as Ability,
  ];

  test('additive: true is well formed and executable', () => {
    expect(structure(withEffect(effect({ additive: true })))).toEqual([]);
    expect(gate(withEffect(effect({ additive: true })))).toEqual([]);
  });

  test('anything but true is malformed', () => {
    for (const additive of [false, 1, 'yes']) {
      expect(structure(withEffect(effect({ additive }))).join(' | '), String(additive)).toContain(
        'additive must be true when present',
      );
    }
  });

  test('an additive creature type may be added without the creature card type in the same node', () => {
    const adds = effect({ types: undefined, subtypes: ['Frog'], additive: true });
    expect(structure(withEffect(adds))).toEqual([]);
    // The replacing form still needs the creature type for creature subtypes (CR 205.1a).
    const replaces = effect({ types: ['artifact'], subtypes: ['Frog'] });
    expect(structure(withEffect(replaces)).join(' | ')).toContain(
      'creature subtypes need the creature or kindred card type',
    );
  });
});
