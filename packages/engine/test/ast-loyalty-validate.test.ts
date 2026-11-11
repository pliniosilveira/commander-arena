// Validation of loyalty abilities and planeswalker tokens (CR 606, D-200): what is malformed (validateCardStructure) and what is
// well-formed but not executable (validateCard). Pins CR 606.2 (the loyalty symbol is in an activated ability of a planeswalker),
// 606.3 (one loyalty ability a turn is the rule, so no oncePerTurn of its own), 605.1a (a loyalty ability that adds mana is not a mana
// ability), 306.5b (a planeswalker token has loyalty), 107.3a (X).
import { describe, expect, test } from 'vitest';
import type { Ability, TokenDefinition } from '../src/ast/types';
import { validateCard, validateCardStructure } from '../src/ast/validate';
import { singleFace } from '../src/cards/fixtures/helpers';
import { SYNTHETIC_WALKER_TOKEN } from '../src/cards/fixtures/synthetic-planeswalkers';
import { syntheticCard } from '../src/index';

const draw = { kind: 'draw', player: { kind: 'you' }, count: 1 } as const;
type Activated = Extract<Ability, { kind: 'activated' }>;
const loyalty = (extra: Partial<Activated> = {}, change: number | 'x' = 1): Ability => ({
  kind: 'activated',
  cost: [{ kind: 'loyalty', change }],
  effect: draw,
  ...extra,
});
const walker = (abilities: Ability[], types: ('planeswalker' | 'creature')[] = ['planeswalker']) =>
  singleFace({
    name: 'SYNTHETIC Test Subject',
    manaCost: ['1'],
    types,
    colors: [],
    colorIdentity: [],
    ...(types.includes('planeswalker') ? { loyalty: 3 } : {}),
    ...(types.includes('creature') ? { power: 1, toughness: 1 } : {}),
    oracleText: '',
    abilities,
  });
const structure = (a: Ability, types?: ('planeswalker' | 'creature')[]) =>
  validateCardStructure(walker([a], types)).map((i) => i.message);
const gate = (a: Ability, types?: ('planeswalker' | 'creature')[]) =>
  validateCard(walker([a], types)).map((i) => i.message);

describe('the SYNTHETIC planeswalkers are valid and executable', () => {
  test.each([
    'SYNTHETIC Loyalty Walker',
    'SYNTHETIC X Walker',
    'SYNTHETIC Ultimate Walker',
    'SYNTHETIC Static Walker',
    'SYNTHETIC Animate Walker',
    'SYNTHETIC Mana Walker',
    'SYNTHETIC Walker Maker',
  ])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

describe('a loyalty ability', () => {
  test('on a planeswalker, with +N, -N, 0 and -X, is well formed and executable', () => {
    for (const change of [1, 3, 0, -2, 'x'] as const) {
      expect(gate(loyalty({}, change)), String(change)).toEqual([]);
    }
  });

  test('is refused on a face that is not a planeswalker (CR 606.2)', () => {
    expect(structure(loyalty(), ['creature']).join('|')).toContain('belongs to a planeswalker');
  });

  test('has one symbol, no oncePerTurn, works on the battlefield, never at instant timing', () => {
    expect(
      structure({
        kind: 'activated',
        cost: [
          { kind: 'loyalty', change: 1 },
          { kind: 'loyalty', change: -1 },
        ],
        effect: draw,
      }).join('|'),
    ).toContain('one loyalty symbol');
    expect(structure(loyalty({ oncePerTurn: true })).join('|')).toContain('CR 606.3');
    expect(structure(loyalty({ functionsIn: 'hand' })).join('|')).toContain('battlefield');
    expect(structure(loyalty({ timing: 'instant' })).join('|')).toContain('sorcery timing');
    expect(structure(loyalty({ timing: 'sorcery' }))).toEqual([]);
  });

  test('takes a whole number or x as its change', () => {
    expect(structure(loyalty({}, 1.5)).join('|')).toContain('whole number');
    expect(structure(loyalty({}, Number.NaN)).join('|')).toContain('whole number');
  });

  test('may use X in its effect only with a -X cost', () => {
    const useX: Partial<Activated> = {
      effect: { kind: 'draw', player: { kind: 'you' }, count: { kind: 'x' } },
    };
    expect(structure(loyalty(useX, 'x'))).toEqual([]);
    expect(structure(loyalty(useX, -1)).join('|')).toContain('X');
  });

  test('that adds mana is not a mana ability (CR 605.1a, 606.2)', () => {
    expect(
      structure(loyalty({ effect: { kind: 'addMana', mana: { kind: 'fixed', mana: ['R'] } } })),
    ).toEqual([]);
  });

  test('cannot be granted to another permanent', () => {
    const grant: Ability = {
      kind: 'static',
      static: {
        kind: 'grantAbility',
        subject: { kind: 'filter', filter: { types: ['creature'] } },
        ability: loyalty() as Activated,
      },
    };
    expect(structure(grant).join('|')).toContain('granted loyalty ability');
  });

  test('is not a cost of a spell or of a mana ability', () => {
    const spell = singleFace({
      name: 'SYNTHETIC Test Subject',
      manaCost: ['1'],
      types: ['sorcery'],
      colors: [],
      colorIdentity: [],
      oracleText: '',
      additionalCosts: [{ kind: 'loyalty', change: -1 }],
      spell: { effect: draw },
    });
    expect(validateCardStructure(spell).length).toBeGreaterThan(0);
    const mana: Ability = {
      kind: 'mana',
      cost: [{ kind: 'loyalty', change: 1 }],
      production: { kind: 'fixed', mana: ['R'] },
    };
    expect(validateCard(walker([mana])).length).toBeGreaterThan(0);
  });
});

describe('a planeswalker token (CR 306.5b)', () => {
  const makeToken = (def: TokenDefinition) =>
    singleFace({
      name: 'SYNTHETIC Test Subject',
      manaCost: ['1'],
      types: ['sorcery'],
      colors: [],
      colorIdentity: [],
      oracleText: '',
      spell: {
        effect: { kind: 'createToken', token: { kind: 'custom', definition: def }, count: 1 },
      },
    });
  const issues = (def: TokenDefinition) =>
    validateCardStructure(makeToken(def)).map((i) => i.message);

  test('with loyalty and loyalty abilities is valid', () => {
    expect(issues(SYNTHETIC_WALKER_TOKEN)).toEqual([]);
    expect(validateCard(makeToken(SYNTHETIC_WALKER_TOKEN))).toEqual([]);
  });

  test('needs a non-negative loyalty; only a planeswalker token has one', () => {
    expect(issues({ ...SYNTHETIC_WALKER_TOKEN, loyalty: null }).join('|')).toContain(
      'planeswalker token needs a non-negative loyalty',
    );
    expect(issues({ ...SYNTHETIC_WALKER_TOKEN, loyalty: -1 }).join('|')).toContain('non-negative');
    expect(
      issues({
        ...SYNTHETIC_WALKER_TOKEN,
        types: ['artifact'],
        abilities: [],
      }).join('|'),
    ).toContain('only a planeswalker token has loyalty');
  });

  test('a loyalty ability on a token that is not a planeswalker is refused', () => {
    expect(
      issues({
        ...SYNTHETIC_WALKER_TOKEN,
        types: ['artifact'],
        loyalty: null,
      }).join('|'),
    ).toContain('belongs to a planeswalker');
  });
});
