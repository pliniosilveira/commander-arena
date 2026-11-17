// Issue 89 (D-589): what `validateCard` allows of goad (CR 701.15): the effect "Goad target creature" and the static ability "is goaded" of the permanent an Aura or Equipment is
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

describe('goad (D-589)', () => {
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

  test('the static ability is refused for any other subject', () => {
    const ability = {
      kind: 'static',
      static: { kind: 'goaded', subject: { kind: 'this' } },
    } as unknown as Ability;
    expect(messages(creature([ability])).join(' ')).toContain(
      'goaded is given to the attached permanent',
    );
  });
});
