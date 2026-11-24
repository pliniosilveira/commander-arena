// Issue 89 (D-639): what `validateCard` allows of goad (CR 701.15): the effect "Goad target creature" and the static ability "is goaded" of the permanent an Aura or Equipment is
// attached to, never of another subject.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { type Ability, type Effect, validateCard } from '../src/index';

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
      targets: [
        {
          id: 't1',
          what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
        },
      ],
      effect,
    },
  });

const messages = (card: Parameters<typeof validateCard>[0]) =>
  validateCard(card).map((i) => i.message);

describe('goad (D-639)', () => {
  test('the effect goads the creature a target names', () => {
    expect(messages(spell({ kind: 'goad', objects: { kind: 'target', id: 't1' } }))).toEqual([]);
  });

  test('the effect refuses a target that does not exist', () => {
    expect(
      messages(spell({ kind: 'goad', objects: { kind: 'target', id: 'missing' } })).length,
    ).toBeGreaterThan(0);
  });

  test('the static ability is given to the attached permanent', () => {
    const ability: Ability = {
      kind: 'static',
      static: { kind: 'goaded', subject: { kind: 'attached' } },
    };
    expect(messages(creature([ability]))).not.toContain(
      'goaded is given to the attached permanent',
    );
  });
});

describe('a static subject that names a goaded creature (CR 701.15b)', () => {
  const group = {
    kind: 'filter',
    filter: { types: ['creature'], controller: 'opponent', goaded: true },
  } as const;

  test('a restriction may name it (Bothersome Quasit)', () => {
    const ability: Ability = {
      kind: 'static',
      static: { kind: 'restriction', subject: group, restriction: 'cantBlock' },
    };
    expect(messages(creature([ability]))).toEqual([]);
  });

  test('a change of power and toughness may not: it would read the designation before it is settled', () => {
    const ability: Ability = {
      kind: 'static',
      static: { kind: 'modifyPt', subject: group, power: 1, toughness: 1 },
    };
    expect(messages(creature([ability])).join('|')).toContain('static ability cannot read');
  });
});
